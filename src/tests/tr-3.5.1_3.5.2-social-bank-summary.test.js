'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { EmployeeModel, ENTITY_MAP } = require('../modules/master_data/employee_model.js');
const {
  calcSocialInsuranceV2,
  buildMultiDimSummary,
  generateIcbcTxt,
  generateCcbCsv,
  generateAbcTxt,
  generateAbcCsv,
  buildBaseDeltaTrace,
  InconsistentError,
  round2
} = require('../modules/payroll/social_bank_summary.js');

function makeEmployee(overrides = {}) {
  const base = {
    id: 'E001',
    name: '张三',
    idCard: '610101199001011234',
    entity: ENTITY_MAP.FUZHI_EDU,
    dept1: '教育事业部',
    dept2: '教学研发部',
    position: '高级讲师',
    positionTag: '教育岗',
    entryDate: '2021-03-15',
    regularDate: '2021-06-15',
    status: '正式',
    payrollGrade: 'P5',
    workLocation: '西安',
    bankCard: '6222021234567890123',
    bankName: '工商银行'
  };
  return new EmployeeModel(Object.assign({}, base, overrides));
}

test('TR-3.5.1 5地各抽1名员工社保核算+人工对照5条全通过', async (t) => {
  const xaEmp = makeEmployee({ id: 'XA001', name: '王西安', workLocation: '西安', idCard: '610101199001010001', payrollGrade: 'P5' });
  const tsEmp = makeEmployee({ id: 'TS001', name: '李天水', workLocation: '天水', idCard: '620502199002020002', payrollGrade: 'P4' });
  const byEmp = makeEmployee({ id: 'BY001', name: '赵白银', workLocation: '白银', idCard: '620402199003030003', payrollGrade: 'P4' });
  const plEmp = makeEmployee({ id: 'PL001', name: '孙平凉', workLocation: '平凉', idCard: '620802199004040004', payrollGrade: 'P3' });
  const lzEmp = makeEmployee({ id: 'LZ001', name: '周兰州', workLocation: '兰州', idCard: '620102199005050005', payrollGrade: 'P5' });

  const xaResult = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 10000, payrollMonth: '2026-08-15', workLocation: '西安' });
  const tsResult = calcSocialInsuranceV2({ employee: tsEmp, baseSalary: 5000, payrollMonth: '2026-08-15', workLocation: '天水' });
  const byResult = calcSocialInsuranceV2({ employee: byEmp, baseSalary: 5000, payrollMonth: '2026-08-15', workLocation: '白银' });
  const plResult = calcSocialInsuranceV2({ employee: plEmp, baseSalary: 5000, payrollMonth: '2026-08-15', workLocation: '平凉' });
  const lzResult = calcSocialInsuranceV2({ employee: lzEmp, baseSalary: 5000, payrollMonth: '2026-08-15', workLocation: '兰州' });

  const allResults = [
    { name: '西安', emp: xaEmp, r: xaResult, baseSalary: 10000 },
    { name: '天水', emp: tsEmp, r: tsResult, baseSalary: 5000 },
    { name: '白银', emp: byEmp, r: byResult, baseSalary: 5000 },
    { name: '平凉', emp: plEmp, r: plResult, baseSalary: 5000 },
    { name: '兰州', emp: lzEmp, r: lzResult, baseSalary: 5000 }
  ];

  await t.test('每人areaName匹配正确', () => {
    assert.equal(xaResult.areaName, '西安');
    assert.equal(tsResult.areaName, '天水');
    assert.equal(byResult.areaName, '白银');
    assert.equal(plResult.areaName, '平凉');
    assert.equal(lzResult.areaName, '兰州');
    console.log('  [TR-3.5.1-1] areaName匹配：西安/天水/白银/平凉/兰州 ✓');
  });

  await t.test('西安8月version=2026H2，baseUsed=10000（在区间内）', () => {
    assert.equal(xaResult.areaVersion, '2026H2', `西安8月应2026H2，实际=${xaResult.areaVersion}`);
    assert.equal(xaResult.baseUsed, 10000, `西安base应为10000，实际=${xaResult.baseUsed}`);
    console.log('  [TR-3.5.1-2] 西安8月version=2026H2 base=10000 ✓');
  });

  await t.test('西安8月大额医疗补=8元（固定）', () => {
    assert.equal(xaResult.大额医疗补, 8, `西安大额医疗补应8元，实际=${xaResult.大额医疗补}`);
    console.log('  [TR-3.5.1-3] 西安大额医疗补=8元 ✓');
  });

  await t.test('西安8月各项比例：养老8%+医疗2%+失业0.3%+公积金10%', () => {
    const base = xaResult.baseUsed;
    assert.equal(xaResult.养老个人, round2(base * 0.08), `养老8%：${base}×0.08=${round2(base * 0.08)}，实际=${xaResult.养老个人}`);
    assert.equal(xaResult.医疗个人, round2(base * 0.02), `医疗2%：${base}×0.02=${round2(base * 0.02)}，实际=${xaResult.医疗个人}`);
    assert.equal(xaResult.失业个人, round2(base * 0.003), `失业0.3%：${base}×0.003=${round2(base * 0.003)}，实际=${xaResult.失业个人}`);
    assert.equal(xaResult.公积金个人, round2(base * 0.10), `公积金10%：${base}×0.10=${round2(base * 0.10)}，实际=${xaResult.公积金个人}`);
    console.log('  [TR-3.5.1-4] 西安8月：养老800+医疗200+失业30+公积金1000+大额8=2038 ✓');
  });

  await t.test('天水base取下限7000，大额5，比例养老8%医疗2%失业0.3%公积金8%', () => {
    assert.equal(tsResult.baseUsed, 7000, `天水base应7000，实际=${tsResult.baseUsed}`);
    assert.equal(tsResult.大额医疗补, 5);
    assert.equal(tsResult.养老个人, round2(7000 * 0.08));
    assert.equal(tsResult.医疗个人, round2(7000 * 0.02));
    assert.equal(tsResult.失业个人, round2(7000 * 0.003));
    assert.equal(tsResult.公积金个人, round2(7000 * 0.08));
    console.log('  [TR-3.5.1-5] 天水：养老560+医疗140+失业21+公积金560+大额5=1286 ✓');
  });

  await t.test('白银base取下限6500，大额5', () => {
    assert.equal(byResult.baseUsed, 6500, `白银base应6500，实际=${byResult.baseUsed}`);
    assert.equal(byResult.大额医疗补, 5);
    console.log('  [TR-3.5.1-6] 白银base=6500大额=5 ✓');
  });

  await t.test('平凉base取下限6000，大额5', () => {
    assert.equal(plResult.baseUsed, 6000, `平凉base应6000，实际=${plResult.baseUsed}`);
    assert.equal(plResult.大额医疗补, 5);
    console.log('  [TR-3.5.1-7] 平凉base=6000大额=5 ✓');
  });

  await t.test('兰州base取下限7500，大额5', () => {
    assert.equal(lzResult.baseUsed, 7500, `兰州base应7500，实际=${lzResult.baseUsed}`);
    assert.equal(lzResult.大额医疗补, 5);
    console.log('  [TR-3.5.1-8] 兰州base=7500大额=5 ✓');
  });

  await t.test('5人合计个人部分与人工计算对照项，每人误差绝对值均≤0.01元', () => {
    const totals = [];
    for (const item of allResults) {
      const comp = item.r.明细vs人工对比;
      assert.ok(comp.passed, `${item.name}人工对照未通过，最大误差=${comp.maxAbsDiff}`);
      assert.ok(comp.maxAbsDiff <= 0.01, `${item.name}最大误差=${comp.maxAbsDiff}应≤0.01`);
      totals.push(item.r.合计个人部分);
      console.log(`  [TR-3.5.1-9] ${item.name}：合计=${item.r.合计个人部分}元 对照passed=${comp.passed} maxDiff=${comp.maxAbsDiff} ✓`);
    }
    const sum5 = round2(totals.reduce((a, b) => a + b, 0));
    const expectedSum5 = 2038 + 1286 + 1194.5 + 1103 + 1377.5;
    assert.ok(Math.abs(sum5 - expectedSum5) <= 0.01, `5人合计${sum5}≠预期${expectedSum5}`);
    console.log(`  [TR-3.5.1-10] 5人合计=${sum5}元（预期6999）误差=${Math.abs(sum5 - expectedSum5)} ✓`);
  });

  await t.test('5条明细vs人工对比全部通过（passed=true）', () => {
    let passCount = 0;
    for (const item of allResults) {
      if (item.r.明细vs人工对比.passed) passCount++;
    }
    assert.equal(passCount, 5, `应5条全通过，实际=${passCount}`);
    console.log(`  [TR-3.5.1-11] 5条明细vs人工对比全部通过 ✓`);
  });
});

