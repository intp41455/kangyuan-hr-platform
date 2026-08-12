'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dayjs = require('dayjs');
const {
  LeaveEngine,
  LEAVE_TYPES,
  LEAVE_TYPE_NAMES,
  LEAVE_UNIT,
  MissingAttachmentError,
  InvalidLeaveRequestError,
  CompTimeManager,
  buildLeaveTypeDefinitions,
  calcAnnualLeaveQuota
} = require('../modules/leave/leave_engine.js');
const { EmployeeModel } = require('../modules/master_data/employee_model.js');
const { DingTalkBotClient } = require('../integrations/dingtalk_bot_dispatcher.js');

test('TR-3.1.1 员工A：entryDate=2023-06-19 → calcAnnualLeaveQuota(asOfDate=2026-08-15)返回quota=5天', async (t) => {
  await t.test('TR-3.1.1-1: 构建员工A模型，入职日期2023-06-19', () => {
    const employeeA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      entity: '陕西康源福祉教育科技',
      dept1: '教学管理中心',
      dept2: '幼教部',
      position: '主班老师',
      positionTag: '教育岗',
      entryDate: new Date('2023-06-19'),
      regularDate: new Date('2023-09-19'),
      status: '正式',
      payrollGrade: 'EDU-T3',
      firstWorkDate: new Date('2023-06-19')
    });
    assert.equal(employeeA.id, 'EMP-A001');
    assert.equal(dayjs(employeeA.entryDate).format('YYYY-MM-DD'), '2023-06-19');
    assert.equal(dayjs(employeeA.regularDate).format('YYYY-MM-DD'), '2023-09-19');
    console.log('  ✓ 员工A数据构建完成: 工号=EMP-A001, 入职=2023-06-19, 转正=2023-09-19');
  });

  await t.test('TR-3.1.1-2: 验证工龄计算：2026-08-15时入职已满3年', () => {
    const employeeA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      entryDate: new Date('2023-06-19'),
      regularDate: new Date('2023-09-19'),
      status: '正式',
      firstWorkDate: new Date('2023-06-19')
    });
    const years = employeeA.calcYearsOfService(new Date('2026-08-15'));
    assert.ok(years >= 3, `2026-08-15时工龄应≥3年，实际=${years}年`);
    assert.ok(years < 10, `工龄应<10年，实际=${years}年`);
    console.log(`  ✓ 工龄计算验证: asOf=2026-08-15时, 工龄=${years}年 (满1年未满10年档位)`);
  });

  await t.test('TR-3.1.1-3: calcAnnualLeaveQuota核心验证 → quota=5天', () => {
    const employeeA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      entryDate: new Date('2023-06-19'),
      regularDate: new Date('2023-09-19'),
      status: '正式',
      firstWorkDate: new Date('2023-06-19')
    });
    const result = calcAnnualLeaveQuota({
      employee: employeeA,
      asOfDate: new Date('2026-08-15')
    });
    console.log('  ┌─────────────────────────────────────────────');
    console.log(`  │ 核算年度: ${result.asOfYear}年`);
    console.log(`  │ 工龄年限: ${result.yearsOfService}年`);
    console.log(`  │ 基础档位: ${result.baseQuota}天`);
    console.log(`  │ 计算方式: ${result.calculationMethod}`);
    console.log(`  │ 最终配额: ⭐ ${result.quota}天`);
    console.log('  └─────────────────────────────────────────────');
    assert.equal(result.quota, 5, `年假配额应为5天，实际=${result.quota}天`);
    assert.equal(result.yearsOfService >= 3 && result.yearsOfService < 10, true, '应落在满1年未满10年档位');
    assert.equal(result.asOfYear, 2026, '核算年度应为2026年');
    console.log('  ✓ 年假配额计算验证通过: quota=5天 (满1年未满10年法定标准)');
  });

  await t.test('TR-3.1.1-4: LeaveEngine集成调用，结果一致', () => {
    const engine = new LeaveEngine();
    const employeeA = new EmployeeModel({
      id: 'EMP-A001',
      name: '员工A',
      entryDate: new Date('2023-06-19'),
      regularDate: new Date('2023-09-19'),
      status: '正式',
      firstWorkDate: new Date('2023-06-19')
    });
    const result = engine.calcAnnualLeaveQuota({
      employee: employeeA,
      asOfDate: new Date('2026-08-15')
    });
    assert.equal(result.quota, 5, `LeaveEngine集成调用应返回5天，实际=${result.quota}天`);
    console.log('  ✓ LeaveEngine集成调用验证通过: 返回quota=5天');
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-3.1.1 测试通过: 员工A年假配额=5天');
  console.log('  - 员工A: 入职2023-06-19，2024-06-19满1年');
  console.log('  - 核算日: 2026-08-15，工龄已满3年');
  console.log('  - 档位判定: 满1年不满10年 → 5天/自然年法定标准');
  console.log('  - 计算方法: 非入职当年，按档位全额计算');
  console.log('  - 最终返回: quota=5天 ✓');
  console.log('═══════════════════════════════════════════════\n');
});

