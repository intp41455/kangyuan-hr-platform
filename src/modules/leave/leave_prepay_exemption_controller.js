'use strict';

const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const AlertQueue = require('../../services/AlertQueue.js');
const { EMPLOYEE_STATUS } = require('../master_data/employee_model.js');

const APPROVAL_NODES = Object.freeze({
  DIRECT_LEADER: 'DIRECT_LEADER',
  DEPT_HEAD: 'DEPT_HEAD',
  VICE_PRESIDENT: 'VICE_PRESIDENT'
});

const APPROVAL_NODE_NAMES = Object.freeze({
  [APPROVAL_NODES.DIRECT_LEADER]: '直属领导',
  [APPROVAL_NODES.DEPT_HEAD]: '部门负责人',
  [APPROVAL_NODES.VICE_PRESIDENT]: '分管副总'
});

const EXEMPTION_TYPES = Object.freeze({
  EXEMPT_PUNCH: 'EXEMPT_PUNCH',
  EXEMPT_OT: 'EXEMPT_OT',
  EXEMPT_LATE: 'EXEMPT_LATE'
});

const EXEMPTION_TYPE_NAMES = Object.freeze({
  [EXEMPTION_TYPES.EXEMPT_PUNCH]: '免打卡',
  [EXEMPTION_TYPES.EXEMPT_OT]: '加班豁免',
  [EXEMPTION_TYPES.EXEMPT_LATE]: '迟到豁免'
});

const EXEMPTION_STATUS = Object.freeze({
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED'
});

class ProbationBlockedError extends Error {
  constructor(message) {
    super(message || '试用期员工不得预支年假');
    this.name = 'ProbationBlockedError';
    this.code = 'PROBATION_BLOCKED';
  }
}

class MissingApprovalError extends Error {
  constructor(message) {
    super(message || '缺少审批单号');
    this.name = 'MissingApprovalError';
    this.code = 'MISSING_APPROVAL';
  }
}

class InvalidExemptionError extends Error {
  constructor(message) {
    super(message || '无效的豁免申请');
    this.name = 'InvalidExemptionError';
    this.code = 'INVALID_EXEMPTION';
  }
}

class PrepayApprovalManager {
  constructor(alertQueue) {
    this.alertQueue = alertQueue || new AlertQueue();
    this._approvalCounter = 0;
  }

  createApproval({ employee, days, reason, approvalForm, approvalChain }) {
    this._approvalCounter += 1;
    const approvalNo = `APP-PREPAY-ANN-${dayjs().format('YYYYMMDD')}-${String(this._approvalCounter).padStart(4, '0')}`;

    return {
      approvalNo,
      employeeId: employee.id,
      employeeName: employee.name,
      days,
      reason,
      approvalForm: approvalForm || null,
      approvalChain: [...approvalChain],
      status: 'PENDING',
      createdAt: new Date()
    };
  }

  resolveApprovalChain({ employee, days }) {
    const chain = [];
    chain.push({ node: APPROVAL_NODES.DIRECT_LEADER, name: APPROVAL_NODE_NAMES[APPROVAL_NODES.DIRECT_LEADER] });
    chain.push({ node: APPROVAL_NODES.DEPT_HEAD, name: APPROVAL_NODE_NAMES[APPROVAL_NODES.DEPT_HEAD] });

    if (days > 5) {
      const hasVpNode = employee && employee.vicePresident !== undefined;
      if (hasVpNode) {
        chain.push({ node: APPROVAL_NODES.VICE_PRESIDENT, name: APPROVAL_NODE_NAMES[APPROVAL_NODES.VICE_PRESIDENT] });
      } else {
        const msg = `预支年假${days}天审批链路缺少分管副总节点，请HR补充`;
        this.alertQueue.enqueueAdminAlert({ level: 'warning', message: msg });
        chain.push({ node: APPROVAL_NODES.VICE_PRESIDENT, name: APPROVAL_NODE_NAMES[APPROVAL_NODES.VICE_PRESIDENT], missing: true });
      }
    }

    return chain;
  }
}

