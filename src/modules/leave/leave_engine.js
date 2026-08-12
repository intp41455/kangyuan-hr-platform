'use strict';

const dayjs = require('dayjs');
const { RuleEngine, RULE_CATEGORIES } = require('../rules/rule_engine.js');
const { EmployeeModel } = require('../master_data/employee_model.js');
const { DingTalkBotClient } = require('../../integrations/dingtalk_bot_dispatcher.js');

const LEAVE_TYPES = Object.freeze({
  ANNUAL: 'ANNUAL',
  PERSONAL: 'PERSONAL',
  SICK: 'SICK',
  MARRIAGE: 'MARRIAGE',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
  FUNERAL: 'FUNERAL',
  COMPTIME: 'COMPTIME'
});

const LEAVE_TYPE_NAMES = Object.freeze({
  [LEAVE_TYPES.ANNUAL]: '年假',
  [LEAVE_TYPES.PERSONAL]: '事假',
  [LEAVE_TYPES.SICK]: '病假',
  [LEAVE_TYPES.MARRIAGE]: '婚假',
  [LEAVE_TYPES.MATERNITY]: '产假',
  [LEAVE_TYPES.PATERNITY]: '陪产假',
  [LEAVE_TYPES.FUNERAL]: '丧假',
  [LEAVE_TYPES.COMPTIME]: '调休'
});

const LEAVE_UNIT = Object.freeze({
  DAY: 'day',
  HOUR: 'hour'
});

class MissingAttachmentError extends Error {
  constructor(message) {
    super(message || '缺少必要的附件材料');
    this.name = 'MissingAttachmentError';
  }
}

class InvalidLeaveRequestError extends Error {
  constructor(message) {
    super(message || '无效的请假申请');
    this.name = 'InvalidLeaveRequestError';
  }
}

class LeaveTypeModel {
  constructor({
    type,
    name,
    minUnit = 1,
    unit = LEAVE_UNIT.DAY,
    requireMedicalRecord = false,
    medicalRecordThresholdDays = Infinity,
    paid = false,
    payRate = 0,
    canCarryOver = false,
    carryOverMaxDate = null,
    canAdvance = false,
    advanceLimitDays = 0,
    quota = null,
    expireDays = null
  }) {
    this.type = type;
    this.name = name;
    this.minUnit = minUnit;
    this.unit = unit;
    this.requireMedicalRecord = requireMedicalRecord;
    this.medicalRecordThresholdDays = medicalRecordThresholdDays;
    this.paid = paid;
    this.payRate = payRate;
    this.canCarryOver = canCarryOver;
    this.carryOverMaxDate = carryOverMaxDate;
    this.canAdvance = canAdvance;
    this.advanceLimitDays = advanceLimitDays;
    this.quota = quota;
    this.expireDays = expireDays;
  }

  needsMedicalRecord(days) {
    if (!this.requireMedicalRecord) return false;
    return days >= this.medicalRecordThresholdDays;
  }
}

function buildLeaveTypeDefinitions() {
  return {
    [LEAVE_TYPES.ANNUAL]: new LeaveTypeModel({
      type: LEAVE_TYPES.ANNUAL,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.ANNUAL],
      minUnit: 0.5,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: true,
      carryOverMaxDate: '2026-12-31',
      canAdvance: true,
      advanceLimitDays: null
    }),
    [LEAVE_TYPES.PERSONAL]: new LeaveTypeModel({
      type: LEAVE_TYPES.PERSONAL,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.PERSONAL],
      minUnit: 1,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: false,
      payRate: 0,
      canCarryOver: false,
      canAdvance: false
    }),
    [LEAVE_TYPES.SICK]: new LeaveTypeModel({
      type: LEAVE_TYPES.SICK,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.SICK],
      minUnit: 0.5,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: true,
      medicalRecordThresholdDays: 3,
      paid: true,
      payRate: 0.8,
      canCarryOver: false,
      canAdvance: false
    }),
    [LEAVE_TYPES.MARRIAGE]: new LeaveTypeModel({
      type: LEAVE_TYPES.MARRIAGE,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.MARRIAGE],
      minUnit: 1,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: false,
      canAdvance: false,
      quota: 3
    }),
    [LEAVE_TYPES.MATERNITY]: new LeaveTypeModel({
      type: LEAVE_TYPES.MATERNITY,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.MATERNITY],
      minUnit: 1,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: false,
      canAdvance: false,
      quota: 158
    }),
    [LEAVE_TYPES.PATERNITY]: new LeaveTypeModel({
      type: LEAVE_TYPES.PATERNITY,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.PATERNITY],
      minUnit: 1,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: false,
      canAdvance: false,
      quota: 15
    }),
    [LEAVE_TYPES.FUNERAL]: new LeaveTypeModel({
      type: LEAVE_TYPES.FUNERAL,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.FUNERAL],
      minUnit: 1,
      unit: LEAVE_UNIT.DAY,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: false,
      canAdvance: false,
      quota: 3
    }),
    [LEAVE_TYPES.COMPTIME]: new LeaveTypeModel({
      type: LEAVE_TYPES.COMPTIME,
      name: LEAVE_TYPE_NAMES[LEAVE_TYPES.COMPTIME],
      minUnit: 1,
      unit: LEAVE_UNIT.HOUR,
      requireMedicalRecord: false,
      paid: true,
      payRate: 1.0,
      canCarryOver: false,
      canAdvance: false,
      expireDays: 180
    })
  };
}

