'use strict';

const { EmployeeModel, EMPLOYEE_STATUS, EMPLOYEE_STATUS_ORDER } = require('../modules/master_data/employee_model.js');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { getPresetGrade, PayrollGradeModel } = require('../modules/master_data/payroll_grade_model.js');

const ROLE = Object.freeze({
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  HR_SPECIALIST: 'HR_SPECIALIST',
  FINANCE: 'FINANCE',
  HR_DIRECTOR: 'HR_DIRECTOR'
});

const RESOURCE = Object.freeze({
  EMPLOYEE_BASIC: 'EMPLOYEE_BASIC',
  EMPLOYEE_ID_CARD: 'EMPLOYEE_ID_CARD',
  EMPLOYEE_BANK_CARD: 'EMPLOYEE_BANK_CARD',
  EMPLOYEE_PAYROLL_GRADE: 'EMPLOYEE_PAYROLL_GRADE',
  EMPLOYEE_SALARY: 'EMPLOYEE_SALARY',
  EMPLOYEE_LIST: 'EMPLOYEE_LIST',
  EMPLOYEE_PROFILE: 'EMPLOYEE_PROFILE'
});

const ACTION = Object.freeze({
  READ: 'READ',
  WRITE: 'WRITE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LIST: 'LIST',
  VIEW: 'VIEW',
  EDIT: 'EDIT'
});

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

class ApprovalPendingError extends Error {
  constructor(message, approvalNo) {
    super(message);
    this.name = 'ApprovalPendingError';
    this.approvalNo = approvalNo;
  }
}

function maskIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return null;
  if (idCard.length < 10) return '*'.repeat(idCard.length);
  const prefix = idCard.substring(0, 6);
  const suffix = idCard.substring(idCard.length - 4);
  const middle = '**********';
  return prefix + middle + suffix;
}

function maskBankCard(bankCard) {
  if (!bankCard || typeof bankCard !== 'string') return null;
  const digits = bankCard.replace(/\s/g, '');
  if (digits.length < 8) return '*'.repeat(digits.length);
  const prefix = digits.substring(0, 4);
  const suffix = digits.substring(digits.length - 3);
  const middle = '*'.repeat(digits.length - 7);
  return prefix + middle + suffix;
}

function roleGuard({ role, action, resource, context = {} }) {
  const validRoles = Object.values(ROLE);
  if (!validRoles.includes(role)) {
    throw new PermissionError(`无效角色: ${role}`);
  }

  const { viewerEmployeeId, targetEmployeeId, viewerDept1, targetDept1, field } = context || {};
  const isSelf = viewerEmployeeId && targetEmployeeId && viewerEmployeeId === targetEmployeeId;
  const isSameDept = viewerDept1 && targetDept1 && viewerDept1 === targetDept1;

  switch (role) {
    case ROLE.EMPLOYEE:
      if (isSelf) {
        if (action === ACTION.READ || action === ACTION.VIEW) {
          if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
          if (resource === RESOURCE.EMPLOYEE_ID_CARD) return true;
          if (resource === RESOURCE.EMPLOYEE_BANK_CARD) return true;
          if (resource === RESOURCE.EMPLOYEE_PROFILE) return true;
        }
      }
      if (action === ACTION.READ || action === ACTION.VIEW) {
        if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
        if (resource === RESOURCE.EMPLOYEE_LIST) return true;
        if (resource === RESOURCE.EMPLOYEE_PROFILE) return true;
      }
      return false;

    case ROLE.MANAGER:
      if (isSelf) {
        if (action === ACTION.READ || action === ACTION.VIEW) return true;
      }
      if (isSameDept) {
        if (action === ACTION.READ || action === ACTION.VIEW) {
          if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
          if (resource === RESOURCE.EMPLOYEE_LIST) return true;
          if (resource === RESOURCE.EMPLOYEE_ID_CARD) return true;
          if (resource === RESOURCE.EMPLOYEE_PROFILE) return true;
        }
      }
      return false;

    case ROLE.HR_SPECIALIST:
      if (action === ACTION.READ || action === ACTION.VIEW || action === ACTION.LIST) {
        if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
        if (resource === RESOURCE.EMPLOYEE_LIST) return true;
        if (resource === RESOURCE.EMPLOYEE_ID_CARD) return true;
        if (resource === RESOURCE.EMPLOYEE_PROFILE) return true;
        if (resource === RESOURCE.EMPLOYEE_PAYROLL_GRADE) return true;
      }
      if (action === ACTION.WRITE || action === ACTION.UPDATE || action === ACTION.EDIT) {
        if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
        if (resource === RESOURCE.EMPLOYEE_ID_CARD) return true;
        if (resource === RESOURCE.EMPLOYEE_BANK_CARD) return false;
        if (resource === RESOURCE.EMPLOYEE_PAYROLL_GRADE) return false;
        if (resource === RESOURCE.EMPLOYEE_SALARY) return false;
      }
      return false;

    case ROLE.FINANCE:
      if (action === ACTION.READ || action === ACTION.VIEW || action === ACTION.LIST) {
        if (resource === RESOURCE.EMPLOYEE_BASIC) return true;
        if (resource === RESOURCE.EMPLOYEE_LIST) return true;
        if (resource === RESOURCE.EMPLOYEE_ID_CARD) return true;
        if (resource === RESOURCE.EMPLOYEE_BANK_CARD) return true;
        if (resource === RESOURCE.EMPLOYEE_PROFILE) return true;
        if (resource === RESOURCE.EMPLOYEE_PAYROLL_GRADE) return true;
        if (resource === RESOURCE.EMPLOYEE_SALARY) return true;
      }
      if (action === ACTION.WRITE || action === ACTION.UPDATE || action === ACTION.EDIT) {
        if (resource === RESOURCE.EMPLOYEE_BANK_CARD) return true;
      }
      return false;

    case ROLE.HR_DIRECTOR:
      return true;

    default:
      return false;
  }
}