class LeaveBalanceManager {
  constructor() {
    this._balances = new Map();
    this._prepayRecords = [];
  }

  _key(employeeId, year) {
    return `${employeeId}:${year}`;
  }

  ensureBalance(employeeId, year, baseQuota = 0) {
    const key = this._key(employeeId, year);
    if (!this._balances.has(key)) {
      this._balances.set(key, {
        employeeId,
        year,
        baseQuota,
        usedDays: 0,
        prepayUsed: 0,
        prepayGranted: 0,
        updatedAt: new Date()
      });
    }
    return this._balances.get(key);
  }

  getBalance(employeeId, year) {
    const key = this._key(employeeId, year);
    return this._balances.get(key) || null;
  }

  grantPrepay({ employeeId, year, days, approvalNo, effectiveDate = null }) {
    const balance = this.ensureBalance(employeeId, year);
    balance.prepayGranted += days;
    balance.updatedAt = new Date();

    const record = {
      prepayId: `PREPAY-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      employeeId,
      year,
      days,
      approvalNo,
      effectiveDate: effectiveDate || dayjs().format('YYYY-MM-DD'),
      status: 'ACTIVE',
      createdAt: new Date()
    };
    this._prepayRecords.push(record);

    return { balance, record };
  }

  listPrepayRecords(employeeId = null) {
    if (!employeeId) return [...this._prepayRecords];
    return this._prepayRecords.filter(r => r.employeeId === employeeId);
  }
}

class ExemptionManager {
  constructor() {
    this._exemptions = new Map();
    this._retroactiveApprovals = [];
    this._exportHistory = [];
  }

  createExemption({ employeeId, exemptionType, reason, approvalNo, effectiveDate, expireDate }) {
    if (!approvalNo) {
      throw new MissingApprovalError('createExemption缺少必填参数approvalNo');
    }
    if (!employeeId || !exemptionType || !effectiveDate || !expireDate) {
      throw new InvalidExemptionError('createExemption缺少必填参数：employeeId, exemptionType, effectiveDate, expireDate均为必填');
    }
    if (!Object.values(EXEMPTION_TYPES).includes(exemptionType)) {
      throw new InvalidExemptionError(`无效的exemptionType：${exemptionType}，有效值：${Object.values(EXEMPTION_TYPES).join(',')}`);
    }

    const eff = dayjs(effectiveDate);
    const exp = dayjs(expireDate);
    if (exp.isBefore(eff)) {
      throw new InvalidExemptionError('expireDate不能早于effectiveDate');
    }

    const exemptionId = `EXM-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const record = {
      exemptionId,
      employeeId,
      exemptionType,
      exemptionTypeName: EXEMPTION_TYPE_NAMES[exemptionType],
      reason: reason || null,
      approvalNo,
      effectiveDate: eff.format('YYYY-MM-DD'),
      expireDate: exp.format('YYYY-MM-DD'),
      status: EXEMPTION_STATUS.ACTIVE,
      createdAt: new Date()
    };
    this._exemptions.set(exemptionId, record);
    return record;
  }

  retroactiveExemptions(records) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new InvalidExemptionError('retroactiveExemptions需要非空records数组');
    }

    const approvalNo = `APP-RETRO-EXM-${dayjs().format('YYYYMMDD')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const pendingRecords = [];

    for (const rec of records) {
      if (!rec.employeeId || !rec.exemptionType || !rec.effectiveDate || !rec.expireDate) {
        throw new InvalidExemptionError('补录豁免记录缺少必填字段：employeeId, exemptionType, effectiveDate, expireDate');
      }
      const eff = dayjs(rec.effectiveDate);
      const exp = dayjs(rec.expireDate);
      if (exp.isBefore(eff)) {
        throw new InvalidExemptionError(`补录记录expireDate不能早于effectiveDate: employeeId=${rec.employeeId}`);
      }

      const exemptionId = `EXM-PENDING-${Date.now()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const pending = {
        exemptionId,
        employeeId: rec.employeeId,
        exemptionType: rec.exemptionType,
        exemptionTypeName: EXEMPTION_TYPE_NAMES[rec.exemptionType],
        reason: rec.reason || null,
        approvalNo,
        effectiveDate: eff.format('YYYY-MM-DD'),
        expireDate: exp.format('YYYY-MM-DD'),
        status: EXEMPTION_STATUS.PENDING_REVIEW,
        retroApprovalNo: approvalNo,
        createdAt: new Date()
      };
      this._exemptions.set(exemptionId, pending);
      pendingRecords.push(pending);
    }

