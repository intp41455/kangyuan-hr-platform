'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AttendancePunchCollector, PunchDayRecord, deepEqual, deepClone } = require('../modules/attendance/punch_data_collector');
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

test('TR-2.3.2: 同月两次调用DeepEqual一致；高管豁免员工全月isMissing=false', async (t) => {
  const alertQueue = new AlertQueue();
  const registry = new EmployeeRegistry();
  const client = new DingTalkClient({ mode: 'mock' });
  const groupsLoader = new AttendanceGroupsLoader({ dingTalkClient: client, mode: 'mock' });

  registry.add(makeEmployee('E000001', 'D01', '总部专员', null));
  registry.add(makeEmployee('E000002', 'D01', '总部专员', null));
  registry.add(makeEmployee('EX0001', 'D01', 'CEO总经理', '高管免打卡岗'));
  registry.add(makeEmployee('EX0002', 'D01', '财务总监', 'EXEC高管'));
  registry.add(makeEmployee('EX0003', 'D01', '运营总监', null));

  await groupsLoader.loadGroups();

  const collector = new AttendancePunchCollector({
    dingTalkClient: client,
    attendanceGroupsLoader: groupsLoader,
    alertQueue,
    mode: 'mock',
    employeeRegistry: registry
  });

  await t.test('步骤1: 8月员工E000001同月调用fetchEmployeeMonthPunch两次→DeepEqual一致', async () => {
    console.log('\n  ===== TR-2.3.2 步骤1: 幂等缓存DeepEqual验证 =====');
    collector.clearCache();

    console.log('  第1次调用fetchEmployeeMonthPunch(E000001, 2026, 8)...');
    const records1 = await collector.fetchEmployeeMonthPunch('E000001', 2026, 8);
    console.log(`  第1次结果: records.length=${records1.length}`);
    console.log(`  示例记录(8月1日): date=${records1[0].date} checkIn=${records1[0].checkInTime} checkOut=${records1[0].checkOutTime} isMissing=${records1[0].isMissing}`);

    console.log('  第2次调用fetchEmployeeMonthPunch(E000001, 2026, 8)...');
    const records2 = await collector.fetchEmployeeMonthPunch('E000001', 2026, 8);
    console.log(`  第2次结果: records.length=${records2.length}`);
    console.log(`  示例记录(8月1日): date=${records2[0].date} checkIn=${records2[0].checkInTime} checkOut=${records2[0].checkOutTime} isMissing=${records2[0].isMissing}`);

    assert.equal(records1.length, records2.length,
      `两次返回数组长度应相等: ${records1.length} vs ${records2.length}`);

    const lengthEqual = records1.length === records2.length;
    console.log(`  ✓ 数组长度相等: ${lengthEqual} (${records1.length})`);

    let itemEqualCount = 0;
    const sampleDiffs = [];
    for (let i = 0; i < records1.length; i++) {
      const json1 = JSON.stringify(records1[i]);
      const json2 = JSON.stringify(records2[i]);
      if (json1 === json2) {
        itemEqualCount++;
      } else if (sampleDiffs.length < 3) {
        sampleDiffs.push({ index: i, date: records1[i].date, json1, json2 });
      }
    }

    console.log(`  ✓ 逐项JSON相等: ${itemEqualCount}/${records1.length} 项`);
    if (sampleDiffs.length > 0) {
      for (const d of sampleDiffs) {
        console.log(`    [差异项${d.index}] date=${d.date}`);
        console.log(`      第1次: ${d.json1}`);
        console.log(`      第2次: ${d.json2}`);
      }
    }

    const isDeepEqual = deepEqual(records1, records2);
    console.log(`  ✓ deepEqual结果: ${isDeepEqual}`);

    assert.ok(isDeepEqual, '两次调用返回值DeepEqual应一致（数组完全相等，每一项JSON相等）');
    assert.equal(itemEqualCount, records1.length, `每一项都应JSON相等，实际仅${itemEqualCount}/${records1.length}项相等`);

    console.log('  ✓ 步骤1通过: 同月两次调用返回DeepEqual一致');
  });

  await t.test('步骤2: E000002验证缓存键隔离，不同员工数据不串', async () => {
    console.log('\n  ===== TR-2.3.2 步骤2: 缓存键隔离验证 =====');

    const recordsEmp1 = await collector.fetchEmployeeMonthPunch('E000001', 2026, 8);
    const recordsEmp2 = await collector.fetchEmployeeMonthPunch('E000002', 2026, 8);

    const emp1Ids = new Set(recordsEmp1.map(r => r.employeeId));
    const emp2Ids = new Set(recordsEmp2.map(r => r.employeeId));

    console.log(`  E000001记录employeeId集合: ${[...emp1Ids].join(',')}`);
    console.log(`  E000002记录employeeId集合: ${[...emp2Ids].join(',')}`);

    assert.ok(emp1Ids.has('E000001') && emp1Ids.size === 1, 'E000001的记录employeeId应全部为E000001');
    assert.ok(emp2Ids.has('E000002') && emp2Ids.size === 1, 'E000002的记录employeeId应全部为E000002');

    console.log('  ✓ 步骤2通过: 缓存键隔离，不同员工数据不串');
  });

  await t.test('步骤3: 高管豁免员工EX0001/EX0002/EX0003全月不标记缺卡，isMissing全为false', async () => {
    console.log('\n  ===== TR-2.3.2 步骤3: 高管豁免isMissing验证 =====');

    const execEmployees = ['EX0001', 'EX0002', 'EX0003'];
    let totalWorkdays = 0;
    let totalMissingFalse = 0;

    for (const empId of execEmployees) {
      const records = await collector.fetchEmployeeMonthPunch(empId, 2026, 8);
      const emp = registry.getById(empId);
      const group = groupsLoader.getAttendanceGroupForEmployee(emp);
      const isExemptGroup = group ? group.isExempt : false;

      console.log(`\n  员工${empId}: title=${emp.title} positionTag=${emp.positionTag}`);
      console.log(`    匹配考勤组: ${group ? group.name + ' (isExempt=' + group.isExempt + ')' : '无'}`);

      const workdayRecords = records.filter(r => {
        const d = new Date(r.date);
        const dow = d.getDay();
        return dow >= 1 && dow <= 5;
      });

      const missingCount = workdayRecords.filter(r => r.isMissing === true).length;
      const missingFalseCount = workdayRecords.filter(r => r.isMissing === false).length;
      totalWorkdays += workdayRecords.length;
      totalMissingFalse += missingFalseCount;

      console.log(`    工作日记录: ${workdayRecords.length}天`);
      console.log(`    isMissing=true: ${missingCount}天`);
      console.log(`    isMissing=false: ${missingFalseCount}天`);

      const sampleWorkday = workdayRecords.find(r => !r.checkInTime && !r.checkOutTime);
      if (sampleWorkday) {
        console.log(`    [缺打卡工作日样本] date=${sampleWorkday.date} checkIn=${!!sampleWorkday.checkInTime} checkOut=${!!sampleWorkday.checkOutTime} isMissing=${sampleWorkday.isMissing}`);
        assert.equal(sampleWorkday.isMissing, false, `豁免员工即使无打卡也不应标记缺卡: ${sampleWorkday.date}`);
      }

      assert.equal(missingCount, 0,
        `高管${empId}全月isMissing=true数量应为0，实际=${missingCount}`);
    }

    console.log(`\n  汇总: 3名高管共${totalWorkdays}个工作日记录`);
    console.log(`  isMissing=false: ${totalMissingFalse}/${totalWorkdays}`);
    assert.equal(totalMissingFalse, totalWorkdays,
      `所有豁免员工工作日记录isMissing应为false，实际false=${totalMissingFalse}/${totalWorkdays}`);

    console.log('  ✓ 步骤3通过: 高管豁免员工全月不标记缺卡，isMissing全为false');
  });

  console.log('\n  ===== TR-2.3.2 测试完成 =====\n');
});
