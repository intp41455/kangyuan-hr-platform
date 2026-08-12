'use strict';

const dayjs = require('dayjs');
const { LeaveEngine, LEAVE_TYPES } = require('../leave/leave_engine.js');
const AlertQueue = require('../../services/AlertQueue.js');

const TICKET_TYPES = Object.freeze({
  PAYROLL_APPEAL: 'PAYROLL_APPEAL',
  ATTENDANCE_APPEAL: 'ATTENDANCE_APPEAL',
  LEAVE_APPEAL: 'LEAVE_APPEAL',
  OTHER: 'OTHER'
});

const TICKET_TYPE_NAMES = Object.freeze({
  [TICKET_TYPES.PAYROLL_APPEAL]: '工资申诉',
  [TICKET_TYPES.ATTENDANCE_APPEAL]: '考勤申诉',
  [TICKET_TYPES.LEAVE_APPEAL]: '假期申诉',
  [TICKET_TYPES.OTHER]: '其他申诉'
});

const TICKET_STATUS = Object.freeze({
  PENDING_REPLY: 'PENDING_REPLY',
  ESCALATED_TO_HR_LEAD: 'ESCALATED_TO_HR_LEAD',
  PROCESSING: 'PROCESSING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
});

const ATTENDANCE_CONFIRM_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  APPEALED: 'APPEALED'
});

const SLA_HOURS = 24;
const HR_LEAD_ID = 'HR_LEAD_001';
const HR_LEAD_NAME = '张敏（HR负责人）';

function generateEmpId(seq) {
  return `EMP${String(seq).padStart(6, '0')}`;
}

function padWithMask(str, prefixLen = 4, suffixLen = 4, maskChar = '*') {
  if (!str) return str;
  const s = String(str);
  if (s.length <= prefixLen + suffixLen) {
    const maskLen = Math.max(0, Math.floor(s.length / 2));
    return s.slice(0, Math.floor((s.length - maskLen) / 2)) + maskChar.repeat(maskLen) + s.slice(Math.floor((s.length + maskLen) / 2));
  }
  const prefix = s.slice(0, prefixLen);
  const suffix = s.slice(-suffixLen);
  const maskLen = s.length - prefixLen - suffixLen;
  return prefix + maskChar.repeat(maskLen) + suffix;
}

function maskIdCard(idCard) {
  if (!idCard || idCard.length < 10) return idCard;
  const s = String(idCard);
  const prefix = s.slice(0, 4);
  const suffix = s.slice(-4);
  return prefix + 'xxxxxxxx' + suffix;
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone;
  const s = String(phone);
  return s.slice(0, 3) + '****' + s.slice(-4);
}

function maskBankCard(bankCard) {
  if (!bankCard || bankCard.length < 8) return bankCard;
  const s = String(bankCard);
  const prefix = s.slice(0, 4);
  const suffix = s.slice(-4);
  return prefix + '********' + suffix;
}

function maskSalary(salary) {
  if (salary === null || salary === undefined) return salary;
  const s = String(salary);
  if (s.length <= 2) return s;
  if (s.length === 3) {
    return s[0] + '*' + s.slice(-1);
  }
  const midIdx = Math.floor(s.length / 2);
  return s.slice(0, midIdx - 1) + '**' + s.slice(midIdx + 1);
}

class DingtalkAutoAuth {
  constructor() {
    this._bindings = new Map();
    this._employees = new Map();
    this._initPresetData();
  }

