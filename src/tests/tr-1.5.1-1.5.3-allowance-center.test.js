'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AllowanceModel,
  AllowanceCenter,
  ALLOWANCE_TYPE,
  APPLY_TO_TYPE,
  MissingApprovalError
} = require('../modules/master_data/allowance_center.js');
const { EmployeeModel } = require('../modules/master_data/employee_model.js');

test('TR-1.5.1: 员工A西安8月，全勤22工作日→MEAL餐补=22×20=440元；HOUSING/TRANSPORT/COMMUNICATION合计正确；calcMonthlyAllowances返回明细数组含每一项', async (t) => {
  await t.test('预置津贴数≥12项', () => {
    const center = new AllowanceCenter();
    const all = center.listAllAllowances();
    console.log(`  [TR-1.5.1] 预置津贴项数: ${all.length}`);
    all.forEach(a => console.log(`    - ${a.code} ${a.name} [${a.typeLabel}] ${a.amount}元`));
    assert.ok(all.length >= 12, `预置津贴应≥12项，实际=${all.length}`);
  });

  await t.test('创建员工A（西安，普通员工，非外派/非教师岗）', () => {
    const empA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      dept1: '西安总部',
      dept2: '行政部',
      payrollGrade: 'NORMAL',
      workLocation: '西安'
    });
    assert.equal(empA.id, 'EMP-A001');
    assert.equal(empA.workLocation, '西安');
  });

  await t.test('员工A 2026年8月 全勤22工作日→calcMonthlyAllowances明细正确', () => {
    const center = new AllowanceCenter();
    const empA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      dept1: '西安总部',
      dept2: '行政部',
      payrollGrade: 'NORMAL',
      workLocation: '西安'
    });

    const result = center.calcMonthlyAllowances({
      employee: empA,
      year: 2026,
      month: 8,
      workdaysOfMonth: 22
    });

    console.log(`  [TR-1.5.1] 员工A 2026年8月津贴明细：`);
    result.details.forEach(d => {
      console.log(`    - ${d.code} ${d.name} | ${d.typeLabel} | ${d.amount}元 | ${d.note}`);
    });
    console.log(`    津贴合计: ${result.total}元`);

    const mealDetail = result.details.find(d => d.code === 'MEAL');
    assert.ok(mealDetail, 'MEAL餐补应在明细中');
    assert.equal(mealDetail.amount, 440, `MEAL餐补应为22×20=440元，实际=${mealDetail.amount}`);
    console.log(`  [TR-1.5.1] ✓ MEAL餐补 = 22工作日 × 20元/天 = ${mealDetail.amount}元`);

    const housing = result.details.find(d => d.code === 'HOUSING');
    const transport = result.details.find(d => d.code === 'TRANSPORT');
    const communication = result.details.find(d => d.code === 'COMMUNICATION');
    assert.ok(housing, 'HOUSING应存在');
    assert.ok(transport, 'TRANSPORT应存在');
    assert.ok(communication, 'COMMUNICATION应存在');
    const htSum = housing.amount + transport.amount + communication.amount;
    const expectedHtSum = 500 + 300 + 200;
    assert.equal(htSum, expectedHtSum, `HOUSING(${housing.amount})+TRANSPORT(${transport.amount})+COMMUNICATION(${communication.amount})=${htSum}，应=${expectedHtSum}`);
    console.log(`  [TR-1.5.1] ✓ HOUSING(${housing.amount}) + TRANSPORT(${transport.amount}) + COMMUNICATION(${communication.amount}) = ${htSum}元`);

    assert.ok(Array.isArray(result.details), 'details应为数组');
    assert.ok(result.details.length >= 5, `明细数组应含多项，实际=${result.details.length}`);
    result.details.forEach(d => {
      assert.ok('code' in d, '明细项应有code');
      assert.ok('name' in d, '明细项应有name');
      assert.ok('amount' in d, '明细项应有amount');
      assert.ok(typeof d.amount === 'number', 'amount应为number类型');
    });
    console.log(`  [TR-1.5.1] ✓ 返回明细数组共 ${result.details.length} 项，每项含code/name/amount字段`);

    const expectedTotal = 500 + 300 + 200 + 440 + 300 + 500;
    console.log(`  [TR-1.5.1] 各项合计：HOUSING500 + TRANSPORT300 + COMMUNICATION200 + MEAL440 + ATTENDANCE300 + HIGH_TEMP500 = ${expectedTotal}元`);
    assert.equal(result.total, expectedTotal, `8月津贴合计应为${expectedTotal}，实际=${result.total}`);
  });
});

