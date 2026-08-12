'use strict';

const {
  ROLES,
  ROLE_NAMES,
  SENSITIVE_DATA_ACCESS_ROLES,
  SLA_MILESTONE_NODES,
  HRDashboard,
  RolePermission,
  DashboardAuditLog,
  ExecutiveCockpit
} = require('../src/modules/dashboard/hr_executive_cockpit.js');

const { SLA_STATUS } = require('../src/modules/workflow/approval_sla_engine.js');

async function run_TR5_5_1_a() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.1-a: getRealtimeSlaProgress(8月) → 5节点进度条+状态');
  console.log('='.repeat(70));

  const dashboard = new HRDashboard();
  let passed = 0;
  let failed = 0;

  try {
    const result = dashboard.getRealtimeSlaProgress('8月');

    console.log('\n  --- SLA里程碑节点列表 ---');
    const expectedNodeNames = [
      'D-3 考勤异常闭环',
      'D-2 薪酬核算',
      'D-2 薪酬确认',
      'D-1 员工确认',
      'D日 工资发放'
    ];

    result.milestones.forEach((m, idx) => {
      console.log(`  [${idx + 1}] ${m.nodeName} | 目标时间:${m.targetTime} | 目标:${m.targetPercent}% | 实际:${m.currentProgressPercent}% | 状态:${m.status}`);
    });

    const nodeCountOk = result.milestones.length === 5;
    console.log(`\n  节点数量: ${result.milestones.length} (期望: 5) → ${nodeCountOk ? '✅' : '❌'}`);

    const allNamesMatch = expectedNodeNames.every((name, idx) =>
      result.milestones[idx] && result.milestones[idx].nodeName === name
    );
    console.log(`  节点名称匹配: ${allNamesMatch ? '✅' : '❌'}`);
    expectedNodeNames.forEach((name, idx) => {
      const actual = result.milestones[idx] ? result.milestones[idx].nodeName : '缺失';
      const match = actual === name;
      console.log(`    节点${idx + 1}: 期望="${name}", 实际="${actual}" → ${match ? '✅' : '❌'}`);
    });

    const allHaveProgress = result.milestones.every(m =>
      typeof m.currentProgressPercent === 'number' &&
      m.currentProgressPercent >= 0 && m.currentProgressPercent <= 100
    );
    console.log(`  所有节点有进度条百分比: ${allHaveProgress ? '✅' : '❌'}`);

    const allHaveStatus = result.milestones.every(m =>
      m.status === SLA_STATUS.GREEN || m.status === SLA_STATUS.YELLOW || m.status === SLA_STATUS.RED
    );
    console.log(`  所有节点有状态(GREEN/YELLOW/RED): ${allHaveStatus ? '✅' : '❌'}`);

    const allGreen = result.milestones.every(m => m.status === SLA_STATUS.GREEN);
    console.log(`  所有节点状态=GREEN: ${allGreen ? '✅' : '❌'}`);
    console.log(`  汇总: GREEN=${result.summary.greenCount}, YELLOW=${result.summary.yellowCount}, RED=${result.summary.redCount}`);

    const hasTargetTime = result.milestones.every(m => m.targetTime && m.targetTime.length > 0);
    console.log(`  所有节点有targetTime字段: ${hasTargetTime ? '✅' : '❌'}`);

    if (nodeCountOk && allNamesMatch && allHaveProgress && allHaveStatus && allGreen && hasTargetTime) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function run_TR5_5_1_a_kpi() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.1-a(续): dashboardKPI → ≥8项指标齐全');
  console.log('='.repeat(70));

  const dashboard = new HRDashboard();
  let passed = 0;
  let failed = 0;

  try {
    const kpiResult = dashboard.getDashboardKPI('8月');
    const kpis = kpiResult.kpis;

    console.log(`\n  KPI指标总数: ${kpis.length} (期望: ≥8)`);
    kpis.forEach((k, idx) => {
      console.log(`  [${idx + 1}] ${k.name}: ${k.value}${k.unit} | 分类:${k.category}`);
    });

    const requiredKeys = ['anomalyRate', 'confirmationRate', 'payrollProgress', 'slaAchievementRate'];
    const hasAllRequired = requiredKeys.every(key => kpis.some(k => k.key === key));
    console.log(`\n  核心4指标(异常率/确认率/工资发放进度/SLA达成率)齐全: ${hasAllRequired ? '✅' : '❌'}`);

    const countOk = kpis.length >= 8;
    console.log(`  指标数≥8项: ${countOk} (实际:${kpis.length}) → ${countOk ? '✅' : '❌'}`);

    const allHaveValue = kpis.every(k => k.value !== undefined && k.value !== null);
    console.log(`  所有指标有值: ${allHaveValue ? '✅' : '❌'}`);

    const allHaveName = kpis.every(k => k.name && k.name.length > 0);
    console.log(`  所有指标有名称: ${allHaveName ? '✅' : '❌'}`);

    if (hasAllRequired && countOk && allHaveValue && allHaveName) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function run_TR5_5_1_b() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.1-b: getLaborCostTrend(6月) → 6月数据+TOP10+清零倒计时');
  console.log('='.repeat(70));

  const dashboard = new HRDashboard();
  let passed = 0;
  let failed = 0;

  try {
    const result = dashboard.getLaborCostTrend(6, '6月');

    console.log('\n  --- 近6个月人工成本趋势 ---');
    const trendOk = result.laborCostTrend.length === 6;
    console.log(`  数据月数: ${result.laborCostTrend.length} (期望: 6) → ${trendOk ? '✅' : '❌'}`);
    result.laborCostTrend.forEach((m, idx) => {
      console.log(`  [${idx + 1}] ${m.month}: 人工成本=${m.totalLaborCost.toLocaleString()}元, 同比=${m.vsLastYoY}%`);
    });

    const allMonthsHaveFields = result.laborCostTrend.every(m =>
      m.month && typeof m.totalLaborCost === 'number' && typeof m.vsLastYoY === 'number'
    );
    console.log(`  所有月份有month/totalLaborCost/vsLastYoY字段: ${allMonthsHaveFields ? '✅' : '❌'}`);

    console.log('\n  --- TOP10加班部门 ---');
    const overtimeOk = result.overtimeTop10.length === 10;
    console.log(`  加班部门数: ${result.overtimeTop10.length} (期望: 10) → ${overtimeOk ? '✅' : '❌'}`);
    result.overtimeTop10.forEach((d, idx) => {
      console.log(`  TOP${d.rank}: ${d.department} | 加班${d.totalOvertimeHours}h | 费用${d.overtimeCost.toLocaleString()}元 | ${d.employeeCount}人`);
    });

    const allRankCorrect = result.overtimeTop10.every((d, idx) => d.rank === idx + 1);
    console.log(`  排名1~10连续正确: ${allRankCorrect ? '✅' : '❌'}`);

    console.log('\n  --- 假期清零倒计时 ---');
    const countdown = result.leaveClearanceCountdown;
    console.log(`  剩余天数: ${countdown.remainingDays}天`);
    console.log(`  风险员工数: ${countdown.atRiskCount}人`);
    console.log(`  截止日期: ${countdown.clearanceDeadline}`);
    console.log(`  假期结余总工时: ${countdown.totalLeaveBalanceHours}h`);
    console.log(`  风险工时: ${countdown.atRiskLeaveHours}h`);
    console.log(`  风险等级: ${countdown.riskLevel}`);

    const countdownOk = countdown.remainingDays !== undefined &&
      countdown.atRiskCount !== undefined &&
      typeof countdown.remainingDays === 'number' &&
      typeof countdown.atRiskCount === 'number';
    console.log(`  剩余天数+风险员工齐全: ${countdownOk ? '✅' : '❌'}`);

    if (trendOk && allMonthsHaveFields && overtimeOk && allRankCorrect && countdownOk) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function run_TR5_5_1_c() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.1-c: 权限测试 → EMPLOYEE/VICE_PRESIDENT/CEO');
  console.log('='.repeat(70));

  const rolePermission = new RolePermission();
  const auditLog = new DashboardAuditLog();
  const cockpit = new ExecutiveCockpit({ rolePermission, auditLog });
  let passed = 0;
  let failed = 0;

  try {
    console.log('\n  --- [1] 普通员工 EMPLOYEE ---');
    const empAccess = cockpit.hasSensitiveAccess({ role: ROLES.EMPLOYEE });
    console.log(`  hasSensitiveAccess(EMPLOYEE): ${empAccess} (期望: false) → ${!empAccess ? '✅' : '❌'}`);

    const empMetrics = cockpit.getExecutiveMetrics('2026-08', ROLES.EMPLOYEE, 'emp_001', '192.168.1.10');
    console.log(`  accessorRole: ${empMetrics.accessorRole} (${empMetrics.accessorRoleName})`);
    console.log(`  sensitiveDataMasked: ${empMetrics.accessControl.sensitiveDataMasked} (期望: true)`);

    const sensitiveFields = ['payrollMoMChange', 'turnoverRate', 'probationPassRate', 'laborEfficiency'];
    sensitiveFields.forEach(field => {
      const val = empMetrics[field];
      const isNull = val === null;
      console.log(`  ${field}: ${val === null ? 'null(掩码)' : JSON.stringify(val).slice(0, 50) + '...'} → ${isNull ? '✅ 已掩码' : '❌ 未掩码'}`);
    });
    const empAllMasked = sensitiveFields.every(f => empMetrics[f] === null);
    console.log(`  4个敏感指标全部=掩码(null): ${empAllMasked ? '✅' : '❌'}`);

    console.log('\n  --- [2] 分管副总 VICE_PRESIDENT ---');
    const vpAccess = cockpit.hasSensitiveAccess({ role: ROLES.VICE_PRESIDENT });
    console.log(`  hasSensitiveAccess(VICE_PRESIDENT): ${vpAccess} (期望: true) → ${vpAccess ? '✅' : '❌'}`);

    const vpMetrics = cockpit.getExecutiveMetrics('2026-08', ROLES.VICE_PRESIDENT, 'vp_001', '10.0.0.50');
    console.log(`  accessorRole: ${vpMetrics.accessorRole} (${vpMetrics.accessorRoleName})`);
    console.log(`  sensitiveDataMasked: ${vpMetrics.accessControl.sensitiveDataMasked} (期望: false)`);

    const vpFieldsOk = sensitiveFields.map(field => {
      const val = vpMetrics[field];
      const hasData = val !== null && val !== undefined;
      console.log(`  ${field}: ${hasData ? '有数据' : 'null'} → ${hasData ? '✅' : '❌'}`);
      return hasData;
    });
    const vpAllHasData = vpFieldsOk.every(Boolean);
    console.log(`  4个敏感指标(环比/离职/试用期/人效)全部有数据: ${vpAllHasData ? '✅' : '❌'}`);

    if (vpMetrics.payrollMoMChange) {
      console.log(`    payrollMoMChange.momChangeRateStr: ${vpMetrics.payrollMoMChange.momChangeRateStr}`);
    }
    if (vpMetrics.turnoverRate) {
      console.log(`    turnoverRate.overallRate: ${vpMetrics.turnoverRate.overallRate}%`);
    }
    if (vpMetrics.probationPassRate) {
      console.log(`    probationPassRate.passRate: ${vpMetrics.probationPassRate.passRate}%`);
    }
    if (vpMetrics.laborEfficiency) {
      console.log(`    laborEfficiency.efficiencyRatio: ${vpMetrics.laborEfficiency.efficiencyRatio}`);
    }

    console.log('\n  --- [3] CEO ---');
    const ceoAccess = cockpit.hasSensitiveAccess({ role: ROLES.CEO });
    console.log(`  hasSensitiveAccess(CEO): ${ceoAccess} (期望: true) → ${ceoAccess ? '✅' : '❌'}`);

    const ceoMetrics = cockpit.getExecutiveMetrics('2026-08', ROLES.CEO, 'ceo_001', '10.0.0.1');
    const ceoFieldsOk = sensitiveFields.every(f => ceoMetrics[f] !== null && ceoMetrics[f] !== undefined);
    console.log(`  CEO 4个敏感指标全部有数据: ${ceoFieldsOk ? '✅' : '❌'}`);

    console.log('\n  --- 访问日志记录 ---');
    const auditResult = cockpit.getAuditLog();
    console.log(`  总访问日志: ${auditResult.totalRecords}条 (期望: 3条)`);
    auditResult.logs.forEach((log, idx) => {
      console.log(`  [${idx + 1}] ${log.accessTimestamp.toISOString().slice(0, 19)} | ${log.accessorRoleName}(${log.accessor}) | IP:${log.ip} | 指标:${log.metricsAccessed.join(',')}`);
    });

    const logCountOk = auditResult.totalRecords === 3;
    console.log(`  3次访问日志齐全(EMPLOYEE+VP+CEO): ${logCountOk ? '✅' : '❌'}`);

    const logsHaveIp = auditResult.logs.every(l => l.ip && l.ip.length > 0);
    console.log(`  日志都有IP字段: ${logsHaveIp ? '✅' : '❌'}`);

    const logsHaveMetrics = auditResult.logs.every(l => l.metricsAccessed && l.metricsAccessed.length > 0);
    console.log(`  日志都有metricsAccessed: ${logsHaveMetrics ? '✅' : '❌'}`);

    if (
      !empAccess && empAllMasked &&
      vpAccess && vpAllHasData &&
      ceoAccess && ceoFieldsOk &&
      logCountOk && logsHaveIp && logsHaveMetrics
    ) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║    智慧化人资平台 Task5.5 TR-5.5.1 大屏+权限 自动化测试                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const r1 = await run_TR5_5_1_a();
  const r1k = await run_TR5_5_1_a_kpi();
  const r2 = await run_TR5_5_1_b();
  const r3 = await run_TR5_5_1_c();

  const totalPassed = r1.passed + r1k.passed + r2.passed + r3.passed;
  const totalFailed = r1.failed + r1k.failed + r2.failed + r3.failed;

  console.log('\n' + '='.repeat(70));
  console.log('  【TR-5.5.1 总体测试结果】');
  console.log('='.repeat(70));
  console.log(`  TR-5.5.1-a  SLA进度条:        通过${r1.passed}/${r1.passed + r1.failed}`);
  console.log(`  TR-5.5.1-a+ KPI≥8项指标:      通过${r1k.passed}/${r1k.passed + r1k.failed}`);
  console.log(`  TR-5.5.1-b  人工成本+TOP10:   通过${r2.passed}/${r2.passed + r2.failed}`);
  console.log(`  TR-5.5.1-c  权限+访问日志:    通过${r3.passed}/${r3.passed + r3.failed}`);
  console.log(`  总计: 通过${totalPassed}/${totalPassed + totalFailed}`);

  if (totalFailed === 0) {
    console.log('\n  🎉 TR-5.5.1 全部测试通过！');
  } else {
    console.log(`\n  ⚠️  TR-5.5.1 有${totalFailed}个测试失败，请检查代码。`);
  }

  console.log('\n  输出文件路径:');
  console.log('  - 模块文件: src/modules/dashboard/hr_executive_cockpit.js');
  console.log('  - 测试文件: tests/test_TR_5_5_1_dashboard_permission.js');
  console.log('');

  return { totalPassed, totalFailed };
}

if (require.main === module) {
  main().catch(err => {
    console.error('测试运行出错:', err);
    process.exit(1);
  });
}

module.exports = {
  run_TR5_5_1_a,
  run_TR5_5_1_a_kpi,
  run_TR5_5_1_b,
  run_TR5_5_1_c,
  main
};
