'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AttendancePunchCollector, PunchDayRecord, getDaysInMonth, deepEqual } = require('../modules/attendance/punch_data_collector');
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

test('TR-2.3.1: 6月100人×30天 + 7月100人×31天批量拉取 → 完整度≥99.9%；缺卡标记验证', async (t) => {
  const alertQueue = new AlertQueue();
  const registry = new EmployeeRegistry();
  const client = new DingTalkClient({ mode: 'mock' });
  const groupsLoader = new AttendanceGroupsLoader({ dingTalkClient: client, mode: 'mock' });

  for (let i = 1; i <= 100; i++) {
    const empId = `E${String(i).padStart(6, '0')}`;
    const dept = i <= 70 ? 'D01' : (i <= 85 ? 'D02' : 'D03-TS');
    const title = i <= 5 ? '总经理' : (i <= 20 ? '部门经理' : '专员');
    registry.add(makeEmployee(empId, dept, title, null));
  }

  await groupsLoader.loadGroups();

  const collector = new AttendancePunchCollector({
    dingTalkClient: client,
    attendanceGroupsLoader: groupsLoader,
    alertQueue,
    mode: 'mock',
    employeeRegistry: registry
  });

  await t.test('步骤1: 6月100人批量拉取，完整度≥99.9%', async () => {
    console.log('\n  ===== TR-2.3.1 步骤1: 6月100人批量拉取 =====');
    const employeeIds = [];
    for (let i = 1; i <= 100; i++) employeeIds.push(`E${String(i).padStart(6, '0')}`);

    const juneDays = getDaysInMonth(2026, 6).length;
    console.log(`  6月天数: ${juneDays}天`);

    const result = await collector.fetchMonthPunchBatch({
      employeeIds,
      year: 2026,
      month: 6,
      batchSize: 25
    });

    console.log(`  successCount=${result.successCount}, failedCount=${result.failedCount}`);
    console.log(`  records总数=${result.records.length}, errors数=${result.errors.length}`);

    assert.equal(result.successCount, 100, `100人拉取成功数应为100，实际=${result.successCount}`);
    assert.equal(result.failedCount, 0, `失败数应为0，实际=${result.failedCount}`);

    const expectedJuneCount = 100 * juneDays;
    console.log(`  预期6月记录数=${expectedJuneCount}`);

    const validation = collector.validateCompleteness({
      year: 2026,
      month: 6,
      expectedCount: expectedJuneCount,
      actualRecords: result.records
    });

    console.log(`  完整度报告: actualCount=${validation.actualCount}, expectedCount=${validation.expectedCount}`);
    console.log(`  completenessRate=${validation.completenessRate}%, isComplete=${validation.isComplete}`);

    assert.ok(validation.completenessRate >= 99.9,
      `6月完整度应≥99.9%，实际=${validation.completenessRate}%`);

    const minSuccess = 100 * 30 * 0.999;
    console.log(`  预期最少成功天数记录(${minSuccess.toFixed(0)})验证: actual=${validation.actualCount}`);
    assert.ok(validation.actualCount >= 2997,
      `6月最少成功记录应≥2997，实际=${validation.actualCount}`);

    console.log('  ✓ 步骤1通过: 6月批量拉取完整度达标');
  });

  await t.test('步骤2: 7月100人批量拉取，完整度≥99.9%', async () => {
    console.log('\n  ===== TR-2.3.1 步骤2: 7月100人批量拉取 =====');
    const employeeIds = [];
    for (let i = 1; i <= 100; i++) employeeIds.push(`E${String(i).padStart(6, '0')}`);

    const julyDays = getDaysInMonth(2026, 7).length;
    console.log(`  7月天数: ${julyDays}天`);

    const result = await collector.fetchMonthPunchBatch({
      employeeIds,
      year: 2026,
      month: 7,
      batchSize: 25
    });

    console.log(`  successCount=${result.successCount}, failedCount=${result.failedCount}`);
    console.log(`  records总数=${result.records.length}, errors数=${result.errors.length}`);

    assert.equal(result.successCount, 100, `100人拉取成功数应为100，实际=${result.successCount}`);

    const expectedJulyCount = 100 * julyDays;
    console.log(`  预期7月记录数=${expectedJulyCount}`);

    const validation = collector.validateCompleteness({
      year: 2026,
      month: 7,
      expectedCount: expectedJulyCount,
      actualRecords: result.records
    });

    console.log(`  完整度报告: actualCount=${validation.actualCount}, expectedCount=${validation.expectedCount}`);
    console.log(`  completenessRate=${validation.completenessRate}%, isComplete=${validation.isComplete}`);

    assert.ok(validation.completenessRate >= 99.9,
      `7月完整度应≥99.9%，实际=${validation.completenessRate}%`);

    console.log('  ✓ 步骤2通过: 7月批量拉取完整度达标');
  });

  await t.test('步骤3: 手动构造10个HQ组员工8月25日缺卡样本 → isMissing全部为true', async () => {
    console.log('\n  ===== TR-2.3.1 步骤3: 缺卡标记验证 =====');

    const hqEmployeeIds = [];
    for (let i = 1; i <= 10; i++) {
      const empId = `HQ${String(i).padStart(4, '0')}`;
      registry.add(makeEmployee(empId, 'D01', '总部专员', null));
      hqEmployeeIds.push(empId);
    }

    const augustCollector = new AttendancePunchCollector({
      dingTalkClient: client,
      attendanceGroupsLoader: groupsLoader,
      alertQueue,
      mode: 'mock',
      employeeRegistry: registry
    });

    for (const empId of hqEmployeeIds) {
      const records = await augustCollector.fetchEmployeeMonthPunch(empId, 2026, 8);
      const aug25Idx = records.findIndex(r => r.date === '2026-08-25');
      if (aug25Idx >= 0) {
        records[aug25Idx].checkInTime = null;
        records[aug25Idx].checkOutTime = null;
        records[aug25Idx].leaveApprovalNo = null;
        records[aug25Idx].businessTripNo = null;
        records[aug25Idx].makeupApprovalNo = null;
      }
      const emp = registry.getById(empId);
      const group = groupsLoader.getAttendanceGroupForEmployee(emp);
      const isExempt = group && group.isExempt;
      augustCollector._applyMissingMark(records, group, isExempt);
      const key = augustCollector._cacheKey(empId, 2026, 8);
      augustCollector._cache.set(key, records);
    }

    const missingSamples = [];
    for (const empId of hqEmployeeIds) {
      const records = await augustCollector.fetchEmployeeMonthPunch(empId, 2026, 8);
      const aug25 = records.find(r => r.date === '2026-08-25');
      if (aug25) {
        missingSamples.push({ employeeId: empId, record: aug25 });
      }
    }

    console.log(`  构造的缺卡样本数=${missingSamples.length}`);
    for (const s of missingSamples) {
      const r = s.record;
      const dayOfWeek = new Date(r.date).getDay();
      console.log(`    员工=${s.employeeId} date=${r.date} 星期${['日','一','二','三','四','五','六'][dayOfWeek]} checkIn=${!!r.checkInTime} checkOut=${!!r.checkOutTime} isMissing=${r.isMissing}`);
    }

    assert.equal(missingSamples.length, 10, `应构造10个缺卡样本，实际=${missingSamples.length}`);

    const allMissingTrue = missingSamples.every(s => s.record.isMissing === true);
    const missingCount = missingSamples.filter(s => s.record.isMissing === true).length;
    console.log(`  isMissing=true数量=${missingCount}/10`);

    assert.ok(allMissingTrue, `10个缺卡样本的isMissing应全部为true，实际true=${missingCount}个`);

    console.log('  ✓ 步骤3通过: 10个缺卡样本isMissing全部为true');
  });

  console.log('\n  ===== TR-2.3.1 测试完成 =====\n');
});
