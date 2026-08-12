const ALLOWANCE_TYPE = Object.freeze({
  FIXED: 'FIXED',
  FLOAT: 'FLOAT',
  ONCE: 'ONCE',
  DAILY: 'DAILY'
});

const ALLOWANCE_TYPE_LABEL = Object.freeze({
  FIXED: '固定',
  FLOAT: '浮动',
  ONCE: '一次性',
  DAILY: '按天'
});

const APPLY_TO_TYPE = Object.freeze({
  ALL: 'ALL',
  DEPT: 'DEPT',
  GRADE: 'GRADE',
  EMPLOYEE: 'EMPLOYEE'
});

class MissingApprovalError extends Error {
  constructor(allowanceCode, allowanceName) {
    super(`津贴「${allowanceName || allowanceCode}」需要审批，缺少approvalNo审批单号`);
    this.name = 'MissingApprovalError';
    this.allowanceCode = allowanceCode;
    this.allowanceName = allowanceName;
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`无效日期格式：${dateStr}`);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function isMonthInRange(year, month, effectiveDate, expireDate) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  monthStart.setHours(0, 0, 0, 0);
  monthEnd.setHours(23, 59, 59, 999);

  if (effectiveDate && effectiveDate.getTime() > monthEnd.getTime()) {
    return false;
  }
  if (expireDate && expireDate.getTime() < monthStart.getTime()) {
    return false;
  }
  return true;
}

class AllowanceModel {
  constructor(data = {}) {
    const validTypes = Object.values(ALLOWANCE_TYPE);
    if (data.type !== undefined && !validTypes.includes(data.type)) {
      throw new Error(`津贴类型必须是${validTypes.join('/')}之一，实际=${data.type}`);
    }
    const validApplyTypes = Object.values(APPLY_TO_TYPE);
    if (data.applyTo && data.applyTo.type && !validApplyTypes.includes(data.applyTo.type)) {
      throw new Error(`适用范围类型必须是${validApplyTypes.join('/')}之一，实际=${data.applyTo.type}`);
    }

    Object.assign(this, {
      id: null,
      code: null,
      name: null,
      type: ALLOWANCE_TYPE.FIXED,
      amount: 0,
      applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
      effectiveDate: null,
      expireDate: null,
      requireApproval: true
    }, data);

    if (this.effectiveDate) {
      this.effectiveDate = parseDate(this.effectiveDate);
    }
    if (this.expireDate) {
      this.expireDate = parseDate(this.expireDate);
    }
    if (!this.applyTo || typeof this.applyTo !== 'object') {
      this.applyTo = { type: APPLY_TO_TYPE.ALL, targetIds: [] };
    }
    if (!this.applyTo.type) {
      this.applyTo.type = APPLY_TO_TYPE.ALL;
    }
    if (!Array.isArray(this.applyTo.targetIds)) {
      this.applyTo.targetIds = [];
    }
  }

  get typeLabel() {
    return ALLOWANCE_TYPE_LABEL[this.type] || this.type;
  }

  isApplicableToEmployee(employee) {
    if (!employee) return false;
    const { type, targetIds } = this.applyTo;
    switch (type) {
      case APPLY_TO_TYPE.ALL:
        return true;
      case APPLY_TO_TYPE.DEPT:
        return targetIds.includes(employee.dept1) || targetIds.includes(employee.dept2);
      case APPLY_TO_TYPE.GRADE:
        return targetIds.includes(employee.payrollGrade);
      case APPLY_TO_TYPE.EMPLOYEE:
        return targetIds.includes(employee.id);
      default:
        return true;
    }
  }

  isMonthApplicable(year, month) {
    return isMonthInRange(year, month, this.effectiveDate, this.expireDate);
  }
}

class AllowanceCenter {
  constructor() {
    this._allowances = new Map();
    this._manualAdjustments = [];
    this._loadPresetAllowances();
  }

