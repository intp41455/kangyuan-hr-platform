'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EmployeeModel,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_ORDER,
  STATUS_TRANSITIONS,
  POSITION_TAGS,
  InvalidStatusTransitionError
} = require('../modules/master_data/employee_model.js');

test('TR-1.1.3: 8状态机 — 试用期→正式 合法成功；试用期→退休 抛异常', async (t) => {
  await t.test('8状态定义齐全：共8个状态值', () => {
    const values = Object.values(EMPLOYEE_STATUS);
    assert.equal(values.length, 8, `应有8个状态，实际=${values.length}`);
    assert.deepEqual(values, EMPLOYEE_STATUS_ORDER);
    assert.ok(values.includes('入职待报到'));
    assert.ok(values.includes('试用期'));
    assert.ok(values.includes('正式'));
    assert.ok(values.includes('调动中'));
    assert.ok(values.includes('晋升中'));
    assert.ok(values.includes('待离职'));
    assert.ok(values.includes('离职'));
    assert.ok(values.includes('退休'));
  });

  await t.test('合法流转：入职待报到 → 试用期', () => {
    const emp = new EmployeeModel({});
    assert.equal(emp.status, EMPLOYEE_STATUS.PENDING_ONBOARDING, '初始状态=入职待报到');
    emp.transitionTo(EMPLOYEE_STATUS.PROBATION, { operator: 'HR' });
    assert.equal(emp.status, EMPLOYEE_STATUS.PROBATION, '跳转后=试用期');
    assert.equal(emp.history.adjustments.length, 1);
  });

  await t.test('TR-1.1.3-A：试用期 → 正式 合法成功', () => {
    const emp = new EmployeeModel({
      id: 'E003',
      name: '王五',
      entryDate: new Date('2026-05-20'),
      regularDate: new Date('2026-08-20'),
      status: EMPLOYEE_STATUS.PROBATION
    });
    emp.setPositionTag(POSITION_TAGS.FIELD);

    assert.equal(emp.status, EMPLOYEE_STATUS.PROBATION, '前置：当前=试用期');
    const allowed = emp.getAllowedTransitions();
    assert.ok(allowed.includes(EMPLOYEE_STATUS.REGULAR), '转正应在允许列表中');

    const result = emp.transitionTo(EMPLOYEE_STATUS.REGULAR, { reason: '试用期考核通过' });
    assert.equal(emp.status, EMPLOYEE_STATUS.REGULAR, '跳转后=正式');
    assert.equal(emp.history.adjustments.length, 1);
    assert.equal(emp.history.adjustments[0].from, EMPLOYEE_STATUS.PROBATION);
    assert.equal(emp.history.adjustments[0].to, EMPLOYEE_STATUS.REGULAR);
    assert.equal(result, emp, '应返回this以支持链式');
  });

  await t.test('TR-1.1.3-B：试用期 → 退休 抛异常 InvalidStatusTransitionError，状态保持不变', () => {
    const emp = new EmployeeModel({
      id: 'E004',
      name: '赵六',
      status: EMPLOYEE_STATUS.PROBATION
    });
    emp.setPositionTag(POSITION_TAGS.EXECUTIVE_EXEMPT);

    const before = emp.status;
    const historyCount = emp.history.adjustments.length;
    const allowed = emp.getAllowedTransitions();
    assert.ok(!allowed.includes(EMPLOYEE_STATUS.RETIRED), '退休不应在试用期允许列表中');

    assert.throws(
      () => emp.transitionTo(EMPLOYEE_STATUS.RETIRED),
      (err) => {
        assert.ok(err instanceof InvalidStatusTransitionError, '应是InvalidStatusTransitionError类型');
        assert.ok(err.message.includes('试用期'), '错误消息应包含「试用期」');
        assert.ok(err.message.includes('退休'), '错误消息应包含「退休」');
        assert.equal(err.fromStatus, EMPLOYEE_STATUS.PROBATION);
        assert.equal(err.toStatus, EMPLOYEE_STATUS.RETIRED);
        return true;
      }
    );

    assert.equal(emp.status, before, '异常后状态保持不变');
    assert.equal(emp.history.adjustments.length, historyCount, '异常后history不增加记录');
  });

  await t.test('全流程顺向合法流转：入职→试用→正式→调动→正式→晋升→正式→待离职→离职', () => {
    const emp = new EmployeeModel({});
    const sequence = [
      EMPLOYEE_STATUS.PROBATION,
      EMPLOYEE_STATUS.REGULAR,
      EMPLOYEE_STATUS.TRANSFERRING,
      EMPLOYEE_STATUS.REGULAR,
      EMPLOYEE_STATUS.PROMOTING,
      EMPLOYEE_STATUS.REGULAR,
      EMPLOYEE_STATUS.PENDING_RESIGNATION,
      EMPLOYEE_STATUS.RESIGNED
    ];
    for (const target of sequence) {
      const from = emp.status;
      emp.transitionTo(target);
      assert.equal(emp.status, target, `${from} → ${target} 应成功`);
    }
    assert.equal(emp.status, EMPLOYEE_STATUS.RESIGNED, '终态=离职');
  });

  await t.test('正式 → 退休 合法路径', () => {
    const emp = new EmployeeModel({ status: EMPLOYEE_STATUS.REGULAR });
    emp.transitionTo(EMPLOYEE_STATUS.RETIRED, { reason: '到达法定退休年龄' });
    assert.equal(emp.status, EMPLOYEE_STATUS.RETIRED);
  });

  await t.test('待离职可撤回：待离职 → 正式', () => {
    const emp = new EmployeeModel({ status: EMPLOYEE_STATUS.PENDING_RESIGNATION });
    emp.transitionTo(EMPLOYEE_STATUS.REGULAR, { reason: '员工撤回离职申请' });
    assert.equal(emp.status, EMPLOYEE_STATUS.REGULAR);
  });

  await t.test('终态不可再跳转：离职/退休无出口', () => {
    const resigned = new EmployeeModel({ status: EMPLOYEE_STATUS.RESIGNED });
    assert.deepEqual(resigned.getAllowedTransitions(), []);
    assert.throws(() => resigned.transitionTo(EMPLOYEE_STATUS.RETIRED), InvalidStatusTransitionError);

    const retired = new EmployeeModel({ status: EMPLOYEE_STATUS.RETIRED });
    assert.deepEqual(retired.getAllowedTransitions(), []);
    assert.throws(() => retired.transitionTo(EMPLOYEE_STATUS.REGULAR), InvalidStatusTransitionError);
  });

  await t.test('跨状态非法跳转抽样：入职待报到→退休', () => {
    const emp = new EmployeeModel({});
    assert.throws(
      () => emp.transitionTo(EMPLOYEE_STATUS.RETIRED),
      InvalidStatusTransitionError
    );
    assert.equal(emp.status, EMPLOYEE_STATUS.PENDING_ONBOARDING);
  });

  await t.test('调动/晋升会记录到对应history子数组', () => {
    const emp = new EmployeeModel({ status: EMPLOYEE_STATUS.REGULAR });
    emp.transitionTo(EMPLOYEE_STATUS.TRANSFERRING, { fromDept: 'A', toDept: 'B' });
    assert.equal(emp.history.transfers.length, 1);
    emp.transitionTo(EMPLOYEE_STATUS.REGULAR);
    emp.transitionTo(EMPLOYEE_STATUS.PROMOTING, { fromGrade: 'G3', toGrade: 'G4' });
    assert.equal(emp.history.promotions.length, 1);
    assert.equal(emp.history.adjustments.length, 3);
  });
});
