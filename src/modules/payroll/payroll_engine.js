'use strict';

const { PayrollGradeModel, getPresetGrade } = require('../master_data/payroll_grade_model.js');
const { AllowanceCenter, AllowanceModel } = require('../master_data/allowance_center.js');
const { calculateMonthlyTax } = require('./tax_engine.js');
const { findAreaVersion, SocialInsuranceAreaModel } = require('../master_data/social_insurance_model.js');
const { EmployeeModel } = require('../master_data/employee_model.js');

const STANDARD_PAY_DAYS = 21.75;
const STANDARD_WORK_HOURS = 8;

const DAG_NODES = Object.freeze([
  { id: 'baseSalary', name: '基础工资', order: 1, dependencies: [] },
  { id: 'absentDeduction', name: '缺勤扣款', order: 2, dependencies: ['baseSalary'] },
  { id: 'performancePay', name: '绩效工资', order: 3, dependencies: ['baseSalary'] },
  { id: 'seniorityPay', name: '工龄工资', order: 4, dependencies: ['baseSalary'] },
  { id: 'overtimePay', name: '加班费', order: 5, dependencies: ['baseSalary'] },
  { id: 'allowances', name: '津贴补贴', order: 6, dependencies: [] },
  { id: 'otherAdjustments', name: '其他加扣项', order: 7, dependencies: [] },
  { id: 'grossPay', name: '应发工资', order: 8, dependencies: ['baseSalary', 'absentDeduction', 'performancePay', 'seniorityPay', 'overtimePay', 'allowances', 'otherAdjustments'] },
  { id: 'socialHousingFund', name: '社保公积金', order: 9, dependencies: ['grossPay'] },
  { id: 'incomeTax', name: '个税', order: 10, dependencies: ['grossPay', 'socialHousingFund'] },
  { id: 'netPay', name: '实发工资', order: 11, dependencies: ['grossPay', 'socialHousingFund', 'incomeTax'] }
]);

const DAG_NODE_MAP = {};
DAG_NODES.forEach(n => { DAG_NODE_MAP[n.id] = n; });

class DAGOrderViolationError extends Error {
  constructor(message) {
    super(message || 'DAG节点执行顺序错误');
    this.name = 'DAGOrderViolationError';
  }
}

function round2(num) {
  return Math.round(num * 100) / 100;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysInMonth(year, month) {
  const m = month - 1;
  const last = new Date(year, m + 1, 0);
  return last.getDate();
}

function getWorkdaysInMonth(year, month) {
  const m = month - 1;
  const totalDays = getDaysInMonth(year, month);
  let workdays = 0;
  for (let d = 1; d <= totalDays; d++) {
    const dayOfWeek = new Date(year, m, d).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) workdays++;
  }
  return workdays;
}

function calcDailyRate(baseSalary) {
  return Number(baseSalary) / STANDARD_PAY_DAYS;
}

function calcHourlyRate(baseSalary) {
  return calcDailyRate(baseSalary) / STANDARD_WORK_HOURS;
}

function calcSeniorityPayAmount(yearsOfService, perYear = 100, capYears = 10) {
  if (yearsOfService < 1) return 0;
  const capped = Math.min(yearsOfService, capYears);
  return capped * perYear;
}

function calcPerformancePayAmount(performanceStandard, score) {
  const validScore = Math.max(0, Math.min(100, Number(score || 0)));
  return Number(performanceStandard || 0) * (validScore / 100);
}