function calcAnnualLeaveQuota({ employee, asOfDate }) {
  const asOf = dayjs(asOfDate);
  const entry = dayjs(employee.entryDate);
  const asOfYear = asOf.year();

  const yearsOfService = employee.calcYearsOfService(asOfDate);

  let baseQuota;
  if (yearsOfService < 1) {
    baseQuota = 0;
  } else if (yearsOfService >= 1 && yearsOfService < 10) {
    baseQuota = 5;
  } else if (yearsOfService >= 10 && yearsOfService < 20) {
    baseQuota = 10;
  } else {
    baseQuota = 15;
  }

  if (baseQuota === 0) {
    return {
      quota: 0,
      yearsOfService,
      baseQuota: 0,
      calculationMethod: '入职不满1年',
      asOfYear
    };
  }

  const isEntryYear = entry.year() === asOfYear;

  if (isEntryYear) {
    const entryMonth = entry.month() + 1;
    const entryDay = entry.date();

    if (entryMonth < 6 || (entryMonth === 6 && entryDay <= 1)) {
      return {
        quota: baseQuota,
        yearsOfService,
        baseQuota,
        calculationMethod: '6月1日前入职，按自然年全额计算',
        asOfYear
      };
    } else {
      const entryAnniversary = entry.add(1, 'year');
      const endOfYear = dayjs(`${asOfYear}-12-31`);
      const remainingMonths = endOfYear.diff(entryAnniversary, 'month', true);
      const monthsRatio = remainingMonths / 12;
      let rawQuota = monthsRatio * baseQuota;
      rawQuota = Math.floor(rawQuota * 2) / 2;

      return {
        quota: Math.max(0, rawQuota),
        yearsOfService,
        baseQuota,
        calculationMethod: '6月1日后入职，按入职周年剩余月数折算',
        remainingMonths: Number(remainingMonths.toFixed(2)),
        asOfYear
      };
    }
  } else {
    return {
      quota: baseQuota,
      yearsOfService,
      baseQuota,
      calculationMethod: '非入职当年，按档位全额计算',
      asOfYear
    };
  }
}

class AnnualLeaveExtensionManager {
  constructor() {
    this._extensions = new Map();
    this._defaultExpireDate = '2026-12-31';
    this._maxExtendDate = '2027-06-30';
  }

  getDefaultExpireDate() {
    return this._defaultExpireDate;
  }

  getMaxExtendDate() {
    return this._maxExtendDate;
  }

  applyAnnualLeaveExtension({ employeeId, year, approvalNo, extendToDate }) {
    if (!employeeId || !year || !approvalNo || !extendToDate) {
      throw new InvalidLeaveRequestError('缺少必要参数：employeeId, year, approvalNo, extendToDate均为必填');
    }

    const extendTo = dayjs(extendToDate);
    const maxDate = dayjs(this._maxExtendDate);

    let finalExtendDate;
    let status;
    let reason;

    if (extendTo.isAfter(maxDate)) {
      finalExtendDate = this._maxExtendDate;
      status = 'TRUNCATED';
      reason = `申请延期至${extendTo.format('YYYY-MM-DD')}超过最长允许日期${this._maxExtendDate}，自动作废超出部分，延至${this._maxExtendDate}`;
    } else {
      finalExtendDate = extendTo.format('YYYY-MM-DD');
      status = 'APPROVED';
      reason = `审批通过，延期至${finalExtendDate}`;
    }

    const key = `${employeeId}:${year}`;
    const record = {
      employeeId,
      year,
      approvalNo,
      requestedExtendTo: dayjs(extendToDate).format('YYYY-MM-DD'),
      finalExtendDate,
      status,
      reason,
      appliedAt: new Date()
    };
    this._extensions.set(key, record);

    return record;
  }

  getExtension(employeeId, year) {
    return this._extensions.get(`${employeeId}:${year}`) || null;
  }

