'use strict';

const {
  AttendanceAdminAPI,
  AnomalyStore,
  AttendanceAdminDashboard,
  ANOMALY_STATUS,
  CLOSURE_REASON,
  ROLE,
  PermissionError,
  MissingApprovalError
} = require('./src/api/attendance_admin_api.js');

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES
} = require('./src/modules/attendance/attendance_anomaly_engine.js');

const {
  MonthlySummaryAggregator
} = require('./src/modules/attendance/monthly_attendance_summary.js');

const DEPT1_LIST = ['研发中心', '销售事业部', '运营支持部', '产品设计部', '行政管理部'];
const DEPT2_MAP = {
  '研发中心': ['后端组', '前端组', '测试组', '运维组'],
  '销售事业部': ['华东区', '华南区', '华北区', '渠道组'],
  '运营支持部': ['客户成功组', '数据分析组', '内容运营组'],
  '产品设计部': ['产品组', 'UI组', 'UX组'],
  '行政管理部': ['HR组', '财务组', '行政组']
};

function _seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateMockEmployees(count = 100, seed = 20260828) {
  const rand = _seededRand(seed);
  const employees = [];
  for (let i = 1; i <= count; i++) {
    const dept1 = DEPT1_LIST[Math.floor(rand() * DEPT1_LIST.length)];
    const dept2List = DEPT2_MAP[dept1] || ['通用组'];
    const dept2 = dept2List[Math.floor(rand() * dept2List.length)];
    const eid = `EMP-${String(i).padStart(4, '0')}`;
    employees.push({
      id: eid,
      employeeId: eid,
      name: `员工${String(i).padStart(3, '0')}`,
      dept1,
      dept2,
      department: dept1,
      idCard: `110101199${i < 10 ? '0' + i : String(i).slice(-2)}0101${String(1000 + i).slice(-4)}`,
      bankCard: `622202${String(1000000000000 + i).slice(-15)}`
    });
  }
  return employees;
}

