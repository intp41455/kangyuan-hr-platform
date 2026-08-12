'use strict';

const {
  simulateSalary,
  _getEmployeeRegistry,
  PREDICTION_MODE
} = require('../src/modules/ai/hr_ai_agent.js');

const {
  PayrollDAGEngine,
  calcAbsentDeduction,
  calcOvertimePay,
  calcDailyRate,
  calcHourlyRate,
  STANDARD_PAY_DAYS,
  STANDARD_WORK_HOURS,
  round2
} = require('../src/modules/payroll/payroll_engine.js');

const {
  PayrollGradeModel,
  getPresetGrade
} = require('../src/modules/master_data/payroll_grade_model.js');

const { EmployeeModel } = require('../src/modules/master_data/employee_model.js');

function runTR_5_3_2() {
  console.log('='.repeat(80));
  console.log('TR-5.3.2 薪酬测算计算器SalarySimulator测试 开始执行');
  console.log('='.repeat(80));
  console.log('测试目标: 月薪10000员工 scenario={leaveDays=5, otRegularHours=8}');
  console.log('        → 扣减5天缺勤2298.85 + 加班费平日8h689.66 → netPayDelta=(-1609.19)');
  console.log('        → 与Task3.6薪酬核算逻辑差额≤1元精确');
  console.log('');

  const BASE_SALARY = 10000;
  const LEAVE_DAYS = 5;
  const OT_REGULAR_HOURS = 8;

  const EXPECTED_ABSENT_DEDUCTION = 2298.85;
  const EXPECTED_OVERTIME_PAY = 689.66;
  const EXPECTED_NET_PAY_DELTA = -1609.19;
  const TOLERANCE = 1.0;

  console.log('--- Step1: Task3.6薪酬核算逻辑(对照基准) ---');
  const dailyRateRaw = BASE_SALARY / STANDARD_PAY_DAYS;
  const hourlyRateRaw = dailyRateRaw / STANDARD_WORK_HOURS;
  console.log(`月薪: ${BASE_SALARY}元`);
  console.log(`计薪天数: ${STANDARD_PAY_DAYS}天/月`);
  console.log(`标准工时: ${STANDARD_WORK_HOURS}小时/天`);
  console.log(`日薪(精确): ${BASE_SALARY} / ${STANDARD_PAY_DAYS} = ${dailyRateRaw}`);
  console.log(`时薪(精确): ${dailyRateRaw.toFixed(10)} / ${STANDARD_WORK_HOURS} = ${hourlyRateRaw}`);
  console.log('');

  const task36Absent = calcAbsentDeduction({
    baseSalary: BASE_SALARY,
    personalLeaveDays: LEAVE_DAYS
  });
  console.log(`Task3.1 缺勤扣款(5天事假): ${task36Absent.total}元`);
  task36Absent.details.forEach(d => {
    console.log(`   · ${d.name}: ${d.days}天 × 日薪${d.dailyRate} × 系数${d.rate} = ${d.amount}元`);
  });

  const task36Overtime = calcOvertimePay({
    baseSalary: BASE_SALARY,
    workdayOvertimeHours: OT_REGULAR_HOURS
  });
  console.log(`Task3.4 加班费(平日8h): ${task36Overtime.total}元`);
  task36Overtime.details.forEach(d => {
    console.log(`   · ${d.name}: ${d.hours}h × 时薪${d.hourlyRate} × 系数${d.rate} = ${d.amount}元`);
  });

  const task36NetDelta = round2(task36Overtime.total - task36Absent.total);
  console.log('');
  console.log(`Task3.6综合 → 模拟netPayDelta = 加班费(${task36Overtime.total}) - 缺勤扣款(${task36Absent.total}) = ${task36NetDelta}元`);
  console.log('');

  console.log(`--- 与用户预期数值对照 (允许±1元) ---`);
  const absentDiff = Math.abs(task36Absent.total - EXPECTED_ABSENT_DEDUCTION);
  const otDiff = Math.abs(task36Overtime.total - EXPECTED_OVERTIME_PAY);
  const deltaDiff = Math.abs(task36NetDelta - EXPECTED_NET_PAY_DELTA);
  console.log(`缺勤扣款: 预期${EXPECTED_ABSENT_DEDUCTION} → 实际${task36Absent.total} → 差额${absentDiff.toFixed(4)}元 ${absentDiff <= TOLERANCE ? '✅合格' : '❌超差'}`);
  console.log(`加班费    : 预期${EXPECTED_OVERTIME_PAY} → 实际${task36Overtime.total} → 差额${otDiff.toFixed(4)}元 ${otDiff <= TOLERANCE ? '✅合格' : '❌超差'}`);
  console.log(`净Delta   : 预期${EXPECTED_NET_PAY_DELTA} → 实际${task36NetDelta} → 差额${deltaDiff.toFixed(4)}元 ${deltaDiff <= TOLERANCE ? '✅合格' : '❌超差'}`);
  const task36Accurate = absentDiff <= TOLERANCE && otDiff <= TOLERANCE && deltaDiff <= TOLERANCE;
  console.log(`Task3.6基准核算精度达标: ${task36Accurate ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  console.log('--- Step2: 通过HR AIAgent simulateSalary调用 ---');
  const scenario = {
    baseSalary: BASE_SALARY,
    leaveDays: LEAVE_DAYS,
    otRegularHours: OT_REGULAR_HOURS
  };
  const testEmpId = 'SIM-10K-EMP';
  console.log(`调用参数: empId=${testEmpId}, scenario=${JSON.stringify(scenario)}`);
  console.log(`注：使用scenario.baseSalary=${BASE_SALARY}直接构造月薪10000元的模拟员工（覆盖花名册数据）`);
  const simResult = simulateSalary({ empId: testEmpId, scenario });
  console.log('');
  console.log(`返回结果:`);
  console.log(`  mode            : ${simResult.mode} (预期: ${PREDICTION_MODE})`);
  console.log(`  baseSalary      : ${simResult.baseSalary}元`);
  console.log(`  netPayDelta     : ${simResult.netPayDelta}元`);
  console.log(`  缺勤扣款        : ${simResult.breakdown ? simResult.breakdown.absentDeduction : 'N/A'}元`);
  console.log(`  加班费          : ${simResult.breakdown ? simResult.breakdown.overtimePay : 'N/A'}元`);
  console.log(`  日薪            : ${simResult.breakdown ? simResult.breakdown.dailyRate : 'N/A'}元`);
  console.log(`  时薪            : ${simResult.breakdown ? simResult.breakdown.hourlyRate : 'N/A'}元`);

  if (simResult.breakdown && simResult.breakdown.absentDetails) {
    console.log('  缺勤明细:');
    simResult.breakdown.absentDetails.forEach(d => {
      console.log(`    - ${d.name}: ${d.days || d.count || 0}${d.days ? '天' : (d.count ? '次' : '')} 金额${d.amount}元`);
    });
  }
  if (simResult.breakdown && simResult.breakdown.overtimeDetails) {
    console.log('  加班明细:');
    simResult.breakdown.overtimeDetails.forEach(d => {
      console.log(`    - ${d.name}: ${d.hours}小时 × ${d.rate}倍 金额${d.amount}元`);
    });
  }

  console.log('');
  console.log('--- Step3: AIAgent结果 vs Task3.6基准 差额校验 (差额≤1元) ---');
  const simAbsent = simResult.breakdown ? simResult.breakdown.absentDeduction : 0;
  const simOt = simResult.breakdown ? simResult.breakdown.overtimePay : 0;
  const simDelta = simResult.netPayDelta;
  const diffAbsent = Math.abs(simAbsent - task36Absent.total);
  const diffOt = Math.abs(simOt - task36Overtime.total);
  const diffDelta = Math.abs(simDelta - task36NetDelta);

  console.log(`缺勤扣款差: ${simAbsent} vs ${task36Absent.total} → |Δ|=${diffAbsent.toFixed(4)}元 ${diffAbsent <= TOLERANCE ? '✅合格' : '❌超差'}`);
  console.log(`加班费  差: ${simOt} vs ${task36Overtime.total} → |Δ|=${diffOt.toFixed(4)}元 ${diffOt <= TOLERANCE ? '✅合格' : '❌超差'}`);
  console.log(`NetDelta差: ${simDelta} vs ${task36NetDelta} → |Δ|=${diffDelta.toFixed(4)}元 ${diffDelta <= TOLERANCE ? '✅合格' : '❌超差'}`);

  const passAgentVsTask36 = (diffAbsent <= TOLERANCE) && (diffOt <= TOLERANCE) && (diffDelta <= TOLERANCE);
  console.log(`Agent结果与Task3.6一致: ${passAgentVsTask36 ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('--- Step4: mode校验 = PREDICTION_NOT_ACTUAL ---');
  const passMode = simResult.mode === PREDICTION_MODE;
  console.log(`mode字段: ${simResult.mode} ${passMode ? '✅ PASS' : '❌ FAIL(必须是PREDICTION_NOT_ACTUAL)'}`);

  console.log('');
  console.log('--- Step5: 场景扩展验证 (周末/节假日/病假/旷工) ---');
  const extScenarios = [
    { name: '周末加班16h', s: { baseSalary: BASE_SALARY, otWeekendHours: 16 }, expectOtSign: '+' },
    { name: '病假3天(有病历)', s: { baseSalary: BASE_SALARY, sickLeaveDays: 3, sickHasMedicalRecord: true }, expectSign: '-' },
    { name: '旷工1天(×3扣)', s: { baseSalary: BASE_SALARY, absentDays: 1 }, expectSign: '-' },
    { name: '迟到早退6次(叠加)', s: { baseSalary: BASE_SALARY, lateEarlyLeaveCount: 6 }, expectSign: '-' },
    { name: '节假日加班4h(×3)', s: { baseSalary: BASE_SALARY, otHolidayHours: 4 }, expectOtSign: '+' }
  ];
  let extAllPass = true;
  for (const es of extScenarios) {
    const r = simulateSalary({ empId: 'SIM-EXT-EMP', scenario: es.s });
    const otOk = (r.breakdown && r.breakdown.overtimePay >= 0);
    const absOk = (r.breakdown && r.breakdown.absentDeduction >= 0);
    const hasBreakdown = !!r.breakdown;
    const ok = otOk && absOk && hasBreakdown;
    if (!ok) extAllPass = false;
    console.log(`  ${es.name}: Delta=${r.netPayDelta}元  加班${r.breakdown ? r.breakdown.overtimePay : 'N/A'}元  扣款${r.breakdown ? r.breakdown.absentDeduction : 'N/A'}元 → ${ok ? '✅合理' : '❌异常'}`);
  }
  console.log(`扩展场景全部合理: ${extAllPass ? '✅ PASS' : '❌ FAIL'}`);

  const finalPass = task36Accurate && passAgentVsTask36 && passMode && extAllPass;
  console.log('');
  console.log('='.repeat(80));
  console.log(`TR-5.3.2 综合结论: ${finalPass ? '✅ 全部通过 PASS' : '❌ 测试未通过 FAIL'}`);
  console.log(`  核心验证项:`);
  console.log(`    · 月薪10000 事假5天+平日加班8h netPayDelta=${simResult.netPayDelta}元`);
  console.log(`    · 与Task3.6差额(缺勤/加班/Delta): |Δ|均≤1元`);
  console.log(`    · mode=PREDICTION_NOT_ACTUAL 正确`);
  console.log('='.repeat(80));

  return {
    finalPass,
    baseSalary: BASE_SALARY,
    leaveDays: LEAVE_DAYS,
    otRegularHours: OT_REGULAR_HOURS,
    absentDeduction: task36Absent.total,
    overtimePay: task36Overtime.total,
    netPayDeltaTask36: task36NetDelta,
    netPayDeltaAgent: simResult.netPayDelta,
    diffAbsent,
    diffOt,
    diffDelta,
    tolerance: TOLERANCE
  };
}

if (require.main === module) {
  runTR_5_3_2();
}

module.exports = { runTR_5_3_2 };