    const approval = {
      approvalNo,
      type: 'RETROACTIVE_EXEMPTION',
      records: pendingRecords.map(r => r.exemptionId),
      status: 'PENDING',
      createdAt: new Date()
    };
    this._retroactiveApprovals.push(approval);

    return { approvalNo, approval, pendingRecords };
  }

  approveRetroactive(approvalNo) {
    const approval = this._retroactiveApprovals.find(a => a.approvalNo === approvalNo);
    if (!approval) {
      throw new InvalidExemptionError(`未找到补录审批单：${approvalNo}`);
    }
    approval.status = 'APPROVED';
    approval.approvedAt = new Date();

    const activated = [];
    for (const exmId of approval.records) {
      const rec = this._exemptions.get(exmId);
      if (rec && rec.status === EXEMPTION_STATUS.PENDING_REVIEW) {
        rec.status = EXEMPTION_STATUS.ACTIVE;
        activated.push(rec);
      }
    }
    return { approval, activated };
  }

  getExemption(exemptionId) {
    return this._exemptions.get(exemptionId) || null;
  }

  listExemptions({ employeeId = null, status = null, exemptionType = null, asOfDate = null } = {}) {
    const asOf = asOfDate ? dayjs(asOfDate) : dayjs();
    let list = Array.from(this._exemptions.values());

    if (employeeId) list = list.filter(e => e.employeeId === employeeId);
    if (status) list = list.filter(e => e.status === status);
    if (exemptionType) list = list.filter(e => e.exemptionType === exemptionType);

    return list.map(e => {
      const eff = dayjs(e.effectiveDate);
      const exp = dayjs(e.expireDate);
      let displayStatus = e.status;
      if (displayStatus === EXEMPTION_STATUS.ACTIVE && asOf.isAfter(exp, 'day')) {
        displayStatus = EXEMPTION_STATUS.EXPIRED;
      }
      if (displayStatus === EXEMPTION_STATUS.ACTIVE && asOf.isBefore(eff, 'day')) {
        displayStatus = 'NOT_YET_EFFECTIVE';
      }
      return { ...e, displayStatus };
    });
  }

  async exportMonthlyExemptionList({ exportDate = null, outputDir = null } = {}) {
    const now = dayjs(exportDate || new Date());
    const year = now.year();
    const month = now.month() + 1;
    const asOf = now.format('YYYY-MM-DD');

    const activeList = this.listExemptions({ asOfDate: now }).filter(e => {
      return e.displayStatus === EXEMPTION_STATUS.ACTIVE || e.displayStatus === 'NOT_YET_EFFECTIVE';
    });

    const jsonData = activeList.map(e => ({
      employeeId: e.employeeId,
      exemptionType: e.exemptionType,
      effectiveDate: e.effectiveDate,
      expireDate: e.expireDate,
      approvalNo: e.approvalNo
    }));

    const exportTimestamp = now.format('YYYY-MM-DD_HHmmss');
    const dir = outputDir || path.join(process.cwd(), 'exports', 'exemptions');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonFileName = `exemption_list_${year}${String(month).padStart(2, '0')}_${exportTimestamp}.json`;
    const jsonFilePath = path.join(dir, jsonFileName);
    fs.writeFileSync(jsonFilePath, JSON.stringify({
      exportDate: asOf,
      exportMonth: `${year}-${String(month).padStart(2, '0')}`,
      generatedAt: new Date().toISOString(),
      recordCount: jsonData.length,
      records: jsonData
    }, null, 2), 'utf-8');

    const pdfDesc = {
      fileName: `exemption_list_${year}${String(month).padStart(2, '0')}_${exportTimestamp}.pdf`,
      structure: {
        title: `康源集团 ${year}年${month}月 考勤豁免名单`,
        exportDate: asOf,
        headers: ['工号(employeeId)', '豁免类型(exemptionType)', '生效日期(effectiveDate)', '截止日期(expireDate)', '审批单号(approvalNo)'],
        recordCount: jsonData.length,
        sampleRecord: jsonData[0] || null,
        footer: `生成时间: ${new Date().toISOString()} | 导出人: HR_SYSTEM_SCHEDULER`
      }
    };
    const pdfDescFileName = `exemption_list_${year}${String(month).padStart(2, '0')}_${exportTimestamp}_pdf_desc.json`;
    const pdfDescFilePath = path.join(dir, pdfDescFileName);
    fs.writeFileSync(pdfDescFilePath, JSON.stringify(pdfDesc, null, 2), 'utf-8');

    const exportRecord = {
      exportId: `EXP-${Date.now()}`,
      exportDate: asOf,
      month: `${year}-${String(month).padStart(2, '0')}`,
      jsonFilePath,
      pdfDescFilePath,
      recordCount: jsonData.length,
      fields: ['employeeId', 'exemptionType', 'effectiveDate', 'expireDate', 'approvalNo'],
      generatedAt: new Date()
    };
    this._exportHistory.push(exportRecord);

    return exportRecord;
  }

  scheduleMonthlyExport(cronHandler = null) {
    const scheduleInfo = {
      cronExpression: '0 10 1 * *',
      description: '每月1号10:00自动导出当月有效考勤豁免名单',
      fields: ['employeeId', 'exemptionType', 'effectiveDate', 'expireDate', 'approvalNo'],
      outputs: ['JSON数据文件', 'PDF结构描述文件']
    };

    if (typeof cronHandler === 'function') {
      scheduleInfo.registered = true;
      scheduleInfo.handlerType = typeof cronHandler;
    } else {
      scheduleInfo.registered = false;
      scheduleInfo.handlerType = null;
    }

    return scheduleInfo;
  }

  getExportHistory() {
    return [...this._exportHistory];
  }
}

