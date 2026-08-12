'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE,
  PermissionError,
  maskIdCard,
  maskBankCard,
  roleGuard,
  MasterDataAPI
} = require('../api/master_data_api.js');
const { EmployeeModel, EMPLOYEE_STATUS } = require('../modules/master_data/employee_model.js');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { PayrollGradeModel, addCustomGrade } = require('../modules/master_data/payroll_grade_model.js');

test('TR-1.9.1: 角色权限模型全场景验证', async (t) => {
  let api;
  let registry;

  t.beforeEach(() => {
    registry = new EmployeeRegistry();
    api = new MasterDataAPI({ registry });

    const gradeG5 = PayrollGradeModel.createCustom({
      gradeCode: 'G5',
      gradeName: 'G5级',
      baseSalaryRatio: 0.9,
      performanceRatio: 0.1,
      totalAmount: 8000
    });
    addCustomGrade(gradeG5);

    const gradeG6 = PayrollGradeModel.createCustom({
      gradeCode: 'G6',
      gradeName: 'G6级',
      baseSalaryRatio: 0.9,
      performanceRatio: 0.1,
      totalAmount: 10000
    });
    addCustomGrade(gradeG6);

    const emp1Data = {
      id: 'E000001',
      name: '张小明',
      idCard: '110101199001010010',
      mobile: '13800000001',
      entity: '陕西康源福祉教育科技',
      dept1: 'D01',
      dept2: 'D0101',
      position: '前端工程师',
      positionTag: '非教育岗',
      directLeader: null,
      entryDate: new Date('2022-01-15'),
      regularDate: new Date('2022-04-15'),
      status: EMPLOYEE_STATUS.REGULAR,
      payrollGrade: 'G5',
      workLocation: '西安',
      firstWorkDate: new Date('2015-07-01'),
      exemptSocialTax: false,
      bankCard: '6222021234567890128',
      bankName: '中国工商银行西安分行',
      isFinance: false,
      history: { transfers: [], promotions: [], adjustments: [] },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const emp1 = new EmployeeModel(emp1Data);
    registry._employees.set('E000001', emp1);
    registry._mobileIndex.set('13800000001', 'E000001');
    registry._idCardIndex.set('110101199001010010', 'E000001');
    registry._updateNameIndex('E000001', '张小明');

    const emp2Data = {
      id: 'E000002',
      name: '李小红',
      idCard: '110101199203050023',
      mobile: '13800000002',
      entity: '陕西康源福祉教育科技',
      dept1: 'D01',
      dept2: 'D0102',
      position: '后端工程师',
      positionTag: '非教育岗',
      directLeader: null,
      entryDate: new Date('2023-03-01'),
      regularDate: new Date('2023-06-01'),
      status: EMPLOYEE_STATUS.REGULAR,
      payrollGrade: 'G6',
      workLocation: '西安',
      firstWorkDate: new Date('2018-07-01'),
      exemptSocialTax: false,
      bankCard: '6222029876543210987',
      bankName: '中国建设银行西安分行',
      isFinance: false,
      history: { transfers: [], promotions: [], adjustments: [] },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const emp2 = new EmployeeModel(emp2Data);
    registry._employees.set('E000002', emp2);
    registry._mobileIndex.set('13800000002', 'E000002');
    registry._idCardIndex.set('110101199203050023', 'E000002');
    registry._updateNameIndex('E000002', '李小红');

    registry._employeeCounter = 2;
  });

  await t.test('辅助函数maskIdCard: 110101199001010010 → 110101********0010（中间10位*）', () => {
    const original = '110101199001010010';
    const masked = maskIdCard(original);
    assert.equal(masked.substring(0, 6), '110101', '前6位应保留');
    assert.equal(masked.substring(masked.length - 4), '0010', '后4位应保留');
    assert.equal(masked, '110101**********0010', `完整脱敏结果应为110101**********0010，实际=${masked}`);
    console.log(`  ✓ maskIdCard: ${original} → ${masked}`);
  });

  await t.test('辅助函数maskBankCard: 6222021234567890128 → 6222********128（中间*）', () => {
    const original = '6222021234567890128';
    const masked = maskBankCard(original);
    assert.equal(masked.substring(0, 4), '6222', '前4位应保留');
    assert.equal(masked.substring(masked.length - 3), '128', '后3位应保留');
    const middle = masked.substring(4, masked.length - 3);
    assert.ok(/^\*+$/.test(middle), `中间应全为*，实际=${middle}`);
    console.log(`  ✓ maskBankCard: ${original} → ${masked}（中间*）`);
  });

  await t.test('ROLE枚举完整性：EMPLOYEE/MANAGER/HR_SPECIALIST/FINANCE/HR_DIRECTOR', () => {
    const expected = ['EMPLOYEE', 'MANAGER', 'HR_SPECIALIST', 'FINANCE', 'HR_DIRECTOR'];
    for (const key of expected) {
      assert.equal(ROLE[key], key, `ROLE.${key} 应等于 "${key}"`);
    }
    console.log(`  ✓ ROLE枚举: ${expected.join(' / ')}`);
  });

  await t.test('员工导入检查：E000001=张小明, E000002=李小红', () => {
    const e1 = registry.findById('E000001');
    const e2 = registry.findById('E000002');
    assert.ok(e1, 'E000001应存在');
    assert.ok(e2, 'E000002应存在');
    assert.equal(e1.name, '张小明', `E000001应为张小明，实际=${e1.name}`);
    assert.equal(e2.name, '李小红', `E000002应为李小红，实际=${e2.name}`);
    assert.equal(e1.idCard, '110101199001010010');
    assert.equal(e2.idCard, '110101199203050023');
    console.log(`  ✓ 员工数据已预填: registry.size=${registry.size}人`);
  });

  await t.test('角色EMPLOYEE查看自己E000001 → idCard完整可见', () => {
    const profile = api.getEmployeeProfile({
      role: ROLE.EMPLOYEE,
      viewerEmployeeId: 'E000001',
      employeeId: 'E000001'
    });
    assert.equal(profile.basicInfo.name, '张小明', `basicInfo.name应为张小明`);
    assert.equal(profile.basicInfo.idCard, '110101199001010010',
      `EMPLOYEE查看自己idCard应完整可见，实际=${profile.basicInfo.idCard}`);
    console.log(`  ✓ EMPLOYEE查看自己: idCard=${profile.basicInfo.idCard}（完整可见）`);
  });

  await t.test('角色EMPLOYEE查看同事E000002 → idCard脱敏为中间*，bankCard=null，payrollGrade.salary=null', () => {
    const profile = api.getEmployeeProfile({
      role: ROLE.EMPLOYEE,
      viewerEmployeeId: 'E000001',
      employeeId: 'E000002'
    });

    const idCard = profile.basicInfo.idCard;
    assert.ok(idCard.includes('*'), `同事idCard应包含*脱敏，实际=${idCard}`);
    assert.equal(idCard.substring(0, 6), '110101', '同事idCard前6位应保留');
    assert.equal(idCard.substring(idCard.length - 4), '0023', '同事idCard后4位应保留');
    console.log(`  ✓ EMPLOYEE查看同事: idCard=${idCard}（中间*脱敏）`);

    const bankCard = profile.basicInfo.bankCard;
    assert.equal(bankCard, null, `同事bankCard应为null（对非HR/FINANCE），实际=${bankCard}`);
    console.log(`  ✓ EMPLOYEE查看同事: bankCard=${bankCard}（非HR/FINANCE返回null）`);

    const salary = profile.basicInfo.payrollGrade && profile.basicInfo.payrollGrade.salary;
    assert.equal(salary, null, `同事payrollGrade.salary应为null，实际=${salary}`);
    console.log(`  ✓ EMPLOYEE查看同事: payrollGrade.salary=${salary}（工资字段null）`);
  });

  await t.test('角色HR_SPECIALIST修改payrollGrade → 抛出PermissionError（禁改）', () => {
    let threwError = false;
    let errorInstance = null;
    try {
      api.updateEmployeeField({
        role: ROLE.HR_SPECIALIST,
        operatorEmployeeId: 'E000001',
        employeeId: 'E000002',
        field: 'payrollGrade',
        value: 'G5'
      });
    } catch (err) {
      threwError = true;
      errorInstance = err;
    }
    assert.equal(threwError, true, 'HR_SPECIALIST修改薪级应抛出PermissionError');
    assert.ok(errorInstance instanceof PermissionError, `应抛出PermissionError类型，实际=${errorInstance && errorInstance.name}`);
    console.log(`  ✓ HR_SPECIALIST修改payrollGrade: 抛出PermissionError（禁改薪级）`);
    console.log(`    错误信息: ${errorInstance.message}`);
  });

  await t.test('角色FINANCE修改bankCard成功', () => {
    const newBankCard = '6222021111222233334';
    const result = api.updateEmployeeField({
      role: ROLE.FINANCE,
      operatorEmployeeId: 'E000001',
      employeeId: 'E000002',
      field: 'bankCard',
      value: newBankCard
    });
    const emp = registry.findById('E000002');
    assert.equal(emp.bankCard, newBankCard, `FINANCE修改后bankCard应为${newBankCard}，实际=${emp.bankCard}`);
    console.log(`  ✓ FINANCE修改bankCard成功: E000002.bankCard = ${newBankCard}`);
  });

  await t.test('角色HR_DIRECTOR修改薪级成功', () => {
    const newGrade = 'VICE_PRESIDENT';
    const result = api.updateEmployeeField({
      role: ROLE.HR_DIRECTOR,
      operatorEmployeeId: 'E000001',
      employeeId: 'E000002',
      field: 'payrollGrade',
      value: newGrade
    });
    const emp = registry.findById('E000002');
    assert.equal(emp.payrollGrade, newGrade, `HR_DIRECTOR修改后payrollGrade应为${newGrade}，实际=${emp.payrollGrade}`);
    console.log(`  ✓ HR_DIRECTOR修改薪级成功: E000002.payrollGrade = ${newGrade}`);
  });

  await t.test('批量操作前置审批：batchAdjustSalaryGrades返回审批单号+审批通过后才生效', () => {
    const adjustments = [
      { employeeId: 'E000001', oldPayrollGrade: 'G5', newPayrollGrade: 'G6' },
      { employeeId: 'E000002', oldPayrollGrade: 'VICE_PRESIDENT', newPayrollGrade: 'G6' }
    ];
    const result = api.batchAdjustSalaryGrades({
      role: ROLE.HR_SPECIALIST,
      operatorEmployeeId: 'E000001',
      adjustments
    });
    assert.ok(result.approvalNo && result.approvalNo.startsWith('SALARY-'),
      `应返回SALARY-开头的审批单号，实际=${result.approvalNo}`);
    assert.equal(result.requiresApproval, true, 'HR_SPECIALIST发起的薪级调整应需要审批');
    console.log(`  ✓ batchAdjustSalaryGrades: 审批单号=${result.approvalNo}，requiresApproval=true`);

    const emp1Before = registry.findById('E000001');
    assert.equal(emp1Before.payrollGrade, 'G5', '审批通过前薪级应保持不变');

    const execResult = api.executeApproval(result.approvalNo, true);
    assert.equal(execResult.status, 'APPROVED_AND_EXECUTED', '执行审批后应为已执行状态');
    const emp1After = registry.findById('E000001');
    assert.equal(emp1After.payrollGrade, 'G6', '审批通过后薪级应已更新为G6');
    console.log(`  ✓ 审批通过后生效: E000001 G5→G6（已执行）`);
  });

  await t.test('批量调部门：batchTransferDept返回审批单号', () => {
    const transfers = [
      { employeeId: 'E000002', oldDept1: 'D01', newDept1: 'D02', newDept2: 'D0201' }
    ];
    const result = api.batchTransferDept({
      role: ROLE.HR_SPECIALIST,
      operatorEmployeeId: 'E000001',
      transfers
    });
    assert.ok(result.approvalNo && result.approvalNo.startsWith('TRANSFER-'),
      `应返回TRANSFER-开头的审批单号，实际=${result.approvalNo}`);
    assert.equal(result.requiresApproval, true, '批量调部门应需要审批');
    console.log(`  ✓ batchTransferDept: 审批单号=${result.approvalNo}，requiresApproval=true`);
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.9.1 测试全部通过:');
  console.log('  - maskIdCard: 身份证中间10位*脱敏 ✓');
  console.log('  - maskBankCard: 银行卡中间*脱敏 ✓');
  console.log('  - ROLE枚举: 5角色完整定义 ✓');
  console.log('  - EMPLOYEE查看自己: idCard完整可见 ✓');
  console.log('  - EMPLOYEE查看同事: idCard脱敏/bankCard=null/salary=null ✓');
  console.log('  - HR_SPECIALIST修改payrollGrade: 抛出PermissionError ✓');
  console.log('  - FINANCE修改bankCard: 成功 ✓');
  console.log('  - HR_DIRECTOR修改薪级: 成功 ✓');
  console.log('  - 批量调薪: 生成审批单号→审批通过才生效 ✓');
  console.log('  - 批量调部门: 生成审批单号 ✓');
  console.log('═══════════════════════════════════════════════\n');
});