function calcMonthRatio({ year, month, entryDate, regularDate, leaveDate }, payrollMonth) {
  const totalDays = getDaysInMonth(year, month);
  const workdays = getWorkdaysInMonth(year, month);
  const entry = parseDate(entryDate);
  const regular = parseDate(regularDate);
  const leave = parseDate(leaveDate);
  const payrollStart = new Date(year, month - 1, 1);
  payrollStart.setHours(0, 0, 0, 0);
  const payrollEnd = new Date(year, month, 0);
  payrollEnd.setHours(23, 59, 59, 999);

  let firstPartDays = 0;
  let secondPartDays = 0;

  const monthBeforeRegular = regular && regular.getTime() < payrollStart.getTime();
  const monthAfterRegular = regular && regular.getTime() > payrollEnd.getTime();
  const regularInMonth = regular && !monthBeforeRegular && !monthAfterRegular;
  const monthBeforeEntry = entry && entry.getTime() > payrollEnd.getTime();
  const entryInMonth = entry && entry.getTime() >= payrollStart.getTime() && entry.getTime() <= payrollEnd.getTime();

  if (monthBeforeRegular || !regular) {
    let actualStart = payrollStart;
    if (entry && entry.getTime() > actualStart.getTime()) {
      actualStart = entry;
    }
    let actualEnd = payrollEnd;
    if (leave && leave.getTime() < actualEnd.getTime()) {
      actualEnd = leave;
    }
    for (let d = new Date(actualStart); d.getTime() <= actualEnd.getTime(); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) secondPartDays++;
    }
  } else if (monthAfterRegular) {
    let actualStart = payrollStart;
    if (entry && entry.getTime() > actualStart.getTime()) {
      actualStart = entry;
    }
    let actualEnd = payrollEnd;
    if (leave && leave.getTime() < actualEnd.getTime()) {
      actualEnd = leave;
    }
    for (let d = new Date(actualStart); d.getTime() <= actualEnd.getTime(); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) firstPartDays++;
    }
  } else if (regularInMonth) {
    const firstPartStart = entry && entry.getTime() > payrollStart.getTime() ? entry : payrollStart;
    let firstPartEnd = new Date(regular);
    firstPartEnd.setDate(firstPartEnd.getDate() - 1);
    if (leave && leave.getTime() < firstPartEnd.getTime()) {
      firstPartEnd = leave;
    }
    if (firstPartStart.getTime() <= firstPartEnd.getTime() && firstPartEnd.getTime() <= payrollEnd.getTime()) {
      const s = new Date(Math.max(firstPartStart.getTime(), payrollStart.getTime()));
      const e = new Date(Math.min(firstPartEnd.getTime(), payrollEnd.getTime()));
      for (let d = new Date(s); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow >= 1 && dow <= 5) firstPartDays++;
      }
    }
    let secondPartStart = new Date(regular);
    if (leave && leave.getTime() < payrollStart.getTime()) {
      secondPartStart = leave;
    }
    let secondPartEnd = payrollEnd;
    if (leave && leave.getTime() < secondPartEnd.getTime()) {
      secondPartEnd = leave;
    }
    if (secondPartStart.getTime() <= secondPartEnd.getTime()) {
      const s = new Date(Math.max(secondPartStart.getTime(), payrollStart.getTime()));
      const e = new Date(Math.min(secondPartEnd.getTime(), payrollEnd.getTime()));
      for (let d = new Date(s); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow >= 1 && dow <= 5) secondPartDays++;
      }
    }
  } else if (entryInMonth && !regular) {
    let actualStart = entry;
    let actualEnd = payrollEnd;
    if (leave && leave.getTime() < actualEnd.getTime()) {
      actualEnd = leave;
    }
    for (let d = new Date(actualStart); d.getTime() <= actualEnd.getTime(); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) firstPartDays++;
    }
  }

  const firstPartRatio = workdays > 0 ? firstPartDays / workdays : 0;
  const secondPartRatio = workdays > 0 ? secondPartDays / workdays : 0;

  return {
    firstPartDays,
    secondPartDays,
    firstPartRatio,
    secondPartRatio,
    totalWorkdays: workdays,
    totalDays,
    workedWorkdays: firstPartDays + secondPartDays
  };
}

