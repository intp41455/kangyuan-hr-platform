'use strict';

const { ATTENDANCE_ANOMALY, ANOMALY_NAMES } = require('../modules/attendance/attendance_anomaly_engine.js');

const APPROVAL_TYPES = Object.freeze({
  MAKEUP: 'MAKEUP',
  OVERTIME: 'OVERTIME',
  FIELDWORK: 'FIELDWORK'
});

const ANOMALY_STATUS = Object.freeze({
  OPEN: 'OPEN',
  PROCESSING: 'PROCESSING',
  CLOSED: 'CLOSED'
});

const ANOMALY_ACTION_TEXT = Object.freeze({
  [ATTENDANCE_ANOMALY.LATE]: '一键确认/申诉',
  [ATTENDANCE_ANOMALY.EARLY_LEAVE]: '一键确认/申诉',
  [ATTENDANCE_ANOMALY.MISSING_PUNCH]: '一键补卡',
  [ATTENDANCE_ANOMALY.ABSENT]: '一键确认/申诉',
  [ATTENDANCE_ANOMALY.OT_WORKDAY]: '一键确认加班',
  [ATTENDANCE_ANOMALY.OT_WEEKEND]: '一键确认加班',
  [ATTENDANCE_ANOMALY.OT_HOLIDAY]: '一键确认加班',
  [ATTENDANCE_ANOMALY.LEAVE_PERSONAL]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_SICK]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_ANNUAL]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_MARRIAGE]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_MATERNITY]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_PATERNITY]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_FUNERAL]: '查看详情',
  [ATTENDANCE_ANOMALY.LEAVE_COMPTIME]: '查看详情',
  [ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK]: '一键提交外勤审批'
});

class ReminderLog {
  constructor() {
    this.logs = [];
  }

  record({ anomalyId, reminderLevel, targetUserId, targetType, message, sentAt }) {
    const entry = {
      logId: `REM_LOG_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`,
      anomalyId,
      reminderLevel,
      targetUserId,
      targetType,
      message,
      sentAt: sentAt || new Date()
    };
    this.logs.push(entry);
    return entry;
  }

  getAll() {
    return [...this.logs];
  }

  getByAnomalyId(anomalyId) {
    return this.logs.filter(l => l.anomalyId === anomalyId);
  }

  size() {
    return this.logs.length;
  }

  clear() {
    this.logs = [];
  }
}

class DingTalkBotClient {
  constructor({ mode = 'mock', dwsSkill = null } = {}) {
    this.mode = mode;
    this.dwsSkill = dwsSkill;
    this._callHistory = [];
    this._mockApprovals = new Map();
    this._sentMessages = new Map();
  }

  _recordCall(methodName, args, result) {
    const record = {
      ts: new Date(),
      method: methodName,
      args: JSON.parse(JSON.stringify(args)),
      result: JSON.parse(JSON.stringify(result || {}))
    };
    this._callHistory.push(record);
    return record;
  }

  getCallHistory() {
    return [...this._callHistory];
  }

  getCallCount(methodName) {
    if (!methodName) return this._callHistory.length;
    return this._callHistory.filter(c => c.method === methodName).length;
  }

  clearCallHistory() {
    this._callHistory = [];
    this._mockApprovals.clear();
    this._sentMessages.clear();
  }

  async sendDm(userId, msgCard) {
    const msgId = `MSG_DM_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const result = { success: true, msgId, userId, sentAt: new Date() };
    this._recordCall('sendDm', [userId, msgCard], result);
    const key = `dm:${userId}`;
    if (!this._sentMessages.has(key)) this._sentMessages.set(key, []);
    this._sentMessages.get(key).push({ msgCard, msgId, sentAt: result.sentAt });
    return result;
  }

  async sendGroupDm(groupId, msgCard) {
    const msgId = `MSG_GRP_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const result = { success: true, msgId, groupId, sentAt: new Date() };
    this._recordCall('sendGroupDm', [groupId, msgCard], result);
    const key = `grp:${groupId}`;
    if (!this._sentMessages.has(key)) this._sentMessages.set(key, []);
    this._sentMessages.get(key).push({ msgCard, msgId, sentAt: result.sentAt });
    return result;
  }

