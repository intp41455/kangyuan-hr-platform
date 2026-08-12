'use strict';

const {
  ROLE,
  PermissionError,
  maskIdCard,
  maskBankCard,
  roleGuard,
  generateApprovalNo
} = require('./master_data_api.js');

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES
} = require('../modules/attendance/attendance_anomaly_engine.js');

const {
  LEAVE_TYPES,
  OT_TYPES,
  MonthlySummaryAggregator
} = require('../modules/attendance/monthly_attendance_summary.js');

const ANOMALY_STATUS = Object.freeze({
  OPEN: 'OPEN',
  PROCESSING: 'PROCESSING',
  CLOSED: 'CLOSED',
  EXEMPT: 'EXEMPT'
});

const CLOSURE_REASON = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  EXEMPT: 'EXEMPT',
  MAKEUP: 'MAKEUP',
  APPEAL_SUCCESS: 'APPEAL_SUCCESS'
});

class MissingApprovalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingApprovalError';
  }
}

class AnomalyStore {
  constructor() {
    this._anomalies = new Map();
    this._employees = new Map();
  }

  setEmployees(employees) {
    this._employees.clear();
    for (const e of employees || []) {
      const eid = String(e.id || e.employeeId);
      this._employees.set(eid, e);
    }
  }

  getEmployee(eid) {
    return this._employees.get(String(eid));
  }

  getAllEmployees() {
    return Array.from(this._employees.values());
  }

  addAnomalies(anomalies) {
    for (const a of anomalies || []) {
      const anomaly = {
        status: ANOMALY_STATUS.OPEN,
        closureReason: null,
        closedAt: null,
        reminderCount: 0,
        generatedAt: a.generatedAt || new Date(),
        ...a
      };
      this._anomalies.set(anomaly.anomalyId, anomaly);
    }
  }

  get(anomalyId) {
    return this._anomalies.get(anomalyId);
  }

  getAll() {
    return Array.from(this._anomalies.values());
  }

  update(anomalyId, patch) {
    const existing = this._anomalies.get(anomalyId);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this._anomalies.set(anomalyId, updated);
    return updated;
  }

  setClosed(anomalyId, reason = CLOSURE_REASON.CONFIRMED) {
    return this.update(anomalyId, {
      status: ANOMALY_STATUS.CLOSED,
      closureReason: reason,
      closedAt: new Date(),
      deduction: reason === CLOSURE_REASON.EXEMPT ? 0 : (this.get(anomalyId)?.deduction || 0)
    });
  }

  size() {
    return this._anomalies.size;
  }
}