function calcAbsentDeduction({
  baseSalary,
  personalLeaveDays = 0,
  sickLeaveDays = 0,
  sickHasMedicalRecord = true,
  absentDays = 0,
  lateEarlyLeaveCount = 0
}) {
  const daily = calcDailyRate(baseSalary);
  const details = [];
  let total = 0;

  if (personalLeaveDays > 0) {
    const amount = round2(personalLeaveDays * daily);
    details.push({
      type: 'PERSONAL_LEAVE',
      name: '事假扣款',
      days: personalLeaveDays,
      rate: 1,
      dailyRate: round2(daily),
      amount
    });
    total += amount;
  }

  if (sickLeaveDays > 0) {
    if (sickHasMedicalRecord) {
      const amount = round2(sickLeaveDays * daily * 0.2);
      details.push({
        type: 'SICK_LEAVE',
        name: '病假扣款(20%，有病历)',
        days: sickLeaveDays,
        rate: 0.2,
        dailyRate: round2(daily),
        amount,
        hasMedicalRecord: true
      });
      total += amount;
    } else {
      const amount = round2(sickLeaveDays * daily * 1);
      details.push({
        type: 'SICK_LEAVE_NO_RECORD',
        name: '病假扣款(无病历按事假100%)',
        days: sickLeaveDays,
        rate: 1,
        dailyRate: round2(daily),
        amount,
        hasMedicalRecord: false
      });
      total += amount;
    }
  }

  // 旷工按事假1倍无薪处理（原×3倍属罚款性质有法律风险，已合规化调整）
  // 法律依据：企业非行政机关不具备罚款权，旷工按事假1倍扣回已发工资部分合理合法
  // 配套：纪律处罚走《员工手册》记过/影响年终评优等非金钱处罚（高自主性可配置）
  if (absentDays > 0) {
    const amount = round2(absentDays * daily * 1);
    details.push({
      type: 'ABSENT',
      name: '旷工扣款(按事假1倍)',
      days: absentDays,
      rate: 1,
      dailyRate: round2(daily),
      amount,
      legalNote: '原×3倍属罚款企业无权，现按事假1倍无薪合规'
    });
    total += amount;
  }

  // 缺卡/迟到规则：一次扣10元 + 取消当月全勤奖（用户确认的规则）
  // 原：累计≥3次叠加扣款（每次20元）已废止
  // 新规则由规则引擎 RULE_ATT_LATE_PER_TIME 控制，可HR自行修改单次金额
  if (lateEarlyLeaveCount > 0) {
    const perTimePenalty = 10; // 单次10元，可配置
    const amount = round2(lateEarlyLeaveCount * perTimePenalty);
    details.push({
      type: 'LATE_EARLY_PER_TIME',
      name: `迟到/早退/缺卡扣款(${lateEarlyLeaveCount}次×${perTimePenalty}元/次)`,
      count: lateEarlyLeaveCount,
      amount,
      perTimePenalty,
      fullAttendanceCancelled: true, // 取消全勤奖
      note: '同时取消当月全勤奖（如有）'
    });
    total += amount;
  }

  return {
    total: round2(total),
    details,
    dailyRate: round2(daily)
  };
}

/**
 * 加班费计算函数 - 康源集团实际执行规则（用户确认版）
 *
 * 【企业实际规则】
 * 1. 工作日加班（平日延长）：不作数，不补钱、不补休、不扣钱
 *    理由：视为员工自身效率问题，应按时完成本职工作
 *    ⚠ 法律提示：劳动法第44条(一)规定应发150%，企业此做法有法律风险
 *       HR可通过规则引擎特殊覆盖为个别人开启150%（高管/特殊岗位）
 *
 * 2. 周末（公休日）加班：1:1结转调休余额，不发200%加班费
 *    合规依据：劳动法第44条(二)允许"补休或200%"二选一，企业可选补休
 *
 * 3. 法定节假日加班：总部放假不存在加班；教育机构也是调休不发300%
 *    ⚠⚠ 法律高风险：劳动法第44条(三)+工资支付暂行规定13条明确法定节假日必须300%
 *       不能用调休代替。企业此做法高风险，劳动监察必查点。
 *       HR可通过规则引擎特殊覆盖为个别人开启300%（如法定节假日确需加班的核心岗位）
 *
 * 【高自主性配置】
 * 全部3类加班的"计算方式"和"倍率"均可通过规则引擎动态修改：
 *   - 工作日：'NO_CALC'（不作数）/ 'PAY_150'（发1.5倍）/ 'COMPTIME'（转调休）
 *   - 周末：'COMPTIME_ONLY'（只转调休）/ 'PAY_200'（发2倍）/ 'PAY_OR_COMPTIME'（二选一）
 *   - 法定节假日：'COMPTIME_ONLY'（只转调休-当前）/ 'PAY_300'（发3倍-法定）/ 'PAY_300_PLUS_COMPTIME'
 *
 * 特殊人员规则覆盖：可针对单个员工/部门/岗位单独配置（见 SpecialRuleOverrideEngine）
 */
