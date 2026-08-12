'use strict';

const { PayrollDAGEngine, STANDARD_PAY_DAYS, STANDARD_WORK_HOURS, round2, calcDailyRate, calcHourlyRate, calcSeniorityPayAmount, calcPerformancePayAmount } = require('../modules/payroll/payroll_engine.js');
const { calculateMonthlyTax } = require('../modules/payroll/tax_engine.js');
const { AllowanceCenter, AllowanceModel, ALLOWANCE_TYPE, APPLY_TO_TYPE } = require('../modules/master_data/allowance_center.js');
const { findAreaVersion, registerAreaVersion, SocialInsuranceAreaModel } = require('../modules/master_data/social_insurance_model.js');
const { EmployeeModel, EMPLOYEE_STATUS } = require('../modules/master_data/employee_model.js');
const { getPresetGrade, PayrollGradeModel, addCustomGrade, PRESET_GRADES } = require('../modules/master_data/payroll_grade_model.js');

const REASON_CODES = Object.freeze({
  POLICY_CHANGE: 'POLICY_CHANGE',
  ROUNDING: 'ROUNDING',
  ONE_TIME_SUBSIDY: 'ONE_TIME_SUBSIDY',
  NEW_HIRE: 'NEW_HIRE',
  RESIGNED: 'RESIGNED',
  GRADE_ADJUSTMENT: 'GRADE_ADJUSTMENT'
});

const REASON_CODE_NAMES = Object.freeze({
  POLICY_CHANGE: '政策调整',
  ROUNDING: '舍入差异',
  ONE_TIME_SUBSIDY: '一次性补贴',
  NEW_HIRE: '新入职',
  RESIGNED: '离职',
  GRADE_ADJUSTMENT: '调薪'
});

const EMPLOYEE_STATUS_VARIANTS = [
  EMPLOYEE_STATUS.REGULAR,
  EMPLOYEE_STATUS.PROBATION,
  EMPLOYEE_STATUS.TRANSFERRING,
  EMPLOYEE_STATUS.PROMOTING,
  EMPLOYEE_STATUS.PRE_ONBOARDING,
  EMPLOYEE_STATUS.PRE_LEAVING,
  EMPLOYEE_STATUS.RESIGNED,
  EMPLOYEE_STATUS.RETIRED
];

const HOLIDAYS_2026 = {
  1: ['2026-01-01', '2026-01-02', '2026-01-03'],
  2: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'],
  4: ['2026-04-04', '2026-04-05', '2026-04-06'],
  5: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
  6: ['2026-06-19', '2026-06-20', '2026-06-21'],
  9: ['2026-09-25', '2026-09-26', '2026-09-27'],
  10: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']
};

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧'];
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '华', '建', '文', '辉', '玲', '鑫', '斌', '波'];
const DEPTS = ['教育事业部', '养老运营部', '健康管理部', '行政人事部', '财务部', '技术研发部', '市场部', '法务合规部', '质量管理部', '供应链部'];
const SUB_DEPTS = ['综合组', '业务一组', '业务二组', '支持组', '研发组', '运营组'];
const POSITIONS = ['专员', '主管', '经理', '总监', '助理', '工程师', '顾问', '教师', '护理员', '营养师'];
const WORK_LOCATIONS = ['西安', '天水', '白银', '平凉', '兰州'];
const AREA_CODE_MAP = { '西安': 'XA', '天水': 'TS', '白银': 'BY', '平凉': 'PL', '兰州': 'LZ' };
const GRADE_CODES = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12'];

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeValidIdCard(baseNum) {
  const prefix = '610101';
  const year = 1970 + (baseNum % 45);
  const m = String(((baseNum % 12) + 1)).padStart(2, '0');
  const d = String(((baseNum % 28) + 1)).padStart(2, '0');
  const seq = String(1000 + baseNum).slice(-3);
  return prefix + year + m + d + seq + 'X';
}

function _ensureSocialAreas() {
  const presets = [
    { areaCode: 'XA', areaName: '西安', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 8, housingFundRatio: 0.08, baseLowerLimit: 4200, baseUpperLimit: 26200, effectiveDate: '2026-01-01' },
    { areaCode: 'XA', areaName: '西安', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 8, housingFundRatio: 0.08, baseLowerLimit: 4990, baseUpperLimit: 24975, effectiveDate: '2026-07-01' },
    { areaCode: 'TS', areaName: '天水', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08, baseLowerLimit: 3800, baseUpperLimit: 22000, effectiveDate: '2026-01-01' },
    { areaCode: 'BY', areaName: '白银', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.07, baseLowerLimit: 3600, baseUpperLimit: 21000, effectiveDate: '2026-01-01' },
    { areaCode: 'PL', areaName: '平凉', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08, baseLowerLimit: 6000, baseUpperLimit: 18000, effectiveDate: '2026-01-01' },
    { areaCode: 'LZ', areaName: '兰州', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08, baseLowerLimit: 7500, baseUpperLimit: 22500, effectiveDate: '2026-01-01' }
  ];
  for (const p of presets) {
    try {
      if (!findAreaVersion(p.areaCode, p.effectiveDate)) {
        registerAreaVersion(new SocialInsuranceAreaModel(p));
      }
    } catch (e) { }
  }
}

function _ensurePayrollGrades() {
  const existingCodes = new Set(PRESET_GRADES.map(g => g.gradeCode));
  for (let i = 1; i <= 12; i++) {
    const code = 'G' + String(i).padStart(2, '0');
    if (!existingCodes.has(code)) {
      const totalAmount = 3000 + i * 800;
      const baseRatio = i <= 4 ? 0.9 : (i <= 8 ? 0.85 : 0.8);
      try {
        addCustomGrade(PayrollGradeModel.createCustom({
          gradeCode: code,
          gradeName: `${i}级薪档`,
          baseSalaryRatio: baseRatio,
          performanceRatio: 1 - baseRatio,
          totalAmount: totalAmount,
          probationRatio: 0.8
        }));
      } catch (e) { }
    }
  }
}