  async dingRemind(userId, msg) {
    const dingId = `DING_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const result = { success: true, dingId, userId, msg, sentAt: new Date() };
    this._recordCall('dingRemind', [userId, msg], result);
    return result;
  }

  _generateApprovalNo(type) {
    const prefix = {
      [APPROVAL_TYPES.MAKEUP]: 'APR-MAKEUP',
      [APPROVAL_TYPES.OVERTIME]: 'APR-OT',
      [APPROVAL_TYPES.FIELDWORK]: 'APR-FW'
    };
    const ts = Date.now();
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    return `${prefix[type] || 'APR'}-${ts}-${rand}`;
  }

  async createApproval(type, payload) {
    const validTypes = Object.values(APPROVAL_TYPES);
    if (!validTypes.includes(type)) {
      throw new Error(`无效审批类型: ${type}，有效值: ${validTypes.join(',')}`);
    }
    const approvalNo = this._generateApprovalNo(type);
    const approvalRecord = {
      approvalNo,
      type,
      payload: payload || {},
      createdAt: new Date(),
      status: 'PENDING'
    };
    this._mockApprovals.set(approvalNo, approvalRecord);
    this._recordCall('createApproval', [type, payload], { approvalNo });
    return approvalNo;
  }

  getApproval(approvalNo) {
    return this._mockApprovals.get(approvalNo) || null;
  }

  getSentDms(userId) {
    return this._sentMessages.get(`dm:${userId}`) || [];
  }

  getSentGroupMsgs(groupId) {
    return this._sentMessages.get(`grp:${groupId}`) || [];
  }
}

function _generateActionUrl(anomaly, approvalNo) {
  const baseUrl = 'https://hr.kangyuan.com/attendance/anomaly';
  const anomalyId = anomaly.anomalyId || 'unknown';
  const params = [`anomalyId=${encodeURIComponent(anomalyId)}`];
  if (approvalNo) params.push(`approvalNo=${encodeURIComponent(approvalNo)}`);
  params.push(`t=${Date.now()}`);
  return `${baseUrl}?${params.join('&')}`;
}

function buildMsgCard({ anomaly, employee, approvalNo, statusOverride }) {
  const typeVal = anomaly.type;
  const displayName = ANOMALY_NAMES[typeVal] || `异常类型#${typeVal}`;
  const date = anomaly.date || new Date().toISOString().slice(0, 10);
  const time = anomaly.time || anomaly.lateMinutes
    ? `迟到${anomaly.lateMinutes}分钟`
    : (anomaly.earlyMinutes
      ? `早退${anomaly.earlyMinutes}分钟`
      : (anomaly.otHours ? `加班${anomaly.otHours}小时` : '--:--'));
  const deductionAmount = Number(anomaly.deduction) || 0;
  const status = statusOverride || ANOMALY_STATUS.OPEN;
  const actionText = ANOMALY_ACTION_TEXT[typeVal] || '查看详情';
  const url = _generateActionUrl(anomaly, approvalNo);

  const card = {
    title: `【考勤异常通知】${displayName}`,
    anomalyType: {
      code: typeVal,
      displayName
    },
    date,
    time,
    deductionAmount,
    status,
    primaryActionButton: {
      text: actionText,
      url
    },
    employeeInfo: employee ? {
      id: employee.id || null,
      name: employee.name || null,
      department: employee.dept2 || employee.department || null
    } : null,
    anomalyId: anomaly.anomalyId || null,
    severity: anomaly.severity || null,
    ruleCodes: anomaly.ruleCodes || []
  };

  if (approvalNo) {
    card.approvalNo = approvalNo;
    card.approvalType = _guessApprovalType(typeVal);
  }

  return card;
}

function _guessApprovalType(anomalyType) {
  if (anomalyType === ATTENDANCE_ANOMALY.MISSING_PUNCH) return APPROVAL_TYPES.MAKEUP;
  if ([ATTENDANCE_ANOMALY.OT_WORKDAY, ATTENDANCE_ANOMALY.OT_WEEKEND, ATTENDANCE_ANOMALY.OT_HOLIDAY].includes(anomalyType)) {
    return APPROVAL_TYPES.OVERTIME;
  }
  if (anomalyType === ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK) return APPROVAL_TYPES.FIELDWORK;
  return null;
}

function _isMakeupAnomaly(anomaly) {
  return anomaly && anomaly.type === ATTENDANCE_ANOMALY.MISSING_PUNCH;
}

async function dispatchAnomaly({ anomaly, employee, leader, botClient, options = {} }) {
  if (!anomaly) throw new Error('缺少anomaly参数');
  if (!botClient) throw new Error('缺少botClient参数');

  const anomalyGeneratedTs = anomaly.generatedAt ? new Date(anomaly.generatedAt).getTime() : Date.now();
  const dispatchResult = {
    anomalyId: anomaly.anomalyId,
    employeeMessages: [],
    leaderMessages: [],
    approvalNo: null,
    sendTimestamp: null,
    latencyMs: null,
    cards: { employeeCard: null, leaderCard: null }
  };

  let approvalNo = null;
  if (_isMakeupAnomaly(anomaly)) {
    approvalNo = await botClient.createApproval(APPROVAL_TYPES.MAKEUP, {
      employeeId: employee ? employee.id : null,
      employeeName: employee ? employee.name : null,
      anomalyDate: anomaly.date,
      anomalyId: anomaly.anomalyId,
      reason: '缺卡自动发起补卡申请'
    });
    dispatchResult.approvalNo = approvalNo;
  }

  const employeeCard = buildMsgCard({ anomaly, employee, approvalNo });
  dispatchResult.cards.employeeCard = employeeCard;

  if (employee && employee.dingtalkUserId) {
    const empResult = await botClient.sendDm(employee.dingtalkUserId, employeeCard);
    dispatchResult.employeeMessages.push(empResult);
  } else if (employee && employee.id) {
    const empResult = await botClient.sendDm(employee.id, employeeCard);
    dispatchResult.employeeMessages.push(empResult);
  }

  const leaderCard = buildMsgCard({
    anomaly,
    employee,
    approvalNo,
    statusOverride: ANOMALY_STATUS.PROCESSING
  });
  dispatchResult.cards.leaderCard = leaderCard;

  if (leader) {
    const leaderId = leader.dingtalkUserId || leader.id;
    if (leaderId) {
      const leaderResult = await botClient.sendDm(leaderId, leaderCard);
      dispatchResult.leaderMessages.push(leaderResult);
    }
  }

  dispatchResult.sendTimestamp = new Date();
  dispatchResult.latencyMs = dispatchResult.sendTimestamp.getTime() - anomalyGeneratedTs;

  return dispatchResult;
}

class AnomalyRepository {
  constructor() {
    this._anomalies = new Map();
  }

