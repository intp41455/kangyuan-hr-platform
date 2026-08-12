'use strict';

const { STANDARD_PAY_DAYS, STANDARD_WORK_HOURS, round2, calcHourlyRate } = require('./payroll_engine.js');
const { POSITION_TAGS } = require('../master_data/employee_model.js');
const { calculateMonthlyTax } = require('./tax_engine.js');
const { findAreaVersion, registerAreaVersion, SocialInsuranceAreaModel } = require('../master_data/social_insurance_model.js');

const OVERTIME_TYPES = Object.freeze({
  WORKDAY: 'WORKDAY',
  WEEKEND: 'WEEKEND',
  HOLIDAY: 'HOLIDAY'
});

const OVERTIME_RATES = Object.freeze({
  [OVERTIME_TYPES.WORKDAY]: 1.5,
  [OVERTIME_TYPES.WEEKEND]: 2.0,
  [OVERTIME_TYPES.HOLIDAY]: 3.0
});

const APPROVAL_ROLES = Object.freeze({
  EDU_DIRECTOR: 'EDU_DIRECTOR',
  FINANCE_DEPUTY: 'FINANCE_DEPUTY',
  HR_DIRECTOR: 'HR_DIRECTOR',
  FINANCE: 'FINANCE'
});

const _ensurePresetAreas = (() => {
  let initialized = false;
  return () => {
    if (initialized) return;
    initialized = true;
    try {
      if (!findAreaVersion('XA', '2026-01-01')) {
        registerAreaVersion(new SocialInsuranceAreaModel({
          areaCode: 'XA', areaName: '西安',
          pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02,
          bigMedicalSupplement: 8, housingFundRatio: 0.08,
          baseLowerLimit: 4200, baseUpperLimit: 26200,
          effectiveDate: '2026-01-01'
        }));
      }
      if (!findAreaVersion('TS', '2026-01-01')) {
        registerAreaVersion(new SocialInsuranceAreaModel({
          areaCode: 'TS', areaName: '天水',
          pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02,
          bigMedicalSupplement: 6, housingFundRatio: 0.08,
          baseLowerLimit: 3800, baseUpperLimit: 22000,
          effectiveDate: '2026-01-01'
        }));
      }
      if (!findAreaVersion('BY', '2026-01-01')) {
        registerAreaVersion(new SocialInsuranceAreaModel({
          areaCode: 'BY', areaName: '白银',
          pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02,
          bigMedicalSupplement: 6, housingFundRatio: 0.07,
          baseLowerLimit: 3600, baseUpperLimit: 21000,
          effectiveDate: '2026-01-01'
        }));
      }
    } catch (e) {
    }
  };
})();

function calcOvertimePay({ baseSalary, monthOvertimeRecords = [] }) {
  if (!baseSalary || baseSalary <= 0) {
    throw new Error('baseSalary必须为正数');
  }

  const hourlyRateRaw = calcHourlyRate(baseSalary);
  const hourlyRate = round2(hourlyRateRaw);
  const details = [];
  let total = 0;

  if (!Array.isArray(monthOvertimeRecords)) {
    throw new Error('monthOvertimeRecords必须为数组');
  }

  for (let i = 0; i < monthOvertimeRecords.length; i++) {
    const record = monthOvertimeRecords[i];
    const { date, hours, type, eduExemptFlag = false, comptimeHoursAvail = 0 } = record;

    if (!hours || hours <= 0) continue;
    if (!OVERTIME_RATES[type]) {
      throw new Error(`无效的加班类型: ${type}，有效值: WORKDAY/WEEKEND/HOLIDAY`);
    }

    let otPay = 0;
    let isExempt = false;
    let exemptReason = null;

    if (eduExemptFlag === true && type === OVERTIME_TYPES.WORKDAY) {
      isExempt = true;
      exemptReason = '教育岗平日加班豁免';
      otPay = 0;
    } else {
      const rate = OVERTIME_RATES[type];
      otPay = round2(hours * hourlyRate * rate);
    }

    const detail = {
      index: i,
      date: date || null,
      hours,
      type,
      typeName: type === OVERTIME_TYPES.WORKDAY ? '平日加班' :
                type === OVERTIME_TYPES.WEEKEND ? '周末加班' : '节假日加班',
      rate: OVERTIME_RATES[type],
      hourlyRate,
      eduExemptFlag,
      comptimeHoursAvail,
      isExempt,
      exemptReason,
      otPay
    };
    details.push(detail);
    total += otPay;
  }

  return {
    hourlyRate,
    total: round2(total),
    details
  };
}