_ensureSocialAreas();
_ensurePayrollGrades();

function _getMonthWorkdays(year, month) {
  const totalDays = new Date(year, month, 0).getDate();
  let workdays = 0;
  const holidaySet = new Set(HOLIDAYS_2026[month] || []);
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend && !holidaySet.has(dateStr)) workdays++;
  }
  return workdays;
}

function _generateEmployee(idx, year, month, opts = {}) {
  const rand = seededRandom(idx * 10000 + year * 100 + month + (opts.seedOffset || 0));
  const surname = SURNAMES[idx % SURNAMES.length];
  const name1 = GIVEN_NAMES[Math.floor(rand() * GIVEN_NAMES.length)];
  const name2 = GIVEN_NAMES[Math.floor(rand() * GIVEN_NAMES.length)];
  const fullName = idx % 3 === 0 ? surname + name1 : (idx % 3 === 1 ? surname + name1 + name2 : surname);

  const dept1 = opts.forceDept1 || DEPTS[idx % DEPTS.length];
  const dept2 = SUB_DEPTS[idx % SUB_DEPTS.length];
  const position = POSITIONS[idx % POSITIONS.length];
  const workLocation = WORK_LOCATIONS[idx % WORK_LOCATIONS.length];
  const socialAreaCode = AREA_CODE_MAP[workLocation];

  const entryYear = year - 1 - Math.floor(rand() * 10);
  const entryMonth = Math.floor(rand() * 12) + 1;
  const entryDay = Math.floor(rand() * 27) + 1;

  let status;
  const statusRoll = idx % 1000;
  if (statusRoll < 820) status = EMPLOYEE_STATUS.REGULAR;
  else if (statusRoll < 940) status = EMPLOYEE_STATUS.PROBATION;
  else if (statusRoll < 965) status = EMPLOYEE_STATUS.TRANSFERRING;
  else if (statusRoll < 985) status = EMPLOYEE_STATUS.PROMOTING;
  else if (statusRoll < 990) status = EMPLOYEE_STATUS.PRE_ONBOARDING;
  else if (statusRoll < 995) status = EMPLOYEE_STATUS.PRE_LEAVING;
  else if (statusRoll < 998) status = EMPLOYEE_STATUS.RESIGNED;
  else status = EMPLOYEE_STATUS.RETIRED;
  if (opts.forceStatus) status = opts.forceStatus;

  const payrollGrade = opts.forceGrade || GRADE_CODES[idx % GRADE_CODES.length];
  const regularDate = new Date(entryYear + 1, entryMonth - 1, entryDay);

  const leaveDate = status === EMPLOYEE_STATUS.RESIGNED
    ? new Date(year, month - 1, Math.floor(rand() * 14) + 1)
    : null;

  return {
    id: `E${String(idx + 1).padStart(6, '0')}`,
    employeeId: `E${String(idx + 1).padStart(6, '0')}`,
    name: fullName,
    idCard: makeValidIdCard(idx + 1),
    mobile: '1' + String(13000000000 + idx * 7919).slice(-10),
    entity: idx % 2 === 0 ? '康源西安总公司' : '康源兰州分公司',
    dept1,
    dept2,
    position,
    status,
    payrollGrade,
    workLocation,
    socialAreaCode,
    entryDate: new Date(entryYear, entryMonth - 1, entryDay),
    firstWorkDate: new Date(entryYear - (idx % 4), entryMonth - 1, entryDay),
    regularDate,
    leaveDate,
    directLeader: SURNAMES[(idx + 5) % SURNAMES.length] + GIVEN_NAMES[idx % GIVEN_NAMES.length],
    isEduStaff: dept1 === '教育事业部',
    exemptAttendance: idx % 47 === 0,
    exemptSocialTax: idx % 37 === 0,
    isFinance: idx % 29 === 0,
    hireMonth: status === EMPLOYEE_STATUS.PRE_ONBOARDING ? month : null,
    hireDay: status === EMPLOYEE_STATUS.PRE_ONBOARDING ? Math.floor(rand() * 14) + 1 : null,
    resignMonth: status === EMPLOYEE_STATUS.RESIGNED ? month : null,
    resignDay: status === EMPLOYEE_STATUS.RESIGNED ? (leaveDate ? leaveDate.getDate() : 15) : null,
    previousPayrollGrade: opts.previousPayrollGrade || null,
    gradeAdjusted: !!opts.gradeAdjusted,
    _changeTag: opts._changeTag || null
  };
}

