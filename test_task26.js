'use strict';

const {
  DingTalkBotClient,
  ReminderLog,
  AnomalyRepository,
  ReminderScheduler,
  dispatchAnomaly,
  buildMsgCard,
  calcSlaStats,
  validateMsgCardStructure,
  APPROVAL_TYPES,
  ANOMALY_STATUS
} = require('./src/integrations/dingtalk_bot_dispatcher.js');

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES,
  AttendanceAnomalyEngine,
  PunchDayRecord
} = require('./src/modules/attendance/attendance_anomaly_engine.js');

function makeTime(dateStr, hh, mm) {
  const d = new Date(dateStr);
  d.setHours(hh, mm, 0, 0);
  return d;
}

const TEN_ANOMALY_TYPES_FOR_CARDS = [
  { type: ATTENDANCE_ANOMALY.LATE, name: '迟到', date: '2026-01-05', deduction: 20, extra: { lateMinutes: 15 } },
  { type: ATTENDANCE_ANOMALY.EARLY_LEAVE, name: '早退', date: '2026-01-06', deduction: 20, extra: { earlyMinutes: 12 } },
  { type: ATTENDANCE_ANOMALY.MISSING_PUNCH, name: '缺卡', date: '2026-01-07', deduction: 50, extra: { missingPunchCount: 1 } },
  { type: ATTENDANCE_ANOMALY.ABSENT, name: '旷工', date: '2026-01-08', deduction: 0, extra: { absentDays: 1 } },
  { type: ATTENDANCE_ANOMALY.OT_WORKDAY, name: '平日加班', date: '2026-01-09', deduction: 0, extra: { otHours: 3 } },
  { type: ATTENDANCE_ANOMALY.LEAVE_PERSONAL, name: '事假', date: '2026-01-10', deduction: 0, extra: { leaveType: ATTENDANCE_ANOMALY.LEAVE_PERSONAL } },
  { type: ATTENDANCE_ANOMALY.LEAVE_SICK, name: '病假', date: '2026-01-11', deduction: 0, extra: { leaveType: ATTENDANCE_ANOMALY.LEAVE_SICK } },
  { type: ATTENDANCE_ANOMALY.LEAVE_ANNUAL, name: '年假', date: '2026-01-12', deduction: 0, extra: { leaveType: ATTENDANCE_ANOMALY.LEAVE_ANNUAL } },
  { type: ATTENDANCE_ANOMALY.LEAVE_MARRIAGE, name: '婚假', date: '2026-01-13', deduction: 0, extra: { leaveType: ATTENDANCE_ANOMALY.LEAVE_MARRIAGE } },
  { type: ATTENDANCE_ANOMALY.LEAVE_MATERNITY, name: '产假', date: '2026-01-14', deduction: 0, extra: { leaveType: ATTENDANCE_ANOMALY.LEAVE_MATERNITY } }
];