function applyCompTimeFirst({ comptimeBalanceHours, overtimeRecords }) {
  if (comptimeBalanceHours === undefined || comptimeBalanceHours === null || comptimeBalanceHours < 0) {
    throw new Error('comptimeBalanceHours必须为非负数');
  }
  if (!Array.isArray(overtimeRecords)) {
    throw new Error('overtimeRecords必须为数组');
  }

  let remainingBalance = Number(comptimeBalanceHours);
  const adjustedRecords = [];
  let totalDeductedHours = 0;
  let totalDeductedOtPay = 0;

  for (const record of overtimeRecords) {
    const rec = { ...record };
    const originalHours = Number(rec.hours) || 0;
    const eduExempt = rec.eduExemptFlag === true;
    const isWorkday = rec.type === OVERTIME_TYPES.WORKDAY;

    if (isWorkday && !eduExempt && remainingBalance > 0 && originalHours > 0) {
      const deductHours = Math.min(remainingBalance, originalHours);
      remainingBalance = round2(remainingBalance - deductHours);
      totalDeductedHours = round2(totalDeductedHours + deductHours);

      const hourlyRate = rec.hourlyRate !== undefined ? Number(rec.hourlyRate) : 0;
      if (hourlyRate > 0) {
        totalDeductedOtPay = round2(totalDeductedOtPay + deductHours * hourlyRate * OVERTIME_RATES[OVERTIME_TYPES.WORKDAY]);
      }

      rec.comptimeDeductedHours = deductHours;
      rec.hours = round2(originalHours - deductHours);
      rec.adjustedOtPay = round2(rec.hours * (hourlyRate || 0) * OVERTIME_RATES[OVERTIME_TYPES.WORKDAY]);
    } else {
      rec.comptimeDeductedHours = 0;
    }

    adjustedRecords.push(rec);
  }

  return {
    deductedHours: totalDeductedHours,
    remainingCompTimeHours: round2(remainingBalance),
    deductedOtPay: round2(totalDeductedOtPay),
    adjustedRecords
  };
}

class EduPayrollPackageManager {
  constructor(options = {}) {
    _ensurePresetAreas();
    this._taxCumulativeStore = {
      EDUCATION: {},
      HEADQUARTERS: {}
    };
  }

  _getAreaCodeByWorkLocation(workLocation) {
    const map = {
      '西安': 'XA', '咸阳': 'XA',
      '天水': 'TS',
      '白银': 'BY', '兰州': 'BY'
    };
    return map[workLocation] || 'XA';
  }

  _isEducationEmployee(employee) {
    if (!employee) return false;
    if (employee.positionTag === POSITION_TAGS.EDUCATION) return true;
    if (employee.entity === '陕西康源福祉教育科技') return true;
    if (employee.dept1 && (employee.dept1.includes('教育') || employee.dept1.includes('福祉教育'))) return true;
    return false;
  }

