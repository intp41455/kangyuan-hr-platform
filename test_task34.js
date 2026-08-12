'use strict';

const {
  calcOvertimePay,
  applyCompTimeFirst,
  EduPayrollPackageManager,
  OVERTIME_TYPES,
  APPROVAL_ROLES
} = require('./src/modules/payroll/overtime_edu_package.js');
const { EmployeeModel, POSITION_TAGS } = require('./src/modules/master_data/employee_model.js');
const { round2 } = require('./src/modules/payroll/payroll_engine.js');

function assertEqual(actual, expected, message, tolerance = 0.01) {
  const a = round2(actual);
  const e = round2(expected);
  if (Math.abs(a - e) > tolerance) {
    console.log(`  ❌ ${message}: 期望=${e}, 实际=${a}, 差值=${(a - e).toFixed(4)}`);
    return false;
  }
  console.log(`  ✅ ${message}: ${a} == ${e}`);
  return true;
}

function assertTrue(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    return true;
  }
  console.log(`  ❌ ${message}`);
  return false;
}

async function test_TR341() {
  console.log('\n========== TR-3.4.1: 月薪8700 平日/周末/节假日加班费精确核算 ==========');

  const baseSalary = 8700;
  const expectedHourly = 8700 / 21.75 / 8;
  console.log(`[数据准备] baseSalary=${baseSalary}元`);
  console.log(`  hourlyRate = ${baseSalary} ÷ 21.75 ÷ 8 = ${expectedHourly.toFixed(6)} ≈ ${round2(expectedHourly)} 元/小时`);

  const workdayHours = 4;
  const weekendHours = 8;
  const holidayHours = 6;

  const expectedWorkdayPay = round2(expectedHourly * 1.5 * workdayHours);
  const expectedWeekendPay = round2(expectedHourly * 2 * weekendHours);
  const expectedHolidayPay = round2(expectedHourly * 3 * holidayHours);
  const expectedTotal = round2(expectedWorkdayPay + expectedWeekendPay + expectedHolidayPay);

  console.log(`\n[预期结果]`);
  console.log(`  平日加班${workdayHours}h: ${expectedHourly.toFixed(2)} × 1.5 × ${workdayHours} = ${expectedWorkdayPay}元`);
  console.log(`  周末加班${weekendHours}h: ${expectedHourly.toFixed(2)} × 2 × ${weekendHours} = ${expectedWeekendPay}元`);
  console.log(`  节假日加班${holidayHours}h: ${expectedHourly.toFixed(2)} × 3 × ${holidayHours} = ${expectedHolidayPay}元`);
  console.log(`  加班费合计: ${expectedWorkdayPay} + ${expectedWeekendPay} + ${expectedHolidayPay} = ${expectedTotal}元`);

  const result = calcOvertimePay({
    baseSalary,
    monthOvertimeRecords: [
      { date: '2026-08-05', hours: workdayHours, type: OVERTIME_TYPES.WORKDAY, eduExemptFlag: false },
      { date: '2026-08-09', hours: weekendHours, type: OVERTIME_TYPES.WEEKEND, eduExemptFlag: false },
      { date: '2026-08-15', hours: holidayHours, type: OVERTIME_TYPES.HOLIDAY, eduExemptFlag: false }
    ]
  });

  console.log(`\n[实际核算结果]`);
  console.log(`  hourlyRate: ${result.hourlyRate}`);
  console.log(`  明细:`);
  result.details.forEach(d => {
    console.log(`    ${d.date} ${d.typeName} ${d.hours}h × ${d.rate} = ${d.otPay}元`);
  });
  console.log(`  合计加班费: ${result.total}元`);

  let pass = true;
  pass = assertEqual(result.hourlyRate, 50, 'hourlyRate=50元/小时') && pass;
  pass = assertEqual(result.details[0].otPay, 300, '平日4h加班费=300元 (50×1.5×4)') && pass;
  pass = assertEqual(result.details[1].otPay, 800, '周末8h加班费=800元 (50×2×8)') && pass;
  pass = assertEqual(result.details[2].otPay, 900, '节假日6h加班费=900元 (50×3×6)') && pass;
  pass = assertEqual(result.total, 2000, '加班费合计=2000元 (300+800+900)') && pass;

  console.log(`\n[教育岗平日豁免验证 - 附加]`);
  const eduExemptResult = calcOvertimePay({
    baseSalary,
    monthOvertimeRecords: [
      { date: '2026-08-05', hours: 8, type: OVERTIME_TYPES.WORKDAY, eduExemptFlag: true },
      { date: '2026-08-09', hours: 8, type: OVERTIME_TYPES.WEEKEND, eduExemptFlag: true }
    ]
  });
  const exemptWorkday = eduExemptResult.details[0];
  const nonExemptWeekend = eduExemptResult.details[1];
  console.log(`  教育岗平日8h: isExempt=${exemptWorkday.isExempt}, otPay=${exemptWorkday.otPay}`);
  console.log(`  教育岗周末8h: isExempt=${nonExemptWeekend.isExempt}, otPay=${nonExemptWeekend.otPay}`);
  pass = assertEqual(exemptWorkday.otPay, 0, '教育岗平日加班豁免→0元') && pass;
  pass = assertEqual(nonExemptWeekend.otPay, 800, '教育岗周末加班不豁免→800元') && pass;

  console.log(`\n[TR-3.4.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR342() {
  console.log('\n========== TR-3.4.2: 员工G 调休抵扣优先(applyCompTimeFirst)测试 ==========');

  const baseSalary = 8700;
  const hourlyRate = 50;

  console.log(`[数据准备] baseSalary=8700, hourlyRate=50元/小时`);
  console.log(`  场景A: 调休余额=8h; 平日加班: 周一8h + 周二4h = 总12h`);

  const overtimeRecords = [
    { date: '2026-08-10', hours: 8, type: OVERTIME_TYPES.WORKDAY, eduExemptFlag: false, hourlyRate },
    { date: '2026-08-11', hours: 4, type: OVERTIME_TYPES.WORKDAY, eduExemptFlag: false, hourlyRate }
  ];

  console.log(`  预期: 优先抵扣周一8h（全部抵扣），剩余调休=0; 周二4h需支付=4×50×1.5=300元`);

  const resultA = applyCompTimeFirst({
    comptimeBalanceHours: 8,
    overtimeRecords: JSON.parse(JSON.stringify(overtimeRecords))
  });

  console.log(`\n[场景A-实际结果]`);
  console.log(`  抵扣总小时数(deductedHours): ${resultA.deductedHours}`);
  console.log(`  剩余调休余额(remainingCompTimeHours): ${resultA.remainingCompTimeHours}`);
  console.log(`  抵扣加班费金额(deductedOtPay): ${resultA.deductedOtPay}`);
  console.log(`  调整后记录:`);
  resultA.adjustedRecords.forEach((r, idx) => {
    console.log(`    记录${idx + 1}(${r.date}): 原${overtimeRecords[idx].hours}h → 剩余${r.hours}h, 调休抵扣${r.comptimeDeductedHours}h`);
  });

  let pass = true;
  pass = assertEqual(resultA.deductedHours, 8, '场景A: 抵扣总小时=8h') && pass;
  pass = assertEqual(resultA.remainingCompTimeHours, 0, '场景A: 剩余调休余额=0') && pass;
  pass = assertEqual(resultA.adjustedRecords[0].hours, 0, '场景A: 周一8h全部抵扣→0h') && pass;
  pass = assertEqual(resultA.adjustedRecords[1].hours, 4, '场景A: 周二4h保留→4h') && pass;

  const calcOtResult = calcOvertimePay({
    baseSalary,
    monthOvertimeRecords: resultA.adjustedRecords.map(r => ({
      date: r.date,
      hours: r.hours,
      type: r.type,
      eduExemptFlag: r.eduExemptFlag
    }))
  });
  console.log(`  调整后加班费核算: ${calcOtResult.total}元`);
  pass = assertEqual(calcOtResult.total, 300, '场景A: 调整后加班费=300元 (周二4h×1.5×50)') && pass;

  console.log(`\n[场景B: 调休余额=12h → 全部抵扣，加班费=0元]`);
  console.log(`  预期: 抵扣12h(全部); 剩余调休=0; 加班费=0`);

  const resultB = applyCompTimeFirst({
    comptimeBalanceHours: 12,
    overtimeRecords: JSON.parse(JSON.stringify(overtimeRecords))
  });

  console.log(`\n[场景B-实际结果]`);
  console.log(`  抵扣总小时数: ${resultB.deductedHours}`);
  console.log(`  剩余调休余额: ${resultB.remainingCompTimeHours}`);
  console.log(`  记录1: 原8h → ${resultB.adjustedRecords[0].hours}h`);
  console.log(`  记录2: 原4h → ${resultB.adjustedRecords[1].hours}h`);

  pass = assertEqual(resultB.deductedHours, 12, '场景B: 抵扣总小时=12h') && pass;
  pass = assertEqual(resultB.remainingCompTimeHours, 0, '场景B: 剩余调休余额=0') && pass;
  pass = assertEqual(resultB.adjustedRecords[0].hours + resultB.adjustedRecords[1].hours, 0, '场景B: 两个记录加班小时合计=0') && pass;

  const calcOtResultB = calcOvertimePay({
    baseSalary,
    monthOvertimeRecords: resultB.adjustedRecords.map(r => ({
      date: r.date,
      hours: r.hours,
      type: r.type,
      eduExemptFlag: r.eduExemptFlag
    }))
  });
  pass = assertEqual(calcOtResultB.total, 0, '场景B: 调整后加班费=0元 (全部抵扣)') && pass;

  console.log(`\n[场景C: 调休余额=20h（大于加班总时长） → 余额剩余8h]`);
  const resultC = applyCompTimeFirst({
    comptimeBalanceHours: 20,
    overtimeRecords: JSON.parse(JSON.stringify(overtimeRecords))
  });
  pass = assertEqual(resultC.deductedHours, 12, '场景C: 抵扣12h') && pass;
  pass = assertEqual(resultC.remainingCompTimeHours, 8, '场景C: 剩余调休=20-12=8h') && pass;

  console.log(`\n[TR-3.4.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR343() {
  console.log('\n========== TR-3.4.3: 100人工资数据 教育/总部分拆薪酬包 ==========');

  const manager = new EduPayrollPackageManager();
  manager.resetTaxCumulativeStore();

  const payrollResults = [];

  const workLocationsEdu = ['西安', '天水', '白银', '西安', '天水'];
  const workLocationsHq = ['西安', '西安', '咸阳', '西安', '西安'];

  for (let i = 1; i <= 50; i++) {
    const idx = (i - 1) % workLocationsEdu.length;
    const workLocation = workLocationsEdu[idx];
    const employee = new EmployeeModel({
      id: `EDU-${String(i).padStart(3, '0')}`,
      name: `教育员工${i}`,
      entity: '陕西康源福祉教育科技',
      dept1: '教育事业部',
      dept2: `教学${idx + 1}部`,
      position: `教师-${i}`,
      positionTag: POSITION_TAGS.EDUCATION,
      workLocation,
      entryDate: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      regularDate: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      status: '正式',
      payrollGrade: 'EMP_B'
    });
    payrollResults.push({
      employee,
      employeeId: employee.id,
      employeeName: employee.name,
      position: employee.position,
      payrollMonth: '2026-08-01',
      year: 2026,
      month: 8,
      baseSalary: 5000 + (i % 5) * 500,
      performancePay: 1000 + (i % 3) * 200,
      seniorityPay: (i % 6) * 100,
      overtimePay: (i % 4) * 150,
      allowances: 300 + (i % 2) * 100,
      otherAdjustments: 0,
      grossPay: 0,
      eduHourAllowance: 200 + (i % 5) * 50,
      eduPerformanceBonus: 800 + (i % 4) * 300
    });
  }

  for (let i = 1; i <= 50; i++) {
    const idx = (i - 1) % workLocationsHq.length;
    const workLocation = workLocationsHq[idx];
    const employee = new EmployeeModel({
      id: `HQ-${String(i).padStart(3, '0')}`,
      name: `总部员工${i}`,
      entity: '上海康源博曜科技',
      dept1: '总部行政中心',
      dept2: `行政${idx + 1}部`,
      position: `行政专员-${i}`,
      positionTag: POSITION_TAGS.NON_EDUCATION,
      workLocation,
      entryDate: `2022-0${(i % 9) + 1}-${(i % 28) + 1}`,
      regularDate: `2022-0${(i % 9) + 1}-${(i % 28) + 1}`,
      status: '正式',
      payrollGrade: 'EMP_C'
    });
    payrollResults.push({
      employee,
      employeeId: employee.id,
      employeeName: employee.name,
      position: employee.position,
      payrollMonth: '2026-08-01',
      year: 2026,
      month: 8,
      baseSalary: 6000 + (i % 5) * 400,
      performancePay: 1200 + (i % 3) * 250,
      seniorityPay: (i % 8) * 100,
      overtimePay: (i % 5) * 200,
      allowances: 400 + (i % 2) * 150,
      otherAdjustments: 0,
      grossPay: 0
    });
  }

  for (const pr of payrollResults) {
    pr.grossPay = round2((pr.baseSalary || 0) + (pr.performancePay || 0) + (pr.seniorityPay || 0) +
                          (pr.overtimePay || 0) + (pr.allowances || 0) + (pr.otherAdjustments || 0) +
                          ((pr.eduHourAllowance || 0) + (pr.eduPerformanceBonus || 0)));
  }

  console.log(`[数据准备] 生成100人工资数据`);
  console.log(`  教育岗: 50人 (EDU-001 ~ EDU-050), workLocation分布: ${workLocationsEdu.join('/')}`);
  console.log(`  非教育岗: 50人 (HQ-001 ~ HQ-050), workLocation分布: ${workLocationsHq.join('/')}`);
  console.log(`  总人数: ${payrollResults.length}`);

  const workbook = manager.createSplitWorkbook(payrollResults);

  console.log(`\n[分拆结果]`);
  console.log(`  sheetHeadquarters(总部)行数: ${workbook.sheetHeadquarters.dataRowCount}`);
  console.log(`  sheetEducation(教育)行数: ${workbook.sheetEducation.dataRowCount}`);
  console.log(`  总行数匹配: ${workbook.metadata.totalCount} (教育${workbook.metadata.educationCount}+总部${workbook.metadata.headquartersCount})`);

  let pass = true;
  pass = assertEqual(workbook.sheetHeadquarters.dataRowCount, 50, '总部Sheet=50人(非教育岗)') && pass;
  pass = assertEqual(workbook.sheetEducation.dataRowCount, 50, '教育Sheet=50人(教育岗)') && pass;
  pass = assertEqual(workbook.metadata.totalCount, 100, '分拆后合计100人') && pass;

  console.log(`\n[SUM公式合计行验证]`);
  console.log(`  总部合计行index: ${workbook.sheetHeadquarters.sumRowIndex}`);
  console.log(`  教育合计行index: ${workbook.sheetEducation.sumRowIndex}`);
  console.log(`  总部Sheet合计行(首列): ${workbook.sheetHeadquarters.sumRow['工号']}`);
  console.log(`  总部Sheet基础工资合计公式: ${workbook.sheetHeadquarters.sumRow['基础工资']}`);
  console.log(`  教育Sheet课时补贴合计公式: ${workbook.sheetEducation.sumRow['课时补贴(EDU_HOUR)']}`);
  console.log(`  教育Sheet教育绩效包合计公式: ${workbook.sheetEducation.sumRow['教育绩效包(EDU_PERF)']}`);
  console.log(`  总部Sheet实发工资合计公式: ${workbook.sheetHeadquarters.sumRow['实发工资']}`);
  console.log(`  教育Sheet实发工资合计公式: ${workbook.sheetEducation.sumRow['实发工资']}`);

  pass = assertTrue(workbook.sheetHeadquarters.hasSumFormula, '总部Sheet包含SUM公式合计行') && pass;
  pass = assertTrue(workbook.sheetEducation.hasSumFormula, '教育Sheet包含SUM公式合计行') && pass;
  pass = assertTrue(
    workbook.sheetHeadquarters.sumRow['基础工资'] && workbook.sheetHeadquarters.sumRow['基础工资'].startsWith('=SUM('),
    '总部Sheet基础工资列含SUM()公式'
  ) && pass;
  pass = assertTrue(
    workbook.sheetEducation.sumRow['课时补贴(EDU_HOUR)'] && workbook.sheetEducation.sumRow['课时补贴(EDU_HOUR)'].startsWith('=SUM('),
    '教育Sheet EDU_HOUR列含SUM()公式'
  ) && pass;
  pass = assertTrue(
    workbook.sheetEducation.sumRow['教育绩效包(EDU_PERF)'] && workbook.sheetEducation.sumRow['教育绩效包(EDU_PERF)'].startsWith('=SUM('),
    '教育Sheet EDU_PERF列含SUM()公式'
  ) && pass;

  console.log(`\n[教育板块独立列验证]`);
  const eduSample = workbook.sheetEducation.rows[0];
  const eduSample2 = workbook.sheetEducation.rows[10];
  const eduSample3 = workbook.sheetEducation.rows[25];
  console.log(`  样本1(${eduSample.employeeName}, ${eduSample.workLocation}): EDU_HOUR=${eduSample.eduHourAllowance}, EDU_PERF=${eduSample.eduPerformanceBonus}`);
  console.log(`  样本2(${eduSample2.employeeName}, ${eduSample2.workLocation}): EDU_HOUR=${eduSample2.eduHourAllowance}, EDU_PERF=${eduSample2.eduPerformanceBonus}`);
  console.log(`  样本3(${eduSample3.employeeName}, ${eduSample3.workLocation}): EDU_HOUR=${eduSample3.eduHourAllowance}, EDU_PERF=${eduSample3.eduPerformanceBonus}`);

  pass = assertTrue(eduSample.eduHourAllowance !== null && eduSample.eduHourAllowance > 0,
    '教育Sheet样本 EDU_HOUR列非空且>0') && pass;
  pass = assertTrue(eduSample.eduPerformanceBonus !== null && eduSample.eduPerformanceBonus > 0,
    '教育Sheet样本 EDU_PERF列非空且>0') && pass;

  const eduHeaders = workbook.sheetEducation.headers;
  const eduHourColIdx = eduHeaders.indexOf('课时补贴(EDU_HOUR)');
  const eduPerfColIdx = eduHeaders.indexOf('教育绩效包(EDU_PERF)');
  pass = assertTrue(eduHourColIdx >= 0, `教育Sheet表头含独立列「课时补贴(EDU_HOUR)」(index=${eduHourColIdx})`) && pass;
  pass = assertTrue(eduPerfColIdx >= 0, `教育Sheet表头含独立列「教育绩效包(EDU_PERF)」(index=${eduPerfColIdx})`) && pass;

  console.log(`\n[教育员工社保地按workLocation正确验证]`);
  const locationCounts = {};
  for (const row of workbook.sheetEducation.rows) {
    const key = `${row.workLocation}→${row.socialAreaName}(${row.socialAreaCode})`;
    locationCounts[key] = (locationCounts[key] || 0) + 1;
  }
  console.log(`  社保地分布:`);
  Object.entries(locationCounts).forEach(([k, v]) => console.log(`    ${k}: ${v}人`));

  let locationCorrect = true;
  for (const row of workbook.sheetEducation.rows) {
    const wl = row.workLocation;
    const sn = row.socialAreaName;
    const sc = row.socialAreaCode;
    if (wl === '西安' && sc !== 'XA') locationCorrect = false;
    if (wl === '天水' && sc !== 'TS') locationCorrect = false;
    if (wl === '白银' && sc !== 'BY') locationCorrect = false;
  }
  pass = assertTrue(locationCorrect, '教育员工社保地按workLocation正确映射(西安→XA/天水→TS/白银→BY)') && pass;

  const xaCount = workbook.sheetEducation.rows.filter(r => r.socialAreaCode === 'XA').length;
  const tsCount = workbook.sheetEducation.rows.filter(r => r.socialAreaCode === 'TS').length;
  const byCount = workbook.sheetEducation.rows.filter(r => r.socialAreaCode === 'BY').length;
  console.log(`  XA(西安): ${xaCount}人, TS(天水): ${tsCount}人, BY(白银): ${byCount}人`);
  pass = assertTrue(xaCount >= 10 && tsCount >= 10 && byCount >= 10, '西安/天水/白银三地教育员工都有分布(各≥10人)') && pass;

  console.log(`\n[个税独立累计预扣验证]`);
  const store = manager.getTaxCumulativeStoreSnapshot();
  const eduKeys = Object.keys(store.EDUCATION).length;
  const hqKeys = Object.keys(store.HEADQUARTERS).length;
  console.log(`  EDUCATION税组累计记录数: ${eduKeys}`);
  console.log(`  HEADQUARTERS税组累计记录数: ${hqKeys}`);

  pass = assertEqual(eduKeys, 50, '教育税组50条独立累计记录') && pass;
  pass = assertEqual(hqKeys, 50, '总部税组50条独立累计记录') && pass;

  const eduTaxSample = workbook.sheetEducation.rows[0];
  const hqTaxSample = workbook.sheetHeadquarters.rows[0];
  console.log(`  教育员工样本 taxGroup=${eduTaxSample.taxGroup}, 累计个税=${eduTaxSample.taxCumulative}`);
  console.log(`  总部员工样本 taxGroup=${hqTaxSample.taxGroup}, 累计个税=${hqTaxSample.taxCumulative}`);
  pass = assertEqual(eduTaxSample.taxGroup, 'EDUCATION', '教育员工样本 taxGroup=EDUCATION') && pass;
  pass = assertEqual(hqTaxSample.taxGroup, 'HEADQUARTERS', '总部员工样本 taxGroup=HEADQUARTERS') && pass;

  console.log(`\n[审批权限分离验证]`);
  const eduApproval = workbook.approvalWorkflows.education;
  const hqApproval = workbook.approvalWorkflows.headquarters;
  console.log(`  教育板块审批链: ${eduApproval.approvers.join(' → ')}`);
  console.log(`    角色说明: ${eduApproval.approvers.map(r => `${r}=${eduApproval.approverRoles[r]}`).join('; ')}`);
  console.log(`  总部审批链: ${hqApproval.approvers.join(' → ')}`);
  console.log(`    角色说明: ${hqApproval.approvers.map(r => `${r}=${hqApproval.approverRoles[r]}`).join('; ')}`);

  pass = assertTrue(
    eduApproval.approvers.length === 2 &&
    eduApproval.approvers[0] === APPROVAL_ROLES.EDU_DIRECTOR &&
    eduApproval.approvers[1] === APPROVAL_ROLES.FINANCE_DEPUTY,
    '教育审批链: [EDU_DIRECTOR, FINANCE_DEPUTY] (教育总监审批+财务副署)'
  ) && pass;
  pass = assertTrue(
    hqApproval.approvers.length === 2 &&
    hqApproval.approvers[0] === APPROVAL_ROLES.HR_DIRECTOR &&
    hqApproval.approvers[1] === APPROVAL_ROLES.FINANCE,
    '总部审批链: [HR_DIRECTOR, FINANCE] (人资总监审批+财务审批)'
  ) && pass;

  console.log(`\n[总部Sheet不包含教育独立列验证]`);
  const hqHeaders = workbook.sheetHeadquarters.headers;
  pass = assertTrue(!hqHeaders.includes('课时补贴(EDU_HOUR)'), '总部Sheet表头不含EDU_HOUR') && pass;
  pass = assertTrue(!hqHeaders.includes('教育绩效包(EDU_PERF)'), '总部Sheet表头不含EDU_PERF') && pass;
  const hqSample = workbook.sheetHeadquarters.rows[0];
  pass = assertTrue(hqSample.eduHourAllowance === null, '总部行 EDU_HOUR=null') && pass;
  pass = assertTrue(hqSample.eduPerformanceBonus === null, '总部行 EDU_PERF=null') && pass;

  console.log(`\n[TR-3.4.3] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('============================================================');
  console.log('智慧化人资平台 Task3.4 加班费核算+教育板块独立薪酬包 测试套件');
  console.log('============================================================');
  console.log('\n【输出文件路径】:');
  console.log('  核心模块: src/modules/payroll/overtime_edu_package.js');
  console.log('  主要导出:');
  console.log('    - calcOvertimePay({baseSalary, monthOvertimeRecords})');
  console.log('      * hourlyRate=baseSalary÷21.75÷8');
  console.log('      * WORKDAY平日×1.5, WEEKEND周末×2, HOLIDAY节假日×3');
  console.log('      * eduExemptFlag=true且type=WORKDAY → OTPay=0 (教育岗平日豁免)');
  console.log('      * 返回: {hourlyRate, total, details:[每笔明细]}');
  console.log('    - applyCompTimeFirst({comptimeBalanceHours, overtimeRecords})');
  console.log('      * 优先1:1抵扣 type=WORKDAY 的平日加班');
  console.log('      * 返回: {deductedHours, remainingCompTimeHours, deductedOtPay, adjustedRecords}');
  console.log('    - EduPayrollPackageManager:');
  console.log('      * createSplitWorkbook(payrollResults) → {sheetHeadquarters, sheetEducation}');
  console.log('      * 教育岗50人+非教育岗50人分组');
  console.log('      * 教育Sheet: EDU_HOUR/EDU_PERF独立列, 社保按workLocation(西安/天水/白银)');
  console.log('      * 个税: EDUCATION/HEADQUARTERS两个税组独立累计预扣');
  console.log('      * 各Sheet SUM()公式合计行');
  console.log('      * 审批分离: education=[EDU_DIRECTOR,FINANCE_DEPUTY], headquarters=[HR_DIRECTOR,FINANCE]');

  const p1 = await test_TR341();
  const p2 = await test_TR342();
  const p3 = await test_TR343();

  console.log('\n============================================================');
  console.log('测试总结:');
  console.log(`  TR-3.4.1 (月薪8700 加班费精确300+800+900=2000):           ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.4.2 (调休抵扣优先8h/12h/20h三场景):                   ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.4.3 (100人分拆+SUM公式+社保地+个税独立+审批分离):     ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3) ? '🎉 全部3个测试通过' : '⚠️ 存在失败用例'}`);
  console.log('============================================================');
})();