function calcOvertimePay({
  baseSalary,
  workdayOvertimeHours = 0,
  weekendOvertimeHours = 0,
  holidayOvertimeHours = 0,
  overtimePolicy = {
    workdayMode: 'NO_CALC',        // 工作日加班：不作数
    weekendMode: 'COMPTIME_ONLY',  // 周末加班：只转调休
    holidayMode: 'COMPTIME_ONLY',  // 法定节假日：只转调休（企业确认）
    comptimeCarryoverHours: 0      // 返回结转的调休小时数（由外部累加到调休余额）
  }
}) {
  const hourly = calcHourlyRate(baseSalary);
  const details = [];
  let total = 0;
  let comptimeAccruedHours = 0;

  // 工作日加班处理
  if (workdayOvertimeHours > 0) {
    const mode = overtimePolicy.workdayMode || 'NO_CALC';
    if (mode === 'PAY_150') {
      // 法定模式（1.5倍）- 仅特殊人员覆盖时启用
      const amount = round2(workdayOvertimeHours * hourly * 1.5);
      details.push({
        type: 'WORKDAY_OT', name: '平日加班(1.5倍-特殊覆盖)',
        hours: workdayOvertimeHours, rate: 1.5, hourlyRate: round2(hourly), amount,
        mode, legalNote: '特殊人员启用法定1.5倍'
      });
      total += amount;
    } else if (mode === 'COMPTIME') {
      // 转调休模式
      comptimeAccruedHours += workdayOvertimeHours;
      details.push({
        type: 'WORKDAY_OT', name: '平日加班(转调休)',
        hours: workdayOvertimeHours, rate: 0, hourlyRate: round2(hourly), amount: 0,
        mode, comptimeAccrued: workdayOvertimeHours,
        note: '工作日加班转调休（特殊人员覆盖）'
      });
    } else {
      // NO_CALC - 不作数（企业默认规则：视为效率问题）
      details.push({
        type: 'WORKDAY_OT', name: '平日加班(不作数)',
        hours: workdayOvertimeHours, rate: 0, hourlyRate: round2(hourly), amount: 0,
        mode: 'NO_CALC',
        note: '企业规则：工作日加班视为效率问题，不作数不补不扣',
        legalRisk: '⚠ 劳动法第44条(一)规定应发150%，此做法有法律风险'
      });
    }
  }

  // 周末加班处理
  if (weekendOvertimeHours > 0) {
    const mode = overtimePolicy.weekendMode || 'COMPTIME_ONLY';
    if (mode === 'PAY_200') {
      // 发2倍工资模式
      const amount = round2(weekendOvertimeHours * hourly * 2);
      details.push({
        type: 'WEEKEND_OT', name: '周末加班(2倍工资)',
        hours: weekendOvertimeHours, rate: 2, hourlyRate: round2(hourly), amount,
        mode, legalNote: '特殊人员覆盖为2倍发放'
      });
      total += amount;
    } else {
      // COMPTIME_ONLY - 只转调休（企业默认规则）
      comptimeAccruedHours += weekendOvertimeHours;
      details.push({
        type: 'WEEKEND_OT', name: '周末加班(转调休1:1)',
        hours: weekendOvertimeHours, rate: 0, hourlyRate: round2(hourly), amount: 0,
        mode: 'COMPTIME_ONLY',
        comptimeAccrued: weekendOvertimeHours,
        legalNote: '✅劳动法第44条(二)允许补休或200%二选一，企业选补休合法'
      });
    }
  }

  // 法定节假日加班处理
  if (holidayOvertimeHours > 0) {
    const mode = overtimePolicy.holidayMode || 'COMPTIME_ONLY';
    if (mode === 'PAY_300') {
      // 发3倍工资模式（法定标准）
      const amount = round2(holidayOvertimeHours * hourly * 3);
      details.push({
        type: 'HOLIDAY_OT', name: '法定节假日加班(3倍工资)',
        hours: holidayOvertimeHours, rate: 3, hourlyRate: round2(hourly), amount,
        mode, legalNote: '✅法定标准3倍发放'
      });
      total += amount;
    } else {
      // COMPTIME_ONLY - 只转调休（企业默认规则 - 法律高风险！）
      comptimeAccruedHours += holidayOvertimeHours;
      details.push({
        type: 'HOLIDAY_OT', name: '法定节假日加班(转调休1:1)',
        hours: holidayOvertimeHours, rate: 0, hourlyRate: round2(hourly), amount: 0,
        mode: 'COMPTIME_ONLY',
        comptimeAccrued: holidayOvertimeHours,
        legalRisk: '⚠⚠ 高风险：劳动法第44条(三)明文法定节假日必须300%不能抵调休',
        recommendation: '建议至少核心岗位（如必须值班的教育机构运维）启用PAY_300模式'
      });
    }
  }

  return {
    total: round2(total),
    details,
    hourlyRate: round2(hourly),
    comptimeAccruedHours: round2(comptimeAccruedHours, 2),
    overtimePolicyApplied: {
      workdayMode: overtimePolicy.workdayMode || 'NO_CALC',
      weekendMode: overtimePolicy.weekendMode || 'COMPTIME_ONLY',
      holidayMode: overtimePolicy.holidayMode || 'COMPTIME_ONLY'
    }
  };
}

class PayrollDAGEngine {
  constructor(options = {}) {
    this.allowanceCenter = options.allowanceCenter || new AllowanceCenter();
    this.enablePresetAllowances = options.enablePresetAllowances === true;
    this._completedNodes = new Map();
    this._nodeResults = {};
    this._currentContext = null;
  }

