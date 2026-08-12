'use strict';

const { EmployeeModel, EMPLOYEE_STATUS } = require('./employee_model.js');
const { genEmployeeId, _resetCounters: _resetDictCounters } = require('../../common/data_dictionary.js');

const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

const REQUIRED_FIELDS = ['name', 'idCard', 'mobile', 'payrollGrade', 'entryDate', 'dept1'];

class EmployeeRegistry {
  constructor() {
    this._employees = new Map();
    this._mobileIndex = new Map();
    this._idCardIndex = new Map();
    this._nameFuzzyIndex = new Map();
    this._dingtalkBindMap = new Map();
    this._dingtalkUserIdIndex = new Map();
    this._employeeCounter = 0;
  }

  _generateEmployeeId() {
    this._employeeCounter += 1;
    return 'E' + String(this._employeeCounter).padStart(6, '0');
  }

  _nextEmployeeId() {
    return this._generateEmployeeId();
  }

  validateRequiredFields(emp) {
    const errors = [];
    for (const field of REQUIRED_FIELDS) {
      if (emp[field] === undefined || emp[field] === null || emp[field] === '') {
        errors.push(`必填字段缺失: ${field}`);
      }
    }
    return errors;
  }

  validateIdCard(idCard) {
    const errors = [];
    if (!idCard || typeof idCard !== 'string') {
      return ['身份证号格式错误: 应为字符串'];
    }
    if (idCard.length !== 18) {
      errors.push(`身份证号长度错误: 应为18位，实际${idCard.length}位`);
      return errors;
    }
    if (!/^\d{17}[\dX]$/.test(idCard)) {
      errors.push('身份证号格式错误: 前17位应为数字，第18位应为数字或X');
      return errors;
    }

    let sum = 0;
    for (let i = 0; i < 17; i++) {
      sum += parseInt(idCard.charAt(i), 10) * ID_CARD_WEIGHTS[i];
    }
    const mod = sum % 11;
    const expectedCheck = ID_CARD_CHECK_CODES[mod];
    const actualCheck = idCard.charAt(17).toUpperCase();

    if (expectedCheck !== actualCheck) {
      errors.push(`身份证校验位错误: 第18位应为${expectedCheck}，实际为${actualCheck}`);
    }

    return errors;
  }

  validateMobile(mobile) {
    const errors = [];
    if (!mobile || typeof mobile !== 'string') {
      return ['手机号格式错误: 应为字符串'];
    }
    if (mobile.length !== 11) {
      errors.push(`手机号长度错误: 应为11位，实际${mobile.length}位`);
      return errors;
    }
    if (!/^1\d{10}$/.test(mobile)) {
      errors.push('手机号格式错误: 应为1开头的11位数字');
    }
    return errors;
  }

  validateBankCard(bankCard) {
    const errors = [];
    if (!bankCard) {
      return errors;
    }
    if (typeof bankCard !== 'string') {
      return ['银行卡号格式错误: 应为字符串'];
    }
    const digits = bankCard.replace(/\s/g, '');
    if (!/^\d+$/.test(digits)) {
      errors.push('银行卡号格式错误: 应全为数字');
      return errors;
    }
    if (digits.length < 13 || digits.length > 19) {
      errors.push(`银行卡号长度错误: 应为13-19位，实际${digits.length}位`);
      return errors;
    }

    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits.charAt(i), 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    if (sum % 10 !== 0) {
      errors.push('银行卡Luhn校验失败');
    }
    return errors;
  }

  validateEmployee(emp) {
    const errors = [];
    errors.push(...this.validateRequiredFields(emp));
    if (emp.idCard) {
      errors.push(...this.validateIdCard(emp.idCard));
    }
    if (emp.mobile) {
      errors.push(...this.validateMobile(emp.mobile));
    }
    if (emp.bankCard) {
      errors.push(...this.validateBankCard(emp.bankCard));
    }
    return errors;
  }

  importFromArray(employees, options = {}) {
    const { createdBy = null, approvalNo = null } = options;
    const failed = [];
    let successCount = 0;

    for (let i = 0; i < employees.length; i++) {
      const row = i + 1;
      const empData = employees[i];
      const rowErrors = [];

      rowErrors.push(...this.validateEmployee(empData));

      if (rowErrors.length === 0) {
        const mobileKey = empData.mobile;
        const idCardKey = empData.idCard;

        if (this._mobileIndex.has(mobileKey) || this._idCardIndex.has(idCardKey)) {
          failed.push({ row, skipped: true, errors: ['手机号或身份证号已存在，跳过幂等导入'] });
          continue;
        }

        try {
          const employeeId = this._nextEmployeeId();
          const employee = new EmployeeModel({
            ...empData,
            id: employeeId,
            entryDate: empData.entryDate instanceof Date ? empData.entryDate : new Date(empData.entryDate),
            firstWorkDate: empData.firstWorkDate
              ? (empData.firstWorkDate instanceof Date ? empData.firstWorkDate : new Date(empData.firstWorkDate))
              : null,
            regularDate: empData.regularDate
              ? (empData.regularDate instanceof Date ? empData.regularDate : new Date(empData.regularDate))
              : null,
            status: empData.status || EMPLOYEE_STATUS.PENDING_ONBOARDING,
            history: empData.history || { transfers: [], promotions: [], adjustments: [] },
            createdAt: new Date(),
            updatedAt: new Date()
          });

          if (createdBy) employee.createdBy = createdBy;
          if (approvalNo) employee.approvalNo = approvalNo;

          this._employees.set(employeeId, employee);
          this._mobileIndex.set(mobileKey, employeeId);
          this._idCardIndex.set(idCardKey, employeeId);
          this._updateNameIndex(employeeId, employee.name);

          successCount++;
        } catch (err) {
          rowErrors.push(`创建员工失败: ${err.message}`);
        }
      }

      if (rowErrors.length > 0) {
        failed.push({ row, errors: rowErrors });
      }
    }

    return { success: successCount, failed };
  }

