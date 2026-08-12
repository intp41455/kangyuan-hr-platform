'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeModel, EMPLOYEE_STATUS, POSITION_TAGS } = require('../modules/master_data/employee_model.js');

test('TR-1.1.2: 2026.5.20入职，regularDate=2026.8.20 → 8.15 isProbation=true；9.1=false', async (t) => {
  let emp;

  t.beforeEach(() => {
    emp = new EmployeeModel({
      id: 'E002',
      name: '李四',
      entryDate: new Date('2026-05-20'),
      regularDate: new Date('2026-08-20'),
      status: EMPLOYEE_STATUS.PROBATION
    });
    emp.setPositionTag(POSITION_TAGS.NON_EDUCATION);
  });

  await t.test('岗位标签：非教育岗正确设置', () => {
    assert.equal(emp.positionTag, POSITION_TAGS.NON_EDUCATION);
  });

  await t.test('2026-08-15 isProbation = true（转正日前一天仍属试用期）', () => {
    const result = emp.isProbation(new Date('2026-08-15'));
    assert.equal(result, true, '8月15日 < 8月20日 应在试用期内');
  });

  await t.test('2026-08-19 isProbation = true（转正日前一天）', () => {
    const result = emp.isProbation(new Date('2026-08-19'));
    assert.equal(result, true, '8月19日 < 8月20日 应在试用期内');
  });

  await t.test('2026-08-20 isProbation = false（转正日当天已转正）', () => {
    const result = emp.isProbation(new Date('2026-08-20'));
    assert.equal(result, false, '8月20日当天 应已转正');
  });

  await t.test('2026-09-01 isProbation = false（TR-1.1.2主案例：转正后）', () => {
    const result = emp.isProbation(new Date('2026-09-01'));
    assert.equal(result, false, '9月1日 > 8月20日 应已转正');
  });

  await t.test('边界：同一天不同时间，isProbation按日期而非时间判定', () => {
    const before = emp.isProbation(new Date('2026-08-19T23:59:59'));
    const at = emp.isProbation(new Date('2026-08-20T00:00:00'));
    const after = emp.isProbation(new Date('2026-08-20T23:59:59'));
    assert.equal(before, true, '8.19 23:59 仍属试用期');
    assert.equal(at, false, '8.20 00:00 已转正');
    assert.equal(after, false, '8.20 23:59 已转正');
  });

  await t.test('无regularDate时，以status=PROBATION判定', () => {
    const empNoRegular = new EmployeeModel({
      entryDate: new Date('2026-07-01'),
      regularDate: null,
      status: EMPLOYEE_STATUS.PROBATION
    });
    assert.equal(empNoRegular.isProbation(new Date('2026-08-15')), true);

    empNoRegular.status = EMPLOYEE_STATUS.REGULAR;
    assert.equal(empNoRegular.isProbation(new Date('2026-08-15')), false);
  });

  await t.test('4类岗位标签均可设置且互不混淆', () => {
    const e1 = new EmployeeModel({});
    e1.setPositionTag(POSITION_TAGS.EDUCATION);
    assert.equal(e1.positionTag, '教育岗');

    const e2 = new EmployeeModel({});
    e2.setPositionTag(POSITION_TAGS.NON_EDUCATION);
    assert.equal(e2.positionTag, '非教育岗');

    const e3 = new EmployeeModel({});
    e3.setPositionTag(POSITION_TAGS.FIELD);
    assert.equal(e3.positionTag, '外勤岗');

    const e4 = new EmployeeModel({});
    e4.setPositionTag(POSITION_TAGS.EXECUTIVE_EXEMPT);
    assert.equal(e4.positionTag, '高管免打卡岗');
  });

  await t.test('无效岗位标签抛异常', () => {
    const e = new EmployeeModel({});
    assert.throws(() => e.setPositionTag('不存在的岗'), /无效岗位标签/);
  });
});
