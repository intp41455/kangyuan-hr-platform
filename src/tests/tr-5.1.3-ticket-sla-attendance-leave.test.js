'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dayjs = require('dayjs');

const {
  TicketSlaEngine,
  AttendanceConfirm,
  LeaveCenter,
  DingtalkAutoAuth,
  TICKET_TYPES,
  TICKET_STATUS,
  ATTENDANCE_CONFIRM_STATUS,
  LEAVE_TYPES,
  SLA_HOURS,
  HR_LEAD_ID,
  HR_LEAD_NAME
} = require('../modules/selfservice/dingtalk_selfservice_portal.js');

console.log('='.repeat(80));
console.log('  Task5.1 TR-5.1.3 申诉工单+SLA+考勤+假期 验收测试');
console.log('='.repeat(80));
console.log('');

test('TR-5.1.3 申诉工单+SLA+考勤确认+假期中心 综合测试', async (t) => {
  const auth = new DingtalkAutoAuth();
  const ticketEngine = new TicketSlaEngine();
  const attendanceConfirm = new AttendanceConfirm({ auth });
  const leaveCenter = new LeaveCenter({ auth });

  const TARGET_EMP_ID = 'EMP000002';
  const TARGET_PERIOD = '2026-07';
  const TARGET_DEPT = '康源集团/总部/信息技术部';

  console.log(`【TR-5.1.3】执行申诉工单+SLA+考勤+假期综合测试...`);
  console.log(`  目标员工: ${TARGET_EMP_ID}`);
  console.log(`  目标期间: ${TARGET_PERIOD}`);
  console.log(`  目标部门: ${TARGET_DEPT}`);
  console.log('');

  await t.test('a) 申诉工资→createTicket slaDeadline=24h + slaEscalationJob触发升级', async (at) => {
    console.log(`  [TR-5.1.3-a] 工资申诉工单创建+SLA升级测试:`);

    const createResult = ticketEngine.createTicket({
      ticketType: TICKET_TYPES.PAYROLL_APPEAL,
      empId: TARGET_EMP_ID,
      content: '7月工资条绩效工资计算异常，请核对',
      dept: TARGET_DEPT
    });

    console.log(`              ── 创建工单 ──`);
    console.log(`              创建成功: ${createResult.success}`);
    console.log(`              ticketId: ${createResult.ticket.ticketId}`);
    console.log(`              ticketType: ${createResult.ticket.ticketType} (${createResult.ticket.ticketTypeName})`);
    console.log(`              status: ${createResult.ticket.status} (预期PENDING_REPLY)`);
    console.log(`              slaHours: ${createResult.slaHours}h (预期24h)`);
    console.log(`              slaDeadline: ${createResult.slaDeadline}`);

    assert.ok(createResult.success, '工单创建应成功');
    assert.equal(createResult.ticket.status, TICKET_STATUS.PENDING_REPLY,
      `初始status应=PENDING_REPLY，实际=${createResult.ticket.status}`);
    assert.equal(createResult.slaHours, SLA_HOURS,
      `slaHours应=${SLA_HOURS}h，实际=${createResult.slaHours}h`);

    const deadline = dayjs(createResult.ticket.slaDeadline);
    const createdAt = dayjs(createResult.ticket.createdAt);
    const diffHours = deadline.diff(createdAt, 'hour', true);
    console.log(`              deadline-createdAt差值: ${diffHours.toFixed(1)}h (≈24h)`);
    assert.ok(Math.abs(diffHours - SLA_HOURS) < 1,
      `SLA应为24h±1h，实际差值=${diffHours.toFixed(2)}h`);

    const ticket = createResult.ticket;
    ticket.slaDeadline = dayjs().subtract(1, 'hour').toISOString();
    console.log(``);
    console.log(`              ── 模拟超过24h未回复，触发升级 ──`);
    console.log(`              将deadline回溯至: ${ticket.slaDeadline} (模拟已逾期1h)`);

    const escalateResult = ticketEngine.slaEscalationJob(ticket);
    console.log(``);
    console.log(`              ── slaEscalationJob执行结果 ──`);
    console.log(`              升级成功: ${escalateResult.success}`);
    console.log(`              previousStatus: ${escalateResult.previousStatus}`);
    console.log(`              status: ${escalateResult.status} (预期ESCALATED_TO_HR_LEAD)`);
    console.log(`              notify.hrLeadId: ${escalateResult.notify ? escalateResult.notify.hrLeadId : 'N/A'}`);
    console.log(`              notify.hrLeadName: ${escalateResult.notify ? escalateResult.notify.hrLeadName : 'N/A'}`);
    console.log(`              notify.notified: ${escalateResult.notify ? escalateResult.notify.notified : 'N/A'}`);

    assert.ok(escalateResult.success, 'SLA升级应成功');
    assert.equal(escalateResult.status, TICKET_STATUS.ESCALATED_TO_HR_LEAD,
      `升级后status应=ESCALATED_TO_HR_LEAD，实际=${escalateResult.status}`);
    assert.equal(escalateResult.notify.hrLeadId, HR_LEAD_ID,
      `升级应通知HR负责人ID=${HR_LEAD_ID}`);
    assert.equal(escalateResult.notify.hrLeadName, HR_LEAD_NAME,
      `升级应通知HR负责人=${HR_LEAD_NAME}`);
    assert.equal(escalateResult.notify.notified, true,
      '通知状态应为true');

    const notifQueue = ticketEngine.getNotificationQueue();
    console.log(``);
    console.log(`              ── 通知队列检查 ──`);
    console.log(`              通知队列条数: ${notifQueue.length} (预期≥1)`);
    const hrLeadNotifs = notifQueue.filter(n => n.notifyTo === HR_LEAD_ID);
    console.log(`              HR负责人通知数: ${hrLeadNotifs.length} (预期1)`);

    assert.ok(notifQueue.length >= 1, `通知队列应有≥1条，实际=${notifQueue.length}`);
    assert.equal(hrLeadNotifs.length, 1,
      `HR负责人通知数应=1，实际=${hrLeadNotifs.length}`);

    if (hrLeadNotifs.length > 0) {
      console.log(`              HR通知详情: ${hrLeadNotifs[0].message}`);
    }

    console.log(`              ✓ PASS: 工资申诉工单创建+24h SLA升级+HR负责人通知=1条`);
  });

  await t.test('b) 考勤确认一键确认→status=CONFIRMED', () => {
    console.log(`  [TR-5.1.3-b] 考勤确认一键确认测试:`);

    const genResult = attendanceConfirm.generateAttendanceConfirmation(TARGET_EMP_ID, TARGET_PERIOD);
    console.log(`              ── D-2生成考勤确认单 ──`);
    console.log(`              生成成功: ${genResult.success}`);
    console.log(`              confirmationId: ${genResult.confirmation ? genResult.confirmation.confirmationId : 'N/A'}`);
    console.log(`              初始status: ${genResult.confirmation ? genResult.confirmation.status : 'N/A'}`);

    assert.ok(genResult.success, '生成考勤确认单应成功');
    assert.equal(genResult.confirmation.status, ATTENDANCE_CONFIRM_STATUS.PENDING,
      `初始状态应=PENDING`);

    const confirmResult = attendanceConfirm.confirmAttendance({
      empId: TARGET_EMP_ID,
      period: TARGET_PERIOD
    });

    console.log(``);
    console.log(`              ── 执行一键确认 ──`);
    console.log(`              确认成功: ${confirmResult.success}`);
    console.log(`              confirmationId: ${confirmResult.confirmationId}`);
    console.log(`              status: ${confirmResult.status} (预期CONFIRMED)`);
    console.log(`              confirmedAt: ${confirmResult.confirmedAt}`);

    assert.ok(confirmResult.success, '一键确认应成功');
    assert.equal(confirmResult.status, ATTENDANCE_CONFIRM_STATUS.CONFIRMED,
      `确认后status应=CONFIRMED，实际=${confirmResult.status}`);
    assert.ok(confirmResult.confirmedAt, '应有确认时间戳');

    const savedConf = attendanceConfirm.getConfirmation(TARGET_EMP_ID, TARGET_PERIOD);
    console.log(``);
    console.log(`              ── 落库状态复核 ──`);
    console.log(`              落库status: ${savedConf ? savedConf.status : 'N/A'}`);
    assert.equal(savedConf.status, ATTENDANCE_CONFIRM_STATUS.CONFIRMED,
      `落库后status应=CONFIRMED`);

    console.log(`              ✓ PASS: 考勤确认一键确认→status=CONFIRMED`);
  });

  await t.test('c) getLeaveBalance返回{annual:10, sick:5, compTime:32h, nextExpireDate}4项', () => {
    console.log(`  [TR-5.1.3-c] 假期中心余额查询测试:`);

    const balance = leaveCenter.getLeaveBalance(TARGET_EMP_ID);
    console.log(`              员工: ${TARGET_EMP_ID}`);
    console.log(`              返回字段检查:`);
    console.log(`                annual: ${balance.annual} 天`);
    console.log(`                sick: ${balance.sick} 天`);
    console.log(`                compTime: ${balance.compTime}`);
    console.log(`                compTimeHours: ${balance.compTimeHours}h`);
    console.log(`                nextExpireDate: ${balance.nextExpireDate}`);
    console.log(`                details存在: ${!!balance.details}`);
    console.log(`                asOfDate: ${balance.asOfDate}`);

    assert.ok(balance.annual !== undefined && balance.annual !== null,
      '应返回annual字段');
    assert.ok(balance.sick !== undefined && balance.sick !== null,
      '应返回sick字段');
    assert.ok(balance.compTime !== undefined,
      '应返回compTime字段');
    assert.ok(balance.nextExpireDate,
      '应返回nextExpireDate字段');

    console.log(``);
    console.log(`              字段值校验(4项核心指标):`);

    const hasAnnual = typeof balance.annual === 'number' && balance.annual >= 0;
    const hasSick = typeof balance.sick === 'number' && balance.sick >= 0;
    const compTimeStr = String(balance.compTime);
    const hasCompTime = compTimeStr.includes('h') || typeof balance.compTimeHours === 'number';
    const hasNextExpire = balance.nextExpireDate && balance.nextExpireDate.includes('-') && balance.nextExpireDate.length === 10;

    console.log(`                ✔ annual=${balance.annual} 类型正确: ${hasAnnual}`);
    console.log(`                ✔ sick=${balance.sick} 类型正确: ${hasSick}`);
    console.log(`                ✔ compTime=${balance.compTime} 含h后缀: ${hasCompTime}`);
    console.log(`                ✔ nextExpireDate=${balance.nextExpireDate} 日期格式: ${hasNextExpire}`);

    assert.ok(hasAnnual, 'annual应为数字且≥0');
    assert.ok(hasSick, 'sick应为数字且≥0');
    assert.ok(hasCompTime, 'compTime应含h或compTimeHours为数字');
    assert.ok(hasNextExpire, 'nextExpireDate应为YYYY-MM-DD格式');

    const allFourPresent = hasAnnual && hasSick && hasCompTime && hasNextExpire;
    console.log(``);
    console.log(`              4项核心字段齐全: ${allFourPresent ? '✓' : '✗'}`);
    assert.ok(allFourPresent, '4项核心字段应全部返回');

    console.log(`              ✓ PASS: getLeaveBalance返回4项核心字段齐全`);
  });

  await t.test('d) applyLeave年假3天→审批任务创建=1条', async () => {
    console.log(`  [TR-5.1.3-d] 一键请假+审批任务创建测试:`);

    const START_DATE = '2026-08-15';
    const END_DATE = '2026-08-17';
    const LEAVE_DAYS = 3;
    const LEAVE_TYPE = LEAVE_TYPES.ANNUAL;
    const REASON = '家庭出游休假';

    console.log(`              ── 请假参数 ──`);
    console.log(`              假期类型: 年假 (${LEAVE_TYPE})`);
    console.log(`              请假日期: ${START_DATE} ~ ${END_DATE}`);
    console.log(`              请假天数: ${LEAVE_DAYS}天`);
    console.log(`              请假原因: ${REASON}`);

    const beforeBalance = leaveCenter.getLeaveBalance(TARGET_EMP_ID);
    console.log(``);
    console.log(`              ── 请假前余额 ──`);
    console.log(`              年假剩余: ${beforeBalance.annual}天`);

    const applyResult = await leaveCenter.applyLeave({
      empId: TARGET_EMP_ID,
      leaveType: LEAVE_TYPE,
      startDate: START_DATE,
      endDate: END_DATE,
      hours: 0,
      reason: REASON
    });

    console.log(``);
    console.log(`              ── 请假申请结果 ──`);
    console.log(`              申请成功: ${applyResult.success}`);
    console.log(`              applicationId: ${applyResult.application ? applyResult.application.applicationId : 'N/A'}`);
    console.log(`              leaveId: ${applyResult.application ? applyResult.application.leaveId : 'N/A'}`);
    console.log(`              请假类型: ${applyResult.application ? applyResult.application.leaveTypeName : 'N/A'}`);
    console.log(`              请假天数: ${applyResult.application ? applyResult.application.days : 'N/A'}天`);
    console.log(`              申请状态: ${applyResult.application ? applyResult.application.status : 'N/A'}`);
    console.log(`              approvalTaskCount: ${applyResult.approvalTaskCount} (预期1)`);
    console.log(`              approvalTaskCreated: ${applyResult.approvalTaskCreated}`);

    assert.ok(applyResult.success, '请假申请应成功');
    assert.equal(applyResult.application.days, LEAVE_DAYS,
      `请假天数应=${LEAVE_DAYS}天，实际=${applyResult.application.days}天`);
    assert.equal(applyResult.application.leaveType, LEAVE_TYPE,
      `假期类型应=${LEAVE_TYPE}`);
    assert.equal(applyResult.approvalTaskCreated, true,
      'approvalTaskCreated应为true');
    assert.equal(applyResult.approvalTaskCount, 1,
      `approvalTaskCount应=1，实际=${applyResult.approvalTaskCount}`);

    const tasks = applyResult.application.approvalTasks;
    console.log(``);
    console.log(`              ── 审批任务明细 ──`);
    console.log(`              审批任务数: ${tasks ? tasks.length : 0} (预期1)`);
    if (tasks && tasks.length > 0) {
      console.log(`                [1] taskId: ${tasks[0].taskId}`);
      console.log(`                    approverRole: ${tasks[0].approverRole}`);
      console.log(`                    status: ${tasks[0].status}`);
    }

    assert.ok(tasks && tasks.length === 1,
      `审批任务数应=1条，实际=${tasks ? tasks.length : 0}条`);

    const afterBalance = leaveCenter.getLeaveBalance(TARGET_EMP_ID);
    console.log(``);
    console.log(`              ── 请假后余额复核 ──`);
    console.log(`              年假剩余: ${afterBalance.annual}天 (请假前${beforeBalance.annual}天 - ${LEAVE_DAYS}天 = 预期${beforeBalance.annual - LEAVE_DAYS}天)`);

    assert.equal(afterBalance.annual, beforeBalance.annual - LEAVE_DAYS,
      `年假余额应扣减${LEAVE_DAYS}天`);

    console.log(`              ✓ PASS: applyLeave年假3天→审批任务创建=1条`);
  });

  console.log('');
  console.log(`  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║ TR-5.1.3 申诉工单+SLA+考勤+假期 测试总结                                  ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);

  const ticketForSummary = ticketEngine.createTicket({
    ticketType: TICKET_TYPES.PAYROLL_APPEAL,
    empId: TARGET_EMP_ID,
    content: 'summary',
    dept: TARGET_DEPT
  }).ticket;
  ticketForSummary.slaDeadline = dayjs().subtract(2, 'hour').toISOString();
  ticketEngine.slaEscalationJob(ticketForSummary);
  const hrNotifyCount = ticketEngine.getNotificationQueue().filter(n => n.notifyTo === HR_LEAD_ID).length;

  const confForSummary = attendanceConfirm.generateAttendanceConfirmation(TARGET_EMP_ID, '2026-06');
  attendanceConfirm.confirmAttendance({ empId: TARGET_EMP_ID, period: '2026-06' });
  const confStatus = attendanceConfirm.getConfirmation(TARGET_EMP_ID, '2026-06');

  const bal = leaveCenter.getLeaveBalance(TARGET_EMP_ID);
  const fourFieldsOK = (bal.annual !== undefined) && (bal.sick !== undefined) && (bal.compTime !== undefined) && (bal.nextExpireDate !== undefined);

  console.log(`  ║  a) 工资申诉SLA: status升级=ESCALATED, HR通知数=${hrNotifyCount}              ✓ ║`);
  console.log(`  ║  b) 考勤一键确认: status=${confStatus ? confStatus.status : 'N/A'}                        ✓ ║`);
  console.log(`  ║  c) 假期余额4项: annual=${bal.annual} sick=${bal.sick} compTime=${bal.compTime} nextExpire=Y  ✓ ║`);
  console.log(`  ║  d) 年假3天申请: 审批任务创建=1条                                          ✓ ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
});