  _updateNameIndex(employeeId, name) {
    if (!name) return;
    const lowerName = name.toLowerCase();
    for (let len = 1; len <= lowerName.length; len++) {
      for (let start = 0; start + len <= lowerName.length; start++) {
        const sub = lowerName.substring(start, start + len);
        if (!this._nameFuzzyIndex.has(sub)) {
          this._nameFuzzyIndex.set(sub, new Set());
        }
        this._nameFuzzyIndex.get(sub).add(employeeId);
      }
    }
  }

  findByName(keyword) {
    if (!keyword || typeof keyword !== 'string') return [];
    const lowerKeyword = keyword.toLowerCase();
    const matchSets = [];

    const directSet = this._nameFuzzyIndex.get(lowerKeyword);
    if (directSet) {
      matchSets.push(directSet);
    } else {
      for (const [sub, ids] of this._nameFuzzyIndex) {
        if (sub.includes(lowerKeyword)) {
          matchSets.push(ids);
        }
      }
    }

    if (matchSets.length === 0) return [];

    const unionIds = new Set();
    for (const s of matchSets) {
      for (const id of s) unionIds.add(id);
    }

    const result = [];
    for (const id of unionIds) {
      const emp = this._employees.get(id);
      if (emp && emp.name && emp.name.toLowerCase().includes(lowerKeyword)) {
        result.push(emp);
      }
    }
    return result;
  }

  findByMobile(mobile) {
    if (!mobile) return null;
    const employeeId = this._mobileIndex.get(mobile);
    if (!employeeId) return null;
    return this._employees.get(employeeId) || null;
  }

  findByDingtalkUserId(dingtalkUserId) {
    if (!dingtalkUserId) return null;
    const employeeId = this._dingtalkUserIdIndex.get(dingtalkUserId);
    if (!employeeId) return null;
    return this._employees.get(employeeId) || null;
  }

  findById(employeeId) {
    return this._employees.get(employeeId) || null;
  }

  get size() {
    return this._employees.size;
  }

  getAllEmployees() {
    return Array.from(this._employees.values());
  }

  bindDingtalkUser(employeeId, bindInfo) {
    const { dingtalkUserId, deptId } = bindInfo || {};
    const employee = this._employees.get(employeeId);
    if (!employee) {
      throw new Error(`员工不存在: ${employeeId}`);
    }
    if (!dingtalkUserId) {
      throw new Error('钉钉用户ID不能为空');
    }
    if (this._dingtalkUserIdIndex.has(dingtalkUserId)) {
      const existingEmpId = this._dingtalkUserIdIndex.get(dingtalkUserId);
      if (existingEmpId !== employeeId) {
        throw new Error(`钉钉用户ID已绑定其他员工: ${dingtalkUserId}`);
      }
    }

    const oldBind = this._dingtalkBindMap.get(employeeId);
    if (oldBind && oldBind.dingtalkUserId && oldBind.dingtalkUserId !== dingtalkUserId) {
      this._dingtalkUserIdIndex.delete(oldBind.dingtalkUserId);
    }

    this._dingtalkBindMap.set(employeeId, { dingtalkUserId, deptId, updatedAt: new Date() });
    this._dingtalkUserIdIndex.set(dingtalkUserId, employeeId);
    return this._dingtalkBindMap.get(employeeId);
  }

  getDingtalkBind(employeeId) {
    const bind = this._dingtalkBindMap.get(employeeId);
    if (!bind) return null;
    return { ...bind };
  }

  unbindDingtalkUser(employeeId) {
    const bind = this._dingtalkBindMap.get(employeeId);
    if (!bind) return false;
    if (bind.dingtalkUserId) {
      this._dingtalkUserIdIndex.delete(bind.dingtalkUserId);
    }
    this._dingtalkBindMap.delete(employeeId);
    return true;
  }

  clear() {
    this._employees.clear();
    this._mobileIndex.clear();
    this._idCardIndex.clear();
    this._nameFuzzyIndex.clear();
    this._dingtalkBindMap.clear();
    this._dingtalkUserIdIndex.clear();
    this._employeeCounter = 0;
  }
}

module.exports = {
  EmployeeRegistry,
  REQUIRED_FIELDS,
  ID_CARD_WEIGHTS,
  ID_CARD_CHECK_CODES
};