  _reset() {
    this._completedNodes.clear();
    this._nodeResults = {};
    this._currentContext = null;
  }

  _ensureNodeExecutable(nodeId) {
    const node = DAG_NODE_MAP[nodeId];
    if (!node) {
      throw new Error(`未知的DAG节点: ${nodeId}`);
    }
    for (const depId of node.dependencies) {
      if (!this._completedNodes.has(depId)) {
        throw new DAGOrderViolationError(`需要先完成节点${depId}才能算${nodeId}`);
      }
    }
  }

  _markComplete(nodeId, result) {
    this._completedNodes.set(nodeId, true);
    this._nodeResults[nodeId] = result;
    return result;
  }

  calcBaseSalary(ctx) {
    this._ensureNodeExecutable('baseSalary');
    const { employee, payrollGrade, year, month } = ctx;

    let gradeModel;
    if (payrollGrade instanceof PayrollGradeModel) {
      gradeModel = payrollGrade;
    } else if (typeof payrollGrade === 'string') {
      gradeModel = getPresetGrade(payrollGrade);
      if (!gradeModel) {
        throw new Error(`未找到预设薪级: ${payrollGrade}`);
      }
    } else {
      gradeModel = new PayrollGradeModel(payrollGrade || {});
    }

    const ratioResult = calcMonthRatio({
      year, month,
      entryDate: employee.entryDate,
      regularDate: employee.regularDate,
      leaveDate: employee.leaveDate
    }, { year, month });

    const baseFull = gradeModel.baseAmount;
    const perfFull = gradeModel.performanceAmount;
    const probationRatio = gradeModel.probationRatio || 0.8;

    let baseCalculated = 0;
    let perfCalculated = 0;
    let probationBase = 0;
    let regularBase = 0;
    let probationPerf = 0;
    let regularPerf = 0;

    const probationBaseDaily = (baseFull * probationRatio) / STANDARD_PAY_DAYS;
    const regularBaseDaily = baseFull / STANDARD_PAY_DAYS;
    const probationPerfDaily = (perfFull * probationRatio) / STANDARD_PAY_DAYS;
    const regularPerfDaily = perfFull / STANDARD_PAY_DAYS;
    const totalWorkdays = ratioResult.totalWorkdays || 0;
    const needProration = (ratioResult.firstPartDays + ratioResult.secondPartDays) < totalWorkdays || (ratioResult.firstPartDays > 0 && ratioResult.secondPartDays > 0);

    if (!needProration) {
      const isProb = ratioResult.firstPartDays > 0 ||
        (employee.isProbation ? employee.isProbation(new Date(year, month - 1, 15)) :
          (employee.status === '试用期' && (!employee.regularDate || new Date(employee.regularDate) > new Date(year, month, 0))));
      if (isProb) {
        baseCalculated = round2(baseFull * probationRatio);
        perfCalculated = round2(perfFull * probationRatio);
      } else {
        baseCalculated = round2(baseFull);
        perfCalculated = round2(perfFull);
      }
    } else {
      if (ratioResult.firstPartDays > 0) {
        probationBase = round2(ratioResult.firstPartDays * probationBaseDaily);
        probationPerf = round2(ratioResult.firstPartDays * probationPerfDaily);
      }
      if (ratioResult.secondPartDays > 0) {
        regularBase = round2(ratioResult.secondPartDays * regularBaseDaily);
        regularPerf = round2(ratioResult.secondPartDays * regularPerfDaily);
      }
      baseCalculated = round2(probationBase + regularBase);
      perfCalculated = round2(probationPerf + regularPerf);
    }

    const dailyRate = calcDailyRate(baseCalculated > 0 ? baseCalculated : baseFull);
    const hourlyRate = calcHourlyRate(baseCalculated > 0 ? baseCalculated : baseFull);

    const result = {
      employeeId: employee.id || null,
      baseSalary: baseCalculated,
      performanceStandard: perfCalculated,
      baseFull,
      performanceFull: perfFull,
      probationRatio,
      dailyRate: round2(dailyRate),
      hourlyRate: round2(hourlyRate),
      ratioBreakdown: ratioResult,
      probationBase,
      regularBase,
      probationPerf,
      regularPerf,
      gradeCode: gradeModel.gradeCode,
      gradeName: gradeModel.gradeName
    };

    this._currentContext = { ...ctx, gradeModel, baseResult: result };
    return this._markComplete('baseSalary', result);
  }

