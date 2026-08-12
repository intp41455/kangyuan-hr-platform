'use strict';

const { AttendanceGroupsLoader, ATTENDANCE_GROUP_TYPES, WORKDAYS_PATTERNS } = require('./attendance_groups_loader');
const AlertQueue = require('../../services/AlertQueue');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWorkday(dateStr, workdaysPattern) {
  const d = new Date(dateStr);
  const dayOfWeek = d.getDay();
  if (workdaysPattern === WORKDAYS_PATTERNS.MON_FRI) {
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  } else if (workdaysPattern === WORKDAYS_PATTERNS.MON_SAT) {
    return dayOfWeek >= 1 && dayOfWeek <= 6;
  }
  return false;
}

function getDaysInMonth(year, month) {
  const m = month - 1;
  const first = new Date(year, m, 1);
  const last = new Date(year, m + 1, 0);
  const days = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push(formatDate(new Date(d)));
  }
  return days;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

class PunchDayRecord {
  constructor(data = {}) {
    this.employeeId = data.employeeId || null;
    this.date = data.date || null;
    this.checkInTime = data.checkInTime || null;
    this.checkOutTime = data.checkOutTime || null;
    this.location = data.location || null;
    this.device = data.device || null;
    this.fieldWorkFlag = data.fieldWorkFlag || false;
    this.makeupApprovalNo = data.makeupApprovalNo || null;
    this.businessTripNo = data.businessTripNo || null;
    this.leaveApprovalNo = data.leaveApprovalNo || null;
    this.source = data.source || 'mock';
    this.isMissing = data.isMissing || false;
  }
}

class AttendancePunchCollector {
  constructor({
    dingTalkClient = null,
    attendanceGroupsLoader = null,
    alertQueue = null,
    mode = 'mock',
    employeeRegistry = null
  } = {}) {
    this.client = dingTalkClient;
    this.groupsLoader = attendanceGroupsLoader || new AttendanceGroupsLoader({ dingTalkClient, mode });
    this.alertQueue = alertQueue || new AlertQueue();
    this.mode = mode;
    this.employeeRegistry = employeeRegistry;

    this._cache = new Map();
    this._recordFailures = [];
    this._retryMarkers = [];

    if (this.client) {
      this._injectMockPunchApi();
    }
  }

  _injectMockPunchApi() {
    if (this.client && !this.client.fetchAttendancePunch) {
      this.client.fetchAttendancePunch = async (params) => {
        if (this.client._networkFailureThreshold > 0 &&
            this.client._networkFailureCount < this.client._networkFailureThreshold) {
          this.client._networkFailureCount++;
          throw new Error('NETWORK_TIMEOUT: 钉钉打卡API连接超时（Mock模拟）');
        }
        return this._generateMockPunchRecords(params);
      };
    }
  }

  _cacheKey(employeeId, year, month) {
    return `${employeeId}_${year}_${String(month).padStart(2, '0')}`;
  }

  _getCached(employeeId, year, month) {
    const key = this._cacheKey(employeeId, year, month);
    if (this._cache.has(key)) {
      return deepClone(this._cache.get(key));
    }
    return null;
  }

  _setCache(employeeId, year, month, records) {
    const key = this._cacheKey(employeeId, year, month);
    this._cache.set(key, deepClone(records));
  }

  clearCache() {
    this._cache.clear();
    this._recordFailures = [];
    this._retryMarkers = [];
  }

  getRetryMarkers() {
    return [...this._retryMarkers];
  }

  getRecordFailures() {
    return [...this._recordFailures];
  }

  _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _generateApprovalNo(prefix, dateStr, empId) {
    const datePart = dateStr.replace(/-/g, '');
    const randPart = String(this._rand(1000, 9999));
    return `${prefix}-${datePart}-${empId}-${randPart}`;
  }

