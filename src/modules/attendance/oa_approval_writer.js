'use strict';

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES
} = require('./attendance_anomaly_engine.js');

const {
  ANOMALY_STATUS,
  ReminderLog,
  dispatchAnomaly
} = require('../../integrations/dingtalk_bot_dispatcher.js');

const APPROVAL_EVENT_TYPES = Object.freeze({
  APPROVAL_PASSED: 'APPROVAL_PASSED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  APPROVAL_TRANSFERRED: 'APPROVAL_TRANSFERRED'
});

const WRITEBACK_LOG_TYPES = Object.freeze({
  CANCEL_DEDUCTION: 'CANCEL_DEDUCTION',
  CLOSE_LEAVE_ANOMALY: 'CLOSE_LEAVE_ANOMALY',
  ACCUMULATE_OVERTIME: 'ACCUMULATE_OVERTIME',
  KEEP_OPEN_REJECTED: 'KEEP_OPEN_REJECTED',
  TRANSFER_RECORD: 'TRANSFER_RECORD'
});

function _isMakeupApproval(approvalNo) {
  if (!approvalNo) return false;
  const upper = String(approvalNo).toUpperCase();
  return upper.startsWith('APR-MAKEUP') || upper.includes('MAKEUP');
}

function _isLeaveApproval(approvalNo) {
  if (!approvalNo) return false;
  const upper = String(approvalNo).toUpperCase();
  return upper.startsWith('APR-LEAVE') || upper.startsWith('LV-') || upper.includes('LEAVE')
    || upper.startsWith('APR-PER') || upper.startsWith('APR-SIC') || upper.startsWith('APR-ANN')
    || upper.startsWith('APR-MAR') || upper.startsWith('APR-MAT') || upper.startsWith('APR-PAT')
    || upper.startsWith('APR-FUN') || upper.startsWith('APR-COM');
}

function _isOvertimeApproval(approvalNo) {
  if (!approvalNo) return false;
  const upper = String(approvalNo).toUpperCase();
  return upper.startsWith('APR-OT') || upper.includes('OVERTIME') || upper.includes('OT_');
}

class WritebackLog {
  constructor() {
    this.logs = [];
  }

  record({
    anomalyId,
    approvalNo,
    eventType,
    beforeState,
    afterState,
    beforeDeduction,
    afterDeduction,
    writebackType,
    extra = {},
    operatorType = 'AUTO'
  }) {
    const entry = {
      logId: `WB_LOG_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`,
      ts: new Date(),
      anomalyId: anomalyId || null,
      approvalNo: approvalNo || null,
      eventType: eventType || null,
      writebackType: writebackType || null,
      beforeState: beforeState || null,
      afterState: afterState || null,
      beforeDeduction: typeof beforeDeduction === 'number' ? beforeDeduction : null,
      afterDeduction: typeof afterDeduction === 'number' ? afterDeduction : null,
      operatorType,
      extra: JSON.parse(JSON.stringify(extra))
    };
    this.logs.push(entry);
    return entry;
  }

  getAll() {
    return [...this.logs];
  }

  getByApprovalNo(approvalNo) {
    return this.logs.filter(l => l.approvalNo === approvalNo);
  }

  getByAnomalyId(anomalyId) {
    return this.logs.filter(l => l.anomalyId === anomalyId);
  }

  getByType(writebackType) {
    return this.logs.filter(l => l.writebackType === writebackType);
  }

  size() {
    return this.logs.length;
  }

  clear() {
    this.logs = [];
  }
}

class TransferLog {
  constructor() {
    this.logs = [];
  }

  record({
    eventId,
    approvalNo,
    anomalyId,
    fromApproverId,
    toApproverId,
    transferredAt,
    comment
  }) {
    const entry = {
      transferId: `TR_LOG_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`,
      eventId: eventId || null,
      approvalNo: approvalNo || null,
      anomalyId: anomalyId || null,
      fromApproverId: fromApproverId || null,
      toApproverId: toApproverId || null,
      transferredAt: transferredAt || new Date(),
      comment: comment || ''
    };
    this.logs.push(entry);
    return entry;
  }

  getAll() {
    return [...this.logs];
  }

  getByApprovalNo(approvalNo) {
    return this.logs.filter(l => l.approvalNo === approvalNo);
  }

  size() {
    return this.logs.length;
  }

  clear() {
    this.logs = [];
  }
}