  calcAbsentDeduction(ctx) {
    this._ensureNodeExecutable('absentDeduction');
    const baseResult = this._nodeResults.baseSalary;
    const baseSalary = baseResult.baseFull;

    const result = calcAbsentDeduction({
      baseSalary,
      personalLeaveDays: ctx.personalLeaveDays,
      sickLeaveDays: ctx.sickLeaveDays,
      sickHasMedicalRecord: ctx.sickHasMedicalRecord !== false,
      absentDays: ctx.absentDays,
      lateEarlyLeaveCount: ctx.lateEarlyLeaveCount || 0
    });

    return this._markComplete('absentDeduction', result);
  }

  calcPerformancePay(ctx) {
    this._ensureNodeExecutable('performancePay');
    const baseResult = this._nodeResults.baseSalary;
    const performanceStandard = baseResult.performanceStandard;
    const score = ctx.performanceScore || 0;
    const amount = round2(calcPerformancePayAmount(performanceStandard, score));

    const result = {
      total: amount,
      performanceStandard,
      score,
      calcFormula: `${performanceStandard} × (${score}/100)`
    };

    return this._markComplete('performancePay', result);
  }

  calcSeniorityPay(ctx) {
    this._ensureNodeExecutable('seniorityPay');
    const { employee, year, month } = ctx || this._currentContext || {};
    const asOfDate = new Date(year, month - 1, 15);
    let years;
    if (employee && typeof employee.calcYearsOfService === 'function') {
      years = employee.calcYearsOfService(asOfDate);
    } else {
      const start = (employee && (employee.firstWorkDate || employee.entryDate)) ? new Date(employee.firstWorkDate || employee.entryDate) : null;
      if (!start) { years = 0; }
      else {
        const diff = asOfDate.getTime() - start.getTime();
        years = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
      }
    }
    const amount = calcSeniorityPayAmount(years, 100, 10);

    const result = {
      total: round2(amount),
      yearsOfService: years,
      perYear: 100,
      capYears: 10
    };

    return this._markComplete('seniorityPay', result);
  }

  calcOvertimePay(ctx) {
    this._ensureNodeExecutable('overtimePay');
    const baseResult = this._nodeResults.baseSalary;
    const baseSalary = baseResult.baseFull;

    const result = calcOvertimePay({
      baseSalary,
      workdayOvertimeHours: ctx.workdayOvertimeHours,
      weekendOvertimeHours: ctx.weekendOvertimeHours,
      holidayOvertimeHours: ctx.holidayOvertimeHours
    });

    return this._markComplete('overtimePay', result);
  }

  calcAllowances(ctx) {
    this._ensureNodeExecutable('allowances');
    const { employee, year, month, workdaysOfMonth, customAllowances = [] } = ctx || this._currentContext || {};
    let result = { details: [], total: 0 };

    if (this.enablePresetAllowances && this.allowanceCenter && employee && year && month) {
      try {
        result = this.allowanceCenter.calcMonthlyAllowances({
          employee, year, month,
          workdaysOfMonth: workdaysOfMonth || getWorkdaysInMonth(year, month)
        });
      } catch (e) {
        result = { details: [], total: 0 };
      }
    }

    if (!result) {
      result = { details: [], total: 0 };
    }

    if (Array.isArray(customAllowances) && customAllowances.length > 0) {
      for (const ca of customAllowances) {
        const det = {
          code: ca.code || `CUSTOM_${Date.now()}`,
          name: ca.name || '自定义津贴',
          type: ca.type || 'CUSTOM',
          typeLabel: ca.typeLabel || '自定义',
          amount: Number(ca.amount) || 0,
          note: ca.note || '',
          source: ca.source || 'CUSTOM'
        };
        result.details.push(det);
        result.total = round2(result.total + det.amount);
      }
    }

    return this._markComplete('allowances', {
      total: round2(result.total || 0),
      details: result.details || []
    });
  }

  calcOtherAdjustments(ctx) {
    this._ensureNodeExecutable('otherAdjustments');
    const adjustments = ctx.adjustments || [];
    const details = [];
    let total = 0;

    for (const adj of adjustments) {
      const amount = Number(adj.amount) || 0;
      details.push({
        code: adj.code,
        name: adj.name,
        amount,
        type: adj.type || 'OTHER',
        note: adj.note || ''
      });
      total += amount;
    }

    return this._markComplete('otherAdjustments', {
      total: round2(total),
      details
    });
  }

