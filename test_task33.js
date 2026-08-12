'use strict';

const {
  PayrollDAGEngine,
  DAGOrderViolationError,
  calcAbsentDeduction,
  calcMonthRatio,
  round2
} = require('./src/modules/payroll/payroll_engine.js');
const { EmployeeModel } = require('./src/modules/master_data/employee_model.js');
const { PayrollGradeModel, getPresetGrade } = require('./src/modules/master_data/payroll_grade_model.js');

function assertEqual(actual, expected, message) {
  const a = round2(actual);
  const e = round2(expected);
  if (Math.abs(a - e) > 0.01) {
    console.log(`  ❌ ${message}: 期望=${e}, 实际=${a}, 差值=${(a-e).toFixed(4)}`);
    return false;
  }
  console.log(`  ✅ ${message}: ${a} == ${e}`);
  return true;
}

async function test_TR331() {
  console.log('\n========== TR-3.3.1: 副总级VICE_PRESIDENT 全勤核算测试 ==========');

  const vicePresGrade = getPresetGrade('VICE_PRESIDENT');
  console.log(`[数据准备] VICE_PRESIDENT薪级: baseAmount=${vicePresGrade.baseAmount}, performanceAmount=${vicePresGrade.performanceAmount}, total=${vicePresGrade.totalAmount}`);
  console.log(`  比例: baseSalaryRatio=9:performanceRatio=1 (base=${vicePresGrade.baseAmount} + perf=${vicePresGrade.performanceAmount} = ${vicePresGrade.baseAmount + vicePresGrade.performanceAmount})`);

  const entryDate = new Date();
  entryDate.setFullYear(entryDate.getFullYear() - 3);
  entryDate.setMonth(0);
  entryDate.setDate(15);

  const employee = new EmployeeModel({
    id: 'EMP-VP-001',
    name: '王副总',
    entryDate: entryDate,
    regularDate: new Date(entryDate.getTime() + 90 * 24 * 3600 * 1000),
    status: '正式',
    payrollGrade: 'VICE_PRESIDENT'
  });

  const years = employee.calcYearsOfService(new Date(2026, 7, 15));
  console.log(`[数据准备] 入职=${entryDate.getFullYear()}-${entryDate.getMonth()+1}-${entryDate.getDate()}, 工龄=${years}年`);

  const engine = new PayrollDAGEngine();

  const payslip = engine.executeFullDAG({
    employee,
    payrollGrade: vicePresGrade,
    year: 2026,
    month: 8,
    performanceScore: 100,
    personalLeaveDays: 0,
    sickLeaveDays: 0,
    absentDays: 0,
    lateEarlyLeaveCount: 0,
    customAllowances: [],
    adjustments: []
  });

  console.log('\n[核算结果详情]');
  console.log(`  1.baseSalary(基础工资): ${payslip.baseSalary}`);
  console.log(`  2.absentDeduction(缺勤扣款): ${payslip.absentDeduction.total}`);
  console.log(`  3.performancePay(绩效工资): ${payslip.performancePay.total} (标准=${payslip.performancePay.performanceStandard}, 得分=${payslip.performancePay.points})`);
  console.log(`  4.seniorityPay(工龄工资): ${payslip.seniorityPay.total} (工龄=${payslip.seniorityPay.years}年)`);
  console.log(`  5.overtimePay(加班费): ${payslip.overtimePay.total}`);
  console.log(`  6.allowances(津贴): ${payslip.allowances.total}`);
  console.log(`  7.otherAdjustments(其他): ${payslip.otherAdjustments.total}`);
  console.log(`  8.grossPay(应发工资): ${payslip.grossPay}`);
  console.log(`  9.socialFund(社保公积金): ${payslip.socialFund.total}`);
  console.log(`  10.incomeTax(个税): ${payslip.incomeTax}`);
  console.log(`  11.netPay(实发工资): ${payslip.netPay}`);
  console.log(`\n  DAG执行顺序: ${payslip.executionOrder.join(' → ')}`);

  const r1 = assertEqual(payslip.baseSalary, 10710, '基础工资=10710');
  const r2 = assertEqual(payslip.absentDeduction.total, 0, '缺勤扣款=0');
  const r3 = assertEqual(payslip.performancePay.total, 1190, '绩效工资=1190 (100分/标准1190)');
  const r4 = assertEqual(payslip.seniorityPay.total, 300, '工龄工资=300 (3年×100)');
  const r5 = assertEqual(payslip.grossPay, 12200, '应发工资grossPay=12200 (10710-0+1190+300+0+0+0)');

  const expectedGross = 10710 - 0 + 1190 + 300;
  console.log(`\n  交叉验证: base(${payslip.baseSalary}) - absent(${payslip.absentDeduction.total}) + perf(${payslip.performancePay.total}) + senior(${payslip.seniorityPay.total}) = ${expectedGross} == grossPay(${payslip.grossPay}): ${expectedGross === payslip.grossPay ? '✅' : '❌'}`);

  const pass = r1 && r2 && r3 && r4 && r5;
  console.log(`\n[TR-3.3.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR332() {
  console.log('\n========== TR-3.3.2: 员工D 2026-08-15转正 按日折算测试 ==========');

  const employeeDGrade = new PayrollGradeModel({
    gradeCode: 'EMP_D',
    gradeName: '员工D薪级',
    baseSalaryRatio: 1.0,
    performanceRatio: 0.0,
    baseAmount: 5800,
    performanceAmount: 0,
    probationRatio: 0.8
  });

  const employee = new EmployeeModel({
    id: 'EMP-D-001',
    name: '员工D',
    entryDate: '2026-02-15',
    regularDate: '2026-08-15',
    status: '试用期',
    payrollGrade: 'EMP_D'
  });

  console.log(`[数据准备] 入职=2026-02-15, 转正=2026-08-15, 8月1日-14日试用期(80%), 8月15日-31日正式期(100%)`);
  console.log(`[数据准备] 正式base=5800元, 试用期比例=80%`);

  const ratio = calcMonthRatio({
    year: 2026, month: 8,
    entryDate: '2026-02-15',
    regularDate: '2026-08-15'
  }, { year: 2026, month: 8 });

  console.log(`\n[按月折算] 8月总工作日=${ratio.totalWorkdays}天`);
  console.log(`  试用期(1-14日)工作日=${ratio.firstPartDays}天, 占比=${(ratio.firstPartRatio*100).toFixed(2)}%`);
  console.log(`  正式期(15-31日)工作日=${ratio.secondPartDays}天, 占比=${(ratio.secondPartRatio*100).toFixed(2)}%`);

  const probationDaily = 5800 * 0.8 / 21.75;
  const regularDaily = 5800 / 21.75;
  const expectedProbationPart = round2(ratio.firstPartDays * probationDaily);
  const expectedRegularPart = round2(ratio.secondPartDays * regularDaily);
  const expectedBase = round2(expectedProbationPart + expectedRegularPart);

  console.log(`\n[按21.75日薪标准计算]`);
  console.log(`  试用期日工资=5800×0.8÷21.75=${probationDaily.toFixed(4)}`);
  console.log(`  试用期工资=${ratio.firstPartDays}天 × ${probationDaily.toFixed(4)} = ${expectedProbationPart}`);
  console.log(`  正式期日工资=5800÷21.75=${regularDaily.toFixed(4)}`);
  console.log(`  正式期工资=${ratio.secondPartDays}天 × ${regularDaily.toFixed(4)} = ${expectedRegularPart}`);
  console.log(`  预期基础工资合计=${expectedProbationPart} + ${expectedRegularPart} = ${expectedBase}`);

  const engine = new PayrollDAGEngine();

  const payslip = engine.executeFullDAG({
    employee,
    payrollGrade: employeeDGrade,
    year: 2026,
    month: 8,
    performanceScore: 0,
    personalLeaveDays: 0,
    sickLeaveDays: 0,
    absentDays: 0,
    lateEarlyLeaveCount: 0,
    customAllowances: [],
    adjustments: []
  });

  console.log(`\n[DAG核算结果]`);
  console.log(`  试用期base部分: ${payslip.baseSalaryBreakdown.probationBase}`);
  console.log(`  正式期base部分: ${payslip.baseSalaryBreakdown.regularBase}`);
  console.log(`  基础工资baseSalary: ${payslip.baseSalary}`);
  console.log(`  grossPay应发: ${payslip.grossPay}`);
  console.log(`  DAG执行顺序合规: ${payslip.executionOrder.join(' → ')}`);

  const r1 = assertEqual(payslip.baseSalaryBreakdown.probationBase, expectedProbationPart, `试用期部分=${expectedProbationPart} (${ratio.firstPartDays}天×80%÷21.75)`);
  const r2 = assertEqual(payslip.baseSalaryBreakdown.regularBase, expectedRegularPart, `正式期部分=${expectedRegularPart} (${ratio.secondPartDays}天×100%÷21.75)`);
  const r3 = assertEqual(payslip.baseSalary, expectedBase, `基础工资合计=${expectedBase}`);

  const dagOrderValid = Array.isArray(payslip.executionOrder) && payslip.executionOrder.length === 11;
  console.log(`  DAG执行顺序11个节点完整: ${dagOrderValid ? '✅' : '❌'} (${payslip.executionOrder.length}个)`);

  const pass = r1 && r2 && r3 && dagOrderValid;
  console.log(`\n[TR-3.3.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR333() {
  console.log('\n========== TR-3.3.3: 员工E 事假2天+病假3天 缺勤扣款测试 ==========');

  const baseSalary = 10000;
  const daily = baseSalary / 21.75;

  console.log(`[数据准备] baseSalary=${baseSalary}元`);
  console.log(`[数据准备] 日工资=${baseSalary}÷21.75=${daily.toFixed(4)}元`);

  const expectedPersonalWithRecord = round2(2 * daily);
  const expectedSickWithRecord = round2(3 * daily * 0.2);
  const expectedTotalWithRecord = round2(expectedPersonalWithRecord + expectedSickWithRecord);
  console.log(`\n[场景A] 病假3天有病历:`);
  console.log(`  事假2天: 2 × ${daily.toFixed(4)} = ${expectedPersonalWithRecord}`);
  console.log(`  病假3天扣20%: 3 × ${daily.toFixed(4)} × 20% = ${expectedSickWithRecord}`);
  console.log(`  预期合计: ${expectedPersonalWithRecord} + ${expectedSickWithRecord} = ${expectedTotalWithRecord} 元`);

  const resultWithRecord = calcAbsentDeduction({
    baseSalary,
    personalLeaveDays: 2,
    sickLeaveDays: 3,
    sickHasMedicalRecord: true,
    absentDays: 0
  });
  console.log(`  实际核算: ${resultWithRecord.total} 元`);
  console.log(`  明细: ${resultWithRecord.details.map(d => `${d.name}=${d.amount}元`).join(', ')}`);

  const r1 = assertEqual(resultWithRecord.total, expectedTotalWithRecord, `场景A：有病历absentDeduction=${expectedTotalWithRecord}`);

  const expectedNoRecord = round2(5 * daily);
  console.log(`\n[场景B] 病假3天无病历(按事假计):`);
  console.log(`  全部按事假5天: 5 × ${daily.toFixed(4)} = ${expectedNoRecord} 元`);

  const resultNoRecord = calcAbsentDeduction({
    baseSalary,
    personalLeaveDays: 2,
    sickLeaveDays: 3,
    sickHasMedicalRecord: false,
    absentDays: 0
  });
  console.log(`  实际核算: ${resultNoRecord.total} 元`);
  console.log(`  明细: ${resultNoRecord.details.map(d => `${d.name}=${d.amount}元`).join(', ')}`);

  const r2 = assertEqual(resultNoRecord.total, expectedNoRecord, `场景B：无病历absentDeduction=${expectedNoRecord}`);
  const diff = Math.abs(resultWithRecord.total - resultNoRecord.total);
  console.log(`\n  两种场景差异: ${resultNoRecord.total} - ${resultWithRecord.total} = ${diff.toFixed(2)} 元 (差异明显验证)`);
  const r3 = diff > 1000;
  console.log(`  差异>1000元(明显): ${r3 ? '✅' : '❌'} (实际${diff.toFixed(2)}元)`);

  const pass = r1 && r2 && r3;
  console.log(`\n[TR-3.3.3] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR334() {
  console.log('\n========== TR-3.3.4: 员工F 旷工1天扣款+DAG顺序违规测试 ==========');

  const baseSalary = 15000;
  const daily = baseSalary / 21.75;
  const expectedAbsentDeduction = round2(daily * 3);

  console.log(`[数据准备] baseSalary=${baseSalary}元, 旷工1天`);
  console.log(`[旷工扣款规则] 旷工当日×3扣 = 日工资×3`);
  console.log(`  日工资=${baseSalary}÷21.75=${daily.toFixed(4)}元`);
  console.log(`  旷工扣款=${daily.toFixed(4)} × 3 = ${expectedAbsentDeduction}元`);

  const engine = new PayrollDAGEngine();

  const employeeFGrade = new PayrollGradeModel({
    gradeCode: 'EMP_F',
    gradeName: '员工F薪级',
    baseSalaryRatio: 1.0,
    performanceRatio: 0.0,
    baseAmount: 15000,
    performanceAmount: 0,
    probationRatio: 1.0
  });

  const employee = new EmployeeModel({
    id: 'EMP-F-001',
    name: '员工F',
    entryDate: '2024-01-01',
    regularDate: '2024-04-01',
    status: '正式',
    payrollGrade: 'EMP_F'
  });

  const payslip = engine.executeFullDAG({
    employee,
    payrollGrade: employeeFGrade,
    year: 2026,
    month: 8,
    absentDays: 1,
    personalLeaveDays: 0,
    sickLeaveDays: 0,
    performanceScore: 0
  });

  console.log(`\n[场景A-旷工核算] 实际旷工扣款=${payslip.absentDeduction.total}元`);
  console.log(`  明细: ${payslip.absentDeduction.details.map(d => `${d.name}=${d.amount}元(rate=x${d.rate})`).join(', ')}`);
  const r1 = assertEqual(payslip.absentDeduction.total, expectedAbsentDeduction, `旷工1天扣款=${expectedAbsentDeduction}元`);

  console.log(`\n[场景B-DAG顺序违规] 故意先调绩效后算base:`);
  const engine2 = new PayrollDAGEngine();
  let caughtError = null;
  try {
    engine2.calcPerformancePay({ performanceScore: 80 });
    console.log('  ❌ 未抛出异常，DAG顺序校验失效!');
  } catch (err) {
    caughtError = err;
    console.log(`  ✅ 抛出异常: ${err.name}: ${err.message}`);
  }

  const r2 = caughtError instanceof DAGOrderViolationError;
  const expectedMsg = '需要先完成节点baseSalary才能算performancePay';
  const r3 = caughtError && caughtError.message && caughtError.message === expectedMsg;

  console.log(`\n[DAG校验结果]`);
  console.log(`  异常类型=DAGOrderViolationError: ${r2 ? '✅' : '❌'} (实际=${caughtError ? caughtError.name : '无异常'})`);
  console.log(`  异常消息正确: ${r3 ? '✅' : '❌'} (期望="${expectedMsg}", 实际="${caughtError ? caughtError.message : '无'}")`);

  const pass = r1 && r2 && r3;
  console.log(`\n[TR-3.3.4] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('============================================================');
  console.log('智慧化人资平台 Task3.3 薪酬核算DAG引擎 测试套件');
  console.log('============================================================');
  console.log('\n【输出文件路径】:');
  console.log('  主引擎文件: src/modules/payroll/payroll_engine.js');
  console.log('  主要导出:');
  console.log('    - PayrollDAGEngine 核心DAG执行类');
  console.log('    - DAG_NODES 核算节点顺序定义(11节点拓扑)');
  console.log('    - DAGOrderViolationError DAG顺序违规错误');
  console.log('    - calcDailyRate 日工资计算 (base÷21.75)');
  console.log('    - calcHourlyRate 小时工资计算 (日工资÷8)');
  console.log('    - calcSeniorityPayAmount 工龄工资 (满1年起×100，10年封顶)');
  console.log('    - calcPerformancePayAmount 绩效工资 (标准×得分/100)');
  console.log('    - calcMonthRatio 入职/转正/离职月按日折算');
  console.log('    - calcAbsentDeduction 缺勤扣款 (事假/病假/旷工/迟到批量)');
  console.log('    - calcOvertimePay 加班费 (1.5/2/3倍时薪)');
  console.log('  DAG拓扑顺序: baseSalary → absentDeduction → performancePay → seniorityPay → overtimePay → allowances → otherAdjustments → grossPay → socialHousingFund → incomeTax → netPay');

  const p1 = await test_TR331();
  const p2 = await test_TR332();
  const p3 = await test_TR333();
  const p4 = await test_TR334();

  console.log('\n============================================================');
  console.log('测试总结:');
  console.log(`  TR-3.3.1 (副总级全勤grossPay=12200元):             ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.3.2 (员工D转正8月按日折算精确):                 ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.3.3 (员工E事假病假扣款两种场景精确):            ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.3.4 (员工F旷工×3扣款+DAG违规报错):             ${p4 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3 && p4) ? '🎉 全部4个测试通过' : '⚠️ 存在失败用例'}`);
  console.log('============================================================');
})();