  _generateMockPunchRecords({ employeeId, year, month, group, isExempt }) {
    const daysInMonth = getDaysInMonth(year, month);
    const records = [];
    const workdaysPattern = group ? group.workdays : WORKDAYS_PATTERNS.MON_FRI;
    const shift = group ? group.shift : { onDutyTime: '09:00', offDutyTime: '18:00' };

    for (const dateStr of daysInMonth) {
      const record = new PunchDayRecord({
        employeeId,
        date: dateStr,
        source: this.mode === 'mock' ? 'mock-dingtalk' : 'dingtalk-api'
      });

      const isWorkDay = isWorkday(dateStr, workdaysPattern);

      if (!isWorkDay || isExempt) {
        records.push(record);
        continue;
      }

      const rand = Math.random();
      const onDutyParts = shift.onDutyTime ? shift.onDutyTime.split(':') : ['09', '00'];
      const offDutyParts = shift.offDutyTime ? shift.offDutyTime.split(':') : ['18', '00'];
      const onDutyHour = parseInt(onDutyParts[0], 10);
      const onDutyMin = parseInt(onDutyParts[1], 10);
      const offDutyHour = parseInt(offDutyParts[0], 10);
      const offDutyMin = parseInt(offDutyParts[1], 10);

      const baseDateTime = new Date(dateStr);

      if (rand < 0.80) {
        const inMinOffset = this._rand(-10, 5);
        const outMinOffset = this._rand(-5, 15);
        record.checkInTime = new Date(baseDateTime.getTime());
        record.checkInTime.setHours(onDutyHour, onDutyMin + inMinOffset, 0, 0);
        record.checkOutTime = new Date(baseDateTime.getTime());
        record.checkOutTime.setHours(offDutyHour, offDutyMin + outMinOffset, 0, 0);
        record.location = '公司总部';
        record.device = `DING-${this._rand(1000, 9999)}`;
      } else if (rand < 0.85) {
        record.isMissing = false;
      } else if (rand < 0.93) {
        const isLate = Math.random() < 0.5;
        if (isLate) {
          const lateMin = this._rand(6, 60);
          record.checkInTime = new Date(baseDateTime.getTime());
          record.checkInTime.setHours(onDutyHour, onDutyMin + lateMin, 0, 0);
          record.checkOutTime = new Date(baseDateTime.getTime());
          record.checkOutTime.setHours(offDutyHour, offDutyMin + this._rand(-5, 10), 0, 0);
        } else {
          record.checkInTime = new Date(baseDateTime.getTime());
          record.checkInTime.setHours(onDutyHour, onDutyMin + this._rand(-10, 0), 0, 0);
          const earlyMin = this._rand(6, 60);
          record.checkOutTime = new Date(baseDateTime.getTime());
          record.checkOutTime.setHours(offDutyHour, offDutyMin - earlyMin, 0, 0);
        }
        record.location = '公司总部';
        record.device = `DING-${this._rand(1000, 9999)}`;
      } else if (rand < 0.96) {
        record.fieldWorkFlag = true;
        const inMinOffset = this._rand(-30, 30);
        const outMinOffset = this._rand(-30, 30);
        record.checkInTime = new Date(baseDateTime.getTime());
        record.checkInTime.setHours(onDutyHour, onDutyMin + inMinOffset, 0, 0);
        record.checkOutTime = new Date(baseDateTime.getTime());
        record.checkOutTime.setHours(offDutyHour, offDutyMin + outMinOffset, 0, 0);
        record.location = '外勤-客户现场';
        record.device = `MOBILE-${this._rand(1000, 9999)}`;
        const businessTripRand = Math.random();
        if (businessTripRand < 0.6) {
          record.businessTripNo = this._generateApprovalNo('BT', dateStr, employeeId);
        } else if (businessTripRand < 0.85) {
          record.makeupApprovalNo = this._generateApprovalNo('MK', dateStr, employeeId);
        }
      } else {
        record.makeupApprovalNo = this._generateApprovalNo('MK', dateStr, employeeId);
        const leaveRand = Math.random();
        if (leaveRand < 0.3) {
          record.leaveApprovalNo = this._generateApprovalNo('LV', dateStr, employeeId);
          record.checkInTime = null;
          record.checkOutTime = null;
        } else if (leaveRand < 0.7) {
          const inMinOffset = this._rand(-10, 30);
          record.checkInTime = new Date(baseDateTime.getTime());
          record.checkInTime.setHours(onDutyHour, onDutyMin + inMinOffset, 0, 0);
          record.checkOutTime = new Date(baseDateTime.getTime());
          record.checkOutTime.setHours(offDutyHour, offDutyMin + this._rand(-5, 15), 0, 0);
          record.location = '公司总部';
          record.device = `DING-${this._rand(1000, 9999)}`;
        } else {
          record.businessTripNo = this._generateApprovalNo('BT', dateStr, employeeId);
          record.checkInTime = new Date(baseDateTime.getTime());
          record.checkInTime.setHours(onDutyHour + 1, onDutyMin, 0, 0);
          record.checkOutTime = new Date(baseDateTime.getTime());
          record.checkOutTime.setHours(offDutyHour - 1, offDutyMin, 0, 0);
          record.location = '外勤-出差地';
          record.device = `MOBILE-${this._rand(1000, 9999)}`;
          record.fieldWorkFlag = true;
        }
      }

      records.push(record);
    }

    return records.map(r => ({ ...r }));
  }