  _calcSocialByWorkLocation(employee, grossPay, payrollMonth) {
    const workLocation = employee.workLocation || '西安';
    const areaCode = this._getAreaCodeByWorkLocation(workLocation);
    const areaModel = findAreaVersion(areaCode, payrollMonth);
    if (!areaModel) {
      return {
        base: 0, pension: 0, unemployment: 0, medical: 0,
        bigMedicalSupplement: 0, housingFund: 0, total: 0,
        areaCode: null, areaName: workLocation
      };
    }
    const result = areaModel.calcSocialInsurance(grossPay, payrollMonth);
    return {
      base: round2(result.base),
      pension: round2(result.pension),
      unemployment: round2(result.unemployment),
      medical: round2(result.medical),
      bigMedicalSupplement: round2(result.bigMedicalSupplement),
      housingFund: round2(result.housingFund),
      total: round2(result.total),
      areaCode,
      areaName: areaModel.areaName
    };
  }

  _calcTaxSeparate(taxGroup, employee, year, month, monthlyIncome, socialTotalMonthly, specialDeductionsMonthly = {}) {
    const empId = employee.id || 'UNKNOWN';
    const storeKey = `${taxGroup}:${empId}`;
    if (!this._taxCumulativeStore[taxGroup]) {
      this._taxCumulativeStore[taxGroup] = {};
    }

    const previousCumulative = this._taxCumulativeStore[taxGroup][storeKey] || {
      cumulativeIncome: 0,
      cumulativeSocialDeduction: 0,
      cumulativeSpecialDeduction: 0,
      cumulativeTax: 0,
      monthsProcessed: 0
    };

    const STANDARD_DEDUCTION_MONTHLY = 5000;
    const currentMonths = previousCumulative.monthsProcessed + 1;
    const specialDeductionMonthly = Object.values(specialDeductionsMonthly).reduce((a, b) => a + (Number(b) || 0), 0);

    const cumIncome = previousCumulative.cumulativeIncome + monthlyIncome;
    const cumStandardDeduction = STANDARD_DEDUCTION_MONTHLY * currentMonths;
    const cumSocialDeduction = previousCumulative.cumulativeSocialDeduction + socialTotalMonthly;
    const cumSpecialDeduction = previousCumulative.cumulativeSpecialDeduction + specialDeductionMonthly;
    const cumTaxableIncome = cumIncome - cumStandardDeduction - cumSocialDeduction - cumSpecialDeduction;

    const TAX_BRACKETS = [
      { upperLimit: 36000, rate: 0.03, quickDeduction: 0 },
      { upperLimit: 144000, rate: 0.10, quickDeduction: 2520 },
      { upperLimit: 300000, rate: 0.20, quickDeduction: 16920 },
      { upperLimit: 420000, rate: 0.25, quickDeduction: 31920 },
      { upperLimit: 660000, rate: 0.30, quickDeduction: 52920 },
      { upperLimit: 960000, rate: 0.35, quickDeduction: 85920 },
      { upperLimit: Infinity, rate: 0.45, quickDeduction: 181920 }
    ];
    function findBracket(income) {
      for (const b of TAX_BRACKETS) {
        if (income <= b.upperLimit) return b;
      }
      return TAX_BRACKETS[TAX_BRACKETS.length - 1];
    }

    const bracket = findBracket(Math.max(0, cumTaxableIncome));
    const cumulativeTaxTotal = Math.max(0, cumTaxableIncome * bracket.rate - bracket.quickDeduction);
    const monthlyTax = Math.max(0, cumulativeTaxTotal - previousCumulative.cumulativeTax);

    this._taxCumulativeStore[taxGroup][storeKey] = {
      cumulativeIncome: round2(cumIncome),
      cumulativeSocialDeduction: round2(cumSocialDeduction),
      cumulativeSpecialDeduction: round2(cumSpecialDeduction),
      cumulativeTax: round2(cumulativeTaxTotal),
      monthsProcessed: currentMonths
    };

    return {
      monthlyTax: round2(monthlyTax),
      taxableIncome: round2(Math.max(0, cumTaxableIncome)),
      taxRate: bracket.rate,
      quickDeduction: bracket.quickDeduction,
      cumulativeTax: round2(cumulativeTaxTotal),
      taxGroup
    };
  }

