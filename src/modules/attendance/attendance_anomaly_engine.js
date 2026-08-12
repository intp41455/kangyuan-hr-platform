'use strict';

const { RuleEngine, RULE_CATEGORIES } = require('../rules/rule_engine.js');
const { PunchDayRecord } = require('./punch_data_collector.js');

const ATTENDANCE_ANOMALY = Object.freeze({
  LATE: 1,
  EARLY_LEAVE: 2,
  MISSING_PUNCH: 3,
  ABSENT: 4,
  OT_WORKDAY: 5,
  OT_WEEKEND: 6,
  OT_HOLIDAY: 7,
  LEAVE_PERSONAL: 8,
  LEAVE_SICK: 9,
  LEAVE_ANNUAL: 10,
  LEAVE_MARRIAGE: 11,
  LEAVE_MATERNITY: 12,
  LEAVE_PATERNITY: 13,
  LEAVE_FUNERAL: 14,
  LEAVE_COMPTIME: 15,
  UNAPPROVED_FIELDWORK: 16
});

const ANOMALY_NAMES = Object.freeze({
  1: '迟到',
  2: '早退',
  3: '缺卡',
  4: '旷工',
  5: '平日加班',
  6: '周末加班',
  7: '节假日加班',
  8: '事假',
  9: '病假',
  10: '年假',
  11: '婚假',
  12: '产假',
  13: '陪产假',
  14: '丧假',
  15: '调休抵扣',
  16: '外勤出差未审批'
});

const SEVERITY = Object.freeze({
  WARNING: 'WARNING',
  FINE: 'FINE',
  DEDUCT: 'DEDUCT'
});

const LEAVE_TYPE_MAP = Object.freeze({
  PERSONAL: ATTENDANCE_ANOMALY.LEAVE_PERSONAL,
  SICK: ATTENDANCE_ANOMALY.LEAVE_SICK,
  ANNUAL: ATTENDANCE_ANOMALY.LEAVE_ANNUAL,
  MARRIAGE: ATTENDANCE_ANOMALY.LEAVE_MARRIAGE,
  MATERNITY: ATTENDANCE_ANOMALY.LEAVE_MATERNITY,
  PATERNITY: ATTENDANCE_ANOMALY.LEAVE_PATERNITY,
  FUNERAL: ATTENDANCE_ANOMALY.LEAVE_FUNERAL,
  COMPTIME: ATTENDANCE_ANOMALY.LEAVE_COMPTIME
});