  add(anomalyRecord) {
    if (!anomalyRecord || !anomalyRecord.anomalyId) {
      throw new Error('无效的异常记录：缺少anomalyId');
    }
    const record = {
      status: ANOMALY_STATUS.OPEN,
      generatedAt: new Date(),
      closedAt: null,
      reminderCount: 0,
      lastReminderAt: null,
      maxReminderLevelReached: 0,
      ...anomalyRecord
    };
    this._anomalies.set(record.anomalyId, record);
    return record;
  }

  get(anomalyId) {
    return this._anomalies.get(anomalyId) || null;
  }

  getAll() {
    return Array.from(this._anomalies.values());
  }

  getUnclosed() {
    return this.getAll().filter(a => a.status !== ANOMALY_STATUS.CLOSED);
  }

  updateStatus(anomalyId, newStatus) {
    const rec = this._anomalies.get(anomalyId);
    if (!rec) return null;
    rec.status = newStatus;
    if (newStatus === ANOMALY_STATUS.CLOSED) {
      rec.closedAt = new Date();
    }
    return rec;
  }

  markReminderSent(anomalyId, level) {
    const rec = this._anomalies.get(anomalyId);
    if (!rec) return null;
    rec.reminderCount = (rec.reminderCount || 0) + 1;
    rec.lastReminderAt = new Date();
    rec.maxReminderLevelReached = Math.max(rec.maxReminderLevelReached || 0, level);
    return rec;
  }

  size() {
    return this._anomalies.size;
  }

  clear() {
    this._anomalies.clear();
  }
}

class ReminderScheduler {
  constructor({
    botClient,
    anomalyRepository,
    reminderLog,
    hour = 18,
    minute = 0,
    employeeRegistry = null
  } = {}) {
    this.botClient = botClient;
    this.repository = anomalyRepository;
    this.reminderLog = reminderLog;
    this.scheduledHour = hour;
    this.scheduledMinute = minute;
    this.employeeRegistry = employeeRegistry;
    this._timer = null;
    this._lastRunAt = null;
    this._runCount = 0;
  }

  _getDeptHeadAndHr(employee) {
    const deptHead = { id: 'DEPT_HEAD_MOCK', name: '部门总负责人', dingtalkUserId: 'DD_DEPT_HEAD' };
    const hrSpecialist = { id: 'HR_SPEC_MOCK', name: 'HR专员', dingtalkUserId: 'DD_HR_SPEC' };
    return { deptHead, hrSpecialist };
  }

  _elapsedHours(anomalyRecord, nowTs) {
    const genTs = anomalyRecord.generatedAt
      ? new Date(anomalyRecord.generatedAt).getTime()
      : nowTs;
    const diffMs = nowTs - genTs;
    return diffMs / (1000 * 60 * 60);
  }

