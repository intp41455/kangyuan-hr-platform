'use strict';

const {
  APPROVAL_TYPES,
  APPROVER_ROLES,
  SLA_NODES,
  SLA_STATUS,
  AlertQueue,
  SmsAlertQueue,
  ApprovalMatrixConfig,
  SlaMonitor,
  getConfigPageStructure
} = require('../src/modules/workflow/approval_sla_engine.js');

async function run_TR4_1_1() {
  console.log('='.repeat(70));
  console.log('  TR-4.1.1 审批路由测试');
  console.log('='.repeat(70));

  const alertQueue = new AlertQueue();
  const config = new ApprovalMatrixConfig({ alertQueue });
  let passed = 0;
  let failed = 0;

  console.log('\n--- Test TR-4.1.1-a: 事假类型，金额1500(≤2000) → 二级审批 ---');
  try {
    const result1 = await config.getApprovalRoute({
      type: APPROVAL_TYPES.LEAVE,
      amount: 1500
    });
    const expected1 = [APPROVER_ROLES.DIRECT_LEADER, APPROVER_ROLES.DEPT_HEAD];
    const isCorrect1 = JSON.stringify(result1.route) === JSON.stringify(expected1);
    console.log(`  路由: ${JSON.stringify(result1.route)}`);
    console.log(`  期望: ${JSON.stringify(expected1)}`);
    console.log(`  审批级数: ${result1.levelCount} (期望: 2)`);
    if (isCorrect1 && result1.levelCount === 2) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.1-b: 事假金额=2500元(>2000) → 三级审批 ---');
  try {
    const result2 = await config.getApprovalRoute({
      type: APPROVAL_TYPES.LEAVE,
      amount: 2500
    });
    const expected2 = [APPROVER_ROLES.DIRECT_LEADER, APPROVER_ROLES.DEPT_HEAD, APPROVER_ROLES.VICE_PRESIDENT];
    const isCorrect2 = JSON.stringify(result2.route) === JSON.stringify(expected2);
    console.log(`  路由: ${JSON.stringify(result2.route)}`);
    console.log(`  期望: ${JSON.stringify(expected2)}`);
    console.log(`  审批级数: ${result2.levelCount} (期望: 3)`);
    if (isCorrect2 && result2.levelCount === 3) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.1-c: PAYROLL_ANOMALY薪酬异常类型 → 强制三级审批 ---');
  try {
    const result3a = await config.getApprovalRoute({
      type: APPROVAL_TYPES.PAYROLL_ANOMALY,
      amount: 500
    });
    const expected3 = [APPROVER_ROLES.DIRECT_LEADER, APPROVER_ROLES.DEPT_HEAD, APPROVER_ROLES.VICE_PRESIDENT];
    const isCorrect3a = JSON.stringify(result3a.route) === JSON.stringify(expected3);

    const result3b = await config.getApprovalRoute({
      type: APPROVAL_TYPES.PAYROLL_ANOMALY,
      amount: 5000
    });
    const isCorrect3b = JSON.stringify(result3b.route) === JSON.stringify(expected3);

    console.log(`  金额500: 路由=${JSON.stringify(result3a.route)}, forceThree=${result3a.forceThree}`);
    console.log(`  金额5000: 路由=${JSON.stringify(result3b.route)}, forceThree=${result3b.forceThree}`);
    console.log(`  期望: 路由=${JSON.stringify(expected3)}, 无论金额多少都强制三级`);
    if (isCorrect3a && isCorrect3b && result3a.forceThree && result3b.forceThree) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.1-d: 缺失DEPT_HEAD配置 → alertQueue.warning级1条 ---');
  try {
    alertQueue.clear();
    const badConfig = new ApprovalMatrixConfig({ alertQueue: new AlertQueue() });
    badConfig.configureType({
      type: APPROVAL_TYPES.LEAVE,
      roleMap: {
        LEVEL_1: APPROVER_ROLES.DIRECT_LEADER,
        LEVEL_2: null,
        LEVEL_3: APPROVER_ROLES.VICE_PRESIDENT
      }
    });
    const badResult = await badConfig.getApprovalRoute({
      type: APPROVAL_TYPES.LEAVE,
      amount: 2500
    });
    const warningAlerts = badConfig.alertQueue.getByLevel('warning');
    console.log(`  路由: ${JSON.stringify(badResult.route)}`);
    console.log(`  缺失节点: ${JSON.stringify(badResult.missingLevels)}`);
    console.log(`  warning告警数: ${warningAlerts.length} (期望: 1)`);
    if (warningAlerts.length === 1 && badResult.missingLevels.length > 0) {
      console.log(`  告警内容: ${warningAlerts[0].message}`);
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log(`\n  【TR-4.1.1 汇总】通过: ${passed}, 失败: ${failed}`);
  return { passed, failed };
}

async function run_TR4_1_2() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-4.1.2 SLA节点测试');
  console.log('='.repeat(70));

  const smsAlertQueue = new SmsAlertQueue();
  const botClient = require('../src/integrations/dingtalk_bot_dispatcher.js').DingTalkBotClient;
  const monitor = new SlaMonitor({
    botClient: new botClient({ mode: 'mock' }),
    smsAlertQueue
  });
  let passed = 0;
  let failed = 0;

  console.log('\n--- Test TR-4.1.2-a: D-3 18:00 考勤异常闭环率=97% → GREEN绿灯 ---');
  try {
    const rA = await monitor.runSlaCheckpoint({
      nodeId: 'D3_1800',
      metric: 'attendance_closure_rate',
      target: 95,
      actual: 97
    });
    console.log(`  实际: ${rA.actual}%, 目标: ${rA.target}%`);
    console.log(`  状态: ${rA.status} (期望: ${SLA_STATUS.GREEN})`);
    const groupMsgCount = monitor.botClient.getCallCount('sendGroupDm');
    const smsCount = smsAlertQueue.size();
    console.log(`  机器人消息: ${groupMsgCount}, 短信: ${smsCount} (期望: 0, 0)`);
    if (rA.status === SLA_STATUS.GREEN) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.2-b: D-3 18:00 93%（∈[90%,95%)）→ YELLOW黄灯 ---');
  try {
    const prevGroupCount = monitor.botClient.getCallCount('sendGroupDm');
    const rB = await monitor.runSlaCheckpoint({
      nodeId: 'D3_1800',
      metric: 'attendance_closure_rate',
      target: 95,
      actual: 93
    });
    const newGroupMsgs = monitor.botClient.getCallCount('sendGroupDm') - prevGroupCount;
    const smsCountAfterB = smsAlertQueue.size();
    console.log(`  实际: ${rB.actual}%, 目标: ${rB.target}%`);
    console.log(`  差值: ${rB.deltaPercent}% (目标-5%=90%，93%∈[90%,95%)→黄灯)`);
    console.log(`  状态: ${rB.status} (期望: ${SLA_STATUS.YELLOW})`);
    console.log(`  HR机器人消息: ${newGroupMsgs}条 (期望: 1条)`);
    console.log(`  短信HR总监: ${smsCountAfterB}条 (期望: 0条)`);
    if (rB.status === SLA_STATUS.YELLOW && newGroupMsgs === 1) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.2-c: D-3 18:00 87%（<90%）→ RED红灯+短信 ---');
  try {
    const prevGroupCountC = monitor.botClient.getCallCount('sendGroupDm');
    const prevSmsCountC = smsAlertQueue.size();
    const rC = await monitor.runSlaCheckpoint({
      nodeId: 'D3_1800',
      metric: 'attendance_closure_rate',
      target: 95,
      actual: 87
    });
    const newGroupMsgsC = monitor.botClient.getCallCount('sendGroupDm') - prevGroupCountC;
    const newSmsCountC = smsAlertQueue.size() - prevSmsCountC;
    const smsToHrDirector = smsAlertQueue.getByTo(APPROVER_ROLES.HR_DIRECTOR);
    console.log(`  实际: ${rC.actual}%, 目标: ${rC.target}%`);
    console.log(`  差值: ${rC.deltaPercent}% (<90%→红灯)`);
    console.log(`  状态: ${rC.status} (期望: ${SLA_STATUS.RED})`);
    console.log(`  HR机器人消息: ${newGroupMsgsC}条 (期望: 1条)`);
    console.log(`  短信HR总监: ${newSmsCountC}条 (期望: 1条)`);
    console.log(`  短信收件人: ${smsToHrDirector.length > 0 ? smsToHrDirector[0].to : '无'}`);
    if (rC.status === SLA_STATUS.RED && newGroupMsgsC === 1 && newSmsCountC === 1 && smsToHrDirector.length > 0) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.2-d: D-1 12:00 员工确认率=85% → 红灯+短信 2条正确 ---');
  try {
    const prevGroupCountD = monitor.botClient.getCallCount('sendGroupDm');
    const prevSmsCountD = smsAlertQueue.size();
    const rD = await monitor.runSlaCheckpoint({
      nodeId: 'D1_1200',
      metric: 'employee_confirm_rate',
      target: 95,
      actual: 85
    });
    const newGroupMsgsD = monitor.botClient.getCallCount('sendGroupDm') - prevGroupCountD;
    const newSmsCountD = smsAlertQueue.size() - prevSmsCountD;
    const allSms = smsAlertQueue.getAll();
    const latestSms = allSms.length > 0 ? allSms[allSms.length - 1] : null;

    console.log(`  实际: ${rD.actual}%, 目标: ${rD.target}%`);
    console.log(`  差值: ${rD.deltaPercent}%`);
    console.log(`  状态: ${rD.status} (期望: ${SLA_STATUS.RED})`);
    console.log(`  HR机器人消息: ${newGroupMsgsD}条 (期望: 1条)`);
    console.log(`  短信HR总监: ${newSmsCountD}条 (期望: 1条)`);
    if (latestSms) {
      console.log(`  最新短信: level=${latestSms.level}, to=${latestSms.to}`);
      console.log(`  最新短信内容: ${latestSms.message}`);
    }

    const dashboard = monitor.getSlaDashboard();
    console.log(`  Dashboard节点: ${Object.keys(dashboard.nodeStatuses).length}个`);
    console.log(`  Dashboard状态汇总: GREEN=${dashboard.summary.greenCount}, YELLOW=${dashboard.summary.yellowCount}, RED=${dashboard.summary.redCount}`);

    if (rD.status === SLA_STATUS.RED && newGroupMsgsD === 1 && newSmsCountD === 1) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log('\n--- Test TR-4.1.2-e: getConfigPageStructure字段完整性验证 ---');
  try {
    const page = getConfigPageStructure();
    const allFields = page.sections.flatMap(s => s.fields);
    const typeField = allFields.find(f => f.fieldId === 'type');
    const levelsField = allFields.find(f => f.fieldId === 'levels');
    const thresholdField = allFields.find(f => f.fieldId === 'threshold');
    const saveBtn = allFields.find(f => f.fieldId === 'saveBtn');

    console.log(`  页面标题: ${page.pageTitle}`);
    console.log(`  type下拉选项数: ${typeField ? typeField.options.length : 0} (期望: 7项审批类型)`);
    console.log(`  levels多选角色数(通过roleMapping验证): ${APPROVER_ROLES ? Object.keys(APPROVER_ROLES).length : 0}`);
    console.log(`  审批人角色总数: ${page.fieldSummary.approverRoleCount} (期望: 6角色)`);
    console.log(`  threshold数字输入: ${thresholdField ? (thresholdField.fieldType === 'number' ? '存在' : '类型错误') : '不存在'}`);
    console.log(`  保存按钮: ${saveBtn ? (saveBtn.fieldType === 'button' ? '存在' : '类型错误') : '不存在'}`);
    console.log(`  按钮总数: ${page.fieldSummary.buttonCount} (期望: 3个:保存/测试/重置)`);

    const typeCountOk = typeField && typeField.options.length === 7;
    const roleCountOk = page.fieldSummary.approverRoleCount === 6;
    const thresholdOk = thresholdField && thresholdField.fieldType === 'number';
    const saveBtnOk = saveBtn && saveBtn.fieldType === 'button';

    if (typeCountOk && roleCountOk && thresholdOk && saveBtnOk) {
      console.log('  ✅ PASS');
      passed++;
    } else {
      console.log('  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    failed++;
  }

  console.log(`\n  【TR-4.1.2 汇总】通过: ${passed}, 失败: ${failed}`);
  return { passed, failed };
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        智慧化人资平台 Task4.1 审批矩阵+SLA时效监控 自动化测试              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const r1 = await run_TR4_1_1();
  const r2 = await run_TR4_1_2();

  const totalPassed = r1.passed + r2.passed;
  const totalFailed = r1.failed + r2.failed;

  console.log('\n' + '='.repeat(70));
  console.log('  总体测试结果');
  console.log('='.repeat(70));
  console.log(`  TR-4.1.1 审批路由: 通过${r1.passed}/${r1.passed + r1.failed}`);
  console.log(`  TR-4.1.2 SLA节点:  通过${r2.passed}/${r2.passed + r2.failed}`);
  console.log(`  总计: 通过${totalPassed}/${totalPassed + totalFailed}`);

  if (totalFailed === 0) {
    console.log('\n  🎉 全部测试通过！');
  } else {
    console.log(`\n  ⚠️  有${totalFailed}个测试失败，请检查代码。`);
  }

  console.log('\n  输出文件路径:');
  console.log('  - 模块文件: src/modules/workflow/approval_sla_engine.js');
  console.log('  - 测试文件: tests/task4_1_approval_sla_test.js');
  console.log('');

  return { totalPassed, totalFailed };
}

main().catch(err => {
  console.error('测试运行出错:', err);
  process.exit(1);
});