function getLeaveTypeByPrefix(approvalNo) {
  if (!approvalNo) return null;
  const upper = approvalNo.toUpperCase();
  if (upper.startsWith('LV-PER') || upper.includes('PERSONAL') || upper.startsWith('APR-PER')) return ATTENDANCE_ANOMALY.LEAVE_PERSONAL;
  if (upper.startsWith('LV-SIC') || upper.includes('SICK') || upper.startsWith('APR-SIC')) return ATTENDANCE_ANOMALY.LEAVE_SICK;
  if (upper.startsWith('LV-ANN') || upper.includes('ANNUAL') || upper.startsWith('APR-ANN')) return ATTENDANCE_ANOMALY.LEAVE_ANNUAL;
  if (upper.startsWith('LV-MAR') || upper.includes('MARRIAGE') || upper.startsWith('APR-MAR')) return ATTENDANCE_ANOMALY.LEAVE_MARRIAGE;
  if (upper.startsWith('LV-MAT') || upper.includes('MATERNITY') || upper.startsWith('APR-MAT')) return ATTENDANCE_ANOMALY.LEAVE_MATERNITY;
  if (upper.startsWith('LV-PAT') || upper.includes('PATERNITY') || upper.startsWith('APR-PAT')) return ATTENDANCE_ANOMALY.LEAVE_PATERNITY;
  if (upper.startsWith('LV-FUN') || upper.includes('FUNERAL') || upper.startsWith('APR-FUN')) return ATTENDANCE_ANOMALY.LEAVE_FUNERAL;
  if (upper.startsWith('LV-COM') || upper.includes('COMPTIME') || upper.startsWith('APR-COM') || upper.includes('COMP')) return ATTENDANCE_ANOMALY.LEAVE_COMPTIME;
  return null;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function getDateMinutes(dateObj) {
  if (!dateObj) return null;
  const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function isWeekend(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function generateAnomalyId() {
  const ts = Date.now();
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `AT_${ts}_${rand}`;
}

class AttendanceAnomalyEngine {
  constructor(options = {}) {
    this.ruleEngine = options.ruleEngine || new RuleEngine();
    this.ruleVersion = options.ruleVersion || '1.0';
    this._rulesRegistered = false;
    this.holidaySet = options.holidays ? new Set(options.holidays) : new Set();
  }

  setHolidays(holidays) {
    this.holidaySet.clear();
    if (Array.isArray(holidays)) {
      holidays.forEach(h => this.holidaySet.add(String(h)));
    }
  }

  isHoliday(dateStr) {
    return this.holidaySet.has(String(dateStr));
  }

  _registerAttendanceRules() {
    if (this._rulesRegistered) return;

    const rules = [
      {
        id: 'hr-rule-att-188',
        rCode: 'R-188',
        name: '迟到识别-基础',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { checkInMinutes, onDutyMinutes, grace } = ctx;
          if (checkInMinutes == null || onDutyMinutes == null) return { triggered: false };
          const lateMin = checkInMinutes - (onDutyMinutes + (grace || 0));
          if (lateMin <= 0) return { triggered: false };
          return { triggered: true, lateMinutes: lateMin };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 1, approvalNo: 'HR-2026-ATT-001' }
      },
      {
        id: 'hr-rule-att-189',
        rCode: 'R-189',
        name: '迟到-警告级(≤10min)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-188'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.lateMinutes <= 10) {
            return { triggered: true, severity: SEVERITY.WARNING, deduction: 0, lateMinutes: base.lateMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 1, approvalNo: 'HR-2026-ATT-001' }
      },
      {
        id: 'hr-rule-att-190',
        rCode: 'R-190',
        name: '迟到-罚款级(≥10min且<30min扣20)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-188'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.lateMinutes >= 10 && base.lateMinutes < 30) {
            return { triggered: true, severity: SEVERITY.FINE, deduction: 20, lateMinutes: base.lateMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 1, approvalNo: 'HR-2026-ATT-001' }
      },
      {
        id: 'hr-rule-att-191',
        rCode: 'R-191',
        name: '迟到-旷工级(≥30min记旷工0.5天)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-188'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.lateMinutes >= 30) {
            return { triggered: true, severity: SEVERITY.DEDUCT, deduction: 0, absentDays: 0.5, lateMinutes: base.lateMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 1, approvalNo: 'HR-2026-ATT-001' }
      },
      {
        id: 'hr-rule-att-192',
        rCode: 'R-192',
        name: '早退识别-基础',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { checkOutMinutes, offDutyMinutes, grace } = ctx;
          if (checkOutMinutes == null || offDutyMinutes == null) return { triggered: false };
          const earlyMin = (offDutyMinutes - (grace || 0)) - checkOutMinutes;
          if (earlyMin <= 0) return { triggered: false };
          return { triggered: true, earlyMinutes: earlyMin };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 2, approvalNo: 'HR-2026-ATT-002' }
      },
      {
        id: 'hr-rule-att-193',
        rCode: 'R-193',
        name: '早退-警告级(≤10min)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-192'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.earlyMinutes <= 10) {
            return { triggered: true, severity: SEVERITY.WARNING, deduction: 0, earlyMinutes: base.earlyMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 2, approvalNo: 'HR-2026-ATT-002' }
      },
      {
        id: 'hr-rule-att-194',
        rCode: 'R-194',
        name: '早退-罚款级(≥10min且<30min扣20)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-192'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.earlyMinutes >= 10 && base.earlyMinutes < 30) {
            return { triggered: true, severity: SEVERITY.FINE, deduction: 20, earlyMinutes: base.earlyMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 2, approvalNo: 'HR-2026-ATT-002' }
      },
      {
        id: 'hr-rule-att-195',
        rCode: 'R-195',
        name: '早退-旷工级(≥30min记旷工0.5天)',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx, results) => {
          const base = results['R-192'];
          if (!base || !base.triggered) return { triggered: false };
          if (base.earlyMinutes >= 30) {
            return { triggered: true, severity: SEVERITY.DEDUCT, deduction: 0, absentDays: 0.5, earlyMinutes: base.earlyMinutes };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 2, approvalNo: 'HR-2026-ATT-002' }
      },
      {
        id: 'hr-rule-att-196',
        rCode: 'R-196',
        name: '缺卡识别-MISSING_PUNCH',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { isMissing, makeupApprovalNo, missingPunchCount } = ctx;
          if (!isMissing) return { triggered: false };
          if (makeupApprovalNo) {
            return { triggered: true, severity: SEVERITY.WARNING, deduction: 0, missingPunchCount: missingPunchCount || 1, exempt: true, makeupApprovalNo, reason: '补卡审批豁免' };
          }
          const count = missingPunchCount || 1;
          return { triggered: true, severity: SEVERITY.FINE, deduction: 50, missingPunchCount: count };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 3, approvalNo: 'HR-2026-ATT-003' }
      },
      {
        id: 'hr-rule-att-197',
        rCode: 'R-197',
        name: '全日旷工识别-ABSENT',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { isMissing, checkInTime, checkOutTime, leaveApprovalNo, businessTripNo, makeupApprovalNo, isWorkDay } = ctx;
          if (!isWorkDay) return { triggered: false };
          if (leaveApprovalNo || businessTripNo || makeupApprovalNo) return { triggered: false };
          const noIn = !checkInTime;
          const noOut = !checkOutTime;
          if (isMissing && noIn && noOut) {
            return { triggered: true, severity: SEVERITY.DEDUCT, absentDays: 1, deduction: 0 };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 4, approvalNo: 'HR-2026-ATT-004' }
      },
      {
        id: 'hr-rule-att-198',
        rCode: 'R-198',
        name: '平日加班识别-OT_WORKDAY',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { checkOutMinutes, offDutyMinutes, dateStr, isWorkDay } = ctx;
          if (!isWorkDay || checkOutMinutes == null || offDutyMinutes == null) return { triggered: false };
          const otMinutes = checkOutMinutes - offDutyMinutes;
          if (otMinutes >= 120) {
            return { triggered: true, severity: SEVERITY.DEDUCT, otHours: Math.floor(otMinutes / 60), rate: 1.5, deduction: 0 };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 5, approvalNo: 'HR-2026-ATT-005' }
      },
      {
        id: 'hr-rule-att-199',
        rCode: 'R-199',
        name: '周末加班识别-OT_WEEKEND',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { checkInTime, checkOutTime, dateStr, isHoliday } = ctx;
          if (!checkInTime || !checkOutTime) return { triggered: false };
          if (isHoliday) return { triggered: false };
          if (isWeekend(dateStr)) {
            const inMin = getDateMinutes(checkInTime);
            const outMin = getDateMinutes(checkOutTime);
            const otMinutes = outMin - inMin;
            if (otMinutes > 0) {
              return { triggered: true, severity: SEVERITY.DEDUCT, otHours: Number((otMinutes / 60).toFixed(1)), rate: 2.0, deduction: 0 };
            }
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 5, approvalNo: 'HR-2026-ATT-006' }
      },
      {
        id: 'hr-rule-att-200',
        rCode: 'R-200',
        name: '节假日加班识别-OT_HOLIDAY',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { checkInTime, checkOutTime, dateStr, isHoliday } = ctx;
          if (!checkInTime || !checkOutTime) return { triggered: false };
          if (isHoliday) {
            const inMin = getDateMinutes(checkInTime);
            const outMin = getDateMinutes(checkOutTime);
            const otMinutes = outMin - inMin;
            if (otMinutes > 0) {
              return { triggered: true, severity: SEVERITY.DEDUCT, otHours: Number((otMinutes / 60).toFixed(1)), rate: 3.0, deduction: 0 };
            }
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 5, approvalNo: 'HR-2026-ATT-007' }
      },
      {
        id: 'hr-rule-att-201',
        rCode: 'R-201',
        name: '假期审批识别-LEAVE系列',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { leaveApprovalNo } = ctx;
          if (!leaveApprovalNo) return { triggered: false };
          const leaveType = getLeaveTypeByPrefix(leaveApprovalNo);
          if (leaveType) {
            return { triggered: true, severity: SEVERITY.WARNING, leaveType, deduction: 0, approvalNo: leaveApprovalNo };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 6, approvalNo: 'HR-2026-ATT-008' }
      },
      {
        id: 'hr-rule-att-202',
        rCode: 'R-202',
        name: '外勤出差未审批-UNAPPROVED_FIELDWORK',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { fieldWorkFlag, businessTripNo, leaveApprovalNo } = ctx;
          if (!fieldWorkFlag) return { triggered: false };
          if (!businessTripNo && !leaveApprovalNo) {
            return { triggered: true, severity: SEVERITY.FINE, deduction: 0 };
          }
          return { triggered: false };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 7, approvalNo: 'HR-2026-ATT-009' }
      },
      {
        id: 'hr-rule-att-203',
        rCode: 'R-203',
        name: '批量规则-同员工当月迟到≥3次叠加扣款',
        category: RULE_CATEGORIES.ATTENDANCE,
        formula: (ctx) => {
          const { lateCountThisMonth } = ctx;
          if (!lateCountThisMonth || lateCountThisMonth < 3) return { triggered: false };
          const extraDeduction = 20;
          return { triggered: true, severity: SEVERITY.FINE, deduction: extraDeduction, batchRule: true, lateCount: lateCountThisMonth };
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: { documentName: '康源集团考勤管理制度2026版', page: 8, approvalNo: 'HR-2026-ATT-010' }
      }
    ];

    this.ruleEngine.batchRegisterRules(rules);
    this._rulesRegistered = true;
  }

  _buildRuleContext(record, attendanceGroup, counters = {}) {
    const shift = attendanceGroup ? attendanceGroup.shift : { onDutyTime: '09:00', offDutyTime: '18:00', graceLateMinutes: 5, graceEarlyLeaveMinutes: 5 };
    const graceLate = shift.graceLateMinutes || 0;
    const graceEarly = shift.graceEarlyLeaveMinutes || 0;

    const onDutyMin = parseTimeToMinutes(shift.onDutyTime);
    const offDutyMin = parseTimeToMinutes(shift.offDutyTime);
    const checkInMin = getDateMinutes(record.checkInTime);
    const checkOutMin = getDateMinutes(record.checkOutTime);
    const dateStr = record.date;
    const isWorkDay = !isWeekend(dateStr) && !this.isHoliday(dateStr);
    const isHoliday = this.isHoliday(dateStr);

    return {
      dateStr,
      checkInMinutes: checkInMin,
      checkOutMinutes: checkOutMin,
      onDutyMinutes: onDutyMin,
      offDutyMinutes: offDutyMin,
      grace: graceLate,
      graceEarly,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      isMissing: !!record.isMissing,
      makeupApprovalNo: record.makeupApprovalNo,
      leaveApprovalNo: record.leaveApprovalNo,
      businessTripNo: record.businessTripNo,
      fieldWorkFlag: !!record.fieldWorkFlag,
      isWorkDay,
      isHoliday,
      missingPunchCount: counters.missingPunchCount || 1,
      lateCountThisMonth: counters.lateCountThisMonth || 0
    };
  }

  _createAnomalyRecord({ employeeId, date, type, severity, deduction = 0, ruleCodes = [], approvalNo = null, makeupApprovalNo = null, extra = {} }) {
    return {
      anomalyId: generateAnomalyId(),
      employeeId,
      date,
      type,
      typeName: ANOMALY_NAMES[type] || `未知(${type})`,
      severity,
      ruleVersion: this.ruleVersion,
      ruleCodes,
      deduction: Number(deduction) || 0,
      approvalNo,
      makeupApprovalNo,
      ...extra
    };
  }

  _createDeductionItem({ anomalyId, employeeId, date, type, amount, reason, ruleCode }) {
    return {
      deductionId: `DED_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`,
      anomalyId,
      employeeId,
      date,
      type,
      typeName: ANOMALY_NAMES[type] || `未知(${type})`,
      amount: Number(amount) || 0,
      reason,
      ruleCode
    };
  }

  async detectAnomalies({ employee, monthRecords, attendanceGroup, approvals = [] }) {
    this._registerAttendanceRules();

    const anomalies = [];
    const deductions = [];
    const employeeId = employee ? (employee.id || employee.employeeId) : null;

    const approvalMap = new Map();
    for (const a of approvals) {
      if (a && a.approvalNo) {
        approvalMap.set(a.approvalNo, a);
      }
    }

    let runningMissingPunchCount = 0;
    let runningLateCount = 0;
    const records = Array.isArray(monthRecords) ? monthRecords : [];
    const sortedRecords = [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    for (const record of sortedRecords) {
      const rec = (record instanceof PunchDayRecord) ? record : new PunchDayRecord(record);
      const recEmpId = rec.employeeId || employeeId;

      if (rec.makeupApprovalNo && rec.isMissing) {
      } else if (rec.isMissing) {
        runningMissingPunchCount++;
      }

      const ctx = this._buildRuleContext(rec, attendanceGroup, {
        missingPunchCount: runningMissingPunchCount,
        lateCountThisMonth: runningLateCount
      });

      const ruleCodesToExec = ['R-188', 'R-189', 'R-190', 'R-191', 'R-192', 'R-193', 'R-194', 'R-195', 'R-196', 'R-197', 'R-198', 'R-199', 'R-200', 'R-201', 'R-202'];
      const execResult = await this.ruleEngine.executeRules(ruleCodesToExec, ctx);
      const results = execResult.results;

      const triggeredLate = results['R-188'] && results['R-188'].triggered;
      if (triggeredLate) runningLateCount++;

      if (triggeredLate) {
        let matchedRule = null;
        let matchedRCode = null;
        if (results['R-189'] && results['R-189'].triggered) { matchedRule = results['R-189']; matchedRCode = 'R-189'; }
        else if (results['R-190'] && results['R-190'].triggered) { matchedRule = results['R-190']; matchedRCode = 'R-190'; }
        else if (results['R-191'] && results['R-191'].triggered) { matchedRule = results['R-191']; matchedRCode = 'R-191'; }

        if (matchedRule) {
          const anomaly = this._createAnomalyRecord({
            employeeId: recEmpId,
            date: rec.date,
            type: ATTENDANCE_ANOMALY.LATE,
            severity: matchedRule.severity,
            deduction: matchedRule.deduction || 0,
            ruleCodes: ['R-188', matchedRCode],
            makeupApprovalNo: rec.makeupApprovalNo,
            extra: { lateMinutes: matchedRule.lateMinutes, absentDays: matchedRule.absentDays || 0 }
          });
          anomalies.push(anomaly);

          if (matchedRule.deduction > 0) {
            deductions.push(this._createDeductionItem({
              anomalyId: anomaly.anomalyId,
              employeeId: recEmpId,
              date: rec.date,
              type: ATTENDANCE_ANOMALY.LATE,
              amount: matchedRule.deduction,
              reason: `迟到${matchedRule.lateMinutes}分钟罚款`,
              ruleCode: matchedRCode
            }));
          }

          if (runningLateCount >= 3) {
            const batchCtx = { ...ctx, lateCountThisMonth: runningLateCount };
            const batchResult = await this.ruleEngine.executeRules(['R-203'], batchCtx);
            const batchRule = batchResult.results['R-203'];
            if (batchRule && batchRule.triggered) {
              const batchAnomaly = this._createAnomalyRecord({
                employeeId: recEmpId,
                date: rec.date,
                type: ATTENDANCE_ANOMALY.LATE,
                severity: batchRule.severity,
                deduction: batchRule.deduction || 0,
                ruleCodes: ['R-203'],
                extra: { lateMinutes: matchedRule.lateMinutes, batchRule: true, lateCount: runningLateCount }
              });
              anomalies.push(batchAnomaly);
              if (batchRule.deduction > 0) {
                deductions.push(this._createDeductionItem({
                  anomalyId: batchAnomaly.anomalyId,
                  employeeId: recEmpId,
                  date: rec.date,
                  type: ATTENDANCE_ANOMALY.LATE,
                  amount: batchRule.deduction,
                  reason: `当月第${runningLateCount}次迟到，批量规则叠加扣款`,
                  ruleCode: 'R-203'
                }));
              }
            }
          }
        }
      }

      const triggeredEarly = results['R-192'] && results['R-192'].triggered;
      if (triggeredEarly) {
        let matchedRule = null;
        let matchedRCode = null;
        if (results['R-193'] && results['R-193'].triggered) { matchedRule = results['R-193']; matchedRCode = 'R-193'; }
        else if (results['R-194'] && results['R-194'].triggered) { matchedRule = results['R-194']; matchedRCode = 'R-194'; }
        else if (results['R-195'] && results['R-195'].triggered) { matchedRule = results['R-195']; matchedRCode = 'R-195'; }

        if (matchedRule) {
          const anomaly = this._createAnomalyRecord({
            employeeId: recEmpId,
            date: rec.date,
            type: ATTENDANCE_ANOMALY.EARLY_LEAVE,
            severity: matchedRule.severity,
            deduction: matchedRule.deduction || 0,
            ruleCodes: ['R-192', matchedRCode],
            makeupApprovalNo: rec.makeupApprovalNo,
            extra: { earlyMinutes: matchedRule.earlyMinutes, absentDays: matchedRule.absentDays || 0 }
          });
          anomalies.push(anomaly);

          if (matchedRule.deduction > 0) {
            deductions.push(this._createDeductionItem({
              anomalyId: anomaly.anomalyId,
              employeeId: recEmpId,
              date: rec.date,
              type: ATTENDANCE_ANOMALY.EARLY_LEAVE,
              amount: matchedRule.deduction,
              reason: `早退${matchedRule.earlyMinutes}分钟罚款`,
              ruleCode: matchedRCode
            }));
          }
        }
      }

      const missingRule = results['R-196'];
      if (missingRule && missingRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.MISSING_PUNCH,
          severity: missingRule.severity,
          deduction: missingRule.deduction || 0,
          ruleCodes: ['R-196'],
          makeupApprovalNo: rec.makeupApprovalNo,
          extra: { missingPunchCount: missingRule.missingPunchCount, exempt: !!missingRule.exempt }
        });
        anomalies.push(anomaly);

        if (missingRule.deduction > 0) {
          deductions.push(this._createDeductionItem({
            anomalyId: anomaly.anomalyId,
            employeeId: recEmpId,
            date: rec.date,
            type: ATTENDANCE_ANOMALY.MISSING_PUNCH,
            amount: missingRule.deduction,
            reason: `第${missingRule.missingPunchCount}次缺卡罚款`,
            ruleCode: 'R-196'
          }));
        }
      }

      const absentRule = results['R-197'];
      if (absentRule && absentRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.ABSENT,
          severity: absentRule.severity,
          deduction: absentRule.deduction || 0,
          ruleCodes: ['R-197'],
          approvalNo: rec.leaveApprovalNo,
          extra: { absentDays: absentRule.absentDays || 1 }
        });
        anomalies.push(anomaly);
      }

      const otWorkdayRule = results['R-198'];
      if (otWorkdayRule && otWorkdayRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.OT_WORKDAY,
          severity: otWorkdayRule.severity,
          deduction: 0,
          ruleCodes: ['R-198'],
          extra: { otHours: otWorkdayRule.otHours, rate: otWorkdayRule.rate }
        });
        anomalies.push(anomaly);
      }

      const otWeekendRule = results['R-199'];
      if (otWeekendRule && otWeekendRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.OT_WEEKEND,
          severity: otWeekendRule.severity,
          deduction: 0,
          ruleCodes: ['R-199'],
          extra: { otHours: otWeekendRule.otHours, rate: otWeekendRule.rate }
        });
        anomalies.push(anomaly);
      }

      const otHolidayRule = results['R-200'];
      if (otHolidayRule && otHolidayRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.OT_HOLIDAY,
          severity: otHolidayRule.severity,
          deduction: 0,
          ruleCodes: ['R-200'],
          extra: { otHours: otHolidayRule.otHours, rate: otHolidayRule.rate }
        });
        anomalies.push(anomaly);
      }

      const leaveRule = results['R-201'];
      if (leaveRule && leaveRule.triggered && leaveRule.leaveType) {
        const leaveType = leaveRule.leaveType;
        const approvalFromMap = approvalMap.get(rec.leaveApprovalNo);
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: leaveType,
          severity: SEVERITY.WARNING,
          deduction: 0,
          ruleCodes: ['R-201'],
          approvalNo: rec.leaveApprovalNo,
          extra: { leaveType, approvalDetail: approvalFromMap || null }
        });
        anomalies.push(anomaly);
      }

      const unapprovedFieldRule = results['R-202'];
      if (unapprovedFieldRule && unapprovedFieldRule.triggered) {
        const anomaly = this._createAnomalyRecord({
          employeeId: recEmpId,
          date: rec.date,
          type: ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK,
          severity: unapprovedFieldRule.severity,
          deduction: unapprovedFieldRule.deduction || 0,
          ruleCodes: ['R-202'],
          extra: { fieldWorkFlag: true }
        });
        anomalies.push(anomaly);
      }
    }

    const totalDeduction = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

    return {
      anomalies,
      deductions,
      totalDeduction,
      summary: {
        anomalyCountByType: this._countByType(anomalies),
        totalDeduction,
        employeeId
      }
    };
  }

  _countByType(anomalies) {
    const count = {};
    for (const a of anomalies) {
      count[a.type] = (count[a.type] || 0) + 1;
    }
    return count;
  }
}

module.exports = {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES,
  SEVERITY,
  LEAVE_TYPE_MAP,
  AttendanceAnomalyEngine,
  parseTimeToMinutes,
  getDateMinutes,
  isWeekend,
  getLeaveTypeByPrefix,
  generateAnomalyId
};