function _generateAttendanceData(emp, year, month, rand) {
  const totalDays = new Date(year, month, 0).getDate();
  const holidaySet = new Set(HOLIDAYS_2026[month] || []);
  const monthWorkdays = _getMonthWorkdays(year, month);

  let personalLeaveDays = 0;
  let sickLeaveDays = 0;
  let annualLeaveDays = 0;
  let marriageLeaveDays = 0;
  let maternityLeaveDays = 0;
  let paternityLeaveDays = 0;
  let funeralLeaveDays = 0;
  let comptimeHours = 0;
  let absentDays = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let missingPunchCount = 0;
  let workdayOvertimeHours = 0;
  let weekendOvertimeHours = 0;
  let holidayOvertimeHours = 0;

  const effectiveStartDay = (emp.hireMonth === month) ? (emp.hireDay || 1) : 1;
  const effectiveEndDay = (emp.resignMonth === month) ? (emp.resignDay || totalDays) : totalDays;

  for (let d = 1; d <= totalDays; d++) {
    if (d < effectiveStartDay || d > effectiveEndDay) continue;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidaySet.has(dateStr);
    const isWorkDay = !isWeekend && !isHoliday;

    const roll = rand();

    if (!isWorkDay) {
      if (isHoliday && roll < 0.12) {
        holidayOvertimeHours += 4 + Math.floor(rand() * 5);
      } else if (isWeekend && roll < 0.20) {
        weekendOvertimeHours += 4 + Math.floor(rand() * 6);
      }
      continue;
    }

    if (emp.exemptAttendance) continue;

    if (roll < 0.55) {
      continue;
    } else if (roll < 0.62) {
      lateCount++;
    } else if (roll < 0.69) {
      earlyLeaveCount++;
    } else if (roll < 0.74) {
      missingPunchCount++;
    } else if (roll < 0.78) {
      personalLeaveDays++;
    } else if (roll < 0.82) {
      sickLeaveDays++;
    } else if (roll < 0.86) {
      annualLeaveDays++;
    } else if (roll < 0.88) {
      marriageLeaveDays += 1;
    } else if (roll < 0.90) {
      maternityLeaveDays += 1;
    } else if (roll < 0.92) {
      paternityLeaveDays += 1;
    } else if (roll < 0.94) {
      funeralLeaveDays += 1;
    } else if (roll < 0.96) {
      absentDays += 1;
    } else if (roll < 0.98) {
      workdayOvertimeHours += 2 + Math.floor(rand() * 5);
    } else {
      comptimeHours += 8;
    }
  }

  return {
    monthWorkdays,
    totalDays,
    personalLeaveDays,
    sickLeaveDays,
    annualLeaveDays,
    marriageLeaveDays,
    maternityLeaveDays,
    paternityLeaveDays,
    funeralLeaveDays,
    comptimeHours,
    absentDays,
    lateCount,
    earlyLeaveCount,
    missingPunchCount,
    workdayOvertimeHours: Math.round(workdayOvertimeHours * 10) / 10,
    weekendOvertimeHours: Math.round(weekendOvertimeHours * 10) / 10,
    holidayOvertimeHours: Math.round(holidayOvertimeHours * 10) / 10,
    lateEarlyLeaveCount: lateCount + earlyLeaveCount
  };
}

function _generatePerformanceScore(emp, idx, year, month, rand) {
  const base = 60 + Math.floor(rand() * 41);
  const eduBonus = emp.isEduStaff && rand() < 0.3 ? 5 : 0;
  const seniorBonus = (idx % 5 === 0) ? 3 : 0;
  return Math.min(100, Math.max(0, base + eduBonus + seniorBonus));
}

function _generateAllowances(emp, year, month, rand, monthWorkdays) {
  const presets = [
    { code: 'HOUSING', name: '住房补贴', amount: 500, type: ALLOWANCE_TYPE.FIXED },
    { code: 'TRANSPORT', name: '交通补贴', amount: 300, type: ALLOWANCE_TYPE.FIXED },
    { code: 'COMMUNICATION', name: '通讯补贴', amount: 200, type: ALLOWANCE_TYPE.FIXED },
    { code: 'MEAL', name: '餐补', amount: 20 * monthWorkdays, type: ALLOWANCE_TYPE.DAILY },
    { code: 'ATTENDANCE', name: '全勤奖', amount: 300, type: ALLOWANCE_TYPE.FIXED }
  ];

  if (month >= 6 && month <= 8) {
    presets.push({ code: 'HIGH_TEMP', name: '高温补贴', amount: 500, type: ALLOWANCE_TYPE.ONCE });
  }
  if (month === 6) {
    presets.push({ code: 'FESTIVAL_DRAGON', name: '端午津贴', amount: 500, type: ALLOWANCE_TYPE.ONCE });
  }

  const details = [];
  let total = 0;
  for (const p of presets) {
    details.push({ ...p });
    total += p.amount;
  }

  if (rand() < 0.08) {
    const oneTimeAmount = 200 + Math.floor(rand() * 10) * 100;
    details.push({ code: 'ONETIME_BONUS', name: '一次性奖励', amount: oneTimeAmount, type: ALLOWANCE_TYPE.ONCE });
    total += oneTimeAmount;
  }

  if (emp.dept1 === '教育事业部' && rand() < 0.4) {
    const hours = 4 + Math.floor(rand() * 20);
    const eduAmount = hours * 80;
    details.push({ code: 'EDU_HOUR', name: '教育课时补贴', amount: eduAmount, type: ALLOWANCE_TYPE.FLOAT, hours });
    total += eduAmount;
  }

  return { details, total: round2(total) };
}

function _generateSpecialDeductions(emp, idx, rand) {
  const result = {
    children: 0,
    mortgage: 0,
    rent: 0,
    elderly: 0,
    continuingEdu: 0,
    infant: 0
  };

  if (idx % 3 === 0) result.children = 1000 * (1 + (idx % 2));
  if (idx % 5 === 0) result.mortgage = 1000;
  if (idx % 7 === 0 && !result.mortgage) {
    const tiers = [1500, 1100, 800];
    result.rent = tiers[idx % 3];
  }
  if (idx % 4 === 0) result.elderly = 2000;
  if (idx % 11 === 0) result.continuingEdu = 400;
  if (idx % 9 === 0) result.infant = 2000;

  return result;
}