function generateMockAnomalies({
  totalCount = 500,
  closedCount = 400,
  pendingReminderCount = 5,
  seed = 20260828,
  employees = []
}) {
  const rand = _seededRand(seed);
  const anomalies = [];
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const thirtyHoursMs = 30 * 60 * 60 * 1000;

  const anomalyTypes = [
    ATTENDANCE_ANOMALY.LATE,
    ATTENDANCE_ANOMALY.EARLY_LEAVE,
    ATTENDANCE_ANOMALY.MISSING_PUNCH,
    ATTENDANCE_ANOMALY.ABSENT,
    ATTENDANCE_ANOMALY.OT_WORKDAY,
    ATTENDANCE_ANOMALY.OT_WEEKEND,
    ATTENDANCE_ANOMALY.LEAVE_PERSONAL,
    ATTENDANCE_ANOMALY.LEAVE_SICK,
    ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK
  ];

  let closedCreated = 0;
  let pendingReminderCreated = 0;
  let openCreated = 0;

  const totalOpenTarget = totalCount - closedCount;
  const normalOpenTarget = totalOpenTarget - pendingReminderCount;

  for (let i = 0; i < totalCount; i++) {
    const emp = employees[Math.floor(rand() * employees.length)];
    const eid = emp ? emp.id : `EMP-${String((i % 100) + 1).padStart(4, '0')}`;
    const typeIdx = Math.floor(rand() * anomalyTypes.length);
    const type = anomalyTypes[typeIdx];

    const dayOffset = Math.floor(rand() * 10);
    const dateObj = new Date(now.getTime() - dayOffset * oneDayMs);
    const dateStr = dateObj.toISOString().slice(0, 10);

    let generatedAt;
    let status;
    let closureReason = null;
    let closedAt = null;

    if (closedCreated < closedCount) {
      generatedAt = new Date(now.getTime() - (5 + Math.floor(rand() * 10)) * oneDayMs);
      status = ANOMALY_STATUS.CLOSED;
      closureReason = [CLOSURE_REASON.CONFIRMED, CLOSURE_REASON.MAKEUP, CLOSURE_REASON.APPEAL_SUCCESS][Math.floor(rand() * 3)];
      closedAt = new Date(generatedAt.getTime() + (1 + Math.floor(rand() * 2)) * oneDayMs);
      closedCreated++;
    } else if (pendingReminderCreated < pendingReminderCount) {
      generatedAt = new Date(now.getTime() - thirtyHoursMs - Math.floor(rand() * 60 * 60 * 1000));
      status = ANOMALY_STATUS.OPEN;
      pendingReminderCreated++;
    } else {
      generatedAt = new Date(now.getTime() - (1 + Math.floor(rand() * 24)) * 60 * 60 * 1000);
      status = ANOMALY_STATUS.OPEN;
      openCreated++;
    }

    const isOT = type === ATTENDANCE_ANOMALY.OT_WORKDAY || type === ATTENDANCE_ANOMALY.OT_WEEKEND;
    const deduction = isOT ? 0 : (type === ATTENDANCE_ANOMALY.MISSING_PUNCH ? 50 : (type === ATTENDANCE_ANOMALY.LATE || type === ATTENDANCE_ANOMALY.EARLY_LEAVE ? 20 : 0));

    const anomaly = {
      anomalyId: `AT_TASK29_${String(i + 1).padStart(5, '0')}`,
      employeeId: eid,
      date: dateStr,
      type,
      typeName: ANOMALY_NAMES[type],
      severity: deduction > 0 ? 'FINE' : (type === ATTENDANCE_ANOMALY.ABSENT ? 'DEDUCT' : 'WARNING'),
      deduction,
      ruleCodes: ['R-TEST'],
      generatedAt,
      status,
      closureReason,
      closedAt
    };

    if (isOT) {
      anomaly.otHours = 2 + Math.floor(rand() * 6);
      anomaly.extra = { otHours: anomaly.otHours };
    }
    if (type === ATTENDANCE_ANOMALY.LATE) {
      anomaly.extra = { lateMinutes: 5 + Math.floor(rand() * 50) };
    }
    if (type === ATTENDANCE_ANOMALY.ABSENT) {
      anomaly.absentDays = 1;
      anomaly.extra = { absentDays: 1 };
    }

    anomalies.push(anomaly);
  }

  return anomalies;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
      if (!deepEqual(a[keysA[i]], b[keysB[i]])) return false;
    }
    return true;
  }

  return false;
}