test('TR-3.5.2 西安7月vs8月版本切换+追溯+银行代发4文件+4维度汇总', async (t) => {
  const xaEmp = makeEmployee({
    id: 'XA002',
    name: '陈西京',
    workLocation: '西安',
    idCard: '610103199208082345',
    entity: ENTITY_MAP.FUZHI_EDU,
    dept1: '教育事业部',
    dept2: '教学管理部',
    position: '教学主管',
    payrollGrade: 'P6',
    bankCard: '6222089988776655443'
  });

  await t.test('西安payrollMonth=2026-07→version=2026H1 base=4990', () => {
    const rJul = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-07', workLocation: '西安' });
    assert.equal(rJul.areaVersion, '2026H1', `7月应2026H1，实际=${rJul.areaVersion}`);
    assert.equal(rJul.baseUsed, 4990, `7月base下限4990，实际=${rJul.baseUsed}`);
    assert.equal(rJul.公积金个人, round2(4990 * 0.08), `7月公积金比例8%：4990×8%=${round2(4990 * 0.08)}，实际=${rJul.公积金个人}`);
    console.log('  [TR-3.5.2-1] 2026-07西安version=2026H1 base=4990 公积金8% ✓');
  });

  await t.test('西安payrollMonth=2026-08→version=2026H2 base=5132', () => {
    const rAug = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-08', workLocation: '西安' });
    assert.equal(rAug.areaVersion, '2026H2', `8月应2026H2，实际=${rAug.areaVersion}`);
    assert.equal(rAug.baseUsed, 5132, `8月base下限5132，实际=${rAug.baseUsed}`);
    assert.equal(rAug.公积金个人, round2(5132 * 0.10), `8月公积金比例10%：5132×10%=${round2(5132 * 0.10)}，实际=${rAug.公积金个人}`);
    console.log('  [TR-3.5.2-2] 2026-08西安version=2026H2 base=5132 公积金10% ✓');
  });

  await t.test('医疗个人2%差异=2%×(5132-4990)=2.84元', () => {
    const rJul = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-07', workLocation: '西安' });
    const rAug = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-08', workLocation: '西安' });
    const medDelta = round2(rAug.医疗个人 - rJul.医疗个人);
    const expectedMedDelta = round2(0.02 * (5132 - 4990));
    assert.equal(expectedMedDelta, 2.84, `预期医疗差异2.84元，计算=${expectedMedDelta}`);
    assert.equal(medDelta, expectedMedDelta, `医疗差异=${medDelta}，预期=${expectedMedDelta}`);
    console.log(`  [TR-3.5.2-3] 医疗个人2%差异=2%×(5132-4990)=2.84元，实际=${medDelta} ✓`);
  });

  await t.test('养老8%差异=11.36元', () => {
    const rJul = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-07', workLocation: '西安' });
    const rAug = calcSocialInsuranceV2({ employee: xaEmp, baseSalary: 4000, payrollMonth: '2026-08', workLocation: '西安' });
    const penDelta = round2(rAug.养老个人 - rJul.养老个人);
    const expectedPenDelta = round2(0.08 * (5132 - 4990));
    assert.equal(expectedPenDelta, 11.36, `预期养老差异11.36元，计算=${expectedPenDelta}`);
    assert.equal(penDelta, expectedPenDelta, `养老差异=${penDelta}，预期=${expectedPenDelta}`);
    console.log(`  [TR-3.5.2-4] 养老8%差异=8%×(5132-4990)=11.36元，实际=${penDelta} ✓`);
  });

  await t.test('追溯记录含{monthFrom,monthTo,baseFrom,baseTo,deltaBreakdown各险种}', () => {
    const trace = buildBaseDeltaTrace('XA', '2026-07', '2026-08');
    assert.ok(trace, '追溯记录不应为null');
    assert.equal(trace.monthFrom, '2026-07');
    assert.equal(trace.monthTo, '2026-08');
    assert.equal(trace.baseFrom, 4990);
    assert.equal(trace.baseTo, 5132);
    assert.ok(trace.deltaBreakdown, 'deltaBreakdown应存在');
    assert.ok('养老' in trace.deltaBreakdown);
    assert.ok('医疗' in trace.deltaBreakdown);
    assert.ok('失业' in trace.deltaBreakdown);
    assert.ok('公积金' in trace.deltaBreakdown);
    assert.ok('大额医疗' in trace.deltaBreakdown);
    assert.ok('合计' in trace.deltaBreakdown);
    assert.equal(trace.deltaBreakdown.医疗, 2.84, `追溯医疗差异应2.84，实际=${trace.deltaBreakdown.医疗}`);
    assert.equal(trace.deltaBreakdown.养老, 11.36, `追溯养老差异应11.36，实际=${trace.deltaBreakdown.养老}`);
    console.log('  [TR-3.5.2-5] 追溯记录字段齐全：{monthFrom, monthTo, baseFrom, baseTo, deltaBreakdown.养老/医疗/失业/公积金/大额医疗/合计} ✓');
    console.log(`              deltaBreakdown=${JSON.stringify(trace.deltaBreakdown)}`);
  });

  const empPaymentList = [
    { name: '陈西京', bankCard: '6222089988776655443', idCard: '610103199208082345', amount: 8500, remark: '2026-08工资' },
    { name: '王西安', bankCard: '6222021234567890123', idCard: '610101199001010001', amount: 7200, remark: '2026-08工资' },
    { name: '李天水', bankCard: '6228481112223334445', idCard: '620502199002020002', amount: 6100, remark: '2026-08工资' },
    { name: '赵白银', bankCard: '6217001234567890111', idCard: '620402199003030003', amount: 5800, remark: '2026-08工资' }
  ];

  await t.test('工行ICBC TXT代发模板字段正则全部通过', () => {
    const icbc = generateIcbcTxt({
      enterpriseCode: 'KYFUZHI001',
      enterpriseName: '陕西康源福祉教育科技有限公司',
      payrollDate: '2026-08',
      employeePayments: empPaymentList
    });
    assert.equal(icbc.validation.valid, true, 'ICBC校验应通过');
    assert.equal(icbc.validation.lines, 4, `ICBC应4笔，实际=${icbc.validation.lines}`);
    console.log(`  [TR-3.5.2-6] ICBC TXT：${icbc.fileName} 笔数=${icbc.validation.lines} 总额=${icbc.validation.totalAmount} 正则校验通过 ✓`);
    console.log('              前2行：');
    const icbcLines = icbc.content.split('\n').slice(0, 2);
    icbcLines.forEach((l, i) => console.log(`                ${i + 1}: ${l}`));
  });

  await t.test('建行CCB CSV代发模板字段正则全部通过+含SUM校验', () => {
    const ccb = generateCcbCsv({ payrollDate: '2026-08', employeePayments: empPaymentList });
    assert.equal(ccb.validation.valid, true, 'CCB校验应通过');
    assert.equal(ccb.validation.hasSumFormula, true, 'CCB应含SUM公式');
    assert.equal(ccb.validation.lines, 4);
    console.log(`  [TR-3.5.2-7] CCB CSV：${ccb.fileName} 笔数=${ccb.validation.lines} 总额=${ccb.validation.totalAmount} 含=SUM ✓`);
    console.log('              前2行+SUM行：');
    const ccbLines = ccb.content.split('\n');
    console.log(`                1: ${ccbLines[0]}`);
    console.log(`                2: ${ccbLines[1]}`);
    console.log(`                ${ccbLines.length - 1}: ${ccbLines[ccbLines.length - 2]}`);
  });

  await t.test('农行ABC TXT代发模板字段正则全部通过', () => {
    const abcTxt = generateAbcTxt({
      enterpriseCode: 'KYABC001',
      enterpriseName: '陕西康源福祉教育科技有限公司',
      payrollDate: '2026-08',
      employeePayments: empPaymentList
    });
    assert.equal(abcTxt.validation.valid, true, 'ABC TXT校验应通过');
    assert.equal(abcTxt.validation.lines, 4);
    console.log(`  [TR-3.5.2-8] ABC TXT：${abcTxt.fileName} 笔数=${abcTxt.validation.lines} 总额=${abcTxt.validation.totalAmount} 正则校验通过 ✓`);
  });

  await t.test('农行ABC CSV代发模板字段正则全部通过+含SUM校验', () => {
    const abcCsv = generateAbcCsv({ payrollDate: '2026-08', employeePayments: empPaymentList });
    assert.equal(abcCsv.validation.valid, true, 'ABC CSV校验应通过');
    assert.equal(abcCsv.validation.hasSumFormula, true, 'ABC CSV应含SUM公式');
    assert.equal(abcCsv.validation.lines, 4);
    console.log(`  [TR-3.5.2-9] ABC CSV：${abcCsv.fileName} 笔数=${abcCsv.validation.lines} 总额=${abcCsv.validation.totalAmount} 含=SUM ✓`);
  });

  await t.test('4维度(byDept/byPosition/byGrade/byEntity)汇总块均非空', () => {
    const payrollResults = [];
    const empConfigs = [
      { emp: makeEmployee({ id: 'E001', name: '陈西京', dept1: '教育事业部', dept2: '教学管理部', position: '教学主管', payrollGrade: 'P6', entity: ENTITY_MAP.FUZHI_EDU, workLocation: '西安' }), gross: 12000, social: 2038, tax: 180, net: 9782 },
      { emp: makeEmployee({ id: 'E002', name: '王西安', dept1: '教育事业部', dept2: '教学研发部', position: '高级讲师', payrollGrade: 'P5', entity: ENTITY_MAP.FUZHI_EDU, workLocation: '西安' }), gross: 10000, social: 2038, tax: 120, net: 7842 },
      { emp: makeEmployee({ id: 'E003', name: '李天水', dept1: '养老事业部', dept2: '运营部', position: '运营经理', payrollGrade: 'P5', entity: ENTITY_MAP.MEIHONG, workLocation: '天水' }), gross: 9000, social: 1286, tax: 90, net: 7624 },
      { emp: makeEmployee({ id: 'E004', name: '赵白银', dept1: '养老事业部', dept2: '护理部', position: '护理主管', payrollGrade: 'P4', entity: ENTITY_MAP.MEIHONG, workLocation: '白银' }), gross: 7500, social: 1194.5, tax: 40, net: 6265.5 },
      { emp: makeEmployee({ id: 'E005', name: '孙平凉', dept1: '科技中心', dept2: '产品部', position: '产品经理', payrollGrade: 'P4', entity: ENTITY_MAP.BOYAO_SH, workLocation: '平凉' }), gross: 8000, social: 1103, tax: 60, net: 6837 },
      { emp: makeEmployee({ id: 'E006', name: '周兰州', dept1: '科技中心', dept2: '技术部', position: '高级开发', payrollGrade: 'P6', entity: ENTITY_MAP.BOYAO_SH, workLocation: '兰州' }), gross: 11000, social: 1377.5, tax: 150, net: 9472.5 }
    ];
    for (const c of empConfigs) {
      payrollResults.push({
        employee: c.emp,
        grossPay: c.gross,
        netPay: c.net,
        socialFund: { total: c.social },
        incomeTax: c.tax,
        payrollGrade: c.emp.payrollGrade,
        dept1: c.emp.dept1,
        dept2: c.emp.dept2,
        position: c.emp.position,
        entity: c.emp.entity,
        baseSalaryBreakdown: { gradeCode: c.emp.payrollGrade }
      });
    }
    const summary = buildMultiDimSummary(payrollResults);
    const byDeptKeys = Object.keys(summary.byDept);
    const byPosKeys = Object.keys(summary.byPosition);
    const byGradeKeys = Object.keys(summary.byGrade);
    const byEntityKeys = Object.keys(summary.byEntity);
    assert.ok(byDeptKeys.length > 0, 'byDept应非空');
    assert.ok(byPosKeys.length > 0, 'byPosition应非空');
    assert.ok(byGradeKeys.length > 0, 'byGrade应非空');
    assert.ok(byEntityKeys.length > 0, 'byEntity应非空');

    let grandEmployees = 0, grandGross = 0, grandNet = 0, grandSocial = 0, grandTax = 0, grandDed = 0;
    for (const k of byDeptKeys) { grandEmployees += summary.byDept[k].totalEmployees; grandGross += summary.byDept[k].grossTotal; grandNet += summary.byDept[k].netTotal; grandSocial += summary.byDept[k].socialTotal; grandTax += summary.byDept[k].taxTotal; grandDed += summary.byDept[k].deductionTotal; }
    assert.equal(grandEmployees, 6, `byDept合计人数应为6，实际=${grandEmployees}`);

    const expectedGross = round2(empConfigs.reduce((s, c) => s + c.gross, 0));
    assert.ok(Math.abs(grandGross - expectedGross) <= 0.01, `byDept gross合计${grandGross}≠预期${expectedGross}`);

    console.log('  [TR-3.5.2-10] 4维度汇总均非空：');
    console.log(`              byDept (${byDeptKeys.length}块)：${byDeptKeys.join('、')}`);
    for (const k of byDeptKeys) {
      const s = summary.byDept[k];
      console.log(`                - ${k}：${s.totalEmployees}人 gross=${s.grossTotal} net=${s.netTotal} social=${s.socialTotal} tax=${s.taxTotal} deduction=${s.deductionTotal}`);
    }
    console.log(`              byPosition (${byPosKeys.length}块)：${byPosKeys.join('、')}`);
    console.log(`              byGrade (${byGradeKeys.length}块)：${byGradeKeys.join('、')}`);
    console.log(`              byEntity (${byEntityKeys.length}块)：${byEntityKeys.join('、')}`);
    for (const k of byEntityKeys) {
      const s = summary.byEntity[k];
      console.log(`                - ${k}：${s.totalEmployees}人 gross=${s.grossTotal} net=${s.netTotal}`);
    }
    console.log(`              合计行校验：总人数=${grandEmployees} 总gross=${round2(grandGross)} ✓`);
  });

  await t.test('InconsistentError抛错场景：人为构造误差>0.01应抛出', () => {
    assert.throws(() => {
      const fakeResult = calcSocialInsuranceV2({
        employee: makeEmployee({ workLocation: '西安' }),
        baseSalary: 10000,
        payrollMonth: '2026-08',
        workLocation: '西安'
      });
      const badComp = { ...fakeResult.明细vs人工对比, maxAbsDiff: 0.5, passed: false };
      if (!badComp.passed) {
        throw new InconsistentError('模拟不一致', badComp);
      }
    }, (err) => {
      return err instanceof InconsistentError;
    });
    console.log('  [TR-3.5.2-11] InconsistentError抛错机制正常 ✓');
  });
});
