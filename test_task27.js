'use strict';

const {
  APPROVAL_EVENT_TYPES,
  WRITEBACK_LOG_TYPES,
  WritebackLog,
  TransferLog,
  ApprovalListener
} = require('./src/modules/attendance/oa_approval_writer.js');

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES
} = require('./src/modules/attendance/attendance_anomaly_engine.js');

const {
  ANOMALY_STATUS,
  AnomalyRepository,
  ReminderLog,
  DingTalkBotClient
} = require('./src/integrations/dingtalk_bot_dispatcher.js');

async function test_TR271() {
  console.log('\n========== TR-2.7.1: 缺卡异常补卡审批PASSED→扣款取消+幂等测试 ==========');

  const repository = new AnomalyRepository();
  const writebackLog = new WritebackLog();
  const transferLog = new TransferLog();
  const reminderLog = new ReminderLog();
  const botClient = new DingTalkBotClient({ mode: 'mock' });

  const listener = new ApprovalListener({
    anomalyRepository: repository,
    writebackLog,
    transferLog,
    reminderLog,
    botClient
  });

  const anomalyAT001 = {
    anomalyId: 'AT-001',
    employeeId: 'EMP-TEST-01',
    date: '2026-08-10',
    type: ATTENDANCE_ANOMALY.MISSING_PUNCH,
    typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.MISSING_PUNCH],
    severity: 'FINE',
    deduction: 50,
    ruleCodes: ['R-196'],
    missingPunchCount: 1,
    makeupApprovalNo: 'APR-MAKEUP-X1'
  };

  repository.add(anomalyAT001);
  listener.bindApprovalAnomaly('APR-MAKEUP-X1', 'AT-001');

  console.log('[TR-2.7.1] 构造场景:');
  console.log(`  异常ID: AT-001`);
  console.log(`  异常类型: 缺卡(MISSING_PUNCH)`);
  console.log(`  初始状态: OPEN (未闭环)`);
  console.log(`  初始扣款金额(deductionAmount): 50元`);
  console.log(`  关联审批单: APR-MAKEUP-X1 (补卡审批)`);
  console.log(`  WritebackLog初始条数: ${writebackLog.size()}`);

  const beforeAnomaly = repository.get('AT-001');
  console.log(`\n  前置校验:`);
  console.log(`    anomaly.status=${beforeAnomaly.status} (期望=OPEN)`);
  console.log(`    anomaly.deduction=${beforeAnomaly.deduction}元 (期望=50)`);

  const passEvent = {
    type: APPROVAL_EVENT_TYPES.APPROVAL_PASSED,
    approvalNo: 'APR-MAKEUP-X1',
    passedAt: new Date()
  };

  console.log(`\n  → 第1次调用handleApprovalEvent({type:PASSED, approvalNo:APR-MAKEUP-X1})`);
  const result1 = await listener.handleApprovalEvent(passEvent);
  console.log(`    返回结果: idempotent=${result1.idempotent}, skipped=${result1.skipped}`);

  const anomalyAfter1 = repository.get('AT-001');
  const wbLogs = writebackLog.getByApprovalNo('APR-MAKEUP-X1');
  const cancelDedLogs = writebackLog.getByType(WRITEBACK_LOG_TYPES.CANCEL_DEDUCTION);

  console.log(`\n  第1次调用后状态:`);
  console.log(`    anomaly.status=${anomalyAfter1.status} (期望=CLOSED)`);
  console.log(`    anomaly.deduction=${anomalyAfter1.deduction}元 (期望=0)`);
  console.log(`    WritebackLog总条数=${writebackLog.size()}`);
  console.log(`    CANCEL_DEDUCTION类型条数=${cancelDedLogs.length} (期望=1)`);
  if (cancelDedLogs.length > 0) {
    const log = cancelDedLogs[0];
    console.log(`      → WritebackLog详情:`);
    console.log(`         ts=${new Date(log.ts).toISOString()}`);
    console.log(`         anomalyId=${log.anomalyId}`);
    console.log(`         approvalNo=${log.approvalNo}`);
    console.log(`         eventType=${log.eventType}`);
    console.log(`         writebackType=${log.writebackType}`);
    console.log(`         beforeState=${log.beforeState} → afterState=${log.afterState}`);
    console.log(`         beforeDeduction=${log.beforeDeduction}元 → afterDeduction=${log.afterDeduction}元`);
    console.log(`         operatorType=${log.operatorType}`);
  }

  console.log(`\n  → 第2次调用handleApprovalEvent (同一approvalNo，测试幂等)`);
  const result2 = await listener.handleApprovalEvent(passEvent);
  console.log(`    返回结果: idempotent=${result2.idempotent}, skipped=${result2.skipped}`);
  console.log(`    message=${result2.message}`);

  const anomalyAfter2 = repository.get('AT-001');
  const wbLogsAfter2 = writebackLog.getByApprovalNo('APR-MAKEUP-X1');
  const cancelDedAfter2 = writebackLog.getByType(WRITEBACK_LOG_TYPES.CANCEL_DEDUCTION);

  console.log(`\n  第2次调用后状态:`);
  console.log(`    anomaly.status=${anomalyAfter2.status}`);
  console.log(`    anomaly.deduction=${anomalyAfter2.deduction}元`);
  console.log(`    WritebackLog总条数=${writebackLog.size()} (期望仍=1)`);
  console.log(`    CANCEL_DEDUCTION条数=${cancelDedAfter2.length} (期望仍=1)`);

  const stateClosed = anomalyAfter1.status === ANOMALY_STATUS.CLOSED;
  const deductZero = (Number(anomalyAfter1.deduction) || 0) === 0;
  const hasCancelLog = cancelDedLogs.length === 1;
  const cancelBefore50 = hasCancelLog && cancelDedLogs[0].beforeDeduction === 50;
  const cancelAfter0 = hasCancelLog && cancelDedLogs[0].afterDeduction === 0;
  const secondSkipped = result2.skipped === true && result2.idempotent === true;
  const logCountStill1 = cancelDedAfter2.length === 1;

  console.log(`\n[TR-2.7.1] 校验清单:`);
  console.log(`  1. PASSED后异常状态=CLOSED: ${stateClosed ? '✅' : '❌'} (实际=${anomalyAfter1.status})`);
  console.log(`  2. PASSED后deductionAmount=0元: ${deductZero ? '✅' : '❌'} (实际=${anomalyAfter1.deduction})`);
  console.log(`  3. WritebackLog含CANCEL_DEDUCTION 1条: ${hasCancelLog ? '✅' : '❌'} (实际=${cancelDedLogs.length}条)`);
  console.log(`  4. CANCEL_DEDUCTION.beforeDeduction=50: ${cancelBefore50 ? '✅' : '❌'} (实际=${hasCancelLog ? cancelDedLogs[0].beforeDeduction : 'N/A'})`);
  console.log(`  5. CANCEL_DEDUCTION.afterDeduction=0: ${cancelAfter0 ? '✅' : '❌'} (实际=${hasCancelLog ? cancelDedLogs[0].afterDeduction : 'N/A'})`);
  console.log(`  6. 第2次幂等调用skipped=true: ${secondSkipped ? '✅' : '❌'} (idempotent=${result2.idempotent}, skipped=${result2.skipped})`);
  console.log(`  7. 幂等后WritebackLog数量仍=1: ${logCountStill1 ? '✅' : '❌'} (实际=${cancelDedAfter2.length})`);

  const pass = stateClosed && deductZero && hasCancelLog && cancelBefore50 && cancelAfter0 && secondSkipped && logCountStill1;
  console.log(`\n[TR-2.7.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR272() {
  console.log('\n========== TR-2.7.2: 请假异常审批REJECTED→保持OPEN+二次催办测试 ==========');

  const repository = new AnomalyRepository();
  const writebackLog = new WritebackLog();
  const transferLog = new TransferLog();
  const reminderLog = new ReminderLog();
  const botClient = new DingTalkBotClient({ mode: 'mock' });

  const listener = new ApprovalListener({
    anomalyRepository: repository,
    writebackLog,
    transferLog,
    reminderLog,
    botClient
  });

  const employee = {
    id: 'EMP-TEST-02',
    name: '请假测试员工',
    dingtalkUserId: 'DD_EMP_LEAVE_02',
    dept2: '测试部',
    department: 'D05'
  };

  const leader = {
    id: 'EMP-LEADER-02',
    name: '请假审批主管',
    dingtalkUserId: 'DD_LEADER_LEAVE_02'
  };

  const anomalyAT002 = {
    anomalyId: 'AT-002',
    employeeId: employee.id,
    date: '2026-08-09',
    type: ATTENDANCE_ANOMALY.LEAVE_PERSONAL,
    typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.LEAVE_PERSONAL],
    severity: 'WARNING',
    deduction: 0,
    ruleCodes: ['R-201'],
    leaveType: ATTENDANCE_ANOMALY.LEAVE_PERSONAL,
    leaveDays: 1,
    approvalNo: 'APR-LEAVE-Y2',
    employee,
    leader
  };

  repository.add(anomalyAT002);
  listener.bindApprovalAnomaly('APR-LEAVE-Y2', 'AT-002');

  console.log('[TR-2.7.2] 构造场景:');
  console.log(`  异常ID: AT-002`);
  console.log(`  异常类型: 事假(LEAVE_PERSONAL)`);
  console.log(`  初始状态: OPEN (未闭环)`);
  console.log(`  关联审批单: APR-LEAVE-Y2 (事假审批)`);
  console.log(`  ReminderLog初始条数: ${reminderLog.size()}`);
  console.log(`  Bot sendDm初始调用次数: ${botClient.getCallCount('sendDm')}`);

  const beforeAnomaly = repository.get('AT-002');
  console.log(`\n  前置校验:`);
  console.log(`    anomaly.status=${beforeAnomaly.status} (期望=OPEN)`);

  const rejectEvent = {
    type: APPROVAL_EVENT_TYPES.APPROVAL_REJECTED,
    approvalNo: 'APR-LEAVE-Y2',
    rejectReason: '请假材料不完整，请补充医院诊断证明',
    rejectedAt: new Date()
  };

  console.log(`\n  → 调用handleApprovalEvent({type:REJECTED, approvalNo:APR-LEAVE-Y2, rejectReason:"材料不完整"})`);
  const result = await listener.handleApprovalEvent(rejectEvent);
  console.log(`    返回结果: idempotent=${result.idempotent}, skipped=${result.skipped}`);
  console.log(`    action=${result.action}`);
  console.log(`    reminderDispatched=${result.reminderDispatched}`);
  console.log(`    rejectReason=${result.rejectReason}`);

  const anomalyAfter = repository.get('AT-002');
  const openLogs = writebackLog.getByType(WRITEBACK_LOG_TYPES.KEEP_OPEN_REJECTED);
  const reminderLogs = reminderLog.getByAnomalyId('AT-002');
  const rejectReminders = reminderLogs.filter(r => r.reminderLevel === 'REJECTED_RESUBMIT');

  console.log(`\n  调用后状态:`);
  console.log(`    anomaly.status=${anomalyAfter.status} (期望仍=OPEN未闭环)`);
  console.log(`    anomaly.rejectCount=${anomalyAfter.rejectCount || 0} (期望=1)`);
  console.log(`    anomaly.lastRejectReason=${anomalyAfter.lastRejectReason}`);
  console.log(`    WritebackLog KEEP_OPEN_REJECTED条数=${openLogs.length} (期望≥1)`);
  console.log(`    Bot sendDm调用次数=${botClient.getCallCount('sendDm')} (期望≥1，二次催办派单)`);
  console.log(`    ReminderLog总条数=${reminderLog.size()}`);
  console.log(`    ReminderLog含REJECTED_RESUBMIT条数=${rejectReminders.length} (期望≥1)`);
  if (rejectReminders.length > 0) {
    const rm = rejectReminders[0];
    console.log(`      → 催办详情:`);
    console.log(`         reminderLevel=${rm.reminderLevel}`);
    console.log(`         targetType=${rm.targetType}`);
    console.log(`         targetUserId=${rm.targetUserId}`);
    console.log(`         message前缀="${String(rm.message || '').slice(0, 50)}..."`);
    console.log(`         message包含REJECTED_RESUBMIT语义: ${String(rm.message || '').includes('驳回') || String(rm.message || '').includes('REJECTED')}`);
  }

  const stillOpen = anomalyAfter.status === ANOMALY_STATUS.OPEN;
  const hasReminder = rejectReminders.length >= 1;
  const hasReasonTag = hasReminder && rejectReminders[0].reminderLevel === 'REJECTED_RESUBMIT';
  const dispatched = result.reminderDispatched === true || botClient.getCallCount('sendDm') >= 1;
  const hasRejectOpenLog = openLogs.length >= 1;
  const rejectCountOne = (Number(anomalyAfter.rejectCount) || 0) >= 1;

  console.log(`\n[TR-2.7.2] 校验清单:`);
  console.log(`  1. REJECTED后异常状态仍OPEN(未闭环): ${stillOpen ? '✅' : '❌'} (实际=${anomalyAfter.status})`);
  console.log(`  2. ReminderLog新增二次催办≥1条: ${hasReminder ? '✅' : '❌'} (实际=${rejectReminders.length}条)`);
  console.log(`  3. 催办含reason=REJECTED_RESUBMIT标记: ${hasReasonTag ? '✅' : '❌'} (level=${hasReminder ? rejectReminders[0].reminderLevel : 'N/A'})`);
  console.log(`  4. dispatchAnomaly触发(Bot sendDm≥1): ${dispatched ? '✅' : '❌'} (sendDm=${botClient.getCallCount('sendDm')}, reminderDispatched=${result.reminderDispatched})`);
  console.log(`  5. WritebackLog含KEEP_OPEN_REJECTED记录: ${hasRejectOpenLog ? '✅' : '❌'} (条数=${openLogs.length})`);
  console.log(`  6. rejectCount计数≥1: ${rejectCountOne ? '✅' : '❌'} (实际=${anomalyAfter.rejectCount || 0})`);

  const pass = stillOpen && hasReminder && hasReasonTag && dispatched && hasRejectOpenLog && rejectCountOne;
  console.log(`\n[TR-2.7.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR273() {
  console.log('\n========== TR-2.7.3: 加班审批单TRANSFERRED→转交链路记录测试 ==========');

  const repository = new AnomalyRepository();
  const writebackLog = new WritebackLog();
  const transferLog = new TransferLog();
  const reminderLog = new ReminderLog();
  const botClient = new DingTalkBotClient({ mode: 'mock' });

  const listener = new ApprovalListener({
    anomalyRepository: repository,
    writebackLog,
    transferLog,
    reminderLog,
    botClient
  });

  const anomalyAT003 = {
    anomalyId: 'AT-003',
    employeeId: 'EMP-TEST-03',
    date: '2026-08-08',
    type: ATTENDANCE_ANOMALY.OT_WORKDAY,
    typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.OT_WORKDAY],
    severity: 'DEDUCT',
    deduction: 0,
    ruleCodes: ['R-198'],
    otHours: 3,
    rate: 1.5,
    approvalNo: 'APR-OT-Z3'
  };

  repository.add(anomalyAT003);
  listener.bindApprovalAnomaly('APR-OT-Z3', 'AT-003');

  console.log('[TR-2.7.3] 构造场景:');
  console.log(`  异常ID: AT-003`);
  console.log(`  异常类型: 平日加班(OT_WORKDAY)`);
  console.log(`  关联审批单: APR-OT-Z3 (加班审批)`);
  console.log(`  转交信息: from=APPROVER01 → to=APPROVER02`);
  console.log(`  comment="王总出差，转交李总审批"`);
  console.log(`  TransferLog初始条数: ${transferLog.size()}`);

  const beforeAnomaly = repository.get('AT-003');
  console.log(`\n  前置校验:`);
  console.log(`    anomaly.status=${beforeAnomaly.status} (期望=OPEN)`);

  const transferredAt = new Date();
  const transferEvent = {
    type: APPROVAL_EVENT_TYPES.APPROVAL_TRANSFERRED,
    approvalNo: 'APR-OT-Z3',
    eventId: 'EVT-TR-20260811-001',
    transfer: {
      from: 'APPROVER01',
      to: 'APPROVER02',
      comment: '王总出差，转交李总审批',
      transferredAt
    }
  };

  console.log(`\n  → 调用handleApprovalEvent({type:TRANSFERRED, approvalNo:APR-OT-Z3, transfer:{from, to, comment}})`);
  const result = await listener.handleApprovalEvent(transferEvent);
  console.log(`    返回结果: action=${result.action}`);
  console.log(`    fromApproverId=${result.fromApproverId}`);
  console.log(`    toApproverId=${result.toApproverId}`);
  console.log(`    comment=${result.comment}`);

  const anomalyAfter = repository.get('AT-003');
  const transferRecords = transferLog.getByApprovalNo('APR-OT-Z3');
  const transferAll = transferLog.getAll();
  const transferWbLogs = writebackLog.getByType(WRITEBACK_LOG_TYPES.TRANSFER_RECORD);

  console.log(`\n  调用后状态:`);
  console.log(`    anomaly.status=${anomalyAfter.status} (转交不改变异常状态)`);
  console.log(`    TransferLog.size()=${transferLog.size()} (期望=1)`);
  console.log(`    审批单APR-OT-Z3关联转交记录数=${transferRecords.length}`);
  if (transferRecords.length > 0) {
    const tr = transferRecords[0];
    console.log(`      → 转交链路详情:`);
    console.log(`         transferId=${tr.transferId}`);
    console.log(`         eventId=${tr.eventId}`);
    console.log(`         approvalNo=${tr.approvalNo}`);
    console.log(`         anomalyId=${tr.anomalyId}`);
    console.log(`         fromApproverId=${tr.fromApproverId} (期望=APPROVER01)`);
    console.log(`         toApproverId=${tr.toApproverId} (期望=APPROVER02)`);
    console.log(`         comment="${tr.comment}" (期望完整内容)`);
    console.log(`         transferredAt=${new Date(tr.transferredAt).toISOString()}`);
  }
  console.log(`    WritebackLog TRANSFER_RECORD类型条数=${transferWbLogs.length}`);
  if (transferWbLogs.length > 0) {
    const wb = transferWbLogs[0];
    console.log(`      → 审计WritebackLog:`);
    console.log(`         extra.fromApproverId=${wb.extra ? wb.extra.fromApproverId : 'N/A'}`);
    console.log(`         extra.toApproverId=${wb.extra ? wb.extra.toApproverId : 'N/A'}`);
    console.log(`         extra.comment="${wb.extra ? wb.extra.comment : 'N/A'}"`);
    console.log(`         operatorType=${wb.operatorType} (期望=AUTO)`);
  }

  const sizeOne = transferLog.size() === 1;
  const fromOk = transferRecords.length >= 1 && transferRecords[0].fromApproverId === 'APPROVER01';
  const toOk = transferRecords.length >= 1 && transferRecords[0].toApproverId === 'APPROVER02';
  const commentExpected = '王总出差，转交李总审批';
  const commentOk = transferRecords.length >= 1 && transferRecords[0].comment === commentExpected;
  const auditOk = transferWbLogs.length >= 1
    && transferWbLogs[0].extra
    && transferWbLogs[0].extra.fromApproverId === 'APPROVER01'
    && transferWbLogs[0].extra.toApproverId === 'APPROVER02'
    && transferWbLogs[0].extra.comment === commentExpected;
  const eventIdOk = transferRecords.length >= 1 && transferRecords[0].eventId === 'EVT-TR-20260811-001';

  console.log(`\n[TR-2.7.3] 校验清单:`);
  console.log(`  1. TransferLog.size()=1: ${sizeOne ? '✅' : '❌'} (实际=${transferLog.size()})`);
  console.log(`  2. fromApproverId=APPROVER01: ${fromOk ? '✅' : '❌'} (实际=${transferRecords.length > 0 ? transferRecords[0].fromApproverId : 'N/A'})`);
  console.log(`  3. toApproverId=APPROVER02: ${toOk ? '✅' : '❌'} (实际=${transferRecords.length > 0 ? transferRecords[0].toApproverId : 'N/A'})`);
  console.log(`  4. comment内容完整一致: ${commentOk ? '✅' : '❌'} (实际="${transferRecords.length > 0 ? transferRecords[0].comment : 'N/A'}")`);
  console.log(`  5. 审计日志WritebackLog可查询(TRANSFER_RECORD): ${auditOk ? '✅' : '❌'} (条数=${transferWbLogs.length})`);
  console.log(`  6. eventId传递正确: ${eventIdOk ? '✅' : '❌'} (实际=${transferRecords.length > 0 ? transferRecords[0].eventId : 'N/A'})`);

  const pass = sizeOne && fromOk && toOk && commentOk && auditOk && eventIdOk;
  console.log(`\n[TR-2.7.3] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('================================================================');
  console.log('智慧化人资平台 Task2.7 OA审批闭环回写(异常引擎+机器人) 测试套件');
  console.log('================================================================');
  console.log('\n【输出文件路径】:');
  console.log('  核心文件: src/modules/attendance/oa_approval_writer.js');
  console.log('  主要导出模块:');
  console.log('    ① ApprovalListener (Polling轮询 + Event订阅 双模式)');
  console.log('      - 构造参数: anomalyRepository, writebackLog, transferLog, reminderLog, botClient');
  console.log('      - handleApprovalEvent(event) → 审批结果核心处理');
  console.log('      - bindApprovalAnomaly(approvalNo, anomalyId) → 审批单与异常绑定');
  console.log('      - subscribe(callback) → 事件订阅模式');
  console.log('      - startPolling()/stopPolling() → 轮询模式');
  console.log('      - 幂等控制: isProcessed(approvalNo), _processedApprovals Set');
  console.log('    ② 事件类型 APPROVAL_EVENT_TYPES:');
  console.log('       APPROVAL_PASSED(通过) / APPROVAL_REJECTED(驳回) / APPROVAL_TRANSFERRED(转交)');
  console.log('    ③ handleApprovalEvent 处理逻辑:');
  console.log('       a) PASSED补卡 → setClosed(CLOSED), deductionAmount=0, WritebackLog(CANCEL_DEDUCTION)');
  console.log('       b) PASSED请假 → setClosed(CLOSED), attendanceDays抵扣正确');
  console.log('       c) PASSED加班 → 加班时长otHours回写累计(accumulatedOtHours)');
  console.log('       d) REJECTED → 保持OPEN, dispatchAnomaly二次催办(reason=REJECTED_RESUBMIT)');
  console.log('       e) TRANSFERRED → transferLog记录转交链路{fromApproverId→toApproverId, comment}');
  console.log('    ④ WritebackLog 所有回写留痕:');
  console.log('       {ts, anomalyId, approvalNo, eventType, beforeState, afterState, beforeDeduction, afterDeduction, operatorType=AUTO}');
  console.log('    ⑤ TransferLog 转交链路审计');
  console.log('    ⑥ 幂等: 同approvalNo多次调用 → 仅第一次生效 (TRANSFERRED除外，允许多次转交)');
  console.log('  依赖模块:');
  console.log('    - Task2.4异常引擎: src/modules/attendance/attendance_anomaly_engine.js');
  console.log('    - Task2.6机器人模块: src/integrations/dingtalk_bot_dispatcher.js');
  console.log('  测试文件: test_task27.js (本文件)');

  const p1 = await test_TR271();
  const p2 = await test_TR272();
  const p3 = await test_TR273();

  console.log('\n================================================================');
  console.log('测试总结:');
  console.log(`  TR-2.7.1 (补卡PASSED→CLOSED+扣款50→0+幂等):   ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.7.2 (请假REJECTED→OPEN+REJECTED_RESUBMIT催办): ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.7.3 (加班TRANSFERRED→转交链路完整审计):    ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('================================================================');
})();