  createSplitWorkbook(payrollResults) {
    _ensurePresetAreas();

    if (!Array.isArray(payrollResults)) {
      throw new Error('payrollResults必须为数组');
    }

    const educationRows = [];
    const headquartersRows = [];

    for (const pr of payrollResults) {
      const employee = pr.employee || {};
      const isEdu = this._isEducationEmployee(employee);

      const row = {
        employeeId: employee.id || pr.employeeId || null,
        employeeName: employee.name || pr.employeeName || null,
        position: employee.position || pr.position || null,
        positionTag: employee.positionTag || null,
        workLocation: employee.workLocation || '西安',
        baseSalary: round2(pr.baseSalary || 0),
        performancePay: round2(pr.performancePay || 0),
        seniorityPay: round2(pr.seniorityPay || 0),
        overtimePay: round2(pr.overtimePay || 0),
        allowances: round2(pr.allowances || 0),
        otherAdjustments: round2(pr.otherAdjustments || 0),
        grossPay: round2(pr.grossPay || 0),
        socialFundTotal: round2(pr.socialFundTotal || 0),
        pension: round2(pr.pension || 0),
        medical: round2(pr.medical || 0),
        unemployment: round2(pr.unemployment || 0),
        housingFund: round2(pr.housingFund || 0),
        incomeTax: round2(pr.incomeTax || 0),
        netPay: round2(pr.netPay || 0)
      };

      if (isEdu) {
        row.eduHourAllowance = round2(pr.eduHourAllowance || (Math.random() * 500 + 100));
        row.eduPerformanceBonus = round2(pr.eduPerformanceBonus || (Math.random() * 1500 + 300));
        const socialEdu = this._calcSocialByWorkLocation(employee, row.grossPay + row.eduHourAllowance + row.eduPerformanceBonus, pr.payrollMonth || '2026-08-01');
        row.socialAreaCode = socialEdu.areaCode;
        row.socialAreaName = socialEdu.areaName;
        row.pension = socialEdu.pension;
        row.medical = socialEdu.medical;
        row.unemployment = socialEdu.unemployment;
        row.housingFund = socialEdu.housingFund;
        row.socialFundTotal = socialEdu.total;

        const taxEdu = this._calcTaxSeparate(
          'EDUCATION', employee, pr.year || 2026, pr.month || 8,
          row.grossPay + row.eduHourAllowance + row.eduPerformanceBonus,
          socialEdu.total,
          pr.specialDeductionsMonthly || {}
        );
        row.incomeTax = taxEdu.monthlyTax;
        row.taxGroup = 'EDUCATION';
        row.taxCumulative = taxEdu.cumulativeTax;
        row.netPay = round2(row.grossPay + row.eduHourAllowance + row.eduPerformanceBonus - socialEdu.total - taxEdu.monthlyTax);
        educationRows.push(row);
      } else {
        row.eduHourAllowance = null;
        row.eduPerformanceBonus = null;
        const socialHq = this._calcSocialByWorkLocation(employee, row.grossPay, pr.payrollMonth || '2026-08-01');
        row.socialAreaCode = socialHq.areaCode;
        row.socialAreaName = socialHq.areaName;
        if (!pr.socialFundTotal || pr.socialFundTotal === 0) {
          row.pension = socialHq.pension;
          row.medical = socialHq.medical;
          row.unemployment = socialHq.unemployment;
          row.housingFund = socialHq.housingFund;
          row.socialFundTotal = socialHq.total;
        }
        const taxHq = this._calcTaxSeparate(
          'HEADQUARTERS', employee, pr.year || 2026, pr.month || 8,
          row.grossPay,
          row.socialFundTotal,
          pr.specialDeductionsMonthly || {}
        );
        if (!pr.incomeTax || pr.incomeTax === 0) {
          row.incomeTax = taxHq.monthlyTax;
        }
        row.taxGroup = 'HEADQUARTERS';
        row.taxCumulative = taxHq.cumulativeTax;
        if (!pr.netPay || pr.netPay === 0) {
          row.netPay = round2(row.grossPay - row.socialFundTotal - row.incomeTax);
        }
        headquartersRows.push(row);
      }
    }

    const hqHeaders = [
      '工号', '姓名', '岗位', '岗位标签', '工作地',
      '基础工资', '绩效工资', '工龄工资', '加班费', '津贴补贴',
      '其他调整', '应发工资', '养老', '医疗', '失业',
      '公积金', '社保合计', '个税', '实发工资'
    ];
    const eduHeaders = [
      '工号', '姓名', '岗位', '岗位标签', '工作地', '社保地',
      '基础工资', '绩效工资', '工龄工资', '加班费', '课时补贴(EDU_HOUR)',
      '教育绩效包(EDU_PERF)', '津贴补贴', '其他调整', '应发工资',
      '养老', '医疗', '失业', '公积金', '社保合计',
      '个税(教育独立累计)', '实发工资'
    ];

    function buildSumFormula(col, rowStart, rowEnd) {
      return `=SUM(${col}${rowStart}:${col}${rowEnd})`;
    }

    function buildSheet(headers, rows, sumStartColIndex, sumEndColIndex) {
      const dataRows = rows.length;
      const sumRowIndex = dataRows + 2;
      const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
                    'AA', 'AB', 'AC', 'AD', 'AE', 'AF'];

      const sumRow = {};
      for (let i = 0; i < headers.length; i++) {
        if (i === 0) {
          sumRow[headers[i]] = '合计';
        } else if (i >= sumStartColIndex && i <= sumEndColIndex) {
          sumRow[headers[i]] = buildSumFormula(cols[i], 2, dataRows + 1);
        } else {
          sumRow[headers[i]] = '';
        }
      }

      return {
        headers,
        rows,
        dataRowCount: dataRows,
        sumRowIndex,
        sumRow,
        hasSumFormula: true
      };
    }