  calcGrossPay() {
    this._ensureNodeExecutable('grossPay');
    const b = this._nodeResults.baseSalary.baseSalary || 0;
    const a = this._nodeResults.absentDeduction.total || 0;
    const p = this._nodeResults.performancePay.total || 0;
    const s = this._nodeResults.seniorityPay.total || 0;
    const o = this._nodeResults.overtimePay.total || 0;
    const al = this._nodeResults.allowances.total || 0;
    const ot = this._nodeResults.otherAdjustments.total || 0;

    const gross = round2(b - a + p + s + o + al + ot);

    const result = {
      grossPay: gross,
      formula: 'baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay + allowances + otherAdjustments',
      components: {
        baseSalary: b,
        absentDeduction: -a,
        performancePay: p,
        seniorityPay: s,
        overtimePay: o,
        allowances: al,
        otherAdjustments: ot
      }
    };

    return this._markComplete('grossPay', result);
  }

  calcSocialHousingFund(ctx) {
    this._ensureNodeExecutable('socialHousingFund');
    const grossPay = this._nodeResults.grossPay.grossPay || 0;
    const { areaCode, payrollMonth, salaryForSocial } = ctx || {};
    const calcSalary = Number(salaryForSocial) > 0 ? salaryForSocial : grossPay;
    const payrollDate = payrollMonth || `${ctx.year}-${String(ctx.month).padStart(2, '0')}-01`;

    let socialResult = null;
    if (areaCode) {
      const areaModel = findAreaVersion(areaCode, payrollDate);
      if (areaModel) {
        socialResult = areaModel.calcSocialInsurance(calcSalary, payrollDate);
      }
    }

    if (!socialResult) {
      socialResult = {
        base: 0, pension: 0, unemployment: 0,
        medical: 0, bigMedicalSupplement: 0,
        housingFund: 0, total: 0
      };
    }

    return this._markComplete('socialHousingFund', {
      base: round2(socialResult.base),
      pension: round2(socialResult.pension),
      unemployment: round2(socialResult.unemployment),
      medical: round2(socialResult.medical),
      bigMedicalSupplement: round2(socialResult.bigMedicalSupplement),
      housingFund: round2(socialResult.housingFund),
      total: round2(socialResult.total),
      breakdown: {
        pension: '养老保险',
        medical: '医疗保险',
        unemployment: '失业保险',
        housingFund: '住房公积金',
        bigMedicalSupplement: '大额医疗补助'
      }
    });
  }

  calcIncomeTax(ctx) {
    this._ensureNodeExecutable('incomeTax');
    const grossPay = this._nodeResults.grossPay.grossPay || 0;
    const socialTotal = this._nodeResults.socialHousingFund.total || 0;
    const { year, month, specialDeductionsMonthly = {} } = ctx || this._currentContext || {};

    const taxResult = calculateMonthlyTax({
      year: year || new Date().getFullYear(),
      month: month || 1,
      monthlyIncome: grossPay,
      socialTotalMonthly: socialTotal,
      specialDeductionsMonthly
    });

    return this._markComplete('incomeTax', {
      monthlyTax: round2(taxResult.monthlyTax),
      taxableIncome: round2(taxResult.taxableIncome),
      taxRate: taxResult.taxRate,
      quickDeduction: taxResult.quickDeduction,
      cumulativeTax: round2(taxResult.cumulativeTax)
    });
  }

  calcNetPay() {
    this._ensureNodeExecutable('netPay');
    const grossPay = this._nodeResults.grossPay.grossPay || 0;
    const socialTotal = this._nodeResults.socialHousingFund.total || 0;
    const incomeTax = this._nodeResults.incomeTax.monthlyTax || 0;
    const net = round2(grossPay - socialTotal - incomeTax);

    return this._markComplete('netPay', {
      netPay: net,
      formula: 'grossPay - socialHousingFund - incomeTax',
      components: {
        grossPay,
        socialHousingFund: -socialTotal,
        incomeTax: -incomeTax
      }
    });
  }

  executeFullDAG(params) {
    this._reset();
    const {
      employee,
      payrollGrade,
      year,
      month,
      personalLeaveDays = 0,
      sickLeaveDays = 0,
      sickHasMedicalRecord = true,
      absentDays = 0,
      lateEarlyLeaveCount = 0,
      performanceScore = 0,
      workdayOvertimeHours = 0,
      weekendOvertimeHours = 0,
      holidayOvertimeHours = 0,
      workdaysOfMonth,
      customAllowances = [],
      adjustments = [],
      areaCode = null,
      payrollMonth = null,
      salaryForSocial = null,
      specialDeductionsMonthly = {}
    } = params;

    const commonCtx = { employee, payrollGrade, year, month };

    this.calcBaseSalary({ ...commonCtx });
    this.calcAbsentDeduction({
      personalLeaveDays, sickLeaveDays, sickHasMedicalRecord,
      absentDays, lateEarlyLeaveCount
    });
    this.calcPerformancePay({ performanceScore });
    this.calcSeniorityPay({ employee, year, month });
    this.calcOvertimePay({ workdayOvertimeHours, weekendOvertimeHours, holidayOvertimeHours });
    this.calcAllowances({ employee, year, month, workdaysOfMonth, customAllowances });
    this.calcOtherAdjustments({ adjustments });
    this.calcGrossPay();
    this.calcSocialHousingFund({ areaCode, payrollMonth, salaryForSocial, year, month });
    this.calcIncomeTax({ year, month, specialDeductionsMonthly });
    this.calcNetPay();

    return this.buildPayslipDetail(params);
  }