  _getEmployeeAttendanceGroup(employeeId) {
    if (!this.employeeRegistry) return null;
    const employee = this.employeeRegistry.getById(employeeId);
    if (!employee) return null;
    if (!this.groupsLoader._groupsLoaded) return null;
    return this.groupsLoader.getAttendanceGroupForEmployee(employee);
  }

  _isEmployeeExempt(employeeId, group) {
    if (group && group.isExempt) return true;
    if (group && group.exemptEmployeeIds && group.exemptEmployeeIds.includes(employeeId)) return true;
    if (this.groupsLoader.hasValidExemptionApproval(employeeId)) return true;
    return false;
  }

  async fetchEmployeeMonthPunch(employeeId, year, month) {
    const cached = this._getCached(employeeId, year, month);
    if (cached) {
      return cached;
    }

    const group = this._getEmployeeAttendanceGroup(employeeId);
    const isExempt = this._isEmployeeExempt(employeeId, group);

    let rawRecords;
    if (this.mode === 'mock' || !this.client || !this.client.fetchAttendancePunch) {
      rawRecords = this._generateMockPunchRecords({
        employeeId,
        year,
        month,
        group,
        isExempt
      });
    } else {
      rawRecords = await this.client.fetchAttendancePunch({
        employeeId,
        year,
        month
      });
    }

    const records = rawRecords.map(r => new PunchDayRecord({ ...r }));
    this._applyMissingMark(records, group, isExempt);
    this._setCache(employeeId, year, month, records);
    return deepClone(records);
  }