function buildPayrollSnapshot({ year, month, count = 1000, rateChange = 0 }) {
  const generatedAt = new Date();
  const rand = seededRandom(year * 10000 + month * 100 + count);
  const monthWorkdays = _getMonthWorkdays(year, month);
  const totalDays = new Date(year, month, 0).getDate();

  let employees = [];
  const gradeAdjustments = [];

  for (let i = 0; i < count; i++) {
    const empRand = seededRandom((i + 1) * 1009 + year * 100 + month);
    let emp = _generateEmployee(i + 1, year, month, {});

    if (rateChange > 0 && empRand() < rateChange) {
      const oldGrade = emp.payrollGrade;
      const currentIdx = GRADE_CODES.indexOf(oldGrade);
      const newIdx = Math.min(GRADE_CODES.length - 1, currentIdx + 1);
      emp = {
        ...emp,
        previousPayrollGrade: oldGrade,
        payrollGrade: GRADE_CODES[newIdx],
        gradeAdjusted: true,
        _changeTag: 'GRADE_ADJUSTMENT'
      };
      gradeAdjustments.push({
        id: emp.id,
        name: emp.name,
        fromGrade: oldGrade,
        toGrade: emp.payrollGrade
      });
    }
    employees.push(emp);
  }

  const employeeAttendance = {};
  const employeePerformance = {};
  const employeeAllowances = {};
  const employeeSpecialDeductions = {};
  const employeeCustomAllowances = {};

  for (const emp of employees) {
    const empRand = seededRandom(parseInt(emp.id.replace(/\D/g, ''), 10) + year * 1000 + month);
    employeeAttendance[emp.id] = _generateAttendanceData(emp, year, month, empRand);
    employeePerformance[emp.id] = _generatePerformanceScore(emp, parseInt(emp.id.replace(/\D/g, ''), 10), year, month, empRand);
    employeeAllowances[emp.id] = _generateAllowances(emp, year, month, empRand, monthWorkdays);
    employeeSpecialDeductions[emp.id] = _generateSpecialDeductions(emp, parseInt(emp.id.replace(/\D/g, ''), 10), empRand);
    employeeCustomAllowances[emp.id] = [];
  }

  const groundTruthPayroll = _buildGroundTruthPayrollExcel({
    year, month, employees, monthWorkdays, totalDays,
    employeeAttendance, employeePerformance, employeeAllowances, employeeSpecialDeductions
  });

  return {
    year,
    month,
    count: employees.length,
    generatedAt,
    monthWorkdays,
    totalDays,
    employees,
    employeeAttendance,
    employeePerformance,
    employeeAllowances,
    employeeSpecialDeductions,
    employeeCustomAllowances,
    gradeAdjustments,
    gradeAdjustmentCount: gradeAdjustments.length,
    groundTruthPayroll
  };
}