async function test_TR291() {
  console.log('\n================================================================================');
  console.log(' TR-2.9.1: 预填500条异常→Dashboard返回统计与月度汇总calc一致性+延迟<1分钟');
  console.log('================================================================================');

  const employees = generateMockEmployees(100, 20260828);
  console.log(`[TR-2.9.1] 步骤①: 构造模拟员工数: ${employees.length}人`);

  const anomalies = generateMockAnomalies({
    totalCount: 500,
    closedCount: 400,
    pendingReminderCount: 5,
    seed: 20260828,
    employees
  });

  const actualClosed = anomalies.filter(a => a.status === ANOMALY_STATUS.CLOSED).length;
  const actualOpen = anomalies.filter(a => a.status !== ANOMALY_STATUS.CLOSED).length;
  const now = new Date();
  const thirtyHoursMs = 30 * 60 * 60 * 1000;
  const actualPendingReminder = anomalies.filter(a => {
    if (a.status === ANOMALY_STATUS.CLOSED) return false;
    const elapsed = now.getTime() - new Date(a.generatedAt).getTime();
    return elapsed >= thirtyHoursMs;
  }).length;

  console.log(`[TR-2.9.1] 步骤②: 预填异常总数=500条:`);
  console.log(`  - 已闭环(CLOSED): ${actualClosed}条 (目标=400)`);
  console.log(`  - 未闭环(OPEN): ${actualOpen}条 (目标=100，其中95条普通+5条待催办)`);
  console.log(`  - 今日待催办数(≥30h): ${actualPendingReminder}条 (目标=5)`);

  const punchRecords = [];
  for (const emp of employees) {
    for (let d = 1; d <= 10; d++) {
      const dateStr = `2026-08-${String(d).padStart(2, '0')}`;
      const day = new Date(dateStr).getDay();
      if (day >= 1 && day <= 5) {
        punchRecords.push({
          employeeId: emp.id,
          date: dateStr,
          checkInTime: new Date(`${dateStr}T09:00:00`),
          checkOutTime: new Date(`${dateStr}T18:00:00`),
          isMissing: false
        });
      }
    }
  }

  const api = new AttendanceAdminAPI({ employees, anomalies });
  console.log(`\n[TR-2.9.1] 步骤③: AttendanceAdminAPI初始化完成，anomalyStore.size=${api.anomalyStore.size()}`);

  const call1Start = Date.now();
  const dashboard1 = api.getDashboard({
    role: ROLE.HR_DIRECTOR,
    year: 2026,
    month: 8,
    punchRecords
  });
  const call1End = Date.now();
  const call1Latency = call1End - call1Start;

  console.log(`\n[TR-2.9.1] 步骤④: 第1次调用getDashboard(HR_DIRECTOR):`);
  console.log(`  overviewCard.totalAnomalies = ${dashboard1.overviewCard.totalAnomalies} (期望=500)`);
  console.log(`  overviewCard.closedCount    = ${dashboard1.overviewCard.closedCount} (期望=400)`);
  console.log(`  overviewCard.closureRate    = ${dashboard1.overviewCard.closureRate}% (期望=80%)`);
  console.log(`  overviewCard.openCount      = ${dashboard1.overviewCard.openCount} (期望=100)`);
  console.log(`  overviewCard.pendingReminder= ${dashboard1.overviewCard.pendingReminder} (期望=5)`);
  console.log(`  本次调用耗时                = ${call1Latency}ms`);

  await new Promise(r => setTimeout(r, 20));
  const call2Start = Date.now();
  const dashboard2 = api.getDashboard({
    role: ROLE.HR_DIRECTOR,
    year: 2026,
    month: 8,
    punchRecords
  });
  const call2End = Date.now();

  const timestampDiff = Math.abs(dashboard2._internal.timestampEnd - dashboard1._internal.timestampEnd);
  console.log(`\n[TR-2.9.1] 步骤⑤: 第2次调用getDashboard，2次调用时间戳差=${timestampDiff}ms (要求<60000ms即<1分钟，本测试≥20ms)`);

  const aggregator = new MonthlySummaryAggregator();
  const summary = aggregator.calcMonthlySummary({
    year: 2026,
    month: 8,
    employees,
    punchRecords,
    anomalies: api.anomalyStore.getAll()
  });

  const expectedAnomalyTop10 = (summary.anomalyTypeDimension?.anomalyTop10 || []).map(x => ({
    empId: x.employeeId,
    employeeId: x.employeeId,
    name: x.name || '',
    dept: x.dept1 || '',
    count: x.count
  }));

  const expectedOtTop10 = (summary.anomalyTypeDimension?.otTop10 || []).map(x => ({
    employeeId: x.employeeId,
    name: x.name || '',
    dept: x.dept1 || '',
    hours: x.otHours
  }));

  const actualAnomalyTop10 = dashboard1.topRanking.anomalyTop10.map(x => ({
    empId: x.empId || x.employeeId,
    employeeId: x.employeeId,
    name: x.name || '',
    dept: x.dept || '',
    count: x.count
  }));

  const actualOtTop10 = dashboard1.topRanking.otTop10.map(x => ({
    employeeId: x.employeeId,
    name: x.name || '',
    dept: x.dept || '',
    hours: x.hours
  }));

  console.log(`\n[TR-2.9.1] 步骤⑥: 内部数据与monthly_summary的calc方法deepEqual对比:`);
  const anomalyTop10Equal = deepEqual(actualAnomalyTop10, expectedAnomalyTop10);
  const otTop10Equal = deepEqual(actualOtTop10, expectedOtTop10);
  console.log(`  anomalyTop10 deepEqual: ${anomalyTop10Equal ? '✅ PASS' : '❌ FAIL'}`);
  if (!anomalyTop10Equal) {
    console.log(`    实际前3:`, JSON.stringify(actualAnomalyTop10.slice(0, 3)));
    console.log(`    期望前3:`, JSON.stringify(expectedAnomalyTop10.slice(0, 3)));
  }
  console.log(`  otTop10 deepEqual:      ${otTop10Equal ? '✅ PASS' : '❌ FAIL'}`);
  if (!otTop10Equal) {
    console.log(`    实际前3:`, JSON.stringify(actualOtTop10.slice(0, 3)));
    console.log(`    期望前3:`, JSON.stringify(expectedOtTop10.slice(0, 3)));
  }

  const sla = dashboard1.slaProgressBar;
  const slaNodesOk = sla.dMinus3 != null && sla.dMinus2 != null && sla.dMinus1 != null && sla.dDay != null;
  console.log(`\n[TR-2.9.1] 步骤⑦: SLA进度条关键节点(dMinus3/dMinus2/dMinus1/dDay)共4个:`);
  console.log(`  slaProgressBar.dMinus3: closed=${sla.dMinus3?.closed}, total=${sla.dMinus3?.total}, achievementRate=${sla.dMinus3?.achievementRate}%`);
  console.log(`  slaProgressBar.dMinus2: closed=${sla.dMinus2?.closed}, total=${sla.dMinus2?.total}, achievementRate=${sla.dMinus2?.achievementRate}%`);
  console.log(`  slaProgressBar.dMinus1: closed=${sla.dMinus1?.closed}, total=${sla.dMinus1?.total}, achievementRate=${sla.dMinus1?.achievementRate}%`);
  console.log(`  slaProgressBar.dDay:    closed=${sla.dDay?.closed}, total=${sla.dDay?.total}, achievementRate=${sla.dDay?.achievementRate}%`);
  console.log(`  4节点全部存在: ${slaNodesOk ? '✅ PASS' : '❌ FAIL'}`);

  const checkTotalAnomalies = dashboard1.overviewCard.totalAnomalies === 500;
  const checkClosedCount = dashboard1.overviewCard.closedCount === 400;
  const checkClosureRate = Math.abs(dashboard1.overviewCard.closureRate - 80.0) < 0.001;
  const checkPendingReminder = dashboard1.overviewCard.pendingReminder === 5;
  const checkTimestampDiffMin = timestampDiff >= 20;
  const checkTimestampDiffMax = timestampDiff < 60000;

  console.log(`\n[TR-2.9.1] 校验清单:`);
  console.log(`  1. totalAnomalies=500:                  ${checkTotalAnomalies ? '✅' : '❌'} (实际=${dashboard1.overviewCard.totalAnomalies})`);
  console.log(`  2. closedCount=400:                     ${checkClosedCount ? '✅' : '❌'} (实际=${dashboard1.overviewCard.closedCount})`);
  console.log(`  3. closureRate=80%:                     ${checkClosureRate ? '✅' : '❌'} (实际=${dashboard1.overviewCard.closureRate}%)`);
  console.log(`  4. pendingReminder=5今日待催办:          ${checkPendingReminder ? '✅' : '❌'} (实际=${dashboard1.overviewCard.pendingReminder})`);
  console.log(`  5. 内部Top10与calc.deepEqual(anomaly):  ${anomalyTop10Equal ? '✅' : '❌'}`);
  console.log(`  6. 内部Top10与calc.deepEqual(ot):       ${otTop10Equal ? '✅' : '❌'}`);
  console.log(`  7. 2次时间戳差≥20ms:                    ${checkTimestampDiffMin ? '✅' : '❌'} (实际=${timestampDiff}ms)`);
  console.log(`  8. 2次时间戳差<60000ms(<1分钟):         ${checkTimestampDiffMax ? '✅' : '❌'} (实际=${timestampDiff}ms)`);
  console.log(`  9. SLA含4关键节点(d-3/-2/-1/D-Day):     ${slaNodesOk ? '✅' : '❌'}`);

  const pass = checkTotalAnomalies && checkClosedCount && checkClosureRate && checkPendingReminder
    && anomalyTop10Equal && otTop10Equal && checkTimestampDiffMin && checkTimestampDiffMax && slaNodesOk;

  console.log(`\n[TR-2.9.1] 结果: ${pass ? '✅ PASS (全部9项校验通过)' : '❌ FAIL (存在未通过项)'}`);
  return { pass, dashboard: dashboard1 };
}

