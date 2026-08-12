'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeModel, EMPLOYEE_STATUS, POSITION_TAGS } = require('../modules/master_data/employee_model.js');

test('TR-1.1.1: 2023.6.19入职 → 2026.8.11 核算工龄=3年 → 工龄工资=300元', async (t) => {
  await t.test('字段完整性：验证22字段及岗位标签可设置', () => {
    const emp = new EmployeeModel({
      id: 'E001',
      name: '张三',
      idCard: '610101199001011234',
      mobile: '13800138000',
      entity: '陕西康源福祉教育科技',
      dept1: '教育事业部',
      dept2: '教学部',
      position: '高级教师',
      directLeader: '李主任',
      entryDate: new Date('2023-06-19'),
      regularDate: new Date('2023-09-19'),
      status: EMPLOYEE_STATUS.REGULAR,
      payrollGrade: 'G5-03',
      workLocation: '西安',
      firstWorkDate: new Date('2015-07-01'),
      exemptSocialTax: false,
      bankCard: '6222021234567890123',
      bankName: '工商银行西安支行',
      isFinance: false
    });
    emp.setPositionTag(POSITION_TAGS.EDUCATION);

    assert.equal(emp.id, 'E001');
    assert.equal(emp.name, '张三');
    assert.equal(emp.positionTag, POSITION_TAGS.EDUCATION);
    assert.equal(emp.status, EMPLOYEE_STATUS.REGULAR);
    assert.ok(emp.createdAt instanceof Date);
    assert.ok(emp.updatedAt instanceof Date);
    assert.ok(Array.isArray(emp.history.transfers));
    assert.ok(Array.isArray(emp.history.promotions));
    assert.ok(Array.isArray(emp.history.adjustments));
  });

  await t.test('calcYearsOfService 双记录：firstWorkDate 优先', () => {
    const emp = new EmployeeModel({
      entryDate: new Date('2023-06-19'),
      firstWorkDate: new Date('2015-07-01')
    });
    const years = emp.calcYearsOfService(new Date('2026-08-11'));
    assert.equal(years, 11, '有firstWorkDate时应优先使用，2015.7.1→2026.8.11=11年');
  });

  await t.test('calcYearsOfService 双记录：无firstWorkDate时用entryDate（TR-1.1.1主案例）', () => {
    const emp = new EmployeeModel({
      entryDate: new Date('2023-06-19')
    });
    const years = emp.calcYearsOfService(new Date('2026-08-11'));
    assert.equal(years, 3, `2023.6.19 → 2026.8.11 应=3年，实际=${years}`);
  });

  await t.test('calcSeniorityPay: 3年 × 100元 = 300元（TR-1.1.1主案例）', () => {
    const emp = new EmployeeModel({
      entryDate: new Date('2023-06-19')
    });
    const pay = emp.calcSeniorityPay(new Date('2026-08-11'));
    assert.equal(pay, 300, `3年工龄应=300元，实际=${pay}元`);
  });

  await t.test('calcSeniorityPay: 10年封顶验证', () => {
    const emp = new EmployeeModel({
      entryDate: new Date('2010-01-01')
    });
    const pay = emp.calcSeniorityPay(new Date('2026-08-11'));
    assert.equal(pay, 1000, '16年工龄应封顶10年=1000元');
  });

  await t.test('calcSeniorityPay: 可配置perYear=200, capYears=15', () => {
    const emp = new EmployeeModel(
      { entryDate: new Date('2000-01-01') },
      { seniorityPay: { perYear: 200, capYears: 15 } }
    );
    const pay = emp.calcSeniorityPay(new Date('2026-08-11'));
    assert.equal(pay, 3000, '26年工龄 cap15年 × 200 = 3000元');
  });
});