  getEffectiveExpireDate(employeeId, year) {
    const ext = this.getExtension(employeeId, year);
    if (ext && (ext.status === 'APPROVED' || ext.status === 'TRUNCATED')) {
      return ext.finalExtendDate;
    }
    return this._defaultExpireDate;
  }

  listAll() {
    return Array.from(this._extensions.values());
  }
}

class CompTimeManager {
  constructor({ botClient = null } = {}) {
    this._grants = new Map();
    this._alertHistory = [];
    this._botClient = botClient || new DingTalkBotClient({ mode: 'mock' });
  }

  setBotClient(botClient) {
    this._botClient = botClient;
  }

  grantCompTime({ employeeId, hours, sourceApprovalNo, grantDate = null }) {
    if (!employeeId || !hours || hours <= 0) {
      throw new InvalidLeaveRequestError('grantCompTime参数无效：employeeId和正的hours为必填');
    }

    const grant = grantDate ? dayjs(grantDate) : dayjs();
    const expireAt = grant.add(180, 'day');

    const grantId = `COMP-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const record = {
      grantId,
      employeeId,
      hours,
      remainingHours: hours,
      sourceApprovalNo: sourceApprovalNo || null,
      grantDate: grant.format('YYYY-MM-DD'),
      expireAt: expireAt.format('YYYY-MM-DD'),
      status: 'ACTIVE',
      alerted: false,
      expiredHours: 0
    };
    this._grants.set(grantId, record);

    return record;
  }

  getGrant(grantId) {
    return this._grants.get(grantId) || null;
  }

  listGrantsByEmployee(employeeId) {
    return Array.from(this._grants.values()).filter(g => g.employeeId === employeeId);
  }

  isExpired(grant, asOfDate = null) {
    const now = asOfDate ? dayjs(asOfDate) : dayjs();
    const expire = dayjs(grant.expireAt);
    return now.isAfter(expire, 'day');
  }

  isExpiringSoon(expireAt, daysAhead = 14, asOfDate = null) {
    const now = asOfDate ? dayjs(asOfDate) : dayjs();
    const expire = dayjs(expireAt);
    const diffDays = expire.diff(now, 'day');
    return diffDays >= 0 && diffDays <= daysAhead;
  }

  daysUntilExpire(grant, asOfDate = null) {
    const now = asOfDate ? dayjs(asOfDate) : dayjs();
    const expire = dayjs(grant.expireAt);
    return expire.diff(now, 'day');
  }

  processExpirations(asOfDate = null) {
    const now = asOfDate ? dayjs(asOfDate) : dayjs();
    const results = { expired: [], expiringSoon: [], alertSent: [] };

    for (const grant of this._grants.values()) {
      if (grant.status === 'EXPIRED' || grant.status === 'USED_UP') continue;

      if (this.isExpired(grant, now)) {
        grant.expiredHours = grant.remainingHours;
        grant.remainingHours = 0;
        grant.status = 'EXPIRED';
        results.expired.push({
          grantId: grant.grantId,
          employeeId: grant.employeeId,
          expiredHours: grant.expiredHours
        });
      } else if (this.isExpiringSoon(grant.expireAt, 14, now) && !grant.alerted) {
        const daysLeft = this.daysUntilExpire(grant, now);
        results.expiringSoon.push({
          grantId: grant.grantId,
          employeeId: grant.employeeId,
          hours: grant.remainingHours,
          daysLeft
        });
      }
    }

    return results;
  }

  async triggerCompTimeAlert(employeeId, hours, daysLeft, targetUserId = null) {
    const message = `您有${hours}小时调休将于${daysLeft}天后过期，请尽快使用`;
    const userId = targetUserId || employeeId;

    const result = await this._botClient.sendDm(userId, {
      title: '【调休过期预警】',
      content: message,
      hours,
      daysLeft,
      alertType: 'COMPTIME_EXPIRING'
    });

    const alertRecord = {
      employeeId,
      targetUserId: userId,
      hours,
      daysLeft,
      message,
      sentAt: new Date(),
      botResult: result
    };
    this._alertHistory.push(alertRecord);

    const activeGrants = this.listGrantsByEmployee(employeeId).filter(
      g => g.status === 'ACTIVE' && this.isExpiringSoon(g.expireAt, 14)
    );
    for (const g of activeGrants) {
      g.alerted = true;
    }

    return alertRecord;
  }

  getAlertHistory() {
    return [...this._alertHistory];
  }

  listAllGrants() {
    return Array.from(this._grants.values());
  }
}

class LeaveEngine {
  constructor({ ruleEngine = null, botClient = null } = {}) {
    this.ruleEngine = ruleEngine || new RuleEngine();
    this.leaveTypes = buildLeaveTypeDefinitions();
    this.annualExtensionManager = new AnnualLeaveExtensionManager();
    this.compTimeManager = new CompTimeManager({ botClient });
    this._leaveRecords = [];
    this._registerDefaultRules();
  }

  _registerDefaultRules() {
    const rules = [
      {
        id: 'hr-leave-annual-quota',
        rCode: 'R-030',
        name: '年假配额计算规则',
        category: RULE_CATEGORIES.HOLIDAY,
        formula: (ctx) => calcAnnualLeaveQuota(ctx),
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团假期管理制度2026版',
          page: 5,
          approvalNo: 'HR-2026-LEAVE-030'
        }
      },
      {
        id: 'hr-leave-sick-attachment',
        rCode: 'R-031',
        name: '病假病历附件校验规则',
        category: RULE_CATEGORIES.HOLIDAY,
        formula: (ctx) => {
          const leaveType = ctx.leaveType;
          const days = ctx.days || 0;
          const hasMedical = ctx.hasMedicalRecord === true;
          if (leaveType === LEAVE_TYPES.SICK && days >= 3 && !hasMedical) {
            return { valid: false, error: '病假≥3天需提供病历附件' };
          }
          return { valid: true };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团假期管理制度2026版',
          page: 8,
          approvalNo: 'HR-2026-LEAVE-031'
        }
      }
    ];
    this.ruleEngine.batchRegisterRules(rules);
  }

  getLeaveType(type) {
    const lt = this.leaveTypes[type];
    if (!lt) {
      throw new InvalidLeaveRequestError(`无效的假期类型：${type}`);
    }
    return lt;
  }

  listLeaveTypes() {
    return Object.values(this.leaveTypes).map(lt => ({
      type: lt.type,
      name: lt.name,
      minUnit: lt.minUnit,
      unit: lt.unit,
      paid: lt.paid,
      payRate: lt.payRate
    }));
  }

  async applyLeave({ type, days = 0, hours = 0, employee, employeeId, hasMedicalRecord = false, reason = null, startDate = null, endDate = null }) {
    const leaveType = this.getLeaveType(type);

    if (leaveType.unit === LEAVE_UNIT.DAY) {
      if (!days || days <= 0) {
        throw new InvalidLeaveRequestError(`${leaveType.name}需提供请假天数(days>0)`);
      }
      if (days % leaveType.minUnit !== 0) {
        throw new InvalidLeaveRequestError(`${leaveType.name}最小单位为${leaveType.minUnit}天`);
      }
    } else {
      if (!hours || hours <= 0) {
        throw new InvalidLeaveRequestError(`${leaveType.name}需提供请假小时数(hours>0)`);
      }
      if (hours % leaveType.minUnit !== 0) {
        throw new InvalidLeaveRequestError(`${leaveType.name}最小单位为${leaveType.minUnit}小时`);
      }
    }

    const ruleResult = await this.ruleEngine.executeRules(['R-031'], {
      leaveType: type,
      days,
      hours,
      hasMedicalRecord
    });
    const checkResult = ruleResult.results['R-031'];
    if (checkResult && checkResult.valid === false) {
      throw new MissingAttachmentError(checkResult.error || '缺少病历附件');
    }

    const record = {
      leaveId: `LEAVE-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      employeeId: employeeId || (employee ? employee.id : null),
      type,
      typeName: leaveType.name,
      days,
      hours,
      unit: leaveType.unit,
      hasMedicalRecord: !!hasMedicalRecord,
      reason,
      startDate: startDate ? dayjs(startDate).format('YYYY-MM-DD') : null,
      endDate: endDate ? dayjs(endDate).format('YYYY-MM-DD') : null,
      paid: leaveType.paid,
      payRate: leaveType.payRate,
      status: 'SUBMITTED',
      submittedAt: new Date()
    };
    this._leaveRecords.push(record);

    return record;
  }

  calcAnnualLeaveQuota({ employee, asOfDate }) {
    return calcAnnualLeaveQuota({ employee, asOfDate });
  }

  applyAnnualLeaveExtension(args) {
    return this.annualExtensionManager.applyAnnualLeaveExtension(args);
  }

  grantCompTime(args) {
    return this.compTimeManager.grantCompTime(args);
  }

  listLeaveRecords() {
    return [...this._leaveRecords];
  }
}

module.exports = {
  LeaveEngine,
  LeaveTypeModel,
  LEAVE_TYPES,
  LEAVE_TYPE_NAMES,
  LEAVE_UNIT,
  MissingAttachmentError,
  InvalidLeaveRequestError,
  AnnualLeaveExtensionManager,
  CompTimeManager,
  calcAnnualLeaveQuota,
  buildLeaveTypeDefinitions
};