test('TR-3.1.2 调休180天有效期+过期预警+自动过期', async (t) => {
  await t.test('TR-3.1.2-1: 发放日期=now-181天 → isExpired=true，expiredHours正确', () => {
    const botClient = new DingTalkBotClient({ mode: 'mock' });
    const compMgr = new CompTimeManager({ botClient });
    const now = dayjs();
    const grantDate181 = now.subtract(181, 'day').format('YYYY-MM-DD');

    const grant = compMgr.grantCompTime({
      employeeId: 'EMP-COMP-001',
      hours: 8,
      sourceApprovalNo: 'APR-OT-2026-0001',
      grantDate: grantDate181
    });

    assert.equal(dayjs(grant.grantDate).format('YYYY-MM-DD'), grantDate181, '发放日期应正确');
    assert.equal(dayjs(grant.expireAt).isBefore(now.subtract(1, 'day')), true, '过期日期应早于今天');

    const expired = compMgr.isExpired(grant);
    assert.equal(expired, true, '发放日期=now-181天，isExpired应为true');

    const processResult = compMgr.processExpirations();
    const myExpired = processResult.expired.filter(e => e.employeeId === 'EMP-COMP-001');
    assert.equal(myExpired.length, 1, '应被识别为过期记录');
    assert.equal(myExpired[0].expiredHours, 8, `过期小时数应为8，实际=${myExpired[0].expiredHours}`);

    const updatedGrant = compMgr.getGrant(grant.grantId);
    assert.equal(updatedGrant.status, 'EXPIRED', '状态应为EXPIRED');
    assert.equal(updatedGrant.remainingHours, 0, '剩余小时应为0');
    assert.equal(updatedGrant.expiredHours, 8, `expiredHours应为8，实际=${updatedGrant.expiredHours}`);

    console.log(`  ✓ [过期] grantDate=${grantDate181} (now-181天)`);
    console.log(`    → expireAt=${grant.expireAt}`);
    console.log(`    → isExpired=${expired}`);
    console.log(`    → expiredHours=${updatedGrant.expiredHours}小时`);
    console.log(`    → status=${updatedGrant.status}`);
  });

  await t.test('TR-3.1.2-2: 发放日期=now-170天 → isExpiringSoon(14天前)=true → 触发机器人预警', async () => {
    const botClient = new DingTalkBotClient({ mode: 'mock' });
    const compMgr = new CompTimeManager({ botClient });
    const now = dayjs();
    const grantDate170 = now.subtract(170, 'day').format('YYYY-MM-DD');

    const grant = compMgr.grantCompTime({
      employeeId: 'EMP-COMP-002',
      hours: 8,
      sourceApprovalNo: 'APR-OT-2026-0002',
      grantDate: grantDate170
    });

    const expireAt = grant.expireAt;
    const daysLeft = compMgr.daysUntilExpire(grant);
    const expiringSoon = compMgr.isExpiringSoon(expireAt, 14);

    assert.equal(expiringSoon, true, `发放日期=now-170天，距过期${daysLeft}天，应在14天预警范围内`);
    assert.ok(daysLeft >= 0 && daysLeft <= 14, `daysLeft=${daysLeft}应在0~14之间`);

    const processResult = compMgr.processExpirations();
    const myExpiring = processResult.expiringSoon.filter(e => e.employeeId === 'EMP-COMP-002');
    assert.equal(myExpiring.length, 1, '应被识别为即将过期');

    const alertRecord = await compMgr.triggerCompTimeAlert('EMP-COMP-002', 8, daysLeft);

    assert.equal(alertRecord.message, `您有8小时调休将于${daysLeft}天后过期，请尽快使用`, '预警消息内容不正确');
    assert.equal(alertRecord.hours, 8, '预警hours应为8');
    assert.equal(alertRecord.daysLeft, daysLeft, `预警daysLeft应为${daysLeft}`);

    const callHistory = botClient.getCallHistory();
    const dmCalls = callHistory.filter(c => c.method === 'sendDm');
    assert.equal(dmCalls.length, 1, `钉钉机器人sendDm调用次数应为1，实际=${dmCalls.length}`);

    const alertHistory = compMgr.getAlertHistory();
    assert.equal(alertHistory.length, 1, `预警历史应为1条，实际=${alertHistory.length}`);

    console.log(`  ✓ [即将过期] grantDate=${grantDate170} (now-170天)`);
    console.log(`    → expireAt=${expireAt}`);
    console.log(`    → daysUntilExpire=${daysLeft}天`);
    console.log(`    → isExpiringSoon(14天预警)=${expiringSoon}`);
    console.log(`    ┌────────────────────────────────────────`);
    console.log(`    │ 📱 钉钉机器人预警消息 (${alertHistory.length}条):`);
    console.log(`    │ ${alertRecord.message}`);
    console.log(`    └────────────────────────────────────────`);
    console.log(`    → 机器人sendDm调用次数: ${dmCalls.length}次 ✓`);

    console.log('\n  【TR-3.1.2-2 验证点明细】');
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log('  │ 预期: 预警消息1条 → "您有8小时调休将于X天后过期，请尽快使用"  │');
    console.log(`  │ 实际: 预警消息${alertHistory.length}条 → "${alertRecord.message}"  │`);
    console.log('  │ 结论: 匹配 ✓ 通过                              │');
    console.log('  └─────────────────────────────────────────────┘');
  });

  await t.test('TR-3.1.2-3: 发放日期=now-50天 → 未过期未预警', () => {
    const botClient = new DingTalkBotClient({ mode: 'mock' });
    const compMgr = new CompTimeManager({ botClient });
    const now = dayjs();
    const grantDate50 = now.subtract(50, 'day').format('YYYY-MM-DD');

    const grant = compMgr.grantCompTime({
      employeeId: 'EMP-COMP-003',
      hours: 16,
      sourceApprovalNo: 'APR-OT-2026-0003',
      grantDate: grantDate50
    });

    const expired = compMgr.isExpired(grant);
    const expiringSoon = compMgr.isExpiringSoon(grant.expireAt, 14);
    const daysLeft = compMgr.daysUntilExpire(grant);

    assert.equal(expired, false, '发放日期=now-50天，isExpired应为false');
    assert.equal(expiringSoon, false, '发放日期=now-50天，isExpiringSoon应为false');
    assert.ok(daysLeft > 14, `daysLeft=${daysLeft}应>14天`);

    const processResult = compMgr.processExpirations();
    const myExpired = processResult.expired.filter(e => e.employeeId === 'EMP-COMP-003');
    const myExpiring = processResult.expiringSoon.filter(e => e.employeeId === 'EMP-COMP-003');
    assert.equal(myExpired.length, 0, '不应出现在过期列表');
    assert.equal(myExpiring.length, 0, '不应出现在即将过期列表');

    const updatedGrant = compMgr.getGrant(grant.grantId);
    assert.equal(updatedGrant.status, 'ACTIVE', '状态应保持ACTIVE');
    assert.equal(updatedGrant.remainingHours, 16, '剩余小时应保持16');
    assert.equal(updatedGrant.alerted, false, 'alerted应为false');

    console.log(`  ✓ [正常] grantDate=${grantDate50} (now-50天)`);
    console.log(`    → expireAt=${grant.expireAt}`);
    console.log(`    → daysUntilExpire=${daysLeft}天 (>14天)`);
    console.log(`    → isExpired=${expired}`);
    console.log(`    → isExpiringSoon=${expiringSoon}`);
    console.log(`    → status=ACTIVE, remainingHours=16小时`);
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-3.1.2 测试通过: 调休180天有效期+过期预警');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │ Case 1: now-181天 → 已过期 ✓                │');
  console.log('  │         expiredHours=8h, status=EXPIRED     │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │ Case 2: now-170天 → 即将过期 ✓              │');
  console.log('  │         isExpiringSoon=true                 │');
  console.log('  │         触发钉钉机器人预警 1条消息           │');
  console.log('  │         "您有8小时调休将于N天后过期，请尽快使用"│');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │ Case 3: now-50天 → 正常 ✓                   │');
  console.log('  │         isExpired=false, expiring=false     │');
  console.log('  │         status=ACTIVE, 无预警               │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('═══════════════════════════════════════════════\n');
});

test('TR-3.1.3 病假校验：3天无病历→MissingAttachmentError；有病历时成功；2天无病历→通过', async (t) => {
  await t.test('TR-3.1.3-1: 病假3天 + hasMedicalRecord=false → 抛出MissingAttachmentError', async () => {
    const engine = new LeaveEngine();
    const employeeB = new EmployeeModel({
      id: 'EMP-B001',
      name: '员工B',
      entryDate: new Date('2022-03-01'),
      status: '正式'
    });

    let thrownError = null;
    try {
      await engine.applyLeave({
        type: LEAVE_TYPES.SICK,
        days: 3,
        employee: employeeB,
        employeeId: 'EMP-B001',
        hasMedicalRecord: false,
        startDate: '2026-08-15',
        endDate: '2026-08-17'
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError !== null, '应抛出异常');
    assert.ok(thrownError instanceof MissingAttachmentError, `应为MissingAttachmentError，实际=${thrownError ? thrownError.name : 'null'}`);
    assert.ok(thrownError.message.includes('病历'), `异常消息应包含"病历"，实际=${thrownError.message}`);

    console.log('  ✓ [病假3天+无病历] 结果: 抛出MissingAttachmentError');
    console.log(`    → Error.name: ${thrownError.name}`);
    console.log(`    → Error.message: ${thrownError.message}`);
  });

  await t.test('TR-3.1.3-2: 病假3天 + hasMedicalRecord=true → 成功提交', async () => {
    const engine = new LeaveEngine();
    const employeeB = new EmployeeModel({
      id: 'EMP-B001',
      name: '员工B',
      entryDate: new Date('2022-03-01'),
      status: '正式'
    });

    let result = null;
    let thrownError = null;
    try {
      result = await engine.applyLeave({
        type: LEAVE_TYPES.SICK,
        days: 3,
        employee: employeeB,
        employeeId: 'EMP-B001',
        hasMedicalRecord: true,
        startDate: '2026-08-15',
        endDate: '2026-08-17',
        reason: '急性肠胃炎，附医院诊断证明'
      });
    } catch (err) {
      thrownError = err;
    }

    assert.equal(thrownError, null, `有病历的病假3天不应抛出异常，实际=${thrownError ? thrownError.message : '无异常'}`);
    assert.ok(result !== null, '应返回请假记录');
    assert.equal(result.type, LEAVE_TYPES.SICK, '类型应为SICK');
    assert.equal(result.typeName, '病假', 'typeName应为病假');
    assert.equal(result.days, 3, '天数应为3天');
    assert.equal(result.hasMedicalRecord, true, 'hasMedicalRecord应为true');
    assert.equal(result.status, 'SUBMITTED', '状态应为SUBMITTED');
    assert.equal(result.paid, true, '病假应为带薪');
    assert.equal(result.payRate, 0.8, '病假薪资比例应为80%');

    console.log('  ✓ [病假3天+有病历] 结果: 成功提交');
    console.log(`    → leaveId: ${result.leaveId}`);
    console.log(`    → 类型: ${result.typeName} (${result.type})`);
    console.log(`    → 天数: ${result.days}天`);
    console.log(`    → 病历附件: 已提供 ✓`);
    console.log(`    → 薪资: 带薪 ${result.payRate * 100}%`);
    console.log(`    → 状态: ${result.status}`);
  });

  await t.test('TR-3.1.3-3: 病假2天 + hasMedicalRecord=false → 正常通过（无需病历）', async () => {
    const engine = new LeaveEngine();
    const employeeB = new EmployeeModel({
      id: 'EMP-B001',
      name: '员工B',
      entryDate: new Date('2022-03-01'),
      status: '正式'
    });

    let result = null;
    let thrownError = null;
    try {
      result = await engine.applyLeave({
        type: LEAVE_TYPES.SICK,
        days: 2,
        employee: employeeB,
        employeeId: 'EMP-B001',
        hasMedicalRecord: false,
        startDate: '2026-08-20',
        endDate: '2026-08-21',
        reason: '轻微感冒，休息2天'
      });
    } catch (err) {
      thrownError = err;
    }

    assert.equal(thrownError, null, `病假2天无病历不应抛异常，实际=${thrownError ? thrownError.message : '无异常'}`);
    assert.ok(result !== null, '应返回请假记录');
    assert.equal(result.type, LEAVE_TYPES.SICK, '类型应为SICK');
    assert.equal(result.days, 2, '天数应为2天');
    assert.equal(result.hasMedicalRecord, false, 'hasMedicalRecord应为false（无需病历）');
    assert.equal(result.status, 'SUBMITTED', '状态应为SUBMITTED');
    assert.equal(result.paid, true, '病假应为带薪');
    assert.equal(result.payRate, 0.8, '病假薪资比例应为80%');

    console.log('  ✓ [病假2天+无病历] 结果: 正常通过（无需病历）');
    console.log(`    → leaveId: ${result.leaveId}`);
    console.log(`    → 类型: ${result.typeName} (${result.type})`);
    console.log(`    → 天数: ${result.days}天`);
    console.log(`    → 病历附件: 无需提供 (阈值=≥3天) ✓`);
    console.log(`    → 薪资: 带薪 ${result.payRate * 100}%`);
    console.log(`    → 状态: ${result.status}`);
  });

  await t.test('TR-3.1.3-4: LeaveTypeModel.needsMedicalRecord阈值验证', () => {
    const leaveTypes = buildLeaveTypeDefinitions();
    const sickType = leaveTypes[LEAVE_TYPES.SICK];

    assert.equal(sickType.needsMedicalRecord(1), false, '病假1天不需要病历');
    assert.equal(sickType.needsMedicalRecord(2), false, '病假2天不需要病历');
    assert.equal(sickType.needsMedicalRecord(3), true, '病假3天需要病历');
    assert.equal(sickType.needsMedicalRecord(5), true, '病假5天需要病历');
    assert.equal(sickType.medicalRecordThresholdDays, 3, '病历阈值应为3天');

    const annualType = leaveTypes[LEAVE_TYPES.ANNUAL];
    assert.equal(annualType.needsMedicalRecord(10), false, '年假10天不需要病历');

    console.log('  ✓ [阈值验证] LeaveTypeModel.needsMedicalRecord(days):');
    console.log('    → 病假1天: false');
    console.log('    → 病假2天: false');
    console.log('    → 病假3天: true ✓ (阈值=3天)');
    console.log('    → 病假5天: true');
    console.log('    → 年假任意: false');
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-3.1.3 测试通过: 病假病历校验');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │ Case 1: 病假3天 + 无病历                     │');
  console.log('  │         → 抛出MissingAttachmentError ✓      │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │ Case 2: 病假3天 + 有病历                     │');
  console.log('  │         → 成功提交 SUBMITTED ✓              │');
  console.log('  │         → 带薪80% (payRate=0.8)             │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │ Case 3: 病假2天 + 无病历                     │');
  console.log('  │         → 正常通过（阈值≥3天才需） ✓         │');
  console.log('  │         → 带薪80% (payRate=0.8)             │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │ Case 4: 阈值模型验证                         │');
  console.log('  │         → needsMedicalRecord(2)=false       │');
  console.log('  │         → needsMedicalRecord(3)=true        │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('═══════════════════════════════════════════════\n');
});

test('TR-3.1.0 额外验证：8类假期类型定义完整性', async (t) => {
  const leaveTypes = buildLeaveTypeDefinitions();
  const expectedTypes = [
    ['ANNUAL', '年假', 0.5, LEAVE_UNIT.DAY, true, 1.0, true, true],
    ['PERSONAL', '事假', 1, LEAVE_UNIT.DAY, false, 0, false, false],
    ['SICK', '病假', 0.5, LEAVE_UNIT.DAY, true, 0.8, false, false],
    ['MARRIAGE', '婚假', 1, LEAVE_UNIT.DAY, true, 1.0, false, false],
    ['MATERNITY', '产假', 1, LEAVE_UNIT.DAY, true, 1.0, false, false],
    ['PATERNITY', '陪产假', 1, LEAVE_UNIT.DAY, true, 1.0, false, false],
    ['FUNERAL', '丧假', 1, LEAVE_UNIT.DAY, true, 1.0, false, false],
    ['COMPTIME', '调休', 1, LEAVE_UNIT.HOUR, true, 1.0, false, false]
  ];

  for (const [type, name, minUnit, unit, paid, payRate, canCarryOver, canAdvance] of expectedTypes) {
    await t.test(`${type}(${name}) 定义验证`, () => {
      const lt = leaveTypes[LEAVE_TYPES[type]];
      assert.ok(lt, `${type}类型应存在`);
      assert.equal(lt.name, name, `名称应为${name}`);
      assert.equal(lt.minUnit, minUnit, `minUnit应为${minUnit}`);
      assert.equal(lt.unit, unit, `unit应为${unit}`);
      assert.equal(lt.paid, paid, `paid应为${paid}`);
      assert.equal(lt.payRate, payRate, `payRate应为${payRate}`);
      assert.equal(lt.canCarryOver, canCarryOver, `canCarryOver应为${canCarryOver}`);
      assert.equal(lt.canAdvance, canAdvance, `canAdvance应为${canAdvance}`);
    });
  }

  const sickType = leaveTypes[LEAVE_TYPES.SICK];
  await t.test('SICK: ≥3天需病历 (medicalRecordThresholdDays=3)', () => {
    assert.equal(sickType.medicalRecordThresholdDays, 3, '病假病历阈值应为3');
    assert.equal(sickType.requireMedicalRecord, true, '病假requireMedicalRecord应为true');
  });

  const annualType = leaveTypes[LEAVE_TYPES.ANNUAL];
  await t.test('ANNUAL: 可跨年+可预支', () => {
    assert.equal(annualType.canCarryOver, true, '年假可跨年');
    assert.equal(annualType.canAdvance, true, '年假可预支');
  });

  const comptimeType = leaveTypes[LEAVE_TYPES.COMPTIME];
  await t.test('COMPTIME: 有效期180天 (expireDays=180)', () => {
    assert.equal(comptimeType.expireDays, 180, '调休有效期应为180天');
    assert.equal(comptimeType.unit, LEAVE_UNIT.HOUR, '调休单位应为小时');
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-3.1.0 8类假期类型定义验证通过');
  console.log('  ┌────────────┬──────┬──────┬──────┬──────┐');
  console.log('  │ 类型       │ 单位 │ min  │ 带薪 │ 跨年 │');
  console.log('  ├────────────┼──────┼──────┼──────┼──────┤');
  console.log('  │ ANNUAL年假  │ 天   │ 0.5  │ 100% │ 是   │');
  console.log('  │ PERSONAL事假│ 天   │ 1    │ 0%   │ 否   │');
  console.log('  │ SICK病假    │ 天   │ 0.5  │ 80%  │ 否   │');
  console.log('  │ MARRIAGE婚假│ 天   │ 1    │ 100% │ 否   │');
  console.log('  │ MATERNITY产假│ 天   │ 1    │ 100% │ 否   │');
  console.log('  │ PATERNITY陪产│ 天   │ 1    │ 100% │ 否   │');
  console.log('  │ FUNERAL丧假 │ 天   │ 1    │ 100% │ 否   │');
  console.log('  │ COMPTIME调休│ 小时 │ 1    │ 抵工 │ 否   │');
  console.log('  └────────────┴──────┴──────┴──────┴──────┘');
  console.log('  特殊规则:');
  console.log('    · SICK病假: ≥3天需病历附件');
  console.log('    · ANNUAL年假: 可预支≤入职年限天数');
  console.log('    · COMPTIME调休: 有效期180天，14天前预警');
  console.log('═══════════════════════════════════════════════\n');
});