  async runOnce(options = {}) {
    const now = options.simulatedNow ? new Date(options.simulatedNow) : new Date();
    const nowTs = now.getTime();
    this._lastRunAt = now;
    this._runCount++;

    const runReport = {
      runAt: now,
      scannedCount: 0,
      level1Reminders: [],
      level2Reminders: [],
      level3Reminders: []
    };

    const unclosed = this.repository.getUnclosed();
    runReport.scannedCount = unclosed.length;

    for (const anomaly of unclosed) {
      const elapsedH = this._elapsedHours(anomaly, nowTs);
      const employee = anomaly.employee || null;
      const leader = anomaly.leader || null;

      if (elapsedH >= 72) {
        const level = 3;
        const { deptHead, hrSpecialist } = this._getDeptHeadAndHr(employee);
        const msgBase = `【严重考勤异常催办-T+72h】员工${employee ? employee.name : '未知'} ${anomaly.date} ${anomaly.typeName}已超72小时未闭环，请立即处理！`;

        if (deptHead && deptHead.dingtalkUserId) {
          await this.botClient.sendDm(deptHead.dingtalkUserId, {
            title: `【T+72h催办】${anomaly.typeName}异常未闭环`,
            anomalyType: anomaly.typeName,
            date: anomaly.date,
            content: msgBase
          });
          this.reminderLog.record({
            anomalyId: anomaly.anomalyId,
            reminderLevel: 'L3_DEPT_HEAD',
            targetUserId: deptHead.dingtalkUserId,
            targetType: 'dept_head',
            message: msgBase,
            sentAt: now
          });
          runReport.level3Reminders.push({ target: 'deptHead', anomalyId: anomaly.anomalyId });
        }

        if (hrSpecialist && hrSpecialist.dingtalkUserId) {
          await this.botClient.sendDm(hrSpecialist.dingtalkUserId, {
            title: `【T+72h催办】${anomaly.typeName}异常未闭环`,
            anomalyType: anomaly.typeName,
            date: anomaly.date,
            content: msgBase
          });
          this.reminderLog.record({
            anomalyId: anomaly.anomalyId,
            reminderLevel: 'L3_HR',
            targetUserId: hrSpecialist.dingtalkUserId,
            targetType: 'hr_specialist',
            message: msgBase,
            sentAt: now
          });
          runReport.level3Reminders.push({ target: 'hrSpec', anomalyId: anomaly.anomalyId });
        }

        this.repository.markReminderSent(anomaly.anomalyId, level);
      } else if (elapsedH >= 48) {
        const level = 2;
        const empId = employee ? (employee.dingtalkUserId || employee.id) : null;
        const dingMsg = `【DING级催办-T+48h】您在${anomaly.date}的考勤异常(${anomaly.typeName})已超48小时未处理，请立即点击消息卡片操作！[异常ID:${anomaly.anomalyId}]`;
        if (empId) {
          await this.botClient.dingRemind(empId, dingMsg);
          this.reminderLog.record({
            anomalyId: anomaly.anomalyId,
            reminderLevel: 'L2_DING',
            targetUserId: empId,
            targetType: 'employee',
            message: dingMsg,
            sentAt: now
          });
          runReport.level2Reminders.push({ target: 'employee', anomalyId: anomaly.anomalyId });
        }
        this.repository.markReminderSent(anomaly.anomalyId, level);
      } else if (elapsedH >= 24) {
        const level = 1;
        const remindCard = {
          title: `【二次提醒-T+24h】考勤异常待处理-${anomaly.typeName}`,
          anomalyType: anomaly.typeName,
          date: anomaly.date,
          time: '--:--',
          deductionAmount: Number(anomaly.deduction) || 0,
          status: anomaly.status,
          primaryActionButton: {
            text: ANOMALY_ACTION_TEXT[anomaly.type] || '立即处理',
            url: _generateActionUrl(anomaly, anomaly.approvalNo)
          },
          reminderNote: '此异常已超过24小时未闭环，请尽快处理'
        };

        const empId = employee ? (employee.dingtalkUserId || employee.id) : null;
        if (empId) {
          await this.botClient.sendDm(empId, remindCard);
          this.reminderLog.record({
            anomalyId: anomaly.anomalyId,
            reminderLevel: 'L1_EMP',
            targetUserId: empId,
            targetType: 'employee',
            message: remindCard.title,
            sentAt: now
          });
          runReport.level1Reminders.push({ target: 'employee', anomalyId: anomaly.anomalyId });
        }

        const leaderId = leader ? (leader.dingtalkUserId || leader.id) : null;
        if (leaderId) {
          const leaderRemindCard = { ...remindCard, title: `【下属异常-T+24h提醒】${employee ? employee.name : ''} ${anomaly.typeName}待处理` };
          await this.botClient.sendDm(leaderId, leaderRemindCard);
          this.reminderLog.record({
            anomalyId: anomaly.anomalyId,
            reminderLevel: 'L1_LEADER',
            targetUserId: leaderId,
            targetType: 'leader',
            message: leaderRemindCard.title,
            sentAt: now
          });
          runReport.level1Reminders.push({ target: 'leader', anomalyId: anomaly.anomalyId });
        }
        this.repository.markReminderSent(anomaly.anomalyId, level);
      }
    }

    return runReport;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === this.scheduledHour && now.getMinutes() === this.scheduledMinute) {
        this.runOnce();
      }
    }, 60 * 1000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getLastRunAt() {
    return this._lastRunAt;
  }