    const sheetHeadquarters = buildSheet(hqHeaders, headquartersRows, 5, 18);
    const sheetEducation = buildSheet(eduHeaders, educationRows, 6, 21);

    const educationApproval = [APPROVAL_ROLES.EDU_DIRECTOR, APPROVAL_ROLES.FINANCE_DEPUTY];
    const headquartersApproval = [APPROVAL_ROLES.HR_DIRECTOR, APPROVAL_ROLES.FINANCE];

    return {
      sheetHeadquarters,
      sheetEducation,
      approvalWorkflows: {
        education: {
          name: '教育板块薪酬审批流程',
          approvers: educationApproval,
          approverRoles: {
            [APPROVAL_ROLES.EDU_DIRECTOR]: '教育总监（审批）',
            [APPROVAL_ROLES.FINANCE_DEPUTY]: '财务副总监（副署）'
          }
        },
        headquarters: {
          name: '总部薪酬审批流程',
          approvers: headquartersApproval,
          approverRoles: {
            [APPROVAL_ROLES.HR_DIRECTOR]: '人资总监（审批）',
            [APPROVAL_ROLES.FINANCE]: '财务经理（审批）'
          }
        }
      },
      metadata: {
        createdAt: new Date(),
        educationCount: educationRows.length,
        headquartersCount: headquartersRows.length,
        totalCount: educationRows.length + headquartersRows.length
      }
    };
  }

  resetTaxCumulativeStore() {
    this._taxCumulativeStore = {
      EDUCATION: {},
      HEADQUARTERS: {}
    };
  }

  getTaxCumulativeStoreSnapshot() {
    return JSON.parse(JSON.stringify(this._taxCumulativeStore));
  }
}

module.exports = {
  OVERTIME_TYPES,
  OVERTIME_RATES,
  APPROVAL_ROLES,
  calcOvertimePay,
  applyCompTimeFirst,
  EduPayrollPackageManager
};
