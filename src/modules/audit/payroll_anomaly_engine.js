const approvalQueue = [];

function checkDataIntegrity({ payrollData, attendances, employees }) {
  const integrityAlerts = [];
  let payrollBlocked = false;

  const totalEmps = payrollData.length;

  const attendanceMissingMap = {};
  if (attendances && attendances.length > 0) {
    attendances.forEach(att => {
      const totalDays = att.totalWorkDays || 22;
      const missingDays = att.missingDays || 0;
      attendanceMissingMap[att.empId] = missingDays / totalDays;
    });
  }

  const missingRateEmpIds = [];
  payrollData.forEach(p => {
    const rate = attendanceMissingMap[p.empId] || 0;
    if (rate > 0.01) {
      missingRateEmpIds.push(p.empId);
    }
  });
  if (missingRateEmpIds.length > 0) {
    integrityAlerts.push({
      type: 'attendanceMissingRate',
      severity: 'medium',
      affectedEmpIds: missingRateEmpIds,
      suggestion: `打卡缺失率超过1%，共${missingRateEmpIds.length}人，请核查考勤异常`
    });
  }

  const empMap = {};
  if (employees && employees.length > 0) {
    employees.forEach(e => { empMap[e.empId] = e; });
  }

  const bankCardEmptyEmpIds = [];
  const socialBaseZeroEmpIds = [];
  payrollData.forEach(p => {
    const emp = empMap[p.empId] || {};
    if (!emp.bankCard || emp.bankCard.trim() === '') {
      bankCardEmptyEmpIds.push(p.empId);
    }
    if (!emp.socialBase || Number(emp.socialBase) === 0) {
      socialBaseZeroEmpIds.push(p.empId);
    }
  });

  if (bankCardEmptyEmpIds.length > 0) {
    integrityAlerts.push({
      type: 'bankCardEmpty',
      severity: 'high',
      affectedEmpIds: bankCardEmptyEmpIds,
      suggestion: `银行卡号为空，共${bankCardEmptyEmpIds.length}人，需补全后再发放`
    });
    payrollBlocked = true;
  }

  if (socialBaseZeroEmpIds.length > 0) {
    integrityAlerts.push({
      type: 'socialBaseZero',
      severity: 'high',
      affectedEmpIds: socialBaseZeroEmpIds,
      suggestion: `社保基数为0，共${socialBaseZeroEmpIds.length}人，需核实后再发放`
    });
    payrollBlocked = true;
  }

  return { integrityAlerts, payrollBlocked };
}