class ApprovalSimulator {
  constructor(alertQueue) {
    this.alertQueue = alertQueue || new AlertQueue();
  }

  simulateApproval({ approvalChain, approversMap = {}, simulateAllPass = true }) {
    const completedNodes = [];
    const missingNodes = [];
    const alertMessages = [];
    const order = [];

    for (const node of approvalChain) {
      const nodeKey = node.node;

      if (node.missing === true) {
        missingNodes.push({ ...node });
        order.push({ node: nodeKey, result: 'MISSING' });
        continue;
      }

      const hasApprover = approversMap && approversMap[nodeKey];
      if (!hasApprover) {
        if (nodeKey === APPROVAL_NODES.VICE_PRESIDENT) {
          const msg = `预支年假审批链路缺少分管副总节点，请HR补充`;
          this.alertQueue.enqueueAdminAlert({ level: 'warning', message: msg });
          alertMessages.push(msg);
          missingNodes.push({ ...node });
          order.push({ node: nodeKey, result: 'MISSING' });
          continue;
        }
      }

      if (simulateAllPass) {
        completedNodes.push({
          node: nodeKey,
          name: node.name,
          approverId: hasApprover ? approversMap[nodeKey].id : `AUTO_${nodeKey}`,
          approverName: hasApprover ? approversMap[nodeKey].name : `模拟${node.name}`,
          status: 'PASSED',
          passedAt: new Date()
        });
        order.push({ node: nodeKey, result: 'PASSED' });
      } else {
        completedNodes.push({
          node: nodeKey,
          name: node.name,
          approverId: hasApprover ? approversMap[nodeKey].id : `AUTO_${nodeKey}`,
          approverName: hasApprover ? approversMap[nodeKey].name : `模拟${node.name}`,
          status: 'PENDING',
          passedAt: null
        });
        order.push({ node: nodeKey, result: 'PENDING' });
      }
    }

    return {
      completedNodes,
      missingNodes,
      alertMessages,
      order,
      allPassed: missingNodes.length === 0 && completedNodes.every(n => n.status === 'PASSED')
    };
  }
}

