'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AttendancePunchCollector, PunchDayRecord, getDaysInMonth } = require('../modules/attendance/punch_data_collector');
const { AttendanceGroupsLoader, ATTENDANCE_GROUP_TYPES, WORKDAYS_PATTERNS } = require('../modules/attendance/attendance_groups_loader');
const { DingTalkClient } = require('../integrations/dingtalk_contact_sync');
const EmployeeRegistry = require('../models/EmployeeRegistry');
const AlertQueue = require('../services/AlertQueue');

function makeEmployee(id, dept, title, positionTag) {
  return {
    id,
    name: `员工${id}`,
    email: `${id}@company.com`,
    mobile: `138${String(10000000 + parseInt(id.replace(/\D/g, '0'))).slice(-8)}`,
    dingtalkUserId: `DD${id.replace(/\D/g, '')}`,
    department: dept,
    dept1: dept,
    title,
    positionTag,
    status: 'active',
    entryDate: '2024-01-01'
  };
}

test('TR-2.3.3: 网络故障→指数退避重试3次(1s/3s/10s)；连续失败→critical报警；重试成功→errors标记可重取', async (t) => {
  const alertQueue = new AlertQueue();
  const registry = new EmployeeRegistry();

  registry.add(makeEmployee('NET001', 'D01', '测试员工1', null));
  registry.add(makeEmployee('NET002', 'D01', '测试员工2', null));
  registry.add(makeEmployee('NET003', 'D01', '测试员工3', null));
  registry.add(makeEmployee('RECOV01', 'D01', '可恢复员工1', null));

  await t.test('步骤1: 设置前3次API调用抛错→指数退避重试3次(打印1s/3s/10s延迟标记)', async () => {
    console.log('\n  ===== TR-2.3.3 步骤1: 指数退避重试验证 =====');

    const clientFailure = new DingTalkClient({ mode: 'mock' });
    clientFailure.setNetworkFailurePattern(999);

    const groupsLoaderFailure = new AttendanceGroupsLoader({ dingTalkClient: clientFailure, mode: 'mock' });
    await groupsLoaderFailure.loadGroups();

    const collectorFailure = new AttendancePunchCollector({
      dingTalkClient: clientFailure,
      attendanceGroupsLoader: groupsLoaderFailure,
      alertQueue,
      mode: 'real',
      employeeRegistry: registry
    });

    collectorFailure.clearCache();
    alertQueue.clear();

    console.log('  开始fetchMonthPunchBatch（设置前3次调用均抛错）...');
    const startTime = Date.now();

    const result = await collectorFailure.fetchMonthPunchBatch({
      employeeIds: ['NET001', 'NET002', 'NET003'],
      year: 2026,
      month: 8,
      batchSize: 3,
      maxRetries: 3
    });
    const endTime = Date.now();
    const totalElapsed = endTime - startTime;

    console.log(`  执行完成: 总耗时≈${totalElapsed}ms`);
    console.log(`  successCount=${result.successCount}, failedCount=${result.failedCount}`);
    console.log(`  records.length=${result.records.length}, errors.length=${result.errors.length}`);

    const retryMarkers = collectorFailure.getRetryMarkers();
    console.log(`\n  重试标记总数=${retryMarkers.length}`);
    for (const m of retryMarkers) {
      console.log(`    [重试记录] emp=${m.employeeId} attempt=${m.attempt} delay=${m.delayLabel} ts=${m.ts}`);
    }

    const delay1sCount = retryMarkers.filter(m => m.delayLabel === '1s').length;
    const delay3sCount = retryMarkers.filter(m => m.delayLabel === '3s').length;
    const delay10sCount = retryMarkers.filter(m => m.delayLabel === '10s').length;

    console.log(`\n  延迟标记统计: 1s=${delay1sCount}次, 3s=${delay3sCount}次, 10s=${delay10sCount}次`);

    const employeeCount = 3;
    assert.ok(delay1sCount >= employeeCount,
      `1s延迟标记应≥${employeeCount}次，实际=${delay1sCount}次`);
    assert.ok(delay3sCount >= employeeCount,
      `3s延迟标记应≥${employeeCount}次，实际=${delay3sCount}次`);
    assert.ok(delay10sCount >= employeeCount,
      `10s延迟标记应≥${employeeCount}次，实际=${delay10sCount}次`);

    const totalExpectedDelay = 1000 + 3000 + 10000;
    const minExpectedPerEmployee = totalExpectedDelay * 0.8;
    console.log(`  每名员工预期最少等待≈${minExpectedPerEmployee}ms (1s+3s+10s=14s的80%)`);

    assert.ok(totalElapsed >= minExpectedPerEmployee * 0.3,
      `总耗时应体现指数退避延迟，实际总耗时=${totalElapsed}ms`);

    console.log('  ✓ 步骤1通过: 指数退避重试3次(1s/3s/10s)延迟标记正确打印');
  });

  await t.test('步骤2: 连续失败→钉钉机器人报警队列有≥1条critical级报警', async () => {
    console.log('\n  ===== TR-2.3.3 步骤2: Critical报警验证 =====');

    const alerts = alertQueue.getAll();
    console.log(`  报警队列总条数=${alerts.length}`);

    const criticalAlerts = alertQueue.getByLevel('critical');
    console.log(`  critical级报警数=${criticalAlerts.length}`);
    for (let i = 0; i < criticalAlerts.length; i++) {
      const a = criticalAlerts[i];
      console.log(`    [critical#${i + 1}] level=${a.level} channel=${a.channel}`);
      console.log(`      message: ${a.message.substring(0, 120)}...`);
    }

    const warningAlerts = alertQueue.getByLevel('warning');
    console.log(`  warning级报警数=${warningAlerts.length}`);

    assert.ok(criticalAlerts.length >= 1,
      `连续失败后钉钉机器人报警队列应有≥1条critical报警，实际critical=${criticalAlerts.length}条`);

    const hasPunchFailureMsg = criticalAlerts.some(a =>
      a.message.includes('打卡') && a.message.includes('失败')
    );
    assert.ok(hasPunchFailureMsg, 'critical报警消息应包含打卡失败相关描述');

    console.log('  ✓ 步骤2通过: 钉钉机器人报警队列有critical级报警');
  });

  await t.test('步骤3: errors数组标记可重取员工的失败原因(retryable=true)', async () => {
    console.log('\n  ===== TR-2.3.3 步骤3: errors可重取标记验证 =====');

    const recordFailuresStep1 = [];
    const clientFailure2 = new DingTalkClient({ mode: 'mock' });
    clientFailure2.setNetworkFailurePattern(999);
    const groupsLoaderFailure2 = new AttendanceGroupsLoader({ dingTalkClient: clientFailure2, mode: 'mock' });
    await groupsLoaderFailure2.loadGroups();
    const alertQueue2 = new AlertQueue();
    const collectorFailure2 = new AttendancePunchCollector({
      dingTalkClient: clientFailure2,
      attendanceGroupsLoader: groupsLoaderFailure2,
      alertQueue: alertQueue2,
      mode: 'real',
      employeeRegistry: registry
    });

    const resultFail = await collectorFailure2.fetchMonthPunchBatch({
      employeeIds: ['NET001'],
      year: 2026,
      month: 7,
      batchSize: 1,
      maxRetries: 3
    });

    console.log(`  失败场景errors数=${resultFail.errors.length}`);
    for (const err of resultFail.errors) {
      console.log(`    [error] employeeId=${err.employeeId} retryable=${err.retryable} reason=${err.reason.substring(0, 60)}...`);
      recordFailuresStep1.push(err);
    }

    assert.equal(resultFail.errors.length, 1, `失败场景errors数应为1，实际=${resultFail.errors.length}`);
    assert.equal(resultFail.errors[0].retryable, true,
      `失败场景errors项的retryable应为true，实际=${resultFail.errors[0].retryable}`);
    assert.ok(resultFail.errors[0].employeeId, 'errors项应包含employeeId');
    assert.ok(resultFail.errors[0].reason && resultFail.errors[0].reason.length > 0,
      'errors项应包含失败原因reason');

    const recordFailures = collectorFailure2.getRecordFailures();
    console.log(`  recordFailures数组记录数=${recordFailures.length}`);
    assert.ok(recordFailures.length >= 1,
      `recordFailures数组应记录失败员工，实际=${recordFailures.length}条`);

    console.log('  ✓ 步骤3a通过: 失败场景errors标记retryable=true');

    console.log('\n  --- 步骤3b: 重试成功场景验证 ---');
    const clientRecover = new DingTalkClient({ mode: 'mock' });
    clientRecover.setNetworkFailurePattern(2);
    const groupsLoaderRecover = new AttendanceGroupsLoader({ dingTalkClient: clientRecover, mode: 'mock' });
    await groupsLoaderRecover.loadGroups();
    const alertQueue3 = new AlertQueue();
    const collectorRecover = new AttendancePunchCollector({
      dingTalkClient: clientRecover,
      attendanceGroupsLoader: groupsLoaderRecover,
      alertQueue: alertQueue3,
      mode: 'real',
      employeeRegistry: registry
    });

    console.log('  执行: 前2次调用抛错，第3次(或重试后)成功');
    const resultRecover = await collectorRecover.fetchMonthPunchBatch({
      employeeIds: ['RECOV01'],
      year: 2026,
      month: 8,
      batchSize: 1,
      maxRetries: 3
    });

    console.log(`  重试结果: successCount=${resultRecover.successCount}, failedCount=${resultRecover.failedCount}`);
    console.log(`  records.length=${resultRecover.records.length}`);
    console.log(`  errors数=${resultRecover.errors.length}`);

    const retryMarkersRecover = collectorRecover.getRetryMarkers();
    console.log(`  重试延迟标记数=${retryMarkersRecover.length}`);
    for (const m of retryMarkersRecover) {
      console.log(`    [重试记录] emp=${m.employeeId} attempt=${m.attempt} delay=${m.delayLabel}`);
    }

    assert.equal(resultRecover.successCount, 1,
      `重试后成功数应为1，实际=${resultRecover.successCount}`);
    assert.ok(resultRecover.records.length > 0,
      `重试成功后应有打卡记录，实际=${resultRecover.records.length}条`);

    if (resultRecover.errors.length > 0) {
      for (const err of resultRecover.errors) {
        console.log(`    [残留error] employeeId=${err.employeeId} retryable=${err.retryable}`);
      }
    }

    console.log('  ✓ 步骤3b通过: 重试成功后数据正确返回');
  });

  await t.test('步骤4: dutyCycleEndedAutoTrigger调度触发配置验证', async () => {
    console.log('\n  ===== TR-2.3.3 步骤4: 月度调度dutyCycleEndedAutoTrigger验证 =====');

    const client = new DingTalkClient({ mode: 'mock' });
    const groupsLoader = new AttendanceGroupsLoader({ dingTalkClient: client, mode: 'mock' });
    const alertQueue4 = new AlertQueue();
    const collector = new AttendancePunchCollector({
      dingTalkClient: client,
      attendanceGroupsLoader: groupsLoader,
      alertQueue: alertQueue4,
      mode: 'mock',
      employeeRegistry: registry
    });

    console.log('  模式1: 次月1号02:00自动触发');
    const trigger1 = await collector.dutyCycleEndedAutoTrigger(2026, 8, { mode: 'nextMonth2AM' });
    console.log(`    triggerDate=${trigger1.triggerDate} triggerTime=${trigger1.triggerTime}`);
    console.log(`    description=${trigger1.description}`);
    console.log(`    targetPeriod=${JSON.stringify(trigger1.targetPeriod)}`);

    assert.equal(trigger1.mode, 'nextMonth2AM', '调度模式应为nextMonth2AM');
    assert.equal(trigger1.triggerDate, '2026-09-01', '8月的触发日期应为9月1日');
    assert.equal(trigger1.triggerTime, '02:00:00', '触发时间应为02:00:00');

    console.log('\n  模式2: D-3日23:59自动触发');
    const trigger2 = await collector.dutyCycleEndedAutoTrigger(2026, 8, { mode: 'D-3_23:59' });
    console.log(`    triggerDate=${trigger2.triggerDate} triggerTime=${trigger2.triggerTime}`);
    console.log(`    description=${trigger2.description}`);

    assert.equal(trigger2.mode, 'D-3_23:59', '调度模式应为D-3_23:59');
    assert.equal(trigger2.triggerTime, '23:59:00', '触发时间应为23:59:00');

    const expectedD3 = new Date(2026, 7, 29);
    const aug29 = '2026-08-29';
    const aug30 = '2026-08-30';
    console.log(`    D-3预期日期≈8月29/30日（8月31日往前3天）`);
    assert.ok(
      trigger2.triggerDate === aug29 || trigger2.triggerDate === aug30,
      `D-3日期应为8月29或30日，实际=${trigger2.triggerDate}`
    );

    console.log('\n  autoRun+onTrigger回调测试:');
    let triggerCalled = null;
    const trigger3 = await collector.dutyCycleEndedAutoTrigger(2026, 12, {
      mode: 'nextMonth2AM',
      autoRun: true,
      onTrigger: async (params) => {
        triggerCalled = params;
        console.log(`    onTrigger被调用: year=${params.year} month=${params.month}`);
        console.log(`    triggerInfo.description=${params.triggerInfo.description}`);
      }
    });

    assert.ok(triggerCalled !== null, 'onTrigger回调应被调用');
    assert.equal(triggerCalled.year, 2026, '回调year应=2026');
    assert.equal(triggerCalled.month, 12, '回调month应=12');
    assert.equal(trigger3.triggerDate, '2027-01-01', '12月的次月触发日期应为2027-01-01');

    console.log('  ✓ 步骤4通过: 月度调度dutyCycleEndedAutoTrigger配置正确');
  });

  console.log('\n  ===== TR-2.3.3 测试完成 =====\n');
});