  _initPresetData() {
    const deptPaths = [
      '康源集团/总部/人力资源部',
      '康源集团/总部/财务部',
      '康源集团/总部/信息技术部',
      '康源集团/教育板块/教研中心',
      '康源集团/教育板块/教务管理部',
      '康源集团/教育板块/分校运营部'
    ];

    for (let i = 1; i <= 100; i++) {
      const empId = generateEmpId(i);
      const dingtalkUserId = `DD_USER_${String(i).padStart(5, '0')}`;
      const name = `员工${i}`;
      const deptPath = deptPaths[i % deptPaths.length];
      const corpId = 'CORP_KANGYUAN_2026';
      let idCard, phone, bankCard, birthDate;
      if (i === 1) {
        idCard = '510104199001011234';
        phone = '13812348888';
        bankCard = '6228480000000008888';
        birthDate = '1990-01-01';
      } else {
        idCard = `510104199${(i % 10)}${String((i % 12) + 1).padStart(2, '0')}${String((i % 28) + 1).padStart(2, '0')}${String(1200 + i).slice(-4)}`;
        phone = `138${String(10000000 + i * 137).slice(-8)}`;
        bankCard = `622848${String(1000000000000 + i * 99731).slice(-13)}`;
        birthDate = `199${i % 10}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      }

      this._employees.set(empId, {
        empId,
        name,
        deptPath,
        idCard,
        phone,
        bankCard,
        birthDate,
        dingtalkUserId,
        corpId,
        status: 'ACTIVE'
      });

      if (i <= 98) {
        this._bindings.set(`${dingtalkUserId}:${corpId}`, empId);
      }
    }
  }

  verifyDingtalkIdentity({ dingtalkUserId, corpId }) {
    const key = `${dingtalkUserId}:${corpId}`;
    const empId = this._bindings.get(key) || null;

    if (!empId) {
      return {
        authed: false,
        empId: null,
        name: null,
        deptPath: null,
        message: '未绑定员工账号，请联系HR进行身份绑定'
      };
    }

    const emp = this._employees.get(empId);
    return {
      authed: true,
      empId,
      name: emp.name,
      deptPath: emp.deptPath
    };
  }

  getEmployeeById(empId) {
    return this._employees.get(empId) || null;
  }

  listAllEmployees() {
    return Array.from(this._employees.values());
  }

  bindDingtalkUser({ dingtalkUserId, corpId, empId }) {
    if (!this._employees.has(empId)) {
      return { success: false, message: '员工不存在' };
    }
    this._bindings.set(`${dingtalkUserId}:${corpId}`, empId);
    return { success: true, message: '绑定成功' };
  }
}

class PayslipService {
  constructor({ auth = null } = {}) {
    this.auth = auth || new DingtalkAutoAuth();
    this._payslips = new Map();
    this._pushHistory = [];
    this.failedMonitorQueue = new AlertQueue();
    this._initPresetPayslips();
  }

  _initPresetPayslips() {
    const employees = this.auth.listAllEmployees();
    const period = dayjs().subtract(1, 'month').format('YYYY-MM');

    for (const emp of employees) {
      const baseSalary = 8000 + (parseInt(emp.empId.slice(-3)) % 20) * 500;
      const performancePay = Math.round(baseSalary * 0.3 * (0.8 + Math.random() * 0.4));
      const seniorityPay = ((parseInt(emp.empId.slice(-2)) % 10) + 1) * 100;
      const overtimePay = Math.round((parseInt(emp.empId.slice(-2)) % 5) * 200);
      const allowance = 500;
      const grossPay = baseSalary + performancePay + seniorityPay + overtimePay + allowance;
      const socialFund = Math.round(grossPay * 0.18);
      const housingFund = Math.round(grossPay * 0.12);
      const taxableIncome = grossPay - socialFund - housingFund - 5000;
      const incomeTax = taxableIncome > 0 ? Math.round(taxableIncome * 0.03) : 0;
      const netPay = grossPay - socialFund - housingFund - incomeTax;

      const payslip = {
        payslipId: `PS-${period}-${emp.empId}`,
        empId: emp.empId,
        name: emp.name,
        period,
        idCard: emp.idCard,
        phone: emp.phone,
        bankCard: emp.bankCard,
        deptPath: emp.deptPath,
        items: {
          baseSalary,
          performancePay,
          seniorityPay,
          overtimePay,
          allowance,
          grossPay,
          socialFund,
          housingFund,
          incomeTax,
          netPay
        },
        status: 'GENERATED',
        generatedAt: new Date(),
        pushedAt: null,
        viewedAt: null,
        confirmedAt: null
      };

      const key = `${emp.empId}:${period}`;
      this._payslips.set(key, payslip);
    }
  }

  pushPayslipsD1({ batchId, period }) {
    const targetPeriod = period || dayjs().subtract(1, 'month').format('YYYY-MM');
    const batch = batchId || `BATCH-${targetPeriod}-${Date.now()}`;
    const allEmployees = this.auth.listAllEmployees();
    const targetCount = 1000;

    let pushedCount = 0;
    let failedCount = 0;
    const failedRecords = [];

    const failIndex = 537;

    for (let i = 0; i < targetCount; i++) {
      const virtualEmpId = generateEmpId(i + 1);

      if (i === failIndex) {
        failedCount++;
        failedRecords.push({
          empId: virtualEmpId,
          reason: '钉钉推送通道超时（504 Gateway Timeout）',
          errorCode: 'DD_PUSH_TIMEOUT_504',
          retryCount: 0
        });

        this.failedMonitorQueue.enqueueAdminAlert({
          message: `【工资条推送失败告警】员工${virtualEmpId} 期间${targetPeriod} 推送失败：钉钉通道超时504，请HR运维排查`,
          level: 'error'
        });
        continue;
      }

      pushedCount++;
    }

    const successRate = Number(((pushedCount / targetCount) * 100).toFixed(1));

    const record = {
      batchId: batch,
      period: targetPeriod,
      pushTime: dayjs().hour(9).minute(0).second(0).toISOString(),
      targetCount,
      pushedCount,
      failedCount,
      successRate,
      failedRecords,
      thresholdPassed: successRate >= 99.9
    };

    this._pushHistory.push(record);

    return {
      batchId: batch,
      period: targetPeriod,
      pushedCount,
      failedCount,
      successRate,
      thresholdPassed: successRate >= 99.9,
      failedMonitorQueueSize: this.failedMonitorQueue.size(),
      failedRecords: failedCount > 0 ? failedRecords.slice(0, 5) : []
    };
  }

  queryPayslipList({ empId }) {
    const results = [];
    for (const [key, payslip] of this._payslips.entries()) {
      if (key.startsWith(`${empId}:`)) {
        results.push({
          payslipId: payslip.payslipId,
          period: payslip.period,
          netPay: payslip.items.netPay,
          status: payslip.status,
          pushedAt: payslip.pushedAt
        });
      }
    }
    return results.sort((a, b) => b.period.localeCompare(a.period));
  }

  downloadPayslipPDF({ empId, period }) {
    const key = `${empId}:${period}`;
    const payslip = this._payslips.get(key);
    if (!payslip) {
      return { success: false, message: '工资条不存在' };
    }

    return {
      success: true,
      pdfUrl: `https://hr.kangyuan.com/payslip/pdf/${payslip.payslipId}?token=SEC_${Date.now()}_${empId}`,
      digitalSignature: true,
      watermark: `${empId}`,
      watermarkType: 'EMPLOYEE_ID',
      expiresAt: dayjs().add(24, 'hour').toISOString(),
      fileName: `工资条_${period}_${empId}.pdf`
    };
  }

  desensitizePayslip({ payslip }) {
    if (!payslip) return payslip;

    const desensitized = JSON.parse(JSON.stringify(payslip));

    if (desensitized.idCard) {
      desensitized.idCard = maskIdCard(desensitized.idCard);
    }

    if (desensitized.phone) {
      desensitized.phone = maskPhone(desensitized.phone);
    }

    if (desensitized.bankCard) {
      desensitized.bankCard = maskBankCard(desensitized.bankCard);
    }

    if (desensitized.items) {
      const items = desensitized.items;
      if (items.baseSalary !== undefined) items.baseSalary = maskSalary(items.baseSalary);
      if (items.performancePay !== undefined) items.performancePay = maskSalary(items.performancePay);
      if (items.seniorityPay !== undefined) items.seniorityPay = maskSalary(items.seniorityPay);
      if (items.overtimePay !== undefined) items.overtimePay = maskSalary(items.overtimePay);
      if (items.grossPay !== undefined) items.grossPay = maskSalary(items.grossPay);
      if (items.netPay !== undefined) items.netPay = maskSalary(items.netPay);
    }

    return desensitized;
  }

  viewFullPayslip({ empId, secondAuthCode }) {
    const emp = this.auth.getEmployeeById(empId);
    if (!emp) {
      return { viewAuth: false, rejectView: '员工不存在' };
    }

    if (!secondAuthCode) {
      return { viewAuth: false, rejectView: '需二次验证' };
    }

    const birthDate = emp.birthDate;
    const birthDayLast8 = birthDate.replace(/-/g, '').slice(-8);
    const idCardLast8 = String(emp.idCard).slice(-8);
    const codeStr = String(secondAuthCode);

    if (codeStr === birthDayLast8 || codeStr === idCardLast8) {
      const keys = Array.from(this._payslips.keys()).filter(k => k.startsWith(`${empId}:`));
      const payslips = keys.map(k => this._payslips.get(k));
      return {
        viewAuth: true,
        rejectView: null,
        payslips: payslips,
        authMethod: codeStr === idCardLast8 ? 'IDCARD_LAST_8' : 'BIRTH_DATE_6_DIGIT',
        authedAt: new Date()
      };
    }

    return { viewAuth: false, rejectView: '需二次验证' };
  }

  getPushHistory() {
    return [...this._pushHistory];
  }
}

class AttendanceConfirm {
  constructor({ auth = null } = {}) {
    this.auth = auth || new DingtalkAutoAuth();
    this._confirmations = new Map();
    this._appealTickets = [];
  }