class AttendanceAdminDashboard {
  constructor(options = {}) {
    this._summaryAggregator = options.summaryAggregator || new MonthlySummaryAggregator();
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _calcTopRankings({ anomalies, employees }) {
    const empMap = new Map();
    for (const e of employees || []) {
      empMap.set(String(e.id || e.employeeId), e);
    }

    const empOtMap = new Map();
    const empAnomalyCountMap = new Map();
    for (const a of anomalies || []) {
      const eid = String(a.employeeId);
      if (OT_TYPES.includes(a.type)) {
        const hrs = Number(a.otHours || (a.extra && a.extra.otHours) || 0);
        empOtMap.set(eid, (empOtMap.get(eid) || 0) + hrs);
      }
      if (!OT_TYPES.includes(a.type) && a.type !== ATTENDANCE_ANOMALY.LEAVE_ANNUAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_SICK && a.type !== ATTENDANCE_ANOMALY.LEAVE_PERSONAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_MARRIAGE && a.type !== ATTENDANCE_ANOMALY.LEAVE_MATERNITY &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_PATERNITY && a.type !== ATTENDANCE_ANOMALY.LEAVE_FUNERAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_COMPTIME) {
        empAnomalyCountMap.set(eid, (empAnomalyCountMap.get(eid) || 0) + 1);
      }
    }

    const otTop10 = Array.from(empOtMap.entries())
      .map(([eid, hrs]) => {
        const e = empMap.get(eid) || {};
        return {
          employeeId: eid,
          name: e.name || '',
          dept: e.dept1 || e.department || '',
          hours: Number(hrs.toFixed(1))
        };
      })
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const anomalyTop10 = Array.from(empAnomalyCountMap.entries())
      .map(([eid, count]) => {
        const e = empMap.get(eid) || {};
        return {
          employeeId: eid,
          empId: eid,
          name: e.name || '',
          dept: e.dept1 || e.department || '',
          count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { anomalyTop10, otTop10 };
  }

  _calcSlaProgressBar({ anomalies, asOf }) {
    const now = asOf ? new Date(asOf) : new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const nodes = {
      dMinus3: { label: 'D-3', targetDays: 3, closed: 0, total: 0 },
      dMinus2: { label: 'D-2', targetDays: 2, closed: 0, total: 0 },
      dMinus1: { label: 'D-1', targetDays: 1, closed: 0, total: 0 },
      dDay: { label: 'D-Day', targetDays: 0, closed: 0, total: 0 }
    };

    for (const a of anomalies || []) {
      const generatedAt = a.generatedAt ? new Date(a.generatedAt) : new Date();
      const daysElapsed = Math.floor((now.getTime() - generatedAt.getTime()) / oneDayMs);

      if (daysElapsed >= 3) {
        nodes.dMinus3.total++;
        if (a.status === ANOMALY_STATUS.CLOSED) nodes.dMinus3.closed++;
      }
      if (daysElapsed >= 2) {
        nodes.dMinus2.total++;
        if (a.status === ANOMALY_STATUS.CLOSED) nodes.dMinus2.closed++;
      }
      if (daysElapsed >= 1) {
        nodes.dMinus1.total++;
        if (a.status === ANOMALY_STATUS.CLOSED) nodes.dMinus1.closed++;
      }
      nodes.dDay.total++;
      if (a.status === ANOMALY_STATUS.CLOSED) nodes.dDay.closed++;
    }

    const calcRate = (node) => {
      if (node.total === 0) return 0;
      return Number(((node.closed / node.total) * 100).toFixed(1));
    };

    return {
      dMinus3: { closed: nodes.dMinus3.closed, total: nodes.dMinus3.total, achievementRate: calcRate(nodes.dMinus3) },
      dMinus2: { closed: nodes.dMinus2.closed, total: nodes.dMinus2.total, achievementRate: calcRate(nodes.dMinus2) },
      dMinus1: { closed: nodes.dMinus1.closed, total: nodes.dMinus1.total, achievementRate: calcRate(nodes.dMinus1) },
      dDay: { closed: nodes.dDay.closed, total: nodes.dDay.total, achievementRate: calcRate(nodes.dDay) }
    };
  }

  _calcPendingReminder({ anomalies, asOf }) {
    const now = asOf ? new Date(asOf) : new Date();
    const nowStr = now.toISOString().slice(0, 10);
    const thirtyHoursMs = 30 * 60 * 60 * 1000;

    let count = 0;
    for (const a of anomalies || []) {
      if (a.status === ANOMALY_STATUS.CLOSED) continue;
      const generatedAt = a.generatedAt ? new Date(a.generatedAt) : new Date();
      const elapsed = now.getTime() - generatedAt.getTime();
      if (elapsed >= thirtyHoursMs) {
        count++;
      }
    }
    return count;
  }

  getDashboard({ role, asOf, anomalies, employees, punchRecords, year, month }) {
    const timestampStart = Date.now();
    const data = (anomalies && employees) ? { anomalies, employees } : null;

    const allAnomalies = data ? data.anomalies : [];
    const allEmployees = data ? data.employees : [];

    const totalAnomalies = allAnomalies.length;
    let closedCount = 0;
    for (const a of allAnomalies) {
      if (a.status === ANOMALY_STATUS.CLOSED) closedCount++;
    }
    const openCount = totalAnomalies - closedCount;
    const closureRate = totalAnomalies === 0 ? 0 : Number(((closedCount / totalAnomalies) * 100).toFixed(1));

    const pendingReminder = this._calcPendingReminder({ anomalies: allAnomalies, asOf });

    const overviewCard = {
      totalAnomalies,
      closedCount,
      closureRate,
      openCount,
      pendingReminder
    };

    const slaProgressBar = this._calcSlaProgressBar({ anomalies: allAnomalies, asOf });
    const topRanking = this._calcTopRankings({ anomalies: allAnomalies, employees: allEmployees });

    let summaryCalcData = null;
    if (year && month && employees && anomalies && punchRecords) {
      const summary = this._summaryAggregator.calcMonthlySummary({
        year, month, employees, punchRecords, anomalies: allAnomalies
      });
      summaryCalcData = {
        anomalyTop10Calc: (summary.anomalyTypeDimension?.anomalyTop10 || []).map(x => ({
          empId: x.employeeId, employeeId: x.employeeId, name: x.name, dept: x.dept1, count: x.count
        })),
        otTop10Calc: (summary.anomalyTypeDimension?.otTop10 || []).map(x => ({
          employeeId: x.employeeId, name: x.name, dept: x.dept1, hours: x.otHours
        }))
      };
    }

    const filtersMeta = {
      types: Object.entries(ANOMALY_NAMES).map(([k, v]) => ({ type: Number(k), name: v })),
      statuses: [
        { key: ANOMALY_STATUS.OPEN, label: '未闭环' },
        { key: ANOMALY_STATUS.PROCESSING, label: '处理中' },
        { key: ANOMALY_STATUS.CLOSED, label: '已闭环' }
      ],
      departments: this._extractDepts(allEmployees),
      dateRange: {
        min: allAnomalies.length ? allAnomalies.reduce((m, a) => {
          const d = a.date ? new Date(a.date) : new Date();
          return d < m ? d : m;
        }, new Date(allAnomalies[0].date)) : new Date(),
        max: allAnomalies.length ? allAnomalies.reduce((m, a) => {
          const d = a.date ? new Date(a.date) : new Date();
          return d > m ? d : m;
        }, new Date(allAnomalies[0].date)) : new Date()
      }
    };

    const timestampEnd = Date.now();
    const callLatency = timestampEnd - timestampStart;

    return {
      overviewCard,
      slaProgressBar,
      topRanking,
      filtersMeta,
      _internal: {
        summaryCalcData,
        timestampStart,
        timestampEnd,
        callLatency
      }
    };
  }

  _extractDepts(employees) {
    const dept1Set = new Set();
    const deptMap = new Map();
    for (const e of employees || []) {
      const d1 = e.dept1 || e.department || '';
      const d2 = e.dept2 || '';
      if (!d1) continue;
      dept1Set.add(d1);
      if (!deptMap.has(d1)) deptMap.set(d1, new Set());
      if (d2) deptMap.get(d1).add(d2);
    }
    return Array.from(dept1Set).map(d1 => ({
      dept1: d1,
      dept2List: Array.from(deptMap.get(d1) || [])
    }));
  }
}

class AttendanceAdminAPI {
  constructor(options = {}) {
    this._anomalyStore = options.anomalyStore || new AnomalyStore();
    this._dashboard = options.dashboard || new AttendanceAdminDashboard();
    this._pendingExemptions = new Map();
    this._exemptionHistory = [];
    if (options.employees) {
      this._anomalyStore.setEmployees(options.employees);
    }
    if (options.anomalies) {
      this._anomalyStore.addAnomalies(options.anomalies);
    }
  }

  get anomalyStore() {
    return this._anomalyStore;
  }

  get pendingExemptions() {
    return new Map(this._pendingExemptions);
  }

  _applyScopeFilter({ role, viewerEmployeeId, viewerDept1, anomalies }) {
    if (role === ROLE.HR_SPECIALIST || role === ROLE.HR_DIRECTOR || role === ROLE.FINANCE) {
      return anomalies;
    }
    if (role === ROLE.MANAGER && viewerDept1) {
      const store = this._anomalyStore;
      return anomalies.filter(a => {
        const eid = String(a.employeeId);
        const emp = store.getEmployee(eid);
        const sameDept = emp && (emp.dept1 === viewerDept1 || emp.department === viewerDept1);
        const isSelf = viewerEmployeeId && eid === String(viewerEmployeeId);
        return sameDept || isSelf;
      });
    }
    if (role === ROLE.EMPLOYEE && viewerEmployeeId) {
      const target = String(viewerEmployeeId);
      return anomalies.filter(a => String(a.employeeId) === target);
    }
    return [];
  }

  _maskSensitiveFields(anomaly, role, viewerEmployeeId) {
    if (!anomaly) return anomaly;
    const store = this._anomalyStore;
    const eid = String(anomaly.employeeId);
    const emp = store.getEmployee(eid);
    const isSelf = viewerEmployeeId && String(viewerEmployeeId) === eid;

    if (!emp) return anomaly;

    const masked = this._deepClone(anomaly);
    const isHROrFinance = role === ROLE.HR_SPECIALIST || role === ROLE.FINANCE || role === ROLE.HR_DIRECTOR;

    if (emp.idCard) {
      if (isSelf) {
        masked.employeeIdCard = emp.idCard;
      } else if (role === ROLE.EMPLOYEE || role === ROLE.MANAGER || role === ROLE.HR_SPECIALIST) {
        masked.employeeIdCard = maskIdCard(emp.idCard);
      } else {
        masked.employeeIdCard = emp.idCard;
      }
    }

    if (emp.bankCard) {
      if (isSelf) {
        masked.employeeBankCard = emp.bankCard;
      } else if (role === ROLE.EMPLOYEE) {
        masked.employeeBankCard = null;
      } else if (role === ROLE.MANAGER || role === ROLE.HR_SPECIALIST) {
        masked.employeeBankCard = maskBankCard(emp.bankCard);
      } else {
        masked.employeeBankCard = emp.bankCard;
      }
    }

    if (!isHROrFinance && !isSelf) {
      if (masked.deduction != null) masked.deduction = null;
    }

    return masked;
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _requireBatchExemptPermission(role) {
    const ok = role === ROLE.HR_DIRECTOR || role === ROLE.HR_SPECIALIST;
    if (!ok) {
      throw new PermissionError(`角色${role}无权限执行批量豁免操作，需要HR_DIRECTOR或HR_SPECIALIST权限`);
    }
    return true;
  }

  getDashboard({ role, viewerEmployeeId = null, viewerDept1 = null, asOf = null, year = null, month = null, punchRecords = null }) {
    const store = this._anomalyStore;
    const allAnomalies = store.getAll();
    const allEmployees = store.getAllEmployees();

    const scopedAnomalies = this._applyScopeFilter({
      role, viewerEmployeeId, viewerDept1, anomalies: allAnomalies
    });

    let scopedEmployees = allEmployees;
    if (role === ROLE.MANAGER && viewerDept1) {
      scopedEmployees = allEmployees.filter(e => {
        const isSelf = viewerEmployeeId && String(e.id || e.employeeId) === String(viewerEmployeeId);
        const sameDept = (e.dept1 === viewerDept1 || e.department === viewerDept1);
        return isSelf || sameDept;
      });
    } else if (role === ROLE.EMPLOYEE && viewerEmployeeId) {
      scopedEmployees = allEmployees.filter(e => String(e.id || e.employeeId) === String(viewerEmployeeId));
    }

    return this._dashboard.getDashboard({
      role,
      asOf,
      anomalies: scopedAnomalies,
      employees: scopedEmployees,
      punchRecords,
      year,
      month
    });
  }

  queryAnomalies({ role, viewerEmployeeId = null, viewerDept1 = null, filters = [], page = 1, pageSize = 20 }) {
    const store = this._anomalyStore;
    let list = store.getAll();

    list = this._applyScopeFilter({ role, viewerEmployeeId, viewerDept1, anomalies: list });

    const filterList = Array.isArray(filters) ? filters : [];
    for (const f of filterList) {
      const field = f.field;
      const value = f.value;

      if (field === 'employeeId' && typeof value === 'string' && value.trim()) {
        const kw = value.trim().toLowerCase();
        list = list.filter(a => String(a.employeeId).toLowerCase().includes(kw));
      } else if (field === 'dept1' && typeof value === 'string' && value.trim()) {
        const target = value.trim();
        list = list.filter(a => {
          const emp = store.getEmployee(a.employeeId);
          return emp && (emp.dept1 === target || emp.department === target);
        });
      } else if (field === 'dept2' && typeof value === 'string' && value.trim()) {
        const target = value.trim();
        list = list.filter(a => {
          const emp = store.getEmployee(a.employeeId);
          return emp && emp.dept2 === target;
        });
      } else if (field === 'type' && value != null) {
        const tv = Number(value);
        list = list.filter(a => a.type === tv);
      } else if (field === 'status' && typeof value === 'string' && value.trim()) {
        list = list.filter(a => a.status === value.trim());
      } else if (field === 'dateRange' && Array.isArray(value) && value.length >= 2) {
        const [startStr, endStr] = value;
        if (startStr && endStr) {
          const start = new Date(startStr);
          start.setHours(0, 0, 0, 0);
          const end = new Date(endStr);
          end.setHours(23, 59, 59, 999);
          list = list.filter(a => {
            if (!a.date) return false;
            const d = new Date(a.date);
            return d >= start && d <= end;
          });
        }
      }
    }

    const total = list.length;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, Math.min(1000, parseInt(pageSize, 10) || 20));
    const startIdx = (safePage - 1) * safePageSize;
    const pageData = list.slice(startIdx, startIdx + safePageSize);

    const enriched = pageData.map(a => {
      const emp = store.getEmployee(a.employeeId);
      const withEmp = { ...a };
      if (emp) {
        withEmp.employeeName = emp.name || '';
        withEmp.dept1 = emp.dept1 || emp.department || '';
        withEmp.dept2 = emp.dept2 || '';
        withEmp.employee = emp;
      }
      return withEmp;
    });

    const maskedData = enriched.map(a => this._maskSensitiveFields(a, role, viewerEmployeeId));

    return {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
      data: maskedData
    };
  }

  batchExemptAnomalies({ role, anomalyIds, reason, approvalNoRequired = true }) {
    this._requireBatchExemptPermission(role);

    if (!Array.isArray(anomalyIds) || anomalyIds.length === 0) {
      throw new Error('anomalyIds不能为空数组');
    }

    const store = this._anomalyStore;
    const validIds = [];
    for (const id of anomalyIds) {
      const a = store.get(id);
      if (a && a.status !== ANOMALY_STATUS.CLOSED) {
        validIds.push(id);
      }
    }

    const approvalNo = generateApprovalNo('EXEMPT');
    const approvalRecord = {
      approvalNo,
      type: 'BATCH_EXEMPTION',
      reason: reason || '批量豁免',
      role,
      anomalyIds: validIds,
      originalDeductions: {},
      status: approvalNoRequired === false ? 'APPROVED_AND_EXECUTED' : 'PENDING_APPROVAL',
      createdAt: new Date()
    };

    for (const id of validIds) {
      const a = store.get(id);
      approvalRecord.originalDeductions[id] = a ? (a.deduction || 0) : 0;
    }

    this._pendingExemptions.set(approvalNo, approvalRecord);
    this._exemptionHistory.push(approvalRecord);

    if (approvalNoRequired === false || role === ROLE.HR_DIRECTOR) {
      for (const id of validIds) {
        store.setClosed(id, CLOSURE_REASON.EXEMPT);
        const updated = store.get(id);
        if (updated) {
          store.update(id, { deduction: 0 });
        }
      }
      approvalRecord.status = 'APPROVED_AND_EXECUTED';
      approvalRecord.executedAt = new Date();
    }

    return {
      approvalNo,
      requiresApproval: approvalNoRequired === true && role !== ROLE.HR_DIRECTOR,
      status: approvalRecord.status,
      affectedCount: validIds.length,
      totalRequested: anomalyIds.length,
      invalidSkipped: anomalyIds.length - validIds.length
    };
  }

  approveBatchExemptions({ approvalNo }) {
    if (!approvalNo) {
      throw new MissingApprovalError('缺少审批单号approvalNo参数');
    }

    const record = this._pendingExemptions.get(approvalNo);
    if (!record) {
      throw new MissingApprovalError(`审批单号不存在: ${approvalNo}`);
    }

    const store = this._anomalyStore;
    for (const id of record.anomalyIds) {
      store.setClosed(id, CLOSURE_REASON.EXEMPT);
      store.update(id, { deduction: 0 });
    }

    record.status = 'APPROVED_AND_EXECUTED';
    record.executedAt = new Date();
    this._pendingExemptions.delete(approvalNo);

    return {
      approvalNo,
      status: record.status,
      executedAt: record.executedAt,
      affectedCount: record.anomalyIds.length
    };
  }

  batchExportExcel({ filters = [], role = ROLE.HR_SPECIALIST, viewerEmployeeId = null, viewerDept1 = null }) {
    const result = this.queryAnomalies({
      role, viewerEmployeeId, viewerDept1,
      filters,
      page: 1,
      pageSize: 100000
    });

    const rows = [];
    const headers = [
      '异常ID', '员工工号', '员工姓名', '一级部门', '二级部门',
      '异常日期', '异常类型', '异常名称', '严重程度',
      '状态', '扣款金额(元)', '生成时间', '闭环时间', '闭环原因'
    ];
    rows.push(headers.join(','));

    for (const a of result.data) {
      const row = [
        a.anomalyId || '',
        a.employeeId || '',
        a.employeeName || '',
        a.dept1 || '',
        a.dept2 || '',
        a.date || '',
        a.type != null ? a.type : '',
        a.typeName || (a.type != null ? ANOMALY_NAMES[a.type] || '' : ''),
        a.severity || '',
        a.status || '',
        a.deduction != null ? a.deduction : '',
        a.generatedAt ? new Date(a.generatedAt).toISOString() : '',
        a.closedAt ? new Date(a.closedAt).toISOString() : '',
        a.closureReason || ''
      ];
      rows.push(row.map(v => {
        const s = String(v == null ? '' : v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(','));
    }

    return {
      totalRows: result.total,
      dataRows: result.data.length,
      headers,
      csvContent: rows.join('\n'),
      generatedAt: new Date()
    };
  }
}

module.exports = {
  ROLE,
  PermissionError,
  MissingApprovalError,
  maskIdCard,
  maskBankCard,
  ANOMALY_STATUS,
  CLOSURE_REASON,
  AnomalyStore,
  AttendanceAdminDashboard,
  AttendanceAdminAPI
};