class LeavePrepayExemptionController {
  constructor({ leaveEngine = null, alertQueue = null } = {}) {
    this.alertQueue = alertQueue || new AlertQueue();
    this.prepayApprovalManager = new PrepayApprovalManager(this.alertQueue);
    this.leaveBalanceManager = new LeaveBalanceManager();
    this.exemptionManager = new ExemptionManager();
    this.approvalSimulator = new ApprovalSimulator(this.alertQueue);
    this.leaveEngine = leaveEngine;
  }

  async requestPrepayAnnualLeave({ employee, days, reason, approvalForm = null }) {
    if (!employee || !employee.status || !employee.id) {
      throw new Error('requestPrepayAnnualLeave缺少employee参数或employee无效');
    }
    if (!days || days <= 0) {
      throw new Error('requestPrepayAnnualLeave参数days必须为正数');
    }

    const status = employee.status;
    if (status === EMPLOYEE_STATUS.PROBATION) {
      throw new ProbationBlockedError('试用期员工不得预支年假，请转正后再申请');
    }

    if (status !== EMPLOYEE_STATUS.REGULAR) {
      throw new Error(`非转正员工(status=${status})不能申请预支年假`);
    }

    const approvalChain = this.prepayApprovalManager.resolveApprovalChain({ employee, days });
    const approval = this.prepayApprovalManager.createApproval({
      employee,
      days,
      reason,
      approvalForm,
      approvalChain
    });

    return {
      approvalNo: approval.approvalNo,
      approval,
      approvalChain,
      days
    };
  }

  approvePrepayAndUpdateBalance({ approvalNo, employeeId, days, year = null }) {
    const y = year || dayjs().year();
    const effDate = dayjs().format('YYYY-MM-DD');
    const result = this.leaveBalanceManager.grantPrepay({
      employeeId,
      year: y,
      days,
      approvalNo,
      effectiveDate: effDate
    });

    return {
      ...result,
      approvalNo,
      employeeId,
      year: y,
      effectiveDate: effDate
    };
  }

  createExemption(params) {
    return this.exemptionManager.createExemption(params);
  }

  retroactiveExemptions(records) {
    return this.exemptionManager.retroactiveExemptions(records);
  }

  approveRetroactive(approvalNo) {
    return this.exemptionManager.approveRetroactive(approvalNo);
  }

  simulateApprovalChain(options) {
    return this.approvalSimulator.simulateApproval(options);
  }

  getLeaveBalance(employeeId, year) {
    return this.leaveBalanceManager.getBalance(employeeId, year);
  }

  ensureLeaveBalance(employeeId, year, baseQuota) {
    return this.leaveBalanceManager.ensureBalance(employeeId, year, baseQuota);
  }

  listPrepayRecords(employeeId) {
    return this.leaveBalanceManager.listPrepayRecords(employeeId);
  }

  listExemptions(options) {
    return this.exemptionManager.listExemptions(options);
  }

  async exportMonthlyExemption(options) {
    return this.exemptionManager.exportMonthlyExemptionList(options);
  }

  scheduleMonthlyExemptionExport(handler) {
    return this.exemptionManager.scheduleMonthlyExport(handler);
  }

  getAlertQueue() {
    return this.alertQueue;
  }
}

module.exports = {
  LeavePrepayExemptionController,
  PrepayApprovalManager,
  LeaveBalanceManager,
  ExemptionManager,
  ApprovalSimulator,
  ProbationBlockedError,
  MissingApprovalError,
  InvalidExemptionError,
  APPROVAL_NODES,
  APPROVAL_NODE_NAMES,
  EXEMPTION_TYPES,
  EXEMPTION_TYPE_NAMES,
  EXEMPTION_STATUS
};