  _loadPresetAllowances() {
    const presets = [
      new AllowanceModel({
        id: 'PRESET_HOUSING',
        code: 'HOUSING',
        name: '住房补贴',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 500,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_TRANSPORT',
        code: 'TRANSPORT',
        name: '交通补贴',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 300,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_COMMUNICATION',
        code: 'COMMUNICATION',
        name: '通讯补贴',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 200,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_MEAL',
        code: 'MEAL',
        name: '餐补',
        type: ALLOWANCE_TYPE.DAILY,
        amount: 20,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_ATTENDANCE',
        code: 'ATTENDANCE',
        name: '全勤奖',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 300,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_HIGH_TEMP',
        code: 'HIGH_TEMP',
        name: '高温补贴',
        type: ALLOWANCE_TYPE.ONCE,
        amount: 500,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-06-01',
        expireDate: '2026-08-31',
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_FESTIVAL_SPRING',
        code: 'FESTIVAL_SPRING',
        name: '春节津贴',
        type: ALLOWANCE_TYPE.ONCE,
        amount: 1000,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-01-20',
        expireDate: '2026-02-28',
        requireApproval: true
      }),
      new AllowanceModel({
        id: 'PRESET_FESTIVAL_DRAGON',
        code: 'FESTIVAL_DRAGON',
        name: '端午津贴',
        type: ALLOWANCE_TYPE.ONCE,
        amount: 500,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-06-01',
        expireDate: '2026-06-30',
        requireApproval: true
      }),
      new AllowanceModel({
        id: 'PRESET_FESTIVAL_MID',
        code: 'FESTIVAL_MID',
        name: '中秋津贴',
        type: ALLOWANCE_TYPE.ONCE,
        amount: 500,
        applyTo: { type: APPLY_TO_TYPE.ALL, targetIds: [] },
        effectiveDate: '2026-09-01',
        expireDate: '2026-09-30',
        requireApproval: true
      }),
      new AllowanceModel({
        id: 'PRESET_ASSIGN',
        code: 'ASSIGN',
        name: '外派补贴',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 1500,
        applyTo: { type: APPLY_TO_TYPE.DEPT, targetIds: ['外派项目组'] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: true
      }),
      new AllowanceModel({
        id: 'PRESET_EDU_HOUR',
        code: 'EDU_HOUR',
        name: '教育课时补贴',
        type: ALLOWANCE_TYPE.FLOAT,
        amount: 80,
        applyTo: { type: APPLY_TO_TYPE.GRADE, targetIds: ['TEACHER', 'INSTRUCTOR'] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: false
      }),
      new AllowanceModel({
        id: 'PRESET_CERTIFICATE',
        code: 'CERTIFICATE',
        name: '证书补贴',
        type: ALLOWANCE_TYPE.ONCE,
        amount: 2000,
        applyTo: { type: APPLY_TO_TYPE.EMPLOYEE, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: true
      }),
      new AllowanceModel({
        id: 'PRESET_ONLY_CHILD',
        code: 'ONLY_CHILD',
        name: '独生子女补贴',
        type: ALLOWANCE_TYPE.FIXED,
        amount: 100,
        applyTo: { type: APPLY_TO_TYPE.EMPLOYEE, targetIds: [] },
        effectiveDate: '2026-01-01',
        expireDate: null,
        requireApproval: true
      })
    ];

    presets.forEach(a => this._allowances.set(a.code, a));
  }

  registerAllowance(allowance) {
    const model = allowance instanceof AllowanceModel ? allowance : new AllowanceModel(allowance);
    if (!model.code) {
      throw new Error('津贴code不能为空');
    }
    this._allowances.set(model.code, model);
    return model;
  }

  getAllowance(code) {
    return this._allowances.get(code) || null;
  }

  listAllAllowances() {
    return [...this._allowances.values()];
  }

  _isHighTempApplicable(code, month) {
    if (code === 'HIGH_TEMP') {
      return month === 6 || month === 7 || month === 8;
    }
    return true;
  }

  calcMonthlyAllowances({ employee, year, month, workdaysOfMonth = 22 }) {
    if (!employee) {
      throw new Error('employee参数不能为空');
    }
    if (!year || !month) {
      throw new Error('year和month参数不能为空');
    }

    const details = [];
    let total = 0;

    for (const allowance of this._allowances.values()) {
      if (!allowance.isApplicableToEmployee(employee)) {
        continue;
      }
      if (!allowance.isMonthApplicable(year, month)) {
        continue;
      }
      if (!this._isHighTempApplicable(allowance.code, month)) {
        continue;
      }

      let calcAmount = 0;
      let calcNote = '';

      switch (allowance.type) {
        case ALLOWANCE_TYPE.DAILY:
          calcAmount = workdaysOfMonth * allowance.amount;
          calcNote = `${workdaysOfMonth}工作日 × ${allowance.amount}元/天`;
          break;
        case ALLOWANCE_TYPE.FIXED:
        case ALLOWANCE_TYPE.ONCE:
          calcAmount = allowance.amount;
          calcNote = `${allowance.typeLabel}津贴`;
          break;
        case ALLOWANCE_TYPE.FLOAT:
          calcAmount = allowance.amount;
          calcNote = `浮动津贴(基准)`;
          break;
        default:
          calcAmount = allowance.amount;
          calcNote = allowance.typeLabel;
      }

      details.push({
        code: allowance.code,
        name: allowance.name,
        type: allowance.type,
        typeLabel: allowance.typeLabel,
        amount: calcAmount,
        note: calcNote,
        source: 'PRESET'
      });
      total += calcAmount;
    }

    const manualAdj = this._manualAdjustments.filter(adj =>
      adj.employeeId === employee.id &&
      adj.year === year &&
      adj.month === month
    );
    for (const adj of manualAdj) {
      details.push({
        code: adj.code,
        name: adj.name,
        type: 'MANUAL',
        typeLabel: '手动调整',
        amount: adj.amount,
        note: adj.reason || '手动加扣',
        approvalNo: adj.approvalNo,
        source: 'MANUAL',
        adjustedAt: adj.adjustedAt
      });
      total += adj.amount;
    }

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      year,
      month,
      workdaysOfMonth,
      details,
      total
    };
  }

  addManualAdjustment({ employeeId, code, name, amount, approvalNo, reason, year, month }) {
    if (!employeeId) {
      throw new Error('employeeId不能为空');
    }
    if (code === undefined || code === null) {
      throw new Error('code不能为空');
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      throw new Error('amount必须是有效数字');
    }

    const existingAllowance = this._allowances.get(code);
    const requireApproval = existingAllowance ? existingAllowance.requireApproval : true;

    if (requireApproval && !approvalNo) {
      throw new MissingApprovalError(code, name || (existingAllowance && existingAllowance.name));
    }

    const record = {
      id: `ADJ_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      employeeId,
      code,
      name: name || (existingAllowance && existingAllowance.name) || code,
      amount: Number(amount),
      approvalNo: approvalNo || null,
      reason: reason || '',
      year: year || null,
      month: month || null,
      requireApproval,
      adjustedAt: new Date()
    };

    this._manualAdjustments.push(record);
    return record;
  }

  getManualAdjustments(employeeId) {
    if (employeeId) {
      return this._manualAdjustments.filter(adj => adj.employeeId === employeeId);
    }
    return [...this._manualAdjustments];
  }

  findManualAdjustmentsByApprovalNo(approvalNo) {
    return this._manualAdjustments.filter(adj => adj.approvalNo === approvalNo);
  }
}

module.exports = {
  AllowanceModel,
  AllowanceCenter,
  ALLOWANCE_TYPE,
  ALLOWANCE_TYPE_LABEL,
  APPLY_TO_TYPE,
  MissingApprovalError,
  isMonthInRange
};