async function test_TR292() {
  console.log('\n================================================================================');
  console.log(' TR-2.9.2: 批量豁免流程(权限校验+审批单号+生效机制)+错误场景验证');
  console.log('================================================================================');

  const employees = generateMockEmployees(50, 20260828 + 7);
  const anomaliesForStore = [];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const emp = employees[i % employees.length];
    const dateStr = `2026-08-${String((i % 28) + 1).padStart(2, '0')}`;
    anomaliesForStore.push({
      anomalyId: `AT_EXEMPT_TEST_${String(i + 1).padStart(3, '0')}`,
      employeeId: emp.id,
      date: dateStr,
      type: ATTENDANCE_ANOMALY.LATE,
      typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.LATE],
      severity: 'FINE',
      deduction: 20,
      ruleCodes: ['R-188', 'R-190'],
      generatedAt: new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
      extra: { lateMinutes: 15 + i }
    });
  }

  console.log(`[TR-2.9.2] 步骤①: 构造50条OPEN状态异常，deduction=20元/条`);

  const api = new AttendanceAdminAPI({ employees, anomalies: anomaliesForStore });
  console.log(`[TR-2.9.2] AttendanceAdminAPI初始化，store.size=${api.anomalyStore.size()}`);

  const allBefore = api.anomalyStore.getAll();
  const openCountBefore = allBefore.filter(a => a.status === ANOMALY_STATUS.OPEN).length;
  console.log(`  OPEN状态异常数(应=50): ${openCountBefore}`);

  const openIds = allBefore.filter(a => a.status === ANOMALY_STATUS.OPEN).map(a => a.anomalyId);
  const selectedIds = openIds.slice(0, 10);
  console.log(`\n[TR-2.9.2] 步骤②: 选取前10个异常ID用于批量豁免:`);
  console.log(`  选中异常ID列表: [${selectedIds.slice(0, 3).join(', ')} ... ] 共${selectedIds.length}个`);

  console.log(`\n[TR-2.9.2] 步骤③: HR_SPECIALIST角色调用batchExemptAnomalies(approvalNoRequired=true):`);
  const exemptResult = api.batchExemptAnomalies({
    role: ROLE.HR_SPECIALIST,
    anomalyIds: selectedIds,
    reason: '考勤异常统一批量豁免处理',
    approvalNoRequired: true
  });
  console.log(`  返回审批单号 approvalNo: ${exemptResult.approvalNo}`);
  console.log(`  requiresApproval:       ${exemptResult.requiresApproval} (HR_SPECIALIST应为true)`);
  console.log(`  status:                 ${exemptResult.status} (应为PENDING_APPROVAL)`);
  console.log(`  affectedCount:          ${exemptResult.affectedCount} (应为10)`);

  const allBeforeApprove = api.anomalyStore.getAll();
  const selectedAnomaliesBefore = allBeforeApprove.filter(a => selectedIds.includes(a.anomalyId));
  const stillOpenBefore = selectedAnomaliesBefore.filter(a => a.status === ANOMALY_STATUS.OPEN).length;
  const closedBeforeApprove = selectedAnomaliesBefore.filter(a => a.status === ANOMALY_STATUS.CLOSED).length;
  const deductionsStillPositive = selectedAnomaliesBefore.filter(a => (a.deduction || 0) > 0).length;

  console.log(`\n[TR-2.9.2] 步骤④: 未调用approve前，检查这10条异常:`);
  console.log(`  status=OPEN仍未闭环:   ${stillOpenBefore}条 (应=10，未生效)`);
  console.log(`  status=CLOSED已闭环:   ${closedBeforeApprove}条 (应=0，未审批前不生效)`);
  console.log(`  deduction>0仍有扣款:   ${deductionsStillPositive}条 (应=10，豁免未生效)`);

  console.log(`\n[TR-2.9.2] 步骤⑤: 调用approveBatchExemptions(审批单号)，审批通过生效:`);
  const approveResult = api.approveBatchExemptions({ approvalNo: exemptResult.approvalNo });
  console.log(`  approve结果.status:    ${approveResult.status} (应为APPROVED_AND_EXECUTED)`);
  console.log(`  approve结果.affectedCount: ${approveResult.affectedCount} (应为10)`);

  const allAfterApprove = api.anomalyStore.getAll();
  const selectedAfter = allAfterApprove.filter(a => selectedIds.includes(a.anomalyId));
  const closedAfter = selectedAfter.filter(a => a.status === ANOMALY_STATUS.CLOSED).length;
  const exemptReasonAfter = selectedAfter.filter(a => a.closureReason === CLOSURE_REASON.EXEMPT).length;
  const deductionZeroAfter = selectedAfter.filter(a => (a.deduction || 0) === 0).length;

  console.log(`\n[TR-2.9.2] 步骤⑥: 审批通过后检查这10条异常：`);
  console.log(`  status=CLOSED已闭环:         ${closedAfter}条 (应=10，已生效)`);
  console.log(`  closureReason=EXEMPT豁免:    ${exemptReasonAfter}条 (应=10)`);
  console.log(`  deduction=0元(已免扣款):     ${deductionZeroAfter}条 (应=10，扣款清零)`);

  console.log(`\n[TR-2.9.2] 步骤⑦: 故意用EMPLOYEE角色尝试批量豁免 → 预期抛出PermissionError:`);
  let threwPermission = false;
  let permissionErrInstance = null;
  try {
    api.batchExemptAnomalies({
      role: ROLE.EMPLOYEE,
      anomalyIds: selectedIds.slice(0, 3),
      reason: '员工尝试批量豁免'
    });
  } catch (err) {
    threwPermission = true;
    permissionErrInstance = err;
  }
  const isPermissionErrorInstance = permissionErrInstance instanceof PermissionError;
  console.log(`  抛出异常:                 ${threwPermission ? '是' : '否'}`);
  console.log(`  instanceof PermissionError: ${isPermissionErrorInstance ? '✅ 是' : '❌ 否'} (实际类型=${permissionErrInstance?.name || 'null'})`);
  if (permissionErrInstance) {
    console.log(`  错误信息: ${permissionErrInstance.message}`);
  }

  console.log(`\n[TR-2.9.2] 步骤⑧: 故意不带approvalNo调approveBatchExemptions → 预期抛出MissingApprovalError:`);
  let threwMissingApproval = false;
  let missingApprovalErr = null;
  try {
    api.approveBatchExemptions({});
  } catch (err) {
    threwMissingApproval = true;
    missingApprovalErr = err;
  }
  const isMissingApproval = missingApprovalErr instanceof MissingApprovalError;
  console.log(`  抛出异常:                    ${threwMissingApproval ? '是' : '否'}`);
  console.log(`  instanceof MissingApprovalError: ${isMissingApproval ? '✅ 是' : '❌ 否'} (实际类型=${missingApprovalErr?.name || 'null'})`);
  if (missingApprovalErr) {
    console.log(`  错误信息: ${missingApprovalErr.message}`);
  }

  const checkApprovalNoGenerated = !!exemptResult.approvalNo;
  const check10StillOpenBefore = stillOpenBefore === 10 && closedBeforeApprove === 0;
  const checkDeductionStill20Before = deductionsStillPositive === 10;
  const check10ClosedAfter = closedAfter === 10 && exemptReasonAfter === 10;
  const checkDeductionZeroAfter = deductionZeroAfter === 10;
  const checkEmployeePermissionDenied = threwPermission && isPermissionErrorInstance;
  const checkMissingApprovalError = threwMissingApproval && isMissingApproval;

  console.log(`\n[TR-2.9.2] 校验清单:`);
  console.log(`  1. HR_SPECIALIST批量豁免→生成审批单号:           ${checkApprovalNoGenerated ? '✅' : '❌'}`);
  console.log(`  2. 审批前10异常status仍=OPEN(未生效):            ${check10StillOpenBefore ? '✅' : '❌'} (OPEN=${stillOpenBefore}, CLOSED=${closedBeforeApprove})`);
  console.log(`  3. 审批前10异常deduction仍>0(未生效):            ${checkDeductionStill20Before ? '✅' : '❌'} (>0条数=${deductionsStillPositive})`);
  console.log(`  4. approve后10异常=CLOSED且reason=EXEMPT:        ${check10ClosedAfter ? '✅' : '❌'} (CLOSED=${closedAfter}, EXEMPT=${exemptReasonAfter})`);
  console.log(`  5. approve后10异常deduction=0清零:               ${checkDeductionZeroAfter ? '✅' : '❌'} (=0条数=${deductionZeroAfter})`);
  console.log(`  6. EMPLOYEE调批量豁免→抛出PermissionError:       ${checkEmployeePermissionDenied ? '✅' : '❌'}`);
  console.log(`  7. 无approvalNo调approve→抛出MissingApprovalError: ${checkMissingApprovalError ? '✅' : '❌'}`);

  const pass = checkApprovalNoGenerated && check10StillOpenBefore && checkDeductionStill20Before
    && check10ClosedAfter && checkDeductionZeroAfter && checkEmployeePermissionDenied && checkMissingApprovalError;

  console.log(`\n[TR-2.9.2] 结果: ${pass ? '✅ PASS (全部7项校验通过)' : '❌ FAIL (存在未通过项)'}`);
  return { pass, exemptResult, approveResult };
}