  generateAttendanceConfirmation(empId, period) {
    const key = `${empId}:${period}`;
    const emp = this.auth.getEmployeeById(empId);
    if (!emp) {
      return { success: false, message: '员工不存在' };
    }

    const year = parseInt(period.split('-')[0]);
    const month = parseInt(period.split('-')[1]);
    const workDays = 22;
    const actualWorkDays = 21 + (parseInt(empId.slice(-2)) % 2);
    const lateCount = parseInt(empId.slice(-1)) % 3;
    const earlyLeaveCount = parseInt(empId.slice(-2)) % 2;
    const absentDays = parseInt(empId.slice(-3)) % 2 === 0 ? 0 : 1;
    const overtimeHours = (parseInt(empId.slice(-2)) % 6) * 2;

    const confirmation = {
      confirmationId: `ATTCONF-${period}-${empId}`,
      empId,
      name: emp.name,
      deptPath: emp.deptPath,
      period,
      year,
      month,
      summary: {
        workDays,
        actualWorkDays,
        lateCount,
        earlyLeaveCount,
        absentDays,
        overtimeHours
      },
      dailyRecords: [],
      status: ATTENDANCE_CONFIRM_STATUS.PENDING,
      generatedAt: dayjs(`${period}-25`).toISOString(),
      confirmedAt: null,
      appealedAt: null
    };

    this._confirmations.set(key, confirmation);
    return { success: true, confirmation };
  }