test('TR-1.5.2: 员工B5月→HIGH_TEMP高温补贴=0；6月→500；7月→500；8月→500；9月→0（自动按月份判断）', async (t) => {
  const center = new AllowanceCenter();
  const empB = new EmployeeModel({
    id: 'EMP-B002',
    name: '员工B',
    dept1: '西安总部',
    dept2: '运营部',
    payrollGrade: 'NORMAL',
    workLocation: '西安'
  });

  function getHighTempAmount(year, month) {
    const result = center.calcMonthlyAllowances({
      employee: empB,
      year,
      month,
      workdaysOfMonth: 22
    });
    const ht = result.details.find(d => d.code === 'HIGH_TEMP');
    return ht ? ht.amount : 0;
  }

  await t.test('员工B 2026年5月→HIGH_TEMP=0（不在6-8月区间）', () => {
    const may = getHighTempAmount(2026, 5);
    console.log(`  [TR-1.5.2] 员工B 2026年5月 高温补贴 = ${may}元`);
    assert.equal(may, 0, `5月高温补贴应为0，实际=${may}`);
    console.log(`  [TR-1.5.2] ✓ 5月高温补贴=0（不在6-8月生效期）`);
  });

  await t.test('员工B 2026年6月→HIGH_TEMP=500', () => {
    const jun = getHighTempAmount(2026, 6);
    console.log(`  [TR-1.5.2] 员工B 2026年6月 高温补贴 = ${jun}元`);
    assert.equal(jun, 500, `6月高温补贴应为500，实际=${jun}`);
    console.log(`  [TR-1.5.2] ✓ 6月高温补贴=500元`);
  });

  await t.test('员工B 2026年7月→HIGH_TEMP=500', () => {
    const jul = getHighTempAmount(2026, 7);
    console.log(`  [TR-1.5.2] 员工B 2026年7月 高温补贴 = ${jul}元`);
    assert.equal(jul, 500, `7月高温补贴应为500，实际=${jul}`);
    console.log(`  [TR-1.5.2] ✓ 7月高温补贴=500元`);
  });

  await t.test('员工B 2026年8月→HIGH_TEMP=500', () => {
    const aug = getHighTempAmount(2026, 8);
    console.log(`  [TR-1.5.2] 员工B 2026年8月 高温补贴 = ${aug}元`);
    assert.equal(aug, 500, `8月高温补贴应为500，实际=${aug}`);
    console.log(`  [TR-1.5.2] ✓ 8月高温补贴=500元`);
  });

  await t.test('员工B 2026年9月→HIGH_TEMP=0（过期）', () => {
    const sep = getHighTempAmount(2026, 9);
    console.log(`  [TR-1.5.2] 员工B 2026年9月 高温补贴 = ${sep}元`);
    assert.equal(sep, 0, `9月高温补贴应为0，实际=${sep}`);
    console.log(`  [TR-1.5.2] ✓ 9月高温补贴=0（过期，expireDate=2026-08-31）`);
  });

  await t.test('员工B 高温补贴5-9月序列 [0,500,500,500,0] 完全匹配', () => {
    const months = [5, 6, 7, 8, 9];
    const expected = [0, 500, 500, 500, 0];
    const actual = months.map(m => getHighTempAmount(2026, m));
    console.log(`  [TR-1.5.2] 5-9月高温补贴序列: ${JSON.stringify(actual)}`);
    console.log(`  [TR-1.5.2] 期望值:              ${JSON.stringify(expected)}`);
    assert.deepEqual(actual, expected, `高温补贴序列应完全匹配，实际=${JSON.stringify(actual)}`);
    console.log(`  [TR-1.5.2] ✓ 高温补贴按月份自动判断完全正确！`);
  });
});