function generateApprovalNo(type) {
  const prefix = type || 'APV';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

class MasterDataAPI {
  constructor(options = {}) {
    this._registry = options.registry || new EmployeeRegistry();
    this._gradeRegistry = options.gradeRegistry || new Map();
    this._pendingApprovals = new Map();
    this._approvalHistory = [];
  }

  get registry() {
    return this._registry;
  }

  get pendingApprovals() {
    return new Map(this._pendingApprovals);
  }

  _getOrCreateGradeDetail(payrollGradeCode) {
    if (this._gradeRegistry.has(payrollGradeCode)) {
      return this._gradeRegistry.get(payrollGradeCode);
    }
    const preset = getPresetGrade(payrollGradeCode);
    if (preset) {
      const detail = {
        gradeCode: preset.gradeCode,
        gradeName: preset.gradeName,
        baseAmount: preset.baseAmount,
        performanceAmount: preset.performanceAmount,
        totalAmount: preset.totalAmount,
        probationRatio: preset.probationRatio
      };
      this._gradeRegistry.set(payrollGradeCode, detail);
      return detail;
    }
    return {
      gradeCode: payrollGradeCode,
      gradeName: payrollGradeCode,
      baseAmount: 0,
      performanceAmount: 0,
      totalAmount: 0,
      probationRatio: 0.8
    };
  }

  _applyFieldMasking(employee, role, viewerEmployeeId) {
    const isSelf = viewerEmployeeId && employee.id === viewerEmployeeId;
    const masked = JSON.parse(JSON.stringify(employee));

    const isHRorFinance = role === ROLE.HR_SPECIALIST || role === ROLE.FINANCE || role === ROLE.HR_DIRECTOR;

    if (!isSelf) {
      if (role === ROLE.EMPLOYEE) {
        masked.idCard = maskIdCard(employee.idCard);
        masked.bankCard = null;
      } else if (role === ROLE.MANAGER) {
        masked.idCard = maskIdCard(employee.idCard);
        masked.bankCard = maskBankCard(employee.bankCard);
      } else if (role === ROLE.HR_SPECIALIST) {
        masked.idCard = maskIdCard(employee.idCard);
        masked.bankCard = maskBankCard(employee.bankCard);
      }
    }

    if (!isHRorFinance && !isSelf) {
      if (masked.payrollGrade && typeof masked.payrollGrade === 'object') {
        masked.payrollGrade.baseAmount = null;
        masked.payrollGrade.performanceAmount = null;
        masked.payrollGrade.totalAmount = null;
        masked.payrollGrade.salary = null;
      } else {
        masked.salary = null;
      }
    } else if (isSelf && role === ROLE.EMPLOYEE) {
      if (masked.payrollGrade && typeof masked.payrollGrade === 'object') {
        masked.payrollGrade.salary = null;
      }
    }

    return masked;
  }

  _enrichEmployeeWithPayrollGrade(employee) {
    if (!employee) return null;
    const enriched = { ...employee };
    if (enriched.payrollGrade && typeof enriched.payrollGrade === 'string') {
      const gradeDetail = this._getOrCreateGradeDetail(enriched.payrollGrade);
      enriched.payrollGrade = {
        code: enriched.payrollGrade,
        ...gradeDetail,
        salary: gradeDetail.totalAmount
      };
    } else if (!enriched.payrollGrade) {
      enriched.payrollGrade = {
        code: null,
        gradeName: null,
        baseAmount: null,
        performanceAmount: null,
        totalAmount: null,
        salary: null,
        probationRatio: 0.8
      };
    }
    return enriched;
  }

  listEmployees({ role, viewerEmployeeId = null, viewerDept1 = null, filters = {}, page = 1, pageSize = 20 } = {}) {
    if (!roleGuard({ role, action: ACTION.LIST, resource: RESOURCE.EMPLOYEE_LIST })) {
      throw new PermissionError(`角色${role}无权限查看员工列表`);
    }

    const {
      name,
      mobile,
      dept1,
      dept2,
      status,
      payrollGrade,
      workLocation,
      entryDateStart,
      entryDateEnd,
      positionTag
    } = filters || {};

    let allEmployees = this._registry.getAllEmployees();

    if (name && typeof name === 'string' && name.trim()) {
      const keyword = name.trim().toLowerCase();
      allEmployees = allEmployees.filter(e =>
        e.name && e.name.toLowerCase().includes(keyword)
      );
    }

    if (mobile && typeof mobile === 'string' && mobile.trim()) {
      allEmployees = allEmployees.filter(e => e.mobile === mobile.trim());
    }

    if (dept1 && typeof dept1 === 'string' && dept1.trim()) {
      allEmployees = allEmployees.filter(e => e.dept1 === dept1.trim());
    }

    if (dept2 && typeof dept2 === 'string' && dept2.trim()) {
      allEmployees = allEmployees.filter(e => e.dept2 === dept2.trim());
    }

    if (status && typeof status === 'string' && status.trim()) {
      allEmployees = allEmployees.filter(e => e.status === status.trim());
    }

    if (payrollGrade && typeof payrollGrade === 'string' && payrollGrade.trim()) {
      allEmployees = allEmployees.filter(e => e.payrollGrade === payrollGrade.trim());
    }

    if (workLocation && typeof workLocation === 'string' && workLocation.trim()) {
      allEmployees = allEmployees.filter(e => e.workLocation === workLocation.trim());
    }

    if (entryDateStart) {
      const start = new Date(entryDateStart);
      start.setHours(0, 0, 0, 0);
      allEmployees = allEmployees.filter(e => {
        if (!e.entryDate) return false;
        const entry = new Date(e.entryDate);
        return entry >= start;
      });
    }

    if (entryDateEnd) {
      const end = new Date(entryDateEnd);
      end.setHours(23, 59, 59, 999);
      allEmployees = allEmployees.filter(e => {
        if (!e.entryDate) return false;
        const entry = new Date(e.entryDate);
        return entry <= end;
      });
    }

    if (positionTag && typeof positionTag === 'string' && positionTag.trim()) {
      allEmployees = allEmployees.filter(e => e.positionTag === positionTag.trim());
    }

    if (role === ROLE.MANAGER && viewerDept1) {
      allEmployees = allEmployees.filter(e => {
        const isSelf = viewerEmployeeId && e.id === viewerEmployeeId;
        const sameDept = e.dept1 === viewerDept1;
        return isSelf || sameDept;
      });
    }

    const total = allEmployees.length;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, Math.min(1000, parseInt(pageSize, 10) || 20));
    const startIdx = (safePage - 1) * safePageSize;
    const pageData = allEmployees.slice(startIdx, startIdx + safePageSize);

    const enrichedPage = pageData.map(emp => this._enrichEmployeeWithPayrollGrade(emp));
    const maskedPage = enrichedPage.map(emp => this._applyFieldMasking(emp, role, viewerEmployeeId));

    return {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
      data: maskedPage
    };
  }

  getEmployeeProfile({ role, viewerEmployeeId, employeeId }) {
    if (!roleGuard({
      role,
      action: ACTION.VIEW,
      resource: RESOURCE.EMPLOYEE_PROFILE,
      context: { viewerEmployeeId, targetEmployeeId: employeeId }
    })) {
      throw new PermissionError(`角色${role}无权限查看员工画像`);
    }

    const employee = this._registry.findById(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }

    const enriched = this._enrichEmployeeWithPayrollGrade(employee);

    const statusIndex = EMPLOYEE_STATUS_ORDER.indexOf(employee.status);
    const statusTimeline = EMPLOYEE_STATUS_ORDER.map((status, idx) => ({
      status,
      reached: idx <= statusIndex,
      current: idx === statusIndex,
      date: idx <= statusIndex ? (idx === statusIndex ? new Date() : null) : null,
      description: `状态: ${status}`
    }));

    const transferHistory = (employee.history && employee.history.transfers) || [];
    const promotionHistory = (employee.history && employee.history.promotions) || [];
    const adjustmentHistory = (employee.history && employee.history.adjustments) || [];
    const allChangeHistory = [
      ...transferHistory.map(h => ({ ...h, type: '调动' })),
      ...promotionHistory.map(h => ({ ...h, type: '晋升' })),
      ...adjustmentHistory.map(h => ({ ...h, type: '调整' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const yearsOfService = employee.calcYearsOfService ? employee.calcYearsOfService() : 0;

    const socialInsuranceLocation = employee.workLocation || '西安';

    const leaveBalance = {
      annualLeave: { total: 5 + Math.floor(yearsOfService / 2), used: 0, balance: 5 + Math.floor(yearsOfService / 2) },
      sickLeave: { total: 10, used: 0, balance: 10 },
      personalLeave: { total: 5, used: 0, balance: 5 },
      marriageLeave: { total: 3, used: 0, balance: 3 },
      maternityLeave: { total: 158, used: 0, balance: 158 },
      paternityLeave: { total: 15, used: 0, balance: 15 }
    };

    const profile = {
      basicInfo: this._applyFieldMasking(enriched, role, viewerEmployeeId),
      statusTimeline,
      changeHistory: allChangeHistory,
      yearsOfService,
      socialInsuranceLocation,
      leaveBalance,
      workLocation: employee.workLocation,
      entryDate: employee.entryDate,
      regularDate: employee.regularDate,
      deptPath: [employee.dept1, employee.dept2].filter(Boolean).join(' / ')
    };

    return profile;
  }

  updateEmployeeField({ role, operatorEmployeeId, employeeId, field, value }) {
    const employee = this._registry.findById(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }

    let resource = RESOURCE.EMPLOYEE_BASIC;
    if (field === 'idCard') resource = RESOURCE.EMPLOYEE_ID_CARD;
    else if (field === 'bankCard' || field === 'bankName') resource = RESOURCE.EMPLOYEE_BANK_CARD;
    else if (field === 'payrollGrade') resource = RESOURCE.EMPLOYEE_PAYROLL_GRADE;
    else if (field === 'salary' || field === 'baseAmount' || field === 'performanceAmount') resource = RESOURCE.EMPLOYEE_SALARY;

    if (!roleGuard({
      role,
      action: ACTION.UPDATE,
      resource,
      context: { viewerEmployeeId: operatorEmployeeId, targetEmployeeId: employeeId, field }
    })) {
      const fieldDescMap = {
        bankCard: '银行卡',
        payrollGrade: '薪级',
        salary: '薪资'
      };
      const fieldDesc = fieldDescMap[field] || field;
      throw new PermissionError(`角色${role}无权限修改员工${fieldDesc}`);
    }

    employee[field] = value;
    employee.updatedAt = new Date();
    return employee;
  }

  batchAdjustSalaryGrades({ role, operatorEmployeeId, adjustments }) {
    const canInitiate = role === ROLE.HR_SPECIALIST || role === ROLE.HR_DIRECTOR;

    const approvalNo = generateApprovalNo('SALARY');
    const approvalRecord = {
      approvalNo,
      type: 'SALARY_GRADE_ADJUSTMENT',
      operatorEmployeeId,
      role,
      adjustments,
      status: canInitiate ? 'PENDING_APPROVAL' : 'REJECTED',
      createdAt: new Date(),
      requiresApproval: role !== ROLE.HR_DIRECTOR
    };

    this._pendingApprovals.set(approvalNo, approvalRecord);
    this._approvalHistory.push(approvalRecord);

    if (!canInitiate) {
      throw new PermissionError(`角色${role}无权限批量调整薪级`);
    }

    if (role === ROLE.HR_DIRECTOR) {
      for (const adj of adjustments) {
        const emp = this._registry.findById(adj.employeeId);
        if (emp) {
          emp.payrollGrade = adj.newPayrollGrade;
          emp.updatedAt = new Date();
          if (!emp.history.adjustments) emp.history.adjustments = [];
          emp.history.adjustments.push({
            type: '薪级调整',
            from: adj.oldPayrollGrade,
            to: adj.newPayrollGrade,
            date: new Date(),
            approvalNo
          });
        }
      }
      approvalRecord.status = 'APPROVED_AND_EXECUTED';
    }

    return {
      approvalNo,
      requiresApproval: role !== ROLE.HR_DIRECTOR,
      status: approvalRecord.status,
      affectedCount: adjustments.length
    };
  }

  batchTransferDept({ role, operatorEmployeeId, transfers }) {
    const canInitiate = role === ROLE.HR_SPECIALIST || role === ROLE.HR_DIRECTOR;

    const approvalNo = generateApprovalNo('TRANSFER');
    const approvalRecord = {
      approvalNo,
      type: 'DEPARTMENT_TRANSFER',
      operatorEmployeeId,
      role,
      transfers,
      status: canInitiate ? 'PENDING_APPROVAL' : 'REJECTED',
      createdAt: new Date(),
      requiresApproval: true
    };

    this._pendingApprovals.set(approvalNo, approvalRecord);
    this._approvalHistory.push(approvalRecord);

    if (!canInitiate) {
      throw new PermissionError(`角色${role}无权限发起批量调部门`);
    }

    if (role === ROLE.HR_DIRECTOR) {
      for (const tr of transfers) {
        const emp = this._registry.findById(tr.employeeId);
        if (emp) {
          if (!emp.history.transfers) emp.history.transfers = [];
          emp.history.transfers.push({
            from: tr.oldDept1,
            to: tr.newDept1,
            date: new Date(),
            approvalNo
          });
        }
      }
    }

    return {
      approvalNo,
      requiresApproval: true,
      status: approvalRecord.status,
      affectedCount: transfers.length
    };
  }

  executeApproval(approvalNo, approved = true) {
    const record = this._pendingApprovals.get(approvalNo);
    if (!record) {
      throw new Error(`审批单号不存在: ${approvalNo}`);
    }

    if (approved) {
      if (record.type === 'SALARY_GRADE_ADJUSTMENT') {
        for (const adj of record.adjustments) {
          const emp = this._registry.findById(adj.employeeId);
          if (emp) {
            emp.payrollGrade = adj.newPayrollGrade;
            emp.updatedAt = new Date();
            if (!emp.history.adjustments) emp.history.adjustments = [];
            emp.history.adjustments.push({
              type: '薪级调整',
              from: adj.oldPayrollGrade,
              to: adj.newPayrollGrade,
              date: new Date(),
              approvalNo
            });
          }
        }
      } else if (record.type === 'DEPARTMENT_TRANSFER') {
        for (const tr of record.transfers) {
          const emp = this._registry.findById(tr.employeeId);
          if (emp) {
            const oldDept1 = emp.dept1;
            const oldDept2 = emp.dept2;
            emp.dept1 = tr.newDept1;
            emp.dept2 = tr.newDept2 || emp.dept2;
            emp.updatedAt = new Date();
            if (!emp.history.transfers) emp.history.transfers = [];
            emp.history.transfers.push({
              from: oldDept1,
              to: tr.newDept1,
              date: new Date(),
              approvalNo
            });
          }
        }
      }
      record.status = 'APPROVED_AND_EXECUTED';
    } else {
      record.status = 'REJECTED';
    }

    this._pendingApprovals.delete(approvalNo);
    return record;
  }

  _generateMockEmployee(id, data = {}) {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡'];
    const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '霞'];
    const depts = ['D01', 'D02', 'D03', 'D04', 'D05'];
    const subDepts = ['D0101', 'D0102', 'D0201', 'D0202', 'D0301', 'D0401', 'D0501'];
    const statuses = Object.values(EMPLOYEE_STATUS);
    const grades = ['VICE_PRESIDENT', 'EXPERT', 'INTERN', 'SOCIAL_ONLY', 'G01', 'G02', 'G03', 'G04', 'G05'];
    const locations = ['西安', '北京', '上海', '深圳', '成都', '杭州'];
    const tags = ['教育岗', '非教育岗', '外勤岗', '高管免打卡岗'];

    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];
    const name = data.name || (surname + givenName);

    const randomIdCard = () => {
      let num = '110101';
      const year = 1970 + Math.floor(Math.random() * 40);
      const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
      const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
      num += year + month + day;
      for (let i = 0; i < 3; i++) num += Math.floor(Math.random() * 10);
      num += String(Math.floor(Math.random() * 10));
      return num;
    };

    const randomMobile = () => {
      let num = '1';
      const prefixes = ['3', '5', '7', '8', '9'];
      num += prefixes[Math.floor(Math.random() * prefixes.length)];
      for (let i = 0; i < 9; i++) num += Math.floor(Math.random() * 10);
      return num;
    };

    const randomBankCard = () => {
      let num = '6222';
      for (let i = 0; i < 15; i++) num += Math.floor(Math.random() * 10);
      return num;
    };

    const randomEntryDate = () => {
      const start = new Date('2020-01-01').getTime();
      const end = new Date('2025-12-31').getTime();
      const t = start + Math.random() * (end - start);
      return new Date(t);
    };

    return {
      id: id || ('E' + String(Math.floor(Math.random() * 999999)).padStart(6, '0')),
      name,
      idCard: randomIdCard(),
      mobile: randomMobile(),
      entity: '陕西康源福祉教育科技',
      dept1: depts[Math.floor(Math.random() * depts.length)],
      dept2: subDepts[Math.floor(Math.random() * subDepts.length)],
      position: '岗位' + Math.floor(Math.random() * 100),
      positionTag: tags[Math.floor(Math.random() * tags.length)],
      directLeader: null,
      entryDate: randomEntryDate(),
      regularDate: null,
      status: statuses[Math.floor(Math.random() * 4)],
      payrollGrade: grades[Math.floor(Math.random() * grades.length)],
      workLocation: locations[Math.floor(Math.random() * locations.length)],
      firstWorkDate: null,
      exemptSocialTax: false,
      bankCard: randomBankCard(),
      bankName: '中国工商银行',
      isFinance: false,
      history: { transfers: [], promotions: [], adjustments: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    };
  }

  preloadMockEmployees(count = 10000) {
    const namePrefixes = ['张', '李', '王'];
    for (let i = 0; i < count; i++) {
      const empId = 'E' + String(i + 1).padStart(6, '0');
      let nameData = {};
      if (i < count * 0.3) {
        nameData.name = '张' + Math.floor(Math.random() * 1000);
      }
      const mock = this._generateMockEmployee(empId, nameData);
      if (i < count * 0.5) {
        mock.dept1 = 'D01';
      }
      if (i < count * 0.2) {
        mock.workLocation = '西安';
      }
      if (i < count * 0.6) {
        mock.status = EMPLOYEE_STATUS.REGULAR;
      }
      if (mock.entryDate.getTime() < new Date('2023-01-01').getTime()) {
        mock.entryDate = new Date(new Date('2023-01-01').getTime() + Math.random() * (new Date('2025-12-31').getTime() - new Date('2023-01-01').getTime()));
      }
      const emp = new EmployeeModel(mock);
      this._registry._employees.set(empId, emp);
      this._registry._updateNameIndex(empId, emp.name);
    }
    this._registry._employeeCounter = count;
    return count;
  }
}

module.exports = {
  ROLE,
  RESOURCE,
  ACTION,
  PermissionError,
  ApprovalPendingError,
  maskIdCard,
  maskBankCard,
  roleGuard,
  generateApprovalNo,
  MasterDataAPI
};