(async function runAll() {
  console.log('================================================================================');
  console.log(' 智慧化人资平台 Task2.9：考勤管理钉钉微应用后台API层 测试套件');
  console.log('================================================================================');
  console.log('\n【输出文件路径】:');
  console.log('  核心API层文件: src/api/attendance_admin_api.js');
  console.log('  主要导出:');
  console.log('    ① AttendanceAdminDashboard 仪表盘API:');
  console.log('       getDashboard({role, asOf}) → {overviewCard, slaProgressBar, topRanking, filtersMeta}');
  console.log('       overviewCard: {totalAnomalies, closedCount, closureRate%, openCount, pendingReminder}');
  console.log('       slaProgressBar: {dMinus3, dMinus2, dMinus1, dDay} 关键节点达成率');
  console.log('       topRanking: {anomalyTop10:[{empId,name,dept,count}], otTop10:[{empId,name,hours}]}');
  console.log('    ② 异常多维筛选API:');
  console.log('       queryAnomalies({role, filters:[employeeId/dept1/dept2/type/status/dateRange], page, pageSize})');
  console.log('       → 分页结果+敏感字段(idCard/bankCard)自动脱敏');
  console.log('    ③ 批量操作API:');
  console.log('       a) batchExemptAnomalies({role, anomalyIds, reason, approvalNoRequired=true})');
  console.log('          → 校验HR_DIRECTOR/HR_SPECIALIST权限 → 生成审批单号 → 记录pendingExemptionList');
  console.log('       b) approveBatchExemptions({approvalNo})');
  console.log('          → 审批通过后批量setClosed(EXEMPT), deduction=0元');
  console.log('       c) batchExportExcel({filters}) → 生成.csv内容');
  console.log('    ④ 权限守卫:');
  console.log('       EMPLOYEE仅看自己 / MANAGER看本部门 / HR及以上看全公司');
  console.log('       敏感字段(idCard/bankCard) 自动脱敏');
  console.log('  测试文件: test_task29.js (本文件)');

  const r1 = await test_TR291();
  const r2 = await test_TR292();

  const p1 = r1.pass;
  const p2 = r2.pass;

  console.log('\n================================================================================');
  console.log('测试总结:');
  console.log(`  TR-2.9.1 (Dashboard统计+月度calc一致性+2次调用延迟): ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.9.2 (批量豁免流程+权限+错误场景共7项):         ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('================================================================================');
})();