function createApprovalInstance({ type, empId, delta, momChangeRate, affectedFields }) {
  const roundedRate = Math.round(momChangeRate * 10000) / 100;
  let reasonCode;
  if (momChangeRate <= -0.4) {
    reasonCode = 'MOM_DROP_40%';
  } else if (momChangeRate <= -0.2) {
    reasonCode = `MOM_DROP_${Math.abs(Math.round(momChangeRate * 100))}%`;
  } else if (momChangeRate >= 0.4) {
    reasonCode = 'MOM_SURGE_40%';
  } else if (momChangeRate >= 0.3) {
    reasonCode = 'MOM_SURGE_30%';
  } else {
    reasonCode = `MOM_SURGE_${Math.round(momChangeRate * 100)}%`;
  }

  const approval = {
    id: `APPR_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: type || 'PAYROLL_ANOMALY',
    empId,
    delta,
    momChangeRate,
    momChangeRatePct: `${roundedRate >= 0 ? '+' : ''}${roundedRate}%`,
    affectedFields: affectedFields || ['netPay'],
    reasonCode,
    approvalLevel: 3,
    status: 'PENDING_APPROVAL',
    approvers: ['HR专员', 'HR经理', '财务总监'],
    currentLevel: 1,
    createdAt: new Date().toISOString(),
    title: `薪酬异常说明 - 员工${empId} - ${reasonCode}`
  };
  approvalQueue.push(approval);
  return approval;
}

function getApprovalQueue() {
  return [...approvalQueue];
}

function clearApprovalQueue() {
  approvalQueue.length = 0;
}

function checkMoMAnomaly({ payrollData, lastMonthPayroll }) {
  const momAlerts = [];
  const lastMap = {};
  if (lastMonthPayroll && lastMonthPayroll.length > 0) {
    lastMonthPayroll.forEach(lp => { lastMap[lp.empId] = lp; });
  }

  payrollData.forEach(current => {
    const last = lastMap[current.empId];
    if (!last || last.netPay === undefined || last.netPay === null || last.netPay === 0) {
      return;
    }
    const currentNet = current.netPay;
    const lastNet = last.netPay;
    const delta = currentNet - lastNet;
    const momChangeRate = delta / lastNet;

    if (Math.abs(momChangeRate) >= 0.2) {
      const approval = createApprovalInstance({
        type: 'PAYROLL_ANOMALY',
        empId: current.empId,
        delta,
        momChangeRate,
        affectedFields: ['netPay']
      });
      momAlerts.push({
        empId: current.empId,
        lastNetPay: lastNet,
        currentNetPay: currentNet,
        delta,
        momChangeRate,
        momChangeRatePct: approval.momChangeRatePct,
        reasonCode: approval.reasonCode,
        approvalId: approval.id,
        severity: Math.abs(momChangeRate) >= 0.4 ? 'high' : 'medium',
        suggestion: `实发工资环比${approval.momChangeRatePct}，需提交三级审批说明`
      });
    }
  });

  return { momAlerts };
}

function buildGroupKey({ dept, grade }) {
  return `${dept || 'UNKNOWN'}__${grade || 'UNKNOWN'}`;
}

function calculateMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function checkLogicConsistency({ payrollData, employees, payrollGrades }) {
  const logicAlerts = [];
  const empMap = {};
  if (employees && employees.length > 0) {
    employees.forEach(e => { empMap[e.empId] = e; });
  }

  const gradeMap = {};
  if (payrollGrades && payrollGrades.length > 0) {
    payrollGrades.forEach(g => { gradeMap[g.grade] = g; });
  }

  const groups = {};
  payrollData.forEach(p => {
    const emp = empMap[p.empId] || {};
    const dept = emp.dept || p.dept;
    const grade = emp.payrollGrade || p.payrollGrade;
    const key = buildGroupKey({ dept, grade });
    if (!groups[key]) {
      groups[key] = { dept, grade, items: [] };
    }
    groups[key].items.push({
      empId: p.empId,
      baseSalary: p.baseSalary !== undefined ? p.baseSalary : (emp.baseSalary || 0)
    });
  });

  Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.items.length < 2) return;

    const baseSalaries = group.items.map(it => it.baseSalary);
    const median = calculateMedian(baseSalaries);
    if (median === 0) return;

    group.items.forEach(item => {
      const deviation = item.baseSalary - median;
      const deviationPct = deviation / median;
      if (Math.abs(deviationPct) > 0.05) {
        const gradeInfo = gradeMap[group.grade] || {};
        const standardSalary = gradeInfo.standardBaseSalary || median;
        logicAlerts.push({
          type: 'baseSalaryDeviation',
          severity: Math.abs(deviationPct) >= 0.15 ? 'high' : 'medium',
          empId: item.empId,
          groupKey: key,
          dept: group.dept,
          grade: group.grade,
          groupMedian: median,
          groupSize: group.items.length,
          actualBaseSalary: item.baseSalary,
          standardBaseSalary: standardSalary,
          groupBaseDeviation: deviation,
          groupBaseDeviationPct: deviationPct,
          groupBaseDeviationPctStr: `${(deviationPct * 100).toFixed(2)}%`,
          suggestion: deviation < 0
            ? `疑似转正未调薪/调薪遗漏：同部门同薪级中位数=${median}，实际=${item.baseSalary}，偏离${(deviationPct * 100).toFixed(2)}%`
            : `基础工资偏高：同部门同薪级中位数=${median}，实际=${item.baseSalary}，偏离${(deviationPct * 100).toFixed(2)}%`
        });
      }
    });
  });

  return { logicAlerts };
}

function generateAnomalyDingtalkDocLink({ allAnomalies, timestamp }) {
  const ts = timestamp || Date.now();
  const integrityCount = (allAnomalies.integrityAlerts || []).length;
  const momCount = (allAnomalies.momAlerts || []).length;
  const logicCount = (allAnomalies.logicAlerts || []).length;
  const totalCount = integrityCount + momCount + logicCount;

  const details = [];
  (allAnomalies.integrityAlerts || []).forEach(a => {
    details.push(`[数据完整性-${a.type}] 严重程度:${a.severity} 影响人数:${a.affectedEmpIds.length} 建议:${a.suggestion}`);
  });
  (allAnomalies.momAlerts || []).forEach(a => {
    details.push(`[环比波动-${a.empId}] ${a.lastNetPay}→${a.currentNetPay}(${a.momChangeRatePct}) reason:${a.reasonCode} 审批:${a.approvalId}`);
  });
  (allAnomalies.logicAlerts || []).forEach(a => {
    details.push(`[逻辑一致性-${a.empId}] ${a.dept}/${a.grade} 实际:${a.actualBaseSalary} vs 中位数:${a.groupMedian} (${a.groupBaseDeviationPctStr})`);
  });

  const mockToken = `DINGTALK_DOC_${ts}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  return {
    dingtalkDocUrl: `https://alidocs.dingtalk.com/i/p/${mockToken}`,
    docToken: mockToken,
    title: `薪酬异常检测报告_${new Date(ts).toISOString().slice(0, 10)}`,
    summary: {
      totalAlerts: totalCount,
      integrityAlerts: integrityCount,
      momAlerts: momCount,
      logicAlerts: logicCount,
      payrollBlocked: allAnomalies.payrollBlocked || false
    },
    details: details.join('\n'),
    generatedAt: new Date(ts).toISOString()
  };
}

function runFullAnomalyAudit({ payrollData, lastMonthPayroll, attendances, employees, payrollGrades }) {
  const integrityResult = checkDataIntegrity({ payrollData, attendances, employees });
  clearApprovalQueue();
  const momResult = checkMoMAnomaly({ payrollData, lastMonthPayroll });
  const approvals = getApprovalQueue();
  const logicResult = checkLogicConsistency({ payrollData, employees, payrollGrades });

  const allAlerts = [];
  integrityResult.integrityAlerts.forEach(a => allAlerts.push({ category: 'integrity', ...a }));
  momResult.momAlerts.forEach(a => allAlerts.push({ category: 'mom', ...a }));
  logicResult.logicAlerts.forEach(a => allAlerts.push({ category: 'logic', ...a }));

  const allAnomalies = {
    integrityAlerts: integrityResult.integrityAlerts,
    momAlerts: momResult.momAlerts,
    logicAlerts: logicResult.logicAlerts,
    payrollBlocked: integrityResult.payrollBlocked,
    approvalInstances: approvals,
    alertTotals: {
      integrity: integrityResult.integrityAlerts.length,
      mom: momResult.momAlerts.length,
      logic: logicResult.logicAlerts.length,
      total: allAlerts.length
    }
  };

  const report = generateAnomalyDingtalkDocLink({ allAnomalies });

  return {
    ...allAnomalies,
    report,
    allAlerts
  };
}

module.exports = {
  checkDataIntegrity,
  checkMoMAnomaly,
  checkLogicConsistency,
  createApprovalInstance,
  getApprovalQueue,
  clearApprovalQueue,
  buildGroupKey,
  calculateMedian,
  generateAnomalyDingtalkDocLink,
  runFullAnomalyAudit
};