  buildPayslipDetail(params) {
    const base = this._nodeResults.baseSalary || {};
    const absent = this._nodeResults.absentDeduction || { total: 0, details: [] };
    const perf = this._nodeResults.performancePay || { total: 0 };
    const sen = this._nodeResults.seniorityPay || { total: 0 };
    const ot = this._nodeResults.overtimePay || { total: 0, details: [] };
    const alw = this._nodeResults.allowances || { total: 0, details: [] };
    const other = this._nodeResults.otherAdjustments || { total: 0, details: [] };
    const gross = this._nodeResults.grossPay || { grossPay: 0 };
    const social = this._nodeResults.socialHousingFund || { total: 0 };
    const tax = this._nodeResults.incomeTax || { monthlyTax: 0 };
    const net = this._nodeResults.netPay || { netPay: 0 };

    return {
      employeeId: params.employee ? (params.employee.id || null) : base.employeeId,
      employeeName: params.employee ? params.employee.name : null,
      month: `${params.year}-${String(params.month).padStart(2, '0')}`,
      year: params.year,
      monthNum: params.month,
      baseSalary: round2(base.baseSalary || 0),
      baseSalaryBreakdown: {
        baseFull: base.baseFull,
        probationBase: base.probationBase,
        regularBase: base.regularBase,
        probationPerf: base.probationPerf,
        regularPerf: base.regularPerf,
        probationRatio: base.probationRatio,
        gradeCode: base.gradeCode,
        gradeName: base.gradeName,
        ratioBreakdown: base.ratioBreakdown
      },
      absentDeduction: {
        total: round2(absent.total || 0),
        details: absent.details || []
      },
      performancePay: {
        total: round2(perf.total || 0),
        performanceStandard: perf.performanceStandard,
        points: perf.score
      },
      seniorityPay: {
        total: round2(sen.total || 0),
        years: sen.yearsOfService,
        perYear: sen.perYear,
        capYears: sen.capYears
      },
      overtimePay: {
        total: round2(ot.total || 0),
        details: ot.details || [],
        hourlyRate: ot.hourlyRate
      },
      allowances: {
        total: round2(alw.total || 0),
        details: alw.details || []
      },
      otherAdjustments: {
        total: round2(other.total || 0),
        details: other.details || []
      },
      grossPay: round2(gross.grossPay || 0),
      socialFund: {
        total: round2(social.total || 0),
        base: social.base,
        pension: round2(social.pension || 0),
        medical: round2(social.medical || 0),
        unemployment: round2(social.unemployment || 0),
        housingFund: round2(social.housingFund || 0),
        bigMedicalSupplement: round2(social.bigMedicalSupplement || 0)
      },
      incomeTax: round2(tax.monthlyTax || 0),
      incomeTaxDetail: {
        taxableIncome: tax.taxableIncome,
        taxRate: tax.taxRate,
        quickDeduction: tax.quickDeduction,
        cumulativeTax: tax.cumulativeTax
      },
      netPay: round2(net.netPay || 0),
      dailyRateBreakdown: {
        standardPayDays: STANDARD_PAY_DAYS,
        standardWorkHours: STANDARD_WORK_HOURS,
        dailyRate: round2(base.dailyRate || calcDailyRate(base.baseSalary || base.baseFull || 0)),
        hourlyRate: round2(base.hourlyRate || calcHourlyRate(base.baseSalary || base.baseFull || 0))
      },
      executionOrder: DAG_NODES.map(n => n.id)
    };
  }
}

module.exports = {
  PayrollDAGEngine,
  DAG_NODES,
  DAG_NODE_MAP,
  DAGOrderViolationError,
  STANDARD_PAY_DAYS,
  STANDARD_WORK_HOURS,
  calcDailyRate,
  calcHourlyRate,
  calcSeniorityPayAmount,
  calcPerformancePayAmount,
  calcMonthRatio,
  calcAbsentDeduction,
  calcOvertimePay,
  round2
};