async function test_TR261() {
  console.log('\n========== TR-2.6.1: 员工A缺卡异常→派单→补卡审批+催办时序测试 ==========');

  const botClient = new DingTalkBotClient({ mode: 'mock' });
  const reminderLog = new ReminderLog();

  const employeeA = {
    id: 'EMP-A-001',
    name: '员工A',
    dingtalkUserId: 'DD_EMP_A_001',
    dept2: '技术部',
    department: 'D02'
  };

  const leaderB = {
    id: 'EMP-B-002',
    name: '直属上级B',
    dingtalkUserId: 'DD_LEADER_B_002'
  };

  const anomalyGeneratedAt = new Date();

  const missingAnomaly = {
    anomalyId: 'AT_TR261_MP_001',
    employeeId: employeeA.id,
    date: '2026-08-11',
    type: ATTENDANCE_ANOMALY.MISSING_PUNCH,
    typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.MISSING_PUNCH],
    severity: 'FINE',
    deduction: 50,
    ruleCodes: ['R-196'],
    generatedAt: anomalyGeneratedAt,
    missingPunchCount: 1
  };

  console.log('[TR-2.6.1] 构造场景:');
  console.log(`  异常类型: 缺卡(MISSING_PUNCH)，anomalyId=${missingAnomaly.anomalyId}`);
  console.log(`  员工A: ${employeeA.name} (DD_ID=${employeeA.dingtalkUserId})`);
  console.log(`  直属上级B: ${leaderB.name} (DD_ID=${leaderB.dingtalkUserId})`);
  console.log(`  罚款金额: ${missingAnomaly.deduction}元（缺卡标准罚款）`);
  console.log(`  异常产生时间: ${anomalyGeneratedAt.toISOString()}`);

  const dispatchResult = await dispatchAnomaly({
    anomaly: missingAnomaly,
    employee: employeeA,
    leader: leaderB,
    botClient
  });

  const sendTs = dispatchResult.sendTimestamp ? new Date(dispatchResult.sendTimestamp).getTime() : 0;
  const genTs = anomalyGeneratedAt.getTime();
  const latencySeconds = (sendTs - genTs) / 1000;
  const latencyLessThan2Min = latencySeconds < 120;

  console.log('\n[TR-2.6.1] dispatchAnomaly执行结果:');
  console.log(`  sendTimestamp: ${dispatchResult.sendTimestamp ? dispatchResult.sendTimestamp.toISOString() : 'N/A'}`);
  console.log(`  派单延迟: ${latencySeconds.toFixed(3)}秒 (标准: <120秒=2分钟) → ${latencyLessThan2Min ? '✅ 合规' : '❌ 超时'}`);
  console.log(`  自动生成补卡审批单号: ${dispatchResult.approvalNo || '无'}`);
  console.log(`  员工消息条数: ${dispatchResult.employeeMessages.length}条`);
  console.log(`  上级消息条数: ${dispatchResult.leaderMessages.length}条`);

  const dmCallCount = botClient.getCallCount('sendDm');
  const createApprovalCallCount = botClient.getCallCount('createApproval');

  console.log(`\n  Bot调用统计:`);
  console.log(`    sendDm调用次数: ${dmCallCount}次 (期望=2次：员工+直属上级各1次)`);
  console.log(`    createApproval调用次数: ${createApprovalCallCount}次 (期望=1次：自动发起补卡)`);

  const empCard = dispatchResult.cards.employeeCard;
  const leaderCard = dispatchResult.cards.leaderCard;

  console.log(`\n  员工消息卡片内容:`);
  console.log(`    title: ${empCard.title}`);
  console.log(`    anomalyType.displayName: ${empCard.anomalyType ? empCard.anomalyType.displayName : 'N/A'}`);
  console.log(`    date: ${empCard.date}`);
  console.log(`    time: ${empCard.time}`);
  console.log(`    deductionAmount: ${empCard.deductionAmount}元`);
  console.log(`    status: ${empCard.status}`);
  console.log(`    approvalNo(补卡单号): ${empCard.approvalNo || '无'}`);
  console.log(`    primaryActionButton.text: ${empCard.primaryActionButton ? empCard.primaryActionButton.text : 'N/A'}`);
  console.log(`    primaryActionButton.url: ${empCard.primaryActionButton ? empCard.primaryActionButton.url : 'N/A'}`);

  const deductOk = empCard.deductionAmount === 50;
  const approvalOk = !!dispatchResult.approvalNo && !!empCard.approvalNo;
  const dmCountOk = dmCallCount === 2;
  const createApprovalOk = createApprovalCallCount === 1;
  const buttonUrlOk = empCard.primaryActionButton
    && empCard.primaryActionButton.url
    && String(empCard.primaryActionButton.url).startsWith('https://');

  console.log(`\n[TR-2.6.1] 校验清单:`);
  console.log(`  1. sendDm调用2次(员工+上级各1次): ${dmCountOk ? '✅' : '❌'} (实际=${dmCallCount})`);
  console.log(`  2. 派单延迟<2分钟: ${latencyLessThan2Min ? '✅' : '❌'} (实际=${latencySeconds.toFixed(1)}秒)`);
  console.log(`  3. 自动调用createApproval(MAKEUP): ${createApprovalOk ? '✅' : '❌'} (实际=${createApprovalCallCount}次)`);
  console.log(`  4. msgCard内deductionAmount=50元: ${deductOk ? '✅' : '❌'} (实际=${empCard.deductionAmount}元)`);
  console.log(`  5. 审批单号存在并嵌入卡片: ${approvalOk ? '✅' : '❌'} (单号=${dispatchResult.approvalNo})`);
  console.log(`  6. primaryActionButton.url合理(https开头): ${buttonUrlOk ? '✅' : '❌'} (url=${empCard.primaryActionButton ? empCard.primaryActionButton.url : 'N/A'})`);

  const pass = dmCountOk && latencyLessThan2Min && createApprovalOk && deductOk && approvalOk && buttonUrlOk;
  console.log(`\n[TR-2.6.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR262() {
  console.log('\n========== TR-2.6.2: T+30h未闭环异常→18:00催办调度+SLA统计测试 ==========');

  const botClient = new DingTalkBotClient({ mode: 'mock' });
  const reminderLog = new ReminderLog();
  const repository = new AnomalyRepository();

  const employee = {
    id: 'EMP-C-003',
    name: '员工C',
    dingtalkUserId: 'DD_EMP_C_003',
    dept2: '市场部'
  };

  const leader = {
    id: 'EMP-D-004',
    name: '直属上级D',
    dingtalkUserId: 'DD_LEADER_D_004'
  };

  const now = new Date();
  const thirtyHoursAgo = new Date(now.getTime() - 30 * 60 * 60 * 1000);

  const anomaly = {
    anomalyId: 'AT_TR262_LATE_002',
    employeeId: employee.id,
    date: thirtyHoursAgo.toISOString().slice(0, 10),
    type: ATTENDANCE_ANOMALY.LATE,
    typeName: ANOMALY_NAMES[ATTENDANCE_ANOMALY.LATE],
    severity: 'FINE',
    deduction: 20,
    ruleCodes: ['R-188', 'R-190'],
    lateMinutes: 15,
    employee,
    leader
  };

  const stored = repository.add({ ...anomaly, generatedAt: thirtyHoursAgo });

  console.log('[TR-2.6.2] 构造场景:');
  console.log(`  异常ID: ${stored.anomalyId}`);
  console.log(`  异常类型: 迟到(LATE)，罚款20元`);
  console.log(`  异常产生时间: ${thirtyHoursAgo.toISOString()} (now-30h前)`);
  console.log(`  当前状态: ${stored.status} (应为OPEN未闭环)`);
  console.log(`  员工: ${employee.name} (${employee.dingtalkUserId}), 上级: ${leader.name} (${leader.dingtalkUserId})`);

  const preUnclosed = repository.getUnclosed();
  console.log(`\n  调度前置检查:未闭环异常数=${preUnclosed.length}个`);

  const simulatedNow = new Date();
  simulatedNow.setHours(18, 0, 0, 0);
  console.log(`  模拟当前时间: ${simulatedNow.toISOString()} (每日18:00催办时点)`);

  const scheduler = new ReminderScheduler({
    botClient,
    anomalyRepository: repository,
    reminderLog,
    hour: 18,
    minute: 0
  });

  const runReport = await scheduler.runOnce({ simulatedNow });

  console.log(`\n[TR-2.6.2] ReminderScheduler(18:00)执行结果:`);
  console.log(`  扫描未闭环异常数: ${runReport.scannedCount}个`);
  console.log(`  L1级(T+24h)二次提醒条数: ${runReport.level1Reminders.length}条`);
  runReport.level1Reminders.forEach(r => console.log(`    → ${r.target}: anomalyId=${r.anomalyId}`));
  console.log(`  L2级(T+48h)DING催办条数: ${runReport.level2Reminders.length}条`);
  console.log(`  L3级(T+72h)通知条数: ${runReport.level3Reminders.length}条`);

  const dingRemindCalls = botClient.getCallCount('dingRemind');
  const totalDmCalls = botClient.getCallCount('sendDm');
  console.log(`\n  Bot方法调用统计:`);
  console.log(`    sendDm总调用: ${totalDmCalls}次`);
  console.log(`    dingRemind调用: ${dingRemindCalls}次`);

  const reminderLogs = reminderLog.getAll();
  console.log(`\n  ReminderLog催办留痕条数: ${reminderLogs.length}条`);
  reminderLogs.forEach(l => {
    console.log(`    级别=${l.reminderLevel} 目标=${l.targetType}(${l.targetUserId}) 时间=${new Date(l.sentAt).toISOString()}`);
  });

  const statsStart = new Date(thirtyHoursAgo.getTime() - 24 * 60 * 60 * 1000);
  const statsEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const sla = calcSlaStats(statsStart, statsEnd, repository);

  console.log(`\n  SLA统计 [${statsStart.toISOString().slice(0,10)} ~ ${statsEnd.toISOString().slice(0,10)}]:`);
  console.log(`    totalCount: ${sla.totalCount} (总异常数)`);
  console.log(`    closedCount: ${sla.closedCount} (已闭环数)`);
  console.log(`    closureRateWithin24h: ${(sla.closureRateWithin24h * 100).toFixed(2)}%`);
  console.log(`    closureRateWithin48h: ${(sla.closureRateWithin48h * 100).toFixed(2)}%`);
  console.log(`    overdueCount: ${sla.overdueCount} (超48h未闭环数)`);
  console.log(`  当前异常实际已过小时数: T+${((now.getTime() - thirtyHoursAgo.getTime())/(1000*60*60)).toFixed(1)}h (T+30h未闭环)`);
  console.log(`  已触发催办标记: reminderCount=${stored.reminderCount}, maxLevelReached=L${stored.maxReminderLevelReached}`);

  const anomalyUnclosed = repository.get(stored.anomalyId);
  const stillOpen = anomalyUnclosed && anomalyUnclosed.status !== ANOMALY_STATUS.CLOSED;
  const remindTriggered = (anomalyUnclosed.reminderCount || 0) >= 1;
  const slaHasThisAnomaly = sla.totalCount >= 1;
  const hasL1Remind = runReport.level1Reminders.length >= 1;
  const logHasEntries = reminderLogs.length >= 1;
  const elapsedH = ((now.getTime() - thirtyHoursAgo.getTime()) / (1000 * 60 * 60));
  const tRangeOk = elapsedH > 29 && elapsedH < 31;

  console.log(`\n[TR-2.6.2] 校验清单:`);
  console.log(`  1. 调度前异常未闭环(OPEN): ${stillOpen ? '✅' : '❌'} (status=${anomalyUnclosed ? anomalyUnclosed.status : 'N/A'})`);
  console.log(`  2. 模拟时间=18:00调度成功: ${runReport.runAt.getHours() === 18 && runReport.runAt.getMinutes() === 0 ? '✅' : '❌'} (时间=${runReport.runAt.toISOString()})`);
  console.log(`  3. dingRemind方法调用≥1次 或 L1级催办触发(T+30h在24~48区间): ${(dingRemindCalls >= 1 || hasL1Remind) ? '✅' : '❌'} (dingRemind=${dingRemindCalls}, L1条数=${runReport.level1Reminders.length})`);
  console.log(`  4. SLA统计包含该异常: ${slaHasThisAnomaly ? '✅' : '❌'} (totalCount=${sla.totalCount})`);
  console.log(`  5. SLA标记为T+30h未闭环(overdueCount=0因<48h): overdueCount=${sla.overdueCount}，closedCount=${sla.closedCount}`);
  console.log(`  6. 已触发催办(reminderCount≥1): ${remindTriggered ? '✅' : '❌'} (count=${anomalyUnclosed.reminderCount})`);
  console.log(`  7. 催办日志留痕≥1条: ${logHasEntries ? '✅' : '❌'} (条数=${reminderLogs.length})`);
  console.log(`  8. 时间区间T+30h准确: ${tRangeOk ? '✅' : '❌'} (实际=T+${elapsedH.toFixed(1)}h)`);

  const pass = stillOpen && slaHasThisAnomaly && remindTriggered && logHasEntries && (dingRemindCalls >= 1 || hasL1Remind);
  console.log(`\n[TR-2.6.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR263() {
  console.log('\n========== TR-2.6.3: 10类异常消息卡片结构完整性程序化验证 ==========');

  const botClient = new DingTalkBotClient({ mode: 'mock' });

  console.log('[TR-2.6.3] 构造10类异常卡片类型:');
  TEN_ANOMALY_TYPES_FOR_CARDS.forEach((t, idx) => {
    console.log(`  卡片#${String(idx + 1).padStart(2, '0')}: type=${t.type} displayName=${t.name}`);
  });

  const testEmployee = {
    id: 'EMP-TEST-CARD',
    name: '卡片测试员工',
    dingtalkUserId: 'DD_TEST_CARD',
    dept2: '质量部'
  };

  const results = [];
  const cards = [];

  for (let i = 0; i < TEN_ANOMALY_TYPES_FOR_CARDS.length; i++) {
    const spec = TEN_ANOMALY_TYPES_FOR_CARDS[i];
    const anomaly = {
      anomalyId: `AT_CARD_${String(i + 1).padStart(3, '0')}`,
      employeeId: testEmployee.id,
      date: spec.date,
      type: spec.type,
      typeName: spec.name,
      severity: 'WARNING',
      deduction: spec.deduction,
      ruleCodes: ['R-TEST'],
      ...(spec.extra || {})
    };

    const approvalNo = spec.type === ATTENDANCE_ANOMALY.MISSING_PUNCH
      ? await botClient.createApproval(APPROVAL_TYPES.MAKEUP, { employeeId: testEmployee.id })
      : null;

    const card = buildMsgCard({ anomaly, employee: testEmployee, approvalNo });
    cards.push({ index: i + 1, spec, anomaly, card, approvalNo });

    const validation = validateMsgCardStructure(card);
    results.push({ index: i + 1, spec, card, validation });
  }

  console.log('\n[TR-2.6.3] 逐卡片结构验证:');
  let allValid = true;
  for (const r of results) {
    const { index, spec, validation } = r;
    const passIcon = validation.valid ? '✅' : '❌';
    console.log(`  卡片#${String(index).padStart(2, '0')} [${spec.name}] → ${passIcon} ${validation.summary}`);
    if (!validation.valid) {
      allValid = false;
      validation.issues.forEach(issue => console.log(`       ❗ ${issue}`));
    }
  }

  console.log('\n[TR-2.6.3] 逐卡片字段抽查展示 (关键字段存在性验证):');
  for (const entry of cards) {
    const { index, spec, card, approvalNo } = entry;
    console.log(`\n  卡片#${String(index).padStart(2, '0')} [${spec.name}]:`);
    console.log(`    .title存在=${!!card.title}  value="${card.title || ''}"`);
    console.log(`    .anomalyType.displayName存在=${!!(card.anomalyType && card.anomalyType.displayName)}  value="${card.anomalyType ? card.anomalyType.displayName : ''}"`);
    console.log(`    .date存在=${!!card.date}  value="${card.date || ''}"`);
    console.log(`    .time存在=${!!card.time}  value="${card.time || ''}"`);
    console.log(`    .deductionAmount存在=${'deductionAmount' in card}  value=${card.deductionAmount}元`);
    console.log(`    .status存在=${!!card.status}  value=${card.status}`);
    console.log(`    .primaryActionButton存在=${!!card.primaryActionButton}`);
    if (card.primaryActionButton) {
      console.log(`      .text存在=${!!card.primaryActionButton.text}  value="${card.primaryActionButton.text || ''}"`);
      console.log(`      .url存在=${!!card.primaryActionButton.url}  startsWithHttp=${String(card.primaryActionButton.url || '').startsWith('http')}`);
    }
    if (approvalNo) {
      console.log(`    .approvalNo(补卡)存在=${!!card.approvalNo}  value="${card.approvalNo || ''}"`);
    }
  }

  console.log(`\n[TR-2.6.3] 程序化验证聚合统计:`);
  console.log(`  总卡片数: ${cards.length}张`);
  console.log(`  结构通过数: ${results.filter(r => r.validation.valid).length}/${cards.length}`);
  console.log(`  存在问题卡片数: ${results.filter(r => !r.validation.valid).length}张`);
  console.log(`  全部通过: ${allValid ? '✅ YES' : '❌ NO'}`);

  const requiredChecks = {
    allHaveDisplayName: cards.every(c => c.card.anomalyType && typeof c.card.anomalyType.displayName === 'string'),
    allHaveDate: cards.every(c => typeof c.card.date === 'string'),
    allHaveTime: cards.every(c => 'time' in c.card),
    allHaveDeductionAmount: cards.every(c => typeof c.card.deductionAmount === 'number'),
    allHaveStatus: cards.every(c => typeof c.card.status === 'string'),
    allHaveButtonText: cards.every(c => c.card.primaryActionButton && typeof c.card.primaryActionButton.text === 'string'),
    allHaveButtonUrl: cards.every(c => c.card.primaryActionButton && String(c.card.primaryActionButton.url).startsWith('http')),
    displayNamesMatchSpec: cards.every(c => c.card.anomalyType.displayName === c.spec.name)
  };

  console.log(`\n[TR-2.6.3] 详细校验清单:`);
  console.log(`  1. 每张card均含anomalyType.displayName(字符串): ${requiredChecks.allHaveDisplayName ? '✅' : '❌'}`);
  console.log(`  2. 每张card均含date(YYYY-MM-DD字符串): ${requiredChecks.allHaveDate ? '✅' : '❌'}`);
  console.log(`  3. 每张card均含time字段: ${requiredChecks.allHaveTime ? '✅' : '❌'}`);
  console.log(`  4. 每张card均含deductionAmount(数值类型): ${requiredChecks.allHaveDeductionAmount ? '✅' : '❌'}`);
  console.log(`  5. 每张card均含status字段: ${requiredChecks.allHaveStatus ? '✅' : '❌'}`);
  console.log(`  6. 每张card.primaryActionButton.text完整: ${requiredChecks.allHaveButtonText ? '✅' : '❌'}`);
  console.log(`  7. 每张card.primaryActionButton.url(http开头)合理: ${requiredChecks.allHaveButtonUrl ? '✅' : '❌'}`);
  console.log(`  8. displayName与10类规格对应匹配: ${requiredChecks.displayNamesMatchSpec ? '✅' : '❌'}`);

  const allChecksPass = allValid && Object.values(requiredChecks).every(v => v);
  console.log(`\n[TR-2.6.3] 结果: ${allChecksPass ? '✅ PASS' : '❌ FAIL'}`);
  return allChecksPass;
}

(async function runAll() {
  console.log('================================================================');
  console.log('智慧化人资平台 Task2.6 钉钉机器人异常派单+催办调度 测试套件');
  console.log('================================================================');
  console.log('\n【输出文件路径】:');
  console.log('  核心调度文件: src/integrations/dingtalk_bot_dispatcher.js');
  console.log('  主要导出模块:');
  console.log('    ① DingTalkBotClient (Mock+真实双模式)');
  console.log('      - sendDm(userId, msgCard) 个人IM');
  console.log('      - sendGroupDm(groupId, msgCard) 群消息');
  console.log('      - dingRemind(userId, msg) DING级消息');
  console.log('      - createApproval(type, payload) → approvalNo');
  console.log('        支持类型: MAKEUP补卡 / OVERTIME加班确认 / FIELDWORK外勤审批');
  console.log('    ② dispatchAnomaly(anomaly, employee, leader) 异常派单');
  console.log('      - 触发时机: 异常产生后≤2分钟(Mock立即触发)');
  console.log('      - 自动记录sendTimestamp, latencyMs');
  console.log('      - 补卡类异常: 自动调用createApproval(MAKEUP)');
  console.log('    ③ ReminderScheduler 三级催办(每日18:00)');
  console.log('      - T+24h未闭环 → L1员工+上级二次提醒');
  console.log('      - T+48h未闭环 → L2 DING级催办');
  console.log('      - T+72h未闭环 → L3 部门总负责人+HR专员');
  console.log('    ④ calcSlaStats(start,end) SLA统计');
  console.log('      - 返回{closedCount,totalCount,closureRateWithin24h,closureRateWithin48h,overdueCount}');
  console.log('    ⑤ ReminderLog 催办日志留痕');
  console.log('    ⑥ buildMsgCard / validateMsgCardStructure 卡片构建+程序化验证');
  console.log('  测试文件: test_task26.js (本文件)');

  const p1 = await test_TR261();
  const p2 = await test_TR262();
  const p3 = await test_TR263();

  console.log('\n================================================================');
  console.log('测试总结:');
  console.log(`  TR-2.6.1 (缺卡派单+2分钟+补卡审批50元罚款): ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.6.2 (T+30h+18:00催办+SLA统计):       ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.6.3 (10类卡片结构完整程序化验证):    ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('================================================================');
})();