  getRunCount() {
    return this._runCount;
  }
}

function calcSlaStats(startDate, endDate, anomalyRepository) {
  const all = anomalyRepository.getAll();
  const startTs = startDate ? new Date(startDate).getTime() : 0;
  const endTs = endDate ? new Date(endDate).getTime() : Date.now();

  const inRange = all.filter(a => {
    const genTs = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
    return genTs >= startTs && genTs <= endTs;
  });

  const totalCount = inRange.length;
  const closedCount = inRange.filter(a => a.status === ANOMALY_STATUS.CLOSED).length;

  let closedWithin24h = 0;
  let closedWithin48h = 0;
  let overdueCount = 0;

  for (const a of inRange) {
    const genTs = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
    if (a.status === ANOMALY_STATUS.CLOSED && a.closedAt) {
      const closeTs = new Date(a.closedAt).getTime();
      const elapsedH = (closeTs - genTs) / (1000 * 60 * 60);
      if (elapsedH <= 24) closedWithin24h++;
      if (elapsedH <= 48) closedWithin48h++;
    } else {
      const elapsedH = (Date.now() - genTs) / (1000 * 60 * 60);
      if (elapsedH > 48) overdueCount++;
    }
  }

  return {
    closedCount,
    totalCount,
    closureRateWithin24h: totalCount > 0 ? Number((closedWithin24h / totalCount).toFixed(4)) : 0,
    closureRateWithin48h: totalCount > 0 ? Number((closedWithin48h / totalCount).toFixed(4)) : 0,
    overdueCount
  };
}

function validateMsgCardStructure(card) {
  const requiredTopKeys = ['title', 'anomalyType', 'date', 'time', 'deductionAmount', 'status', 'primaryActionButton'];
  const requiredAnomalyTypeKeys = ['code', 'displayName'];
  const requiredButtonKeys = ['text', 'url'];

  const issues = [];

  for (const k of requiredTopKeys) {
    if (!(k in card)) {
      issues.push(`缺少顶层键: ${k}`);
    }
  }

  if (card.anomalyType) {
    for (const k of requiredAnomalyTypeKeys) {
      if (!(k in card.anomalyType)) {
        issues.push(`anomalyType缺少键: ${k}`);
      }
    }
    if (card.anomalyType.displayName && typeof card.anomalyType.displayName !== 'string') {
      issues.push('anomalyType.displayName应为字符串');
    }
  }

  if (card.primaryActionButton) {
    for (const k of requiredButtonKeys) {
      if (!(k in card.primaryActionButton)) {
        issues.push(`primaryActionButton缺少键: ${k}`);
      }
    }
    if (card.primaryActionButton.url && !String(card.primaryActionButton.url).startsWith('http')) {
      issues.push('primaryActionButton.url应为http(s)开头的URL');
    }
  }

  if (!isNaN(Number(card.deductionAmount)) === false && card.deductionAmount !== 0) {
    issues.push('deductionAmount应为数值');
  }

  if (card.date && typeof card.date !== 'string') {
    issues.push('date应为字符串(YYYY-MM-DD格式)');
  }

  return {
    valid: issues.length === 0,
    issues,
    summary: issues.length === 0 ? '卡片结构完整' : `存在${issues.length}个问题`
  };
}

module.exports = {
  APPROVAL_TYPES,
  ANOMALY_STATUS,
  ANOMALY_ACTION_TEXT,
  ReminderLog,
  DingTalkBotClient,
  buildMsgCard,
  dispatchAnomaly,
  AnomalyRepository,
  ReminderScheduler,
  calcSlaStats,
  validateMsgCardStructure
};