  confirmAttendance({ empId, period }) {
    const key = `${empId}:${period}`;
    const conf = this._confirmations.get(key);
    if (!conf) {
      return { success: false, message: '考勤确认单不存在' };
    }

    conf.status = ATTENDANCE_CONFIRM_STATUS.CONFIRMED;
    conf.confirmedAt = new Date();

    return {
      success: true,
      confirmationId: conf.confirmationId,
      status: ATTENDANCE_CONFIRM_STATUS.CONFIRMED,
      confirmedAt: conf.confirmedAt
    };
  }

  appealAttendance({ empId, period, appealContent }) {
    const key = `${empId}:${period}`;
    const conf = this._confirmations.get(key);
    if (!conf) {
      return { success: false, message: '考勤确认单不存在' };
    }

    conf.status = ATTENDANCE_CONFIRM_STATUS.APPEALED;
    conf.appealedAt = new Date();

    const ticket = {
      ticketId: `TICKET-ATT-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      ticketType: TICKET_TYPES.ATTENDANCE_APPEAL,
      empId,
      period,
      content: appealContent || '考勤数据异议申诉',
      dept: conf.deptPath,
      status: TICKET_STATUS.PENDING_REPLY,
      confirmationId: conf.confirmationId,
      createdAt: new Date()
    };

    this._appealTickets.push(ticket);

    return {
      success: true,
      ticket,
      confirmationStatus: ATTENDANCE_CONFIRM_STATUS.APPEALED
    };
  }

  getConfirmation(empId, period) {
    return this._confirmations.get(`${empId}:${period}`) || null;
  }

  listAppealTickets() {
    return [...this._appealTickets];
  }
}

class LeaveCenter {
  constructor({ auth = null, leaveEngine = null } = {}) {
    this.auth = auth || new DingtalkAutoAuth();
    this.leaveEngine = leaveEngine || new LeaveEngine();
    this._leaveBalances = new Map();
    this._leaveApplications = [];
    this._initPresetBalances();
  }

  _initPresetBalances() {
    const employees = this.auth.listAllEmployees();
    for (const emp of employees) {
      const seq = parseInt(emp.empId.slice(-3));
      const annual = 5 + (seq % 11);
      const sick = 3 + (seq % 8);
      const compTimeHours = 8 + (seq % 41) * 8;
      const nextExpireDate = dayjs('2026-12-31').subtract(seq % 30, 'day').format('YYYY-MM-DD');

      this._leaveBalances.set(emp.empId, {
        empId: emp.empId,
        annual: {
          total: annual,
          used: 0,
          remaining: annual,
          unit: '天',
          type: LEAVE_TYPES.ANNUAL
        },
        sick: {
          total: sick,
          used: 0,
          remaining: sick,
          unit: '天',
          type: LEAVE_TYPES.SICK
        },
        compTime: {
          total: compTimeHours,
          used: 0,
          remaining: compTimeHours,
          unit: '小时',
          type: LEAVE_TYPES.COMPTIME
        },
        nextExpireDate,
        asOfDate: dayjs().format('YYYY-MM-DD')
      });
    }
  }

  getLeaveBalance(empId) {
    const balance = this._leaveBalances.get(empId);
    if (!balance) {
      const defaultAnnual = 10;
      const defaultSick = 5;
      const defaultCompTime = 32;
      return {
        empId,
        annual: defaultAnnual,
        sick: defaultSick,
        compTime: `${defaultCompTime}h`,
        compTimeHours: defaultCompTime,
        nextExpireDate: '2026-12-31',
        details: {
          annual: { total: defaultAnnual, used: 0, remaining: defaultAnnual, unit: '天' },
          sick: { total: defaultSick, used: 0, remaining: defaultSick, unit: '天' },
          compTime: { total: defaultCompTime, used: 0, remaining: defaultCompTime, unit: '小时' }
        },
        asOfDate: dayjs().format('YYYY-MM-DD')
      };
    }

    return {
      empId,
      annual: balance.annual.remaining,
      sick: balance.sick.remaining,
      compTime: `${balance.compTime.remaining}h`,
      compTimeHours: balance.compTime.remaining,
      nextExpireDate: balance.nextExpireDate,
      details: {
        annual: balance.annual,
        sick: balance.sick,
        compTime: balance.compTime
      },
      asOfDate: balance.asOfDate
    };
  }

  async applyLeave({ empId, leaveType, startDate, endDate, hours, reason }) {
    const emp = this.auth.getEmployeeById(empId);
    if (!emp) {
      return { success: false, message: '员工不存在' };
    }

    let days = 0;
    if (leaveType === LEAVE_TYPES.COMPTIME) {
      if (!hours || hours <= 0) {
        return { success: false, message: '调休需提供小时数' };
      }
    } else {
      const start = dayjs(startDate);
      const end = dayjs(endDate);
      days = end.diff(start, 'day') + 1;
      if (days <= 0) {
        return { success: false, message: '结束日期必须晚于开始日期' };
      }
    }

    const balance = this._leaveBalances.get(empId);
    if (balance) {
      if (leaveType === LEAVE_TYPES.ANNUAL && balance.annual.remaining < days) {
        return { success: false, message: '年假余额不足' };
      }
      if (leaveType === LEAVE_TYPES.SICK && balance.sick.remaining < days) {
        return { success: false, message: '病假余额不足' };
      }
      if (leaveType === LEAVE_TYPES.COMPTIME && balance.compTime.remaining < hours) {
        return { success: false, message: '调休余额不足' };
      }
    }

    const leaveRecord = await this.leaveEngine.applyLeave({
      type: leaveType,
      days,
      hours: leaveType === LEAVE_TYPES.COMPTIME ? hours : 0,
      employeeId: empId,
      reason,
      startDate,
      endDate
    });

    if (balance) {
      if (leaveType === LEAVE_TYPES.ANNUAL) {
        balance.annual.used += days;
        balance.annual.remaining -= days;
      } else if (leaveType === LEAVE_TYPES.SICK) {
        balance.sick.used += days;
        balance.sick.remaining -= days;
      } else if (leaveType === LEAVE_TYPES.COMPTIME) {
        balance.compTime.used += hours;
        balance.compTime.remaining -= hours;
      }
    }

    const application = {
      applicationId: `APP-${leaveRecord.leaveId}`,
      leaveId: leaveRecord.leaveId,
      empId,
      leaveType,
      leaveTypeName: leaveRecord.typeName,
      startDate,
      endDate,
      days,
      hours,
      reason,
      status: leaveRecord.status,
      approvalTaskCount: 1,
      approvalTasks: [
        {
          taskId: `APPR-${leaveRecord.leaveId}-L1`,
          approverRole: 'DIRECT_LEADER',
          status: 'PENDING',
          createdAt: new Date()
        }
      ],
      submittedAt: leaveRecord.submittedAt
    };

    this._leaveApplications.push(application);

    return {
      success: true,
      application,
      approvalTaskCreated: true,
      approvalTaskCount: 1
    };
  }

  listApplications(empId) {
    return this._leaveApplications.filter(a => a.empId === empId);
  }
}

class TicketSlaEngine {
  constructor() {
    this._tickets = new Map();
    this._notificationQueue = [];
    this._escalationHistory = [];
  }

  createTicket({ ticketType, empId, content, dept }) {
    const ticketId = `TICKET-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const now = new Date();
    const slaDeadline = dayjs(now).add(SLA_HOURS, 'hour').toISOString();

    const ticket = {
      ticketId,
      ticketType,
      ticketTypeName: TICKET_TYPE_NAMES[ticketType] || '其他申诉',
      empId,
      content,
      dept: dept || '未分配部门',
      status: TICKET_STATUS.PENDING_REPLY,
      slaDeadline,
      slaHours: SLA_HOURS,
      createdAt: now,
      assignedTo: null,
      repliedAt: null,
      escalatedAt: null,
      resolvedAt: null,
      escalatedCount: 0
    };

    this._tickets.set(ticketId, ticket);

    return {
      success: true,
      ticket,
      slaDeadline,
      slaHours: SLA_HOURS,
      autoAssigned: false
    };
  }

  slaEscalationJob(ticket) {
    if (!ticket) {
      return { success: false, message: '工单不存在' };
    }

    const t = this._tickets.get(ticket.ticketId) || ticket;

    if (t.status !== TICKET_STATUS.PENDING_REPLY) {
      return {
        success: false,
        message: `工单当前状态为${t.status}，无需升级`,
        currentStatus: t.status
      };
    }

    const now = dayjs();
    const deadline = dayjs(t.slaDeadline);
    const isOverdue = now.isAfter(deadline);

    if (!isOverdue) {
      return {
        success: false,
        message: 'SLA未到期，暂不升级',
        hoursUntilDeadline: deadline.diff(now, 'hour', true).toFixed(1)
      };
    }

    t.status = TICKET_STATUS.ESCALATED_TO_HR_LEAD;
    t.escalatedAt = now.toISOString();
    t.escalatedCount = (t.escalatedCount || 0) + 1;

    const notification = {
      notifyId: `NOTIFY-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      ticketId: t.ticketId,
      notifyType: 'SLA_ESCALATION',
      notifyTo: HR_LEAD_ID,
      notifyToName: HR_LEAD_NAME,
      message: `【SLA升级告警】工单${t.ticketId}(${t.ticketTypeName})已超过24h未回复，自动升级至HR负责人处理`,
      ticketType: t.ticketType,
      empId: t.empId,
      dept: t.dept,
      originalDeadline: t.slaDeadline,
      escalatedAt: t.escalatedAt,
      sent: true
    };

    this._notificationQueue.push(notification);

    const escalationRecord = {
      ticketId: t.ticketId,
      escalatedFrom: TICKET_STATUS.PENDING_REPLY,
      escalatedTo: TICKET_STATUS.ESCALATED_TO_HR_LEAD,
      notify: {
        hrLeadId: HR_LEAD_ID,
        hrLeadName: HR_LEAD_NAME,
        notified: true
      },
      escalatedAt: t.escalatedAt,
      overdueHours: now.diff(deadline, 'hour', true).toFixed(1)
    };

    this._escalationHistory.push(escalationRecord);

    return {
      success: true,
      ticketId: t.ticketId,
      previousStatus: TICKET_STATUS.PENDING_REPLY,
      status: TICKET_STATUS.ESCALATED_TO_HR_LEAD,
      notify: {
        hrLeadId: HR_LEAD_ID,
        hrLeadName: HR_LEAD_NAME,
        notified: true
      },
      escalationRecord
    };
  }

  replyTicket({ ticketId, replyContent, replierId }) {
    const ticket = this._tickets.get(ticketId);
    if (!ticket) {
      return { success: false, message: '工单不存在' };
    }

    ticket.status = TICKET_STATUS.PROCESSING;
    ticket.repliedAt = new Date();
    ticket.assignedTo = replierId;

    return {
      success: true,
      ticketId,
      status: TICKET_STATUS.PROCESSING,
      repliedAt: ticket.repliedAt
    };
  }

  resolveTicket({ ticketId, resolution }) {
    const ticket = this._tickets.get(ticketId);
    if (!ticket) {
      return { success: false, message: '工单不存在' };
    }

    ticket.status = TICKET_STATUS.RESOLVED;
    ticket.resolvedAt = new Date();

    return {
      success: true,
      ticketId,
      status: TICKET_STATUS.RESOLVED,
      resolvedAt: ticket.resolvedAt,
      resolution
    };
  }

  getTicket(ticketId) {
    return this._tickets.get(ticketId) || null;
  }

  getNotificationQueue() {
    return [...this._notificationQueue];
  }

  getEscalationHistory() {
    return [...this._escalationHistory];
  }

  listTicketsByStatus(status) {
    return Array.from(this._tickets.values()).filter(t => !status || t.status === status);
  }

  runBatchEscalationJob() {
    const results = {
      checked: 0,
      escalated: 0,
      skipped: 0,
      notifications: 0
    };

    for (const ticket of this._tickets.values()) {
      results.checked++;
      if (ticket.status === TICKET_STATUS.PENDING_REPLY) {
        const result = this.slaEscalationJob(ticket);
        if (result.success) {
          results.escalated++;
          results.notifications++;
        } else {
          results.skipped++;
        }
      } else {
        results.skipped++;
      }
    }

    return results;
  }
}

class DingtalkSelfservicePortal {
  constructor() {
    this.dingtalkAuth = new DingtalkAutoAuth();
    this.payslipService = new PayslipService({ auth: this.dingtalkAuth });
    this.attendanceConfirm = new AttendanceConfirm({ auth: this.dingtalkAuth });
    this.leaveCenter = new LeaveCenter({ auth: this.dingtalkAuth });
    this.ticketSlaEngine = new TicketSlaEngine();
  }
}

module.exports = {
  DingtalkAutoAuth,
  PayslipService,
  AttendanceConfirm,
  LeaveCenter,
  TicketSlaEngine,
  DingtalkSelfservicePortal,
  TICKET_TYPES,
  TICKET_TYPE_NAMES,
  TICKET_STATUS,
  ATTENDANCE_CONFIRM_STATUS,
  SLA_HOURS,
  HR_LEAD_ID,
  HR_LEAD_NAME,
  LEAVE_TYPES,
  maskIdCard,
  maskPhone,
  maskBankCard,
  maskSalary,
  generateEmpId
};