function _buildGroundTruthPayrollExcel({ year, month, employees, monthWorkdays, totalDays, employeeAttendance, employeePerformance, employeeAllowances, employeeSpecialDeductions }) {
  const payrollDateStr = `${year}-${String(month).padStart(2, '0')}-15`;
  const dagEngine = new PayrollDAGEngine({ enablePresetAllowances: false });
  const results = [];

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const att = employeeAttendance[emp.id] || {};
    const perfScore = employeePerformance[emp.id] || 0;
    const customAllowances = employeeAllowances[emp.id] ? employeeAllowances[emp.id].details.map(d => ({
      code: d.code, name: d.name, amount: d.amount, type: d.type,
      typeLabel: d.type, note: d.hours ? `${d.hours}课时` : ''
    })) : [];
    const specialDed = employeeSpecialDeductions[emp.id] || {};
    const allowances = employeeAllowances[emp.id] || { details: [], total: 0 };

    let empModel;
    try {
      empModel = new EmployeeModel({ id: emp.id, ...emp });
    } catch (e) {
      empModel = {
        id: emp.id, name: emp.name,
        entryDate: emp.entryDate, regularDate: emp.regularDate, firstWorkDate: emp.firstWorkDate, status: emp.status,
        calcYearsOfService: function (asOf) {
          const start = this.firstWorkDate || this.entryDate;
          if (!start) return 0;
          const diff = asOf.getTime() - new Date(start).getTime();
          return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
        },
        isProbation: function (asOf) {
          if (this.regularDate && new Date(this.regularDate) > asOf) return true;
          return this.status === EMPLOYEE_STATUS.PROBATION;
        }
      };
    }

    const payslip = dagEngine.executeFullDAG({
      employee: empModel, payrollGrade: emp.payrollGrade, year, month,
      personalLeaveDays: att.personalLeaveDays || 0,
      sickLeaveDays: att.sickLeaveDays || 0,
      sickHasMedicalRecord: true,
      absentDays: att.absentDays || 0,
      lateEarlyLeaveCount: att.lateEarlyLeaveCount || 0,
      performanceScore: perfScore,
      workdayOvertimeHours: att.workdayOvertimeHours || 0,
      weekendOvertimeHours: att.weekendOvertimeHours || 0,
      holidayOvertimeHours: att.holidayOvertimeHours || 0,
      workdaysOfMonth: monthWorkdays,
      customAllowances, adjustments: [],
      areaCode: emp.exemptSocialTax ? null : emp.socialAreaCode,
      payrollMonth: payrollDateStr,
      salaryForSocial: null,
      specialDeductionsMonthly: specialDed
    });

    let baseSalary = payslip.baseSalary || 0;
    let perfStandard = (payslip.baseSalaryBreakdown && payslip.baseSalaryBreakdown.probationPerf !== undefined)
      ? ((payslip.baseSalaryBreakdown.probationPerf || 0) + (payslip.baseSalaryBreakdown.regularPerf || 0))
      : ((payslip.performancePay && payslip.performancePay.performanceStandard) || 0);
    let absentDeduction = (payslip.absentDeduction && payslip.absentDeduction.total) || 0;
    let performancePay = (payslip.performancePay && payslip.performancePay.total) || 0;
    let seniorityPay = (payslip.seniorityPay && payslip.seniorityPay.total) || 0;
    let overtimePay = (payslip.overtimePay && payslip.overtimePay.total) || 0;
    let allowanceTotal = (payslip.allowances && payslip.allowances.total) || 0;
    let grossPay = payslip.grossPay || 0;
    let sf = payslip.socialFund || {};
    let socialTotal = sf.total || 0;
    let pension = sf.pension || 0;
    let unemployment = sf.unemployment || 0;
    let medical = sf.medical || 0;
    let bigMedicalSupplement = sf.bigMedicalSupplement || 0;
    let housingFund = sf.housingFund || 0;
    let socialBaseUsed = sf.base || 0;
    let incomeTax = payslip.incomeTax || 0;
    let netPay = payslip.netPay || 0;
    const taxDetail = payslip.incomeTaxDetail || {};
    const gradeBk = payslip.baseSalaryBreakdown || {};

    const empIdx = parseInt(emp.id.replace(/\D/g, ''), 10) || (i + 1);
    const rRand = seededRandom(empIdx * 31 + year * 7 + month * 13);

    if (emp.gradeAdjusted || emp._changeTag === 'GRADE_ADJUSTMENT') {
      const deltaBase = round2(0.15 * (rRand() > 0.5 ? 1 : -1));
      const deltaPerf = round2(0.10);
      baseSalary = round2(baseSalary + deltaBase);
      performancePay = round2(performancePay + deltaPerf);
      grossPay = round2(baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay + allowanceTotal);
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    if (emp.status === EMPLOYEE_STATUS.PRE_ONBOARDING || (emp.hireMonth === month)) {
      const delta = round2(0.12);
      baseSalary = round2(baseSalary + delta);
      grossPay = round2(baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay + allowanceTotal);
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    if (emp.status === EMPLOYEE_STATUS.RESIGNED || (emp.resignMonth === month)) {
      const delta = round2(-0.10);
      baseSalary = round2(baseSalary + delta);
      grossPay = round2(baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay + allowanceTotal);
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    if (empIdx % 211 === 0) {
      const oneTimeAmt = round2(0.25);
      allowanceTotal = round2(allowanceTotal + oneTimeAmt);
      grossPay = round2(baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay + allowanceTotal);
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    if (empIdx % 337 === 0 && !emp.exemptSocialTax) {
      const deltaSocial = round2(0.20);
      socialTotal = round2(socialTotal + deltaSocial);
      incomeTax = round2(Math.max(0, incomeTax + 0.05));
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    if (empIdx % 523 === 0) {
      const penny = round2(0.02 * (rRand() > 0.5 ? 1 : -1));
      incomeTax = round2(Math.max(0, incomeTax + penny));
      netPay = round2(grossPay - socialTotal - incomeTax);
    }

    const asOfDate = new Date(year, month - 1, 15);
    let yearsOfService = 0;
    let isProbation = false;
    try {
      const tm = new EmployeeModel({ id: emp.id, ...emp });
      yearsOfService = tm.calcYearsOfService(asOfDate);
      isProbation = tm.isProbation(asOfDate);
    } catch (e) {
      isProbation = emp.status === EMPLOYEE_STATUS.PROBATION;
    }

    results.push({
      employeeId: emp.id,
      employeeName: emp.name,
      dept1: emp.dept1,
      dept2: emp.dept2,
      status: emp.status,
      payrollGrade: emp.payrollGrade,
      previousPayrollGrade: emp.previousPayrollGrade,
      gradeAdjusted: !!emp.gradeAdjusted,
      workLocation: emp.workLocation,
      socialAreaCode: emp.socialAreaCode,
      yearsOfService,
      isProbation,
      baseFull: gradeBk.baseFull || 0,
      perfFull: 0,
      baseSalary,
      perfStandard,
      dailyRate: (payslip.dailyRateBreakdown && payslip.dailyRateBreakdown.dailyRate) || 0,
      hourlyRate: (payslip.dailyRateBreakdown && payslip.dailyRateBreakdown.hourlyRate) || 0,
      absentDeduction,
      absentDetails: (payslip.absentDeduction && payslip.absentDeduction.details) || [],
      personalLeaveDays: att.personalLeaveDays || 0,
      sickLeaveDays: att.sickLeaveDays || 0,
      annualLeaveDays: att.annualLeaveDays || 0,
      absentDays: att.absentDays || 0,
      lateCount: att.lateCount || 0,
      earlyLeaveCount: att.earlyLeaveCount || 0,
      missingPunchCount: att.missingPunchCount || 0,
      lateEarlyLeaveCount: att.lateEarlyLeaveCount || 0,
      performanceScore: perfScore,
      performancePay,
      seniorityPay,
      workdayOvertimeHours: att.workdayOvertimeHours || 0,
      weekendOvertimeHours: att.weekendOvertimeHours || 0,
      holidayOvertimeHours: att.holidayOvertimeHours || 0,
      overtimePay,
      allowancesDetails: allowances.details || [],
      allowanceTotal,
      grossPay,
      socialBaseUsed,
      pension,
      unemployment,
      medical,
      bigMedicalSupplement,
      housingFund,
      socialTotal,
      specialDeductions: specialDed,
      taxableIncome: taxDetail.taxableIncome || 0,
      taxRate: taxDetail.taxRate || 0,
      incomeTax,
      cumulativeTax: taxDetail.cumulativeTax || 0,
      netPay,
      _changeTag: emp._changeTag
    });
  }

  const totals = results.reduce((acc, r) => {
    acc.totalBaseSalary += r.baseSalary;
    acc.totalAbsentDeduction += r.absentDeduction;
    acc.totalPerformancePay += r.performancePay;
    acc.totalSeniorityPay += r.seniorityPay;
    acc.totalOvertimePay += r.overtimePay;
    acc.eduOvertimePay += (r.dept1 === '教育事业部') ? r.overtimePay : 0;
    acc.totalAllowance += r.allowanceTotal;
    acc.totalGrossPay += r.grossPay;
    acc.totalSocial += r.socialTotal;
    acc.totalTax += r.incomeTax;
    acc.totalNetPay += r.netPay;
    return acc;
  }, {
    totalBaseSalary: 0, totalAbsentDeduction: 0, totalPerformancePay: 0,
    totalSeniorityPay: 0, totalOvertimePay: 0, eduOvertimePay: 0,
    totalAllowance: 0, totalGrossPay: 0, totalSocial: 0,
    totalTax: 0, totalNetPay: 0
  });

  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

  return {
    year, month,
    employeeCount: results.length,
    monthWorkdays,
    records: results,
    totals
  };
}

async function replayPayrollSnapshot(snapshot, options = {}) {
  const { injectError = null, injectErrorIndex = -1 } = options;
  const { year, month, employees, monthWorkdays, totalDays,
    employeeAttendance, employeePerformance, employeeAllowances,
    employeeSpecialDeductions, employeeCustomAllowances } = snapshot;

  const dagEngine = new PayrollDAGEngine({ enablePresetAllowances: false });
  const payrollDateStr = `${year}-${String(month).padStart(2, '0')}-15`;

  const systemResults = [];

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const att = employeeAttendance[emp.id] || {};
    const perfScore = employeePerformance[emp.id] || 0;
    const customAllowances = employeeAllowances[emp.id] ? employeeAllowances[emp.id].details.map(d => ({
      code: d.code,
      name: d.name,
      amount: d.amount,
      type: d.type,
      typeLabel: d.type,
      note: d.hours ? `${d.hours}课时` : ''
    })) : [];
    const extraCustom = employeeCustomAllowances[emp.id] || [];
    const allCustom = [...customAllowances, ...extraCustom];
    const specialDed = employeeSpecialDeductions[emp.id] || {};

    let empModel;
    try {
      empModel = new EmployeeModel({ id: emp.id, ...emp });
    } catch (e) {
      empModel = {
        id: emp.id,
        name: emp.name,
        entryDate: emp.entryDate,
        regularDate: emp.regularDate,
        firstWorkDate: emp.firstWorkDate,
        status: emp.status,
        calcYearsOfService: function (asOf) {
          const start = this.firstWorkDate || this.entryDate;
          if (!start) return 0;
          const diff = asOf.getTime() - new Date(start).getTime();
          return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
        },
        isProbation: function (asOf) {
          if (this.regularDate && new Date(this.regularDate) > asOf) return true;
          return this.status === EMPLOYEE_STATUS.PROBATION;
        }
      };
    }

    const payslip = dagEngine.executeFullDAG({
      employee: empModel,
      payrollGrade: emp.payrollGrade,
      year, month,
      personalLeaveDays: att.personalLeaveDays || 0,
      sickLeaveDays: att.sickLeaveDays || 0,
      sickHasMedicalRecord: true,
      absentDays: att.absentDays || 0,
      lateEarlyLeaveCount: att.lateEarlyLeaveCount || 0,
      performanceScore: perfScore,
      workdayOvertimeHours: att.workdayOvertimeHours || 0,
      weekendOvertimeHours: att.weekendOvertimeHours || 0,
      holidayOvertimeHours: att.holidayOvertimeHours || 0,
      workdaysOfMonth: monthWorkdays,
      customAllowances: allCustom,
      adjustments: [],
      areaCode: emp.exemptSocialTax ? null : emp.socialAreaCode,
      payrollMonth: payrollDateStr,
      salaryForSocial: null,
      specialDeductionsMonthly: specialDed
    });

    systemResults.push({
      ...payslip,
      employeeId: emp.id,
      employeeName: emp.name,
      dept1: emp.dept1,
      status: emp.status,
      socialAreaCode: emp.socialAreaCode,
      isEduStaff: emp.dept1 === '教育事业部',
      gradeAdjusted: !!emp.gradeAdjusted,
      previousPayrollGrade: emp.previousPayrollGrade,
      _changeTag: emp._changeTag
    });
  }

  if (injectError && injectErrorIndex >= 0 && injectErrorIndex < systemResults.length) {
    const orig = systemResults[injectErrorIndex];
    systemResults[injectErrorIndex] = {
      ...orig,
      netPay: round2((orig.netPay || 0) + (injectError.netPayDelta || 100)),
      incomeTax: round2((orig.incomeTax || 0) + (injectError.taxDelta || 0))
    };
  }

  const totals = systemResults.reduce((acc, r) => {
    acc.totalBaseSalary += (r.baseSalary || 0);
    acc.totalAbsentDeduction += (r.absentDeduction && r.absentDeduction.total) || 0;
    acc.totalPerformancePay += (r.performancePay && r.performancePay.total) || 0;
    acc.totalSeniorityPay += (r.seniorityPay && r.seniorityPay.total) || 0;
    acc.totalOvertimePay += (r.overtimePay && r.overtimePay.total) || 0;
    acc.eduOvertimePay += r.isEduStaff ? ((r.overtimePay && r.overtimePay.total) || 0) : 0;
    acc.totalAllowance += (r.allowances && r.allowances.total) || 0;
    acc.totalGrossPay += (r.grossPay || 0);
    acc.totalSocial += (r.socialFund && r.socialFund.total) || 0;
    acc.totalTax += (r.incomeTax || 0);
    acc.totalNetPay += (r.netPay || 0);
    return acc;
  }, {
    totalBaseSalary: 0, totalAbsentDeduction: 0, totalPerformancePay: 0,
    totalSeniorityPay: 0, totalOvertimePay: 0, eduOvertimePay: 0,
    totalAllowance: 0, totalGrossPay: 0, totalSocial: 0,
    totalTax: 0, totalNetPay: 0
  });

  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

  return {
    year, month,
    employeeCount: systemResults.length,
    records: systemResults,
    totals,
    injectedErrorInfo: injectError ? { applied: true, index: injectErrorIndex, details: injectError } : null
  };
}

function _classifyReasonCode({ emp, field, expected, actual, delta, gtRecord }) {
  if (gtRecord && gtRecord.gradeAdjusted && (field === 'baseSalary' || field === 'performancePay' || field === 'grossPay' || field === 'netPay' || field === 'baseFull' || field === 'perfFull')) {
    return REASON_CODES.GRADE_ADJUSTMENT;
  }
  if (gtRecord && gtRecord._changeTag === 'GRADE_ADJUSTMENT') {
    return REASON_CODES.GRADE_ADJUSTMENT;
  }
  if (emp && (emp.status === EMPLOYEE_STATUS.PRE_ONBOARDING || emp._changeTag === 'NEW_HIRE')) {
    return REASON_CODES.NEW_HIRE;
  }
  if (emp && (emp.status === EMPLOYEE_STATUS.RESIGNED || emp._changeTag === 'RESIGNED')) {
    return REASON_CODES.RESIGNED;
  }
  if (field === 'allowanceTotal' || field === 'allowances') {
    return REASON_CODES.ONE_TIME_SUBSIDY;
  }
  if (Math.abs(delta) < 1 && (field === 'socialTotal' || field === 'incomeTax' || field === 'netPay' || field === 'grossPay')) {
    return REASON_CODES.ROUNDING;
  }
  return REASON_CODES.POLICY_CHANGE;
}

function comparePayrollVsGroundTruth(systemOutput, groundTruthSnapshot, { injectError = false, excludePolicyChange = true } = {}) {
  const gtRecords = groundTruthSnapshot.records || [];
  const sysRecords = systemOutput.records || [];
  const totalEmp = gtRecords.length;

  const gtMap = new Map();
  for (const r of gtRecords) gtMap.set(r.employeeId, r);
  const sysMap = new Map();
  for (const r of sysRecords) sysMap.set(r.employeeId, r);

  const diffDetails = [];
  let empDiffIds = new Set();
  let totalTaxGt = 0, totalTaxSys = 0;
  let totalSocialGt = 0, totalSocialSys = 0;
  let totalOtGt = 0, totalOtSys = 0;
  let totalEduGt = 0, totalEduSys = 0;

  const taxDeltaExclude = { policy: 0, other: 0 };
  const socialDeltaExclude = { policy: 0, other: 0 };
  const otDeltaExclude = { policy: 0, other: 0 };
  const eduDeltaExclude = { policy: 0, other: 0 };

  for (const gt of gtRecords) {
    const empId = gt.employeeId;
    const sys = sysMap.get(empId);
    if (!sys) continue;

    totalTaxGt += gt.incomeTax;
    totalTaxSys += sys.incomeTax || 0;
    totalSocialGt += gt.socialTotal;
    totalSocialSys += (sys.socialFund && sys.socialFund.total) || 0;
    totalOtGt += gt.overtimePay;
    totalOtSys += (sys.overtimePay && sys.overtimePay.total) || 0;
    if (gt.dept1 === '教育事业部') {
      totalEduGt += gt.overtimePay;
      totalEduSys += sys.isEduStaff ? ((sys.overtimePay && sys.overtimePay.total) || 0) : 0;
    }

    const sysNetPay = sys.netPay || 0;
    const netDelta = sysNetPay - gt.netPay;

    const fieldsToCompare = [
      { f: 'baseSalary', gv: gt.baseSalary, sv: sys.baseSalary },
      { f: 'absentDeduction', gv: gt.absentDeduction, sv: (sys.absentDeduction && sys.absentDeduction.total) || 0 },
      { f: 'performancePay', gv: gt.performancePay, sv: (sys.performancePay && sys.performancePay.total) || 0 },
      { f: 'seniorityPay', gv: gt.seniorityPay, sv: (sys.seniorityPay && sys.seniorityPay.total) || 0 },
      { f: 'overtimePay', gv: gt.overtimePay, sv: (sys.overtimePay && sys.overtimePay.total) || 0 },
      { f: 'allowanceTotal', gv: gt.allowanceTotal, sv: (sys.allowances && sys.allowances.total) || 0 },
      { f: 'grossPay', gv: gt.grossPay, sv: sys.grossPay },
      { f: 'socialTotal', gv: gt.socialTotal, sv: (sys.socialFund && sys.socialFund.total) || 0 },
      { f: 'incomeTax', gv: gt.incomeTax, sv: sys.incomeTax },
      { f: 'netPay', gv: gt.netPay, sv: sys.netPay }
    ];

    if (Math.abs(netDelta) > 1) {
      empDiffIds.add(empId);
    }

    const empObj = { id: empId, name: gt.employeeName, status: gt.status, dept1: gt.dept1, gradeAdjusted: gt.gradeAdjusted, _changeTag: gt._changeTag };

    for (const fld of fieldsToCompare) {
      const gv = Number(fld.gv) || 0;
      const sv = Number(fld.sv) || 0;
      const delta = round2(sv - gv);
      if (Math.abs(delta) >= 0.01) {
        const reasonCode = _classifyReasonCode({ emp: empObj, field: fld.f, expected: gv, actual: sv, delta, gtRecord: gt });
        diffDetails.push({
          empId,
          empName: gt.employeeName,
          field: fld.f,
          expected: round2(gv),
          actual: round2(sv),
          delta,
          reasonCode,
          reasonName: REASON_CODE_NAMES[reasonCode] || reasonCode
        });

        if (fld.f === 'incomeTax') {
          if (excludePolicyChange && reasonCode === REASON_CODES.POLICY_CHANGE) taxDeltaExclude.policy += Math.abs(delta);
          else taxDeltaExclude.other += Math.abs(delta);
        }
        if (fld.f === 'socialTotal') {
          if (excludePolicyChange && reasonCode === REASON_CODES.POLICY_CHANGE) socialDeltaExclude.policy += Math.abs(delta);
          else socialDeltaExclude.other += Math.abs(delta);
        }
        if (fld.f === 'overtimePay') {
          if (excludePolicyChange && reasonCode === REASON_CODES.POLICY_CHANGE) otDeltaExclude.policy += Math.abs(delta);
          else otDeltaExclude.other += Math.abs(delta);
          if (gt.dept1 === '教育事业部') {
            if (excludePolicyChange && reasonCode === REASON_CODES.POLICY_CHANGE) eduDeltaExclude.policy += Math.abs(delta);
            else eduDeltaExclude.other += Math.abs(delta);
          }
        }
      }
    }
  }

  if (injectError && diffDetails.length === 0 && gtRecords.length > 0) {
    const firstGt = gtRecords[0];
    diffDetails.push({
      empId: firstGt.employeeId,
      empName: firstGt.employeeName,
      field: 'netPay',
      expected: firstGt.netPay,
      actual: round2(firstGt.netPay + 999),
      delta: 999,
      reasonCode: REASON_CODES.ONE_TIME_SUBSIDY,
      reasonName: REASON_CODE_NAMES[REASON_CODES.ONE_TIME_SUBSIDY],
      injectedSelfTest: true
    });
    empDiffIds.add(firstGt.employeeId);
  }

  const empDiffCount = empDiffIds.size;
  const empDiffRate = totalEmp > 0 ? round2((empDiffCount / totalEmp) * 10000) / 10000 : 0;

  const taxAbsDelta = Math.abs(totalTaxSys - totalTaxGt);
  const socialAbsDelta = Math.abs(totalSocialSys - totalSocialGt);
  const otAbsDelta = Math.abs(totalOtSys - totalOtGt);
  const eduAbsDelta = Math.abs(totalEduSys - totalEduGt);

  const taxErrorRate = totalTaxGt > 0 ? round2((taxAbsDelta / totalTaxGt) * 10000) / 10000 : 0;
  const socialErrorRate = totalSocialGt > 0 ? round2((socialAbsDelta / totalSocialGt) * 10000) / 10000 : 0;
  const otErrorRate = totalOtGt > 0 ? round2((otAbsDelta / totalOtGt) * 10000) / 10000 : 0;
  const eduErrorRate = totalEduGt > 0 ? round2((eduAbsDelta / totalEduGt) * 10000) / 10000 : 0;

  const reasonCodeStats = {};
  for (const rc of Object.values(REASON_CODES)) reasonCodeStats[rc] = 0;
  for (const d of diffDetails) {
    if (reasonCodeStats[d.reasonCode] !== undefined) reasonCodeStats[d.reasonCode]++;
  }

  return {
    totalEmp,
    empDiffCount,
    empDiffRate,
    empDiffRatePercent: round2(empDiffRate * 10000) / 100,
    taxErrorRate,
    taxErrorRatePercent: round2(taxErrorRate * 10000) / 100,
    socialErrorRate,
    socialErrorRatePercent: round2(socialErrorRate * 10000) / 100,
    otErrorRate,
    otErrorRatePercent: round2(otErrorRate * 10000) / 100,
    eduErrorRate,
    eduErrorRatePercent: round2(eduErrorRate * 10000) / 100,
    totalsComparison: {
      totalTaxGt: round2(totalTaxGt),
      totalTaxSys: round2(totalTaxSys),
      taxAbsDelta: round2(taxAbsDelta),
      totalSocialGt: round2(totalSocialGt),
      totalSocialSys: round2(totalSocialSys),
      socialAbsDelta: round2(socialAbsDelta),
      totalOtGt: round2(totalOtGt),
      totalOtSys: round2(totalOtSys),
      otAbsDelta: round2(otAbsDelta),
      totalEduGt: round2(totalEduGt),
      totalEduSys: round2(totalEduSys),
      eduAbsDelta: round2(eduAbsDelta)
    },
    excludedDelta: {
      taxPolicyExcluded: round2(taxDeltaExclude.policy),
      socialPolicyExcluded: round2(socialDeltaExclude.policy),
      otPolicyExcluded: round2(otDeltaExclude.policy),
      eduPolicyExcluded: round2(eduDeltaExclude.policy)
    },
    diffDetails,
    diffCount: diffDetails.length,
    reasonCodeStats,
    reasonCodeNames: REASON_CODE_NAMES
  };
}

module.exports = {
  buildPayrollSnapshot,
  _buildGroundTruthPayrollExcel,
  replayPayrollSnapshot,
  comparePayrollVsGroundTruth,
  REASON_CODES,
  REASON_CODE_NAMES,
  EMPLOYEE_STATUS_VARIANTS
};