class ApprovalListener {
  constructor({
    anomalyRepository,
    writebackLog,
    transferLog,
    reminderLog,
    botClient,
    employeeRegistry = null,
    pollingIntervalMs = 60000,
    dwsSkill = null
  } = {}) {
    this.repository = anomalyRepository;
    this.writebackLog = writebackLog || new WritebackLog();
    this.transferLog = transferLog || new TransferLog();
    this.reminderLog = reminderLog || new ReminderLog();
    this.botClient = botClient;
    this.employeeRegistry = employeeRegistry;
    this.pollingIntervalMs = pollingIntervalMs;
    this.dwsSkill = dwsSkill;
    this._processedApprovals = new Set();
    this._approvalToAnomalyMap = new Map();
    this._eventSubscribers = [];
    this._pollingTimer = null;
    this._pendingPollResults = [];
  }

  bindApprovalAnomaly(approvalNo, anomalyId) {
    if (approvalNo && anomalyId) {
      this._approvalToAnomalyMap.set(String(approvalNo), String(anomalyId));
    }
  }

  getAnomalyIdByApprovalNo(approvalNo) {
    if (!approvalNo) return null;
    const mapped = this._approvalToAnomalyMap.get(String(approvalNo));
    if (mapped) return mapped;
    const all = this.repository ? this.repository.getAll() : [];
    for (const a of all) {
      if (a.approvalNo === approvalNo || a.makeupApprovalNo === approvalNo) {
        return a.anomalyId;
      }
    }
    return null;
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this._eventSubscribers.push(callback);
      return () => {
        const idx = this._eventSubscribers.indexOf(callback);
        if (idx >= 0) this._eventSubscribers.splice(idx, 1);
      };
    }
    return () => {};
  }

  _emitEvent(event) {
    for (const cb of this._eventSubscribers) {
      try { cb(event); } catch (e) {}
    }
  }

  isProcessed(approvalNo) {
    return approvalNo ? this._processedApprovals.has(String(approvalNo)) : false;
  }

  _markProcessed(approvalNo) {
    if (approvalNo) this._processedApprovals.add(String(approvalNo));
  }

  resetProcessedSet() {
    this._processedApprovals.clear();
  }

  async handleApprovalEvent(event) {
    if (!event || !event.type) {
      throw new Error('无效审批事件：缺少type字段');
    }
    if (!event.approvalNo) {
      throw new Error('无效审批事件：缺少approvalNo字段');
    }

    const { type, approvalNo } = event;
    const validTypes = Object.values(APPROVAL_EVENT_TYPES);
    if (!validTypes.includes(type)) {
      throw new Error(`无效审批事件类型: ${type}，有效值: ${validTypes.join(',')}`);
    }

    const approvalKey = String(approvalNo);
    if (this.isProcessed(approvalKey) && type !== APPROVAL_EVENT_TYPES.APPROVAL_TRANSFERRED) {
      return {
        idempotent: true,
        skipped: true,
        approvalNo,
        eventType: type,
        message: `审批单${approvalNo}已处理过，幂等跳过`
      };
    }

    const anomalyId = this.getAnomalyIdByApprovalNo(approvalNo);
    const anomaly = anomalyId && this.repository ? this.repository.get(anomalyId) : null;

    let result = {
      idempotent: false,
      skipped: false,
      approvalNo,
      eventType: type,
      anomalyId: anomalyId || null,
      writebackLogEntries: [],
      handledAt: new Date()
    };

    if (type === APPROVAL_EVENT_TYPES.APPROVAL_PASSED) {
      result = { ...result, ...await this._handlePassed(event, anomaly, anomalyId) };
    } else if (type === APPROVAL_EVENT_TYPES.APPROVAL_REJECTED) {
      result = { ...result, ...await this._handleRejected(event, anomaly, anomalyId) };
    } else if (type === APPROVAL_EVENT_TYPES.APPROVAL_TRANSFERRED) {
      result = { ...result, ...this._handleTransferred(event, anomalyId) };
    }

    if (type !== APPROVAL_EVENT_TYPES.APPROVAL_TRANSFERRED) {
      this._markProcessed(approvalKey);
    }

    this._emitEvent({ ...event, handledResult: result, anomalyId: anomalyId || null });
    return result;
  }

  async _handlePassed(event, anomaly, anomalyId) {
    const { approvalNo } = event;
    const subResult = {
      anomalyBeforeState: null,
      anomalyAfterState: null,
      deductionBefore: null,
      deductionAfter: null
    };

    if (anomaly) {
      subResult.anomalyBeforeState = anomaly.status;
      subResult.deductionBefore = Number(anomaly.deduction) || 0;
    }

    if (_isMakeupApproval(approvalNo)) {
      if (anomaly) {
        const beforeDed = Number(anomaly.deduction) || 0;
        anomaly.deduction = 0;
        anomaly.deductionAmount = 0;
        if (this.repository) {
          this.repository.updateStatus(anomalyId, ANOMALY_STATUS.CLOSED);
        }
        const afterDed = Number(anomaly.deduction) || 0;
        const afterState = anomaly.status;

        const wbEntry = this.writebackLog.record({
          anomalyId,
          approvalNo,
          eventType: APPROVAL_EVENT_TYPES.APPROVAL_PASSED,
          writebackType: WRITEBACK_LOG_TYPES.CANCEL_DEDUCTION,
          beforeState: subResult.anomalyBeforeState,
          afterState,
          beforeDeduction: beforeDed,
          afterDeduction: afterDed,
          extra: {
            originalAmount: beforeDed,
            canceledAmount: beforeDed,
            note: '补卡审批通过，扣款取消'
          },
          operatorType: 'AUTO'
        });
        subResult.writebackLogEntries = [wbEntry];
        subResult.anomalyAfterState = afterState;
        subResult.deductionAfter = afterDed;
        subResult.action = 'CANCEL_DEDUCTION';
      }
    } else if (_isLeaveApproval(approvalNo)) {
      if (anomaly) {
        if (this.repository) {
          this.repository.updateStatus(anomalyId, ANOMALY_STATUS.CLOSED);
        }
        const afterState = anomaly.status;
        const leaveDays = anomaly.leaveDays || anomaly.absentDays || 1;
        anomaly.attendanceDaysAdjusted = true;
        anomaly.leaveDaysDeducted = leaveDays;

        const wbEntry = this.writebackLog.record({
          anomalyId,
          approvalNo,
          eventType: APPROVAL_EVENT_TYPES.APPROVAL_PASSED,
          writebackType: WRITEBACK_LOG_TYPES.CLOSE_LEAVE_ANOMALY,
          beforeState: subResult.anomalyBeforeState,
          afterState,
          beforeDeduction: subResult.deductionBefore,
          afterDeduction: subResult.deductionBefore,
          extra: {
            leaveDays,
            attendanceDaysDeducted: leaveDays,
            note: '请假审批通过，异常闭环，attendanceDays已抵扣'
          },
          operatorType: 'AUTO'
        });
        subResult.writebackLogEntries = [wbEntry];
        subResult.anomalyAfterState = afterState;
        subResult.deductionAfter = subResult.deductionBefore;
        subResult.action = 'CLOSE_LEAVE_ANOMALY';
        subResult.leaveDaysDeducted = leaveDays;
      }
    } else if (_isOvertimeApproval(approvalNo)) {
      if (anomaly) {
        if (this.repository) {
          this.repository.updateStatus(anomalyId, ANOMALY_STATUS.CLOSED);
        }
        const afterState = anomaly.status;
        const otHours = Number(anomaly.otHours) || 0;
        const rate = Number(anomaly.rate) || 1;
        anomaly.accumulatedOtHours = (Number(anomaly.accumulatedOtHours) || 0) + otHours;
        anomaly.otApproved = true;

        const wbEntry = this.writebackLog.record({
          anomalyId,
          approvalNo,
          eventType: APPROVAL_EVENT_TYPES.APPROVAL_PASSED,
          writebackType: WRITEBACK_LOG_TYPES.ACCUMULATE_OVERTIME,
          beforeState: subResult.anomalyBeforeState,
          afterState,
          beforeDeduction: subResult.deductionBefore,
          afterDeduction: subResult.deductionBefore,
          extra: {
            otHours,
            rate,
            accumulatedOtHours: anomaly.accumulatedOtHours,
            note: `加班审批通过，累计加班${otHours}小时(倍率x${rate})`
          },
          operatorType: 'AUTO'
        });
        subResult.writebackLogEntries = [wbEntry];
        subResult.anomalyAfterState = afterState;
        subResult.deductionAfter = subResult.deductionBefore;
        subResult.action = 'ACCUMULATE_OVERTIME';
        subResult.otHours = otHours;
        subResult.rate = rate;
      }
    }

    return subResult;
  }

  async _handleRejected(event, anomaly, anomalyId) {
    const { approvalNo, rejectReason } = event;
    const subResult = {
      anomalyBeforeState: null,
      anomalyAfterState: null,
      reminderDispatched: false,
      rejectReason: rejectReason || null
    };

    if (anomaly) {
      subResult.anomalyBeforeState = anomaly.status;
      subResult.anomalyAfterState = anomaly.status;
      anomaly.rejectCount = (Number(anomaly.rejectCount) || 0) + 1;
      anomaly.lastRejectReason = rejectReason || null;
      anomaly.lastRejectAt = new Date();
    }

    const wbEntry = this.writebackLog.record({
      anomalyId,
      approvalNo,
      eventType: APPROVAL_EVENT_TYPES.APPROVAL_REJECTED,
      writebackType: WRITEBACK_LOG_TYPES.KEEP_OPEN_REJECTED,
      beforeState: subResult.anomalyBeforeState,
      afterState: subResult.anomalyAfterState,
      beforeDeduction: anomaly ? (Number(anomaly.deduction) || 0) : null,
      afterDeduction: anomaly ? (Number(anomaly.deduction) || 0) : null,
      extra: {
        rejectReason: rejectReason || null,
        note: '审批驳回，异常保持OPEN，将触发二次催办'
      },
      operatorType: 'AUTO'
    });
    subResult.writebackLogEntries = [wbEntry];

    if (anomaly && this.botClient) {
      const reasonTag = 'REJECTED_RESUBMIT';
      const employee = anomaly.employee || null;
      const leader = anomaly.leader || null;
      const rejectNote = rejectReason ? `（驳回原因：${rejectReason}）` : '';

      this.reminderLog.record({
        anomalyId,
        reminderLevel: 'REJECTED_RESUBMIT',
        targetUserId: employee ? (employee.dingtalkUserId || employee.id) : null,
        targetType: 'employee',
        message: `【审批驳回需重新提交】您关联的审批单${approvalNo}被驳回，请重新提交${rejectNote}[anomalyId=${anomalyId}]`,
        sentAt: new Date()
      });

      if (employee || leader) {
        try {
          const anomalyWithContext = {
            ...anomaly,
            reason: reasonTag,
            rejectFlag: true,
            rejectReason: rejectReason || null
          };
          await dispatchAnomaly({
            anomaly: anomalyWithContext,
            employee,
            leader,
            botClient: this.botClient,
            options: { reason: reasonTag, resubmit: true }
          });
          subResult.reminderDispatched = true;
        } catch (e) {
          subResult.reminderDispatchError = String(e.message || e);
        }
      }
    }

    subResult.action = 'KEEP_OPEN_AND_REDISPATCH';
    return subResult;
  }

  _handleTransferred(event, anomalyId) {
    const { approvalNo, transfer, eventId } = event;
    const transferInfo = transfer || {};
    const fromApproverId = transferInfo.from || transferInfo.fromApproverId || null;
    const toApproverId = transferInfo.to || transferInfo.toApproverId || null;
    const comment = transferInfo.comment || '';
    const transferredAt = transferInfo.transferredAt || new Date();

    const trEntry = this.transferLog.record({
      eventId: eventId || null,
      approvalNo,
      anomalyId,
      fromApproverId,
      toApproverId,
      transferredAt,
      comment
    });

    const wbEntry = this.writebackLog.record({
      anomalyId,
      approvalNo,
      eventType: APPROVAL_EVENT_TYPES.APPROVAL_TRANSFERRED,
      writebackType: WRITEBACK_LOG_TYPES.TRANSFER_RECORD,
      beforeState: null,
      afterState: null,
      beforeDeduction: null,
      afterDeduction: null,
      extra: {
        fromApproverId,
        toApproverId,
        comment,
        transferredAt,
        note: `审批转交：${fromApproverId} → ${toApproverId}`
      },
      operatorType: 'AUTO'
    });

    return {
      writebackLogEntries: [wbEntry],
      transferLogEntry: trEntry,
      action: 'RECORD_TRANSFER',
      fromApproverId,
      toApproverId,
      comment
    };
  }

  submitMockPollResult(event) {
    this._pendingPollResults.push(event);
  }

  async _pollOnce() {
    const batch = this._pendingPollResults.splice(0);
    const results = [];
    for (const evt of batch) {
      try {
        const r = await this.handleApprovalEvent(evt);
        results.push(r);
      } catch (e) {
        results.push({ error: String(e.message || e), event: evt });
      }
    }
    return results;
  }

  startPolling() {
    if (this._pollingTimer) return;
    this._pollingTimer = setInterval(() => {
      this._pollOnce().catch(() => {});
    }, this.pollingIntervalMs);
  }

  stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  }

  isPolling() {
    return !!this._pollingTimer;
  }

  getProcessedApprovalCount() {
    return this._processedApprovals.size;
  }

  clearAll() {
    this.stopPolling();
    this.resetProcessedSet();
    this._approvalToAnomalyMap.clear();
    this._eventSubscribers = [];
    this._pendingPollResults = [];
    if (this.writebackLog) this.writebackLog.clear();
    if (this.transferLog) this.transferLog.clear();
  }
}

module.exports = {
  APPROVAL_EVENT_TYPES,
  WRITEBACK_LOG_TYPES,
  WritebackLog,
  TransferLog,
  ApprovalListener,
  _isMakeupApproval,
  _isLeaveApproval,
  _isOvertimeApproval
};