test('TR-1.5.3: 手动加奖2000元(approvalNo=APP-2026-088)→成功；故意不传approvalNo→抛出MissingApprovalError，操作不入库；审批单号与操作记录永久留痕可查询', async (t) => {
  await t.test('手动加奖2000元，带approvalNo=APP-2026-088→成功入库', () => {
    const center = new AllowanceCenter();
    const empC = new EmployeeModel({
      id: 'EMP-C003',
      name: '员工C',
      dept1: '西安总部',
      workLocation: '西安'
    });

    const beforeCount = center.getManualAdjustments(empC.id).length;
    const record = center.addManualAdjustment({
      employeeId: empC.id,
      code: 'BONUS_MANUAL',
      name: '季度特别贡献奖',
      amount: 2000,
      approvalNo: 'APP-2026-088',
      reason: 'Q3季度突出贡献嘉奖',
      year: 2026,
      month: 8
    });

    const afterCount = center.getManualAdjustments(empC.id).length;
    console.log(`  [TR-1.5.3] 加奖前记录数: ${beforeCount}，加奖后记录数: ${afterCount}`);
    console.log(`  [TR-1.5.3] 新记录ID: ${record.id}`);
    console.log(`  [TR-1.5.3] 金额: ${record.amount}元 | 审批单号: ${record.approvalNo} | 原因: ${record.reason}`);

    assert.equal(afterCount - beforeCount, 1, '记录数应增加1');
    assert.equal(record.amount, 2000, '金额应为2000');
    assert.equal(record.approvalNo, 'APP-2026-088', '审批单号应为APP-2026-088');
    assert.ok(record.adjustedAt instanceof Date, 'adjustedAt应为Date');
    console.log(`  [TR-1.5.3] ✓ 手动加奖2000元成功入库，审批单号APP-2026-088已记录`);
  });

  await t.test('故意不传approvalNo→抛出MissingApprovalError', () => {
    const center = new AllowanceCenter();
    const empC = new EmployeeModel({
      id: 'EMP-C003',
      name: '员工C',
      dept1: '西安总部',
      workLocation: '西安'
    });

    const beforeCount = center.getManualAdjustments(empC.id).length;
    let thrownError = null;

    try {
      center.addManualAdjustment({
        employeeId: empC.id,
        code: 'BONUS_SPECIAL',
        name: '特别津贴',
        amount: 1500,
        reason: '无审批单号测试',
        year: 2026,
        month: 8
      });
    } catch (e) {
      thrownError = e;
    }

    const afterCount = center.getManualAdjustments(empC.id).length;
    console.log(`  [TR-1.5.3] 异常前记录数: ${beforeCount}，异常后记录数: ${afterCount}`);

    assert.ok(thrownError !== null, '应抛出异常');
    assert.ok(thrownError instanceof MissingApprovalError, `异常类型应为MissingApprovalError，实际=${thrownError && thrownError.name}`);
    assert.equal(thrownError.name, 'MissingApprovalError');
    console.log(`  [TR-1.5.3] ✓ 成功捕获异常: ${thrownError.name}: ${thrownError.message}`);
    assert.equal(afterCount - beforeCount, 0, '操作失败时不应入库，记录数不变');
    console.log(`  [TR-1.5.3] ✓ 失败操作未入库，记录数保持不变`);
  });

  await t.test('审批单号与操作记录永久留痕，可按approvalNo查询', () => {
    const center = new AllowanceCenter();
    const empC = new EmployeeModel({
      id: 'EMP-C003',
      name: '员工C',
      dept1: '西安总部',
      workLocation: '西安'
    });
    const empD = new EmployeeModel({
      id: 'EMP-D004',
      name: '员工D',
      dept1: '西安总部',
      workLocation: '西安'
    });

    center.addManualAdjustment({
      employeeId: empC.id,
      code: 'BONUS_MANUAL',
      name: '季度特别贡献奖',
      amount: 2000,
      approvalNo: 'APP-2026-088',
      reason: 'Q3季度突出贡献嘉奖',
      year: 2026,
      month: 8
    });
    center.addManualAdjustment({
      employeeId: empD.id,
      code: 'BONUS_HALF_YEAR',
      name: '半年绩效奖',
      amount: 5000,
      approvalNo: 'APP-2026-088',
      reason: '同审批单关联员工D半年奖',
      year: 2026,
      month: 8
    });
    center.addManualAdjustment({
      employeeId: empC.id,
      code: 'OTHER_BONUS',
      name: '其他奖励',
      amount: 800,
      approvalNo: 'APP-2026-099',
      reason: '其他审批单',
      year: 2026,
      month: 8
    });

    const queried = center.findManualAdjustmentsByApprovalNo('APP-2026-088');
    console.log(`  [TR-1.5.3] 按审批单号APP-2026-088查询，命中 ${queried.length} 条记录:`);
    queried.forEach(q => {
      console.log(`    - ${q.id} | 员工${q.employeeId} | ${q.name} | ${q.amount}元 | 审批:${q.approvalNo} | ${q.reason}`);
    });

    assert.equal(queried.length, 2, `审批单APP-2026-088应关联2条记录，实际=${queried.length}`);
    assert.ok(queried.every(q => q.approvalNo === 'APP-2026-088'), '所有记录审批单号都匹配');
    console.log(`  [TR-1.5.3] ✓ 审批单号永久留痕，查询APP-2026-088命中2条记录完全正确`);

    const empCAdj = center.getManualAdjustments(empC.id);
    console.log(`  [TR-1.5.3] 员工C个人调整记录共 ${empCAdj.length} 条，永久可追溯`);
    empCAdj.forEach((r, idx) => {
      console.log(`    [${idx + 1}] ${r.name} | ${r.amount}元 | 审批:${r.approvalNo} | 时间:${r.adjustedAt.toISOString()}`);
    });
    assert.equal(empCAdj.length, 2, `员工C应有2条调整记录`);
    console.log(`  [TR-1.5.3] ✓ 员工个人调整记录完整留痕，可随时审计追溯`);
  });

  await t.test('calcMonthlyAllowances会合并手动调整项计入当月合计', () => {
    const center = new AllowanceCenter();
    const empC = new EmployeeModel({
      id: 'EMP-C003',
      name: '员工C',
      dept1: '西安总部',
      workLocation: '西安'
    });

    center.addManualAdjustment({
      employeeId: empC.id,
      code: 'BONUS_MANUAL',
      name: '季度特别贡献奖',
      amount: 2000,
      approvalNo: 'APP-2026-088',
      reason: 'Q3季度突出贡献嘉奖',
      year: 2026,
      month: 8
    });

    const result = center.calcMonthlyAllowances({
      employee: empC,
      year: 2026,
      month: 8,
      workdaysOfMonth: 22
    });

    const manualItems = result.details.filter(d => d.source === 'MANUAL');
    console.log(`  [TR-1.5.3] 8月津贴明细中手动调整项: ${manualItems.length}项`);
    manualItems.forEach(m => {
      console.log(`    - ${m.name} ${m.amount}元 | 审批:${m.approvalNo}`);
    });

    assert.ok(manualItems.length >= 1, '明细中应包含手动调整项');
    const bonusItem = manualItems.find(m => m.code === 'BONUS_MANUAL');
    assert.ok(bonusItem, 'BONUS_MANUAL应在明细中');
    assert.equal(bonusItem.amount, 2000, '手动加奖金额应为2000');
    assert.equal(bonusItem.approvalNo, 'APP-2026-088', '审批单号应带入明细');
    console.log(`  [TR-1.5.3] ✓ 手动调整项已并入calcMonthlyAllowances明细，审批单号带入工资单`);
  });
});