  _applyMissingMark(records, group, isExempt) {
    if (!records || records.length === 0) return;
    const workdaysPattern = group ? group.workdays : WORKDAYS_PATTERNS.MON_FRI;

    for (const rec of records) {
      if (isExempt) {
        rec.isMissing = false;
        continue;
      }
      const isWorkDay = isWorkday(rec.date, workdaysPattern);
      if (!isWorkDay) {
        rec.isMissing = false;
        continue;
      }
      if (!rec.checkInTime && !rec.checkOutTime) {
        if (!rec.leaveApprovalNo && !rec.businessTripNo) {
          rec.isMissing = true;
        }
      }
    }
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _fetchWithRetry(employeeId, year, month, maxRetries = 3, backoffDelays = [1000, 3000, 10000]) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = backoffDelays[attempt - 1] || 1000;
          this._retryMarkers.push({
            employeeId,
            attempt,
            delayMs: delay,
            delayLabel: delay === 1000 ? '1s' : delay === 3000 ? '3s' : delay === 10000 ? '10s' : `${delay}ms`,
            ts: new Date().toISOString()
          });
          console.log(`    [指数退避重试] employee=${employeeId} 第${attempt}次重试 → 延迟${delay === 1000 ? '1s' : delay === 3000 ? '3s' : '10s'}`);
          await this._sleep(delay);
        }
        const records = await this.fetchEmployeeMonthPunch(employeeId, year, month);
        return { success: true, records };
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) break;
      }
    }
    return { success: false, error: lastError ? lastError.message : '未知错误' };
  }

  async fetchMonthPunchBatch({ employeeIds, year, month, batchSize = 20, maxRetries = 3 }) {
    const backoffDelays = [1000, 3000, 10000];
    const allRecords = [];
    const errors = [];
    let successCount = 0;
    let failedCount = 0;

    const batches = [];
    for (let i = 0; i < employeeIds.length; i += batchSize) {
      batches.push(employeeIds.slice(i, i + batchSize));
    }

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const batchPromises = batch.map(async (eid) => {
        const result = await this._fetchWithRetry(eid, year, month, maxRetries, backoffDelays);
        if (result.success) {
          return { type: 'success', employeeId: eid, records: result.records };
        } else {
          return { type: 'fail', employeeId: eid, reason: result.error };
        }
      });
      const batchResults = await Promise.all(batchPromises);

      for (const br of batchResults) {
        if (br.type === 'success') {
          successCount++;
          allRecords.push(...br.records);
        } else {
          failedCount++;
          const errItem = { employeeId: br.employeeId, reason: br.reason, retryable: true };
          errors.push(errItem);
          this._recordFailures.push(errItem);
          if (maxRetries > 0) {
            this.alertQueue.enqueueAdminAlert({
              message: `[CRITICAL] 钉钉打卡数据采集失败：员工${br.employeeId} ${year}年${month}月 连续${maxRetries + 1}次API调用失败，错误: ${br.reason}`,
              level: 'critical'
            });
          }
        }
      }
    }

    return {
      successCount,
      failedCount,
      records: allRecords,
      errors
    };
  }

  validateCompleteness({ year, month, expectedCount, actualRecords }) {
    const records = actualRecords || [];
    const successFetchedDays = records.length;
    const expected = expectedCount || 0;
    const completenessRate = expected > 0
      ? Number(((successFetchedDays / expected) * 100).toFixed(4))
      : 0;

    return {
      year,
      month,
      expectedCount: expected,
      actualCount: successFetchedDays,
      completenessRate,
      isComplete: completenessRate >= 99.9
    };
  }

  async dutyCycleEndedAutoTrigger(year, month, {
    mode = 'nextMonth2AM',
    onTrigger = null,
    autoRun = false
  } = {}) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    let triggerInfo;
    if (mode === 'nextMonth2AM') {
      triggerInfo = {
        mode,
        triggerDate: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
        triggerTime: '02:00:00',
        description: `次月1号02:00自动触发：${year}年${month}月打卡数据全量采集`,
        targetPeriod: { year, month }
      };
    } else {
      const lastDay = new Date(year, month, 0);
      const dayBefore = new Date(lastDay.getTime() - 2 * 24 * 60 * 60 * 1000);
      triggerInfo = {
        mode: 'D-3_23:59',
        triggerDate: formatDate(dayBefore),
        triggerTime: '23:59:00',
        description: `D-3日23:59自动触发：${year}年${month}月打卡数据全量采集`,
        targetPeriod: { year, month }
      };
    }

    if (autoRun && onTrigger && typeof onTrigger === 'function') {
      await onTrigger({ year, month, triggerInfo });
    }

    return triggerInfo;
  }

  enqueueAdminAlertForFailure({ employeeId, year, month, reason }) {
    return this.alertQueue.enqueueAdminAlert({
      message: `[考勤采集告警] 员工${employeeId} ${year}年${month}月打卡数据采集失败：${reason}，请检查钉钉API并重试`,
      level: 'critical'
    });
  }
}

module.exports = {
  PunchDayRecord,
  AttendancePunchCollector,
  formatDate,
  isWorkday,
  getDaysInMonth,
  deepEqual,
  deepClone
};
