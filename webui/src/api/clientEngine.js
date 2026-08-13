// 客户端 API 引擎 — 实现与 backend_server.js 完全对等的接口
// 所有计算在浏览器内完成，零后端依赖，可部署到任意静态托管

const STANDARD_PAY_DAYS = 21.75;
const STANDARD_WORK_HOURS = 8;
const round2 = n => Math.round(n * 100) / 100;

// ===== 个税引擎 =====
const TAX_BRACKETS = [
  { upperLimit: 36000, rate: 0.03, quickDeduction: 0 },
  { upperLimit: 144000, rate: 0.10, quickDeduction: 2520 },
  { upperLimit: 300000, rate: 0.20, quickDeduction: 16920 },
  { upperLimit: 420000, rate: 0.25, quickDeduction: 31920 },
  { upperLimit: 660000, rate: 0.30, quickDeduction: 52920 },
  { upperLimit: 960000, rate: 0.35, quickDeduction: 85920 },
  { upperLimit: Infinity, rate: 0.45, quickDeduction: 181920 }
];
const SPECIAL_DEDUCTION_CONFIG = {
  childrenPerChild: 1000, mortgage: 1000,
  rentTier1: 1500, rentTier2: 1100, rentTier3: 800,
  elderlyOnlyChild: 2000, continuingEduMonthly: 400,
  infantCare: 2000
};
const STANDARD_DEDUCTION_MONTHLY = 5000;

function calculateMonthlyTax({ year, month, monthlyIncome, socialTotalMonthly, specialDeductionsMonthly = {} }) {
  const taxableIncome = Math.max(0, Number(monthlyIncome) - Number(socialTotalMonthly || 0) - STANDARD_DEDUCTION_MONTHLY
    - Object.values(specialDeductionsMonthly).reduce((s, v) => s + (Number(v) || 0), 0));
  let rate = 0, quickDeduction = 0, cumulativeTax = 0;
  for (const b of TAX_BRACKETS) {
    if (taxableIncome <= b.upperLimit) { rate = b.rate; quickDeduction = b.quickDeduction; break; }
  }
  cumulativeTax = taxableIncome * rate - quickDeduction;
  const monthlyTax = Math.max(0, cumulativeTax);
  return { taxableIncome: round2(taxableIncome), taxRate: rate, quickDeduction, cumulativeTax: round2(cumulativeTax), monthlyTax: round2(monthlyTax) };
}

// ===== 社保引擎 =====
const AREA_VERSIONS = {
  XA: [{ effectiveDate: '2026-01-01', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 8, housingFundRatio: 0.10 }],
  TS: [{ effectiveDate: '2026-01-01', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08 }],
  BY: [{ effectiveDate: '2026-01-01', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08 }],
  PL: [{ effectiveDate: '2026-01-01', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.08 }],
  LZ: [{ effectiveDate: '2026-01-01', pensionRatio: 0.08, unemploymentRatio: 0.003, medicalRatio: 0.02, bigMedicalSupplement: 5, housingFundRatio: 0.12 }]
};

function listAllAreaCodes() {
  return Object.entries(AREA_VERSIONS).map(([code, vs]) => ({ areaCode: code, areaName: { XA:'西安', TS:'天水', BY:'白银', PL:'平凉', LZ:'兰州' }[code], versions: vs.length }));
}
function findAreaVersion(areaCode, payrollMonth) {
  const versions = AREA_VERSIONS[areaCode];
  if (!versions || !versions.length) return null;
  const sorted = [...versions].sort((a,b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
  for (const v of sorted) {
    if (new Date(payrollMonth) >= new Date(v.effectiveDate)) return { ...v, areaCode, calcSocialInsurance: (salary, month) => calcSocial(salary, v) };
  }
  return { ...sorted[sorted.length-1], areaCode, calcSocialInsurance: (salary, month) => calcSocial(salary, sorted[sorted.length-1]) };
}
function calcSocial(salary, v) {
  const base = Number(salary);
  const pension = round2(base * v.pensionRatio);
  const unemployment = round2(base * v.unemploymentRatio);
  const medical = round2(base * v.medicalRatio);
  const bigMedical = v.bigMedicalSupplement;
  const housingFund = round2(base * v.housingFundRatio);
  return { base: round2(base), pension, unemployment, medical, bigMedicalSupplement: bigMedical, housingFund, total: round2(pension+unemployment+medical+bigMedical+housingFund) };
}

// ===== 品牌配置 =====
const BRAND = {
  brandColors: { primary: { name:'康源橙', hex:'#CC5500', rgb:'rgb(204,85,0)' } },
  groupInfo: { legalName:'陕西康源投资（集团）有限公司', shortName:'康源集团', slogan:'医康养健文娱·全产业链守护幸福晚年' },
  businessUnits: {
    MEIHONG: { code:'BU_MEIHONG', shortName:'康源美宏', fullName:'养老机构运营', buColor:'#CC5500' },
    FUZHI_EDU: { code:'BU_FUZHI_EDU', shortName:'福祉教育', fullName:'护理人才培育', buColor:'#5B8BA6' },
    QIXIANG: { code:'BU_QIXIANG', shortName:'耆祥', fullName:'社区居家上门', buColor:'#7BA05B' }
  }
};

// ===== 数据字典 =====
const DICT = {
  BUSINESS_UNIT_CODE: { GROUP_HQ:'GROUP_HQ', MEIHONG:'BU_MEIHONG', FUZHI_EDU:'BU_FUZHI_EDU', QIXIANG:'BU_QIXIANG' },
  LEGAL_ENTITY_CODE: { GROUP_HQ:'GROUP_HQ', MEIHONG:'MEIHONG', FUZHI_EDU:'FUZHI_EDU', QIXIANG:'QIXIANG' },
  EMPLOYMENT_STATUS: { ACTIVE:'在职', PROBATION:'试用期', LEAVE:'请假', RESIGNED:'离职' },
  EMPLOYEE_TYPE: { FULL_TIME:'正式', PART_TIME:'兼职', INTERN:'实习' },
  WORK_LOCATION_CODE: { XA:'西安', TS:'天水', BY:'白银', PL:'平凉', LZ:'兰州' },
  POSITION_LEVEL: { L1:'L1', L2:'L2', L3:'L3', M1:'M1', M2:'M2', M3:'M3', M4:'M4' },
  PAYROLL_BAND: { BAND_A:'A档(高管)', BAND_B:'B档(中层)', BAND_C:'C档(主管)', BAND_D:'D档(员工)' },
  APPROVAL_ROUTING_MATRIX: { LEAVE:'部门主管→HR', PAYROLL:'HR→CFO→CEO', OVERTIME:'部门主管→HR' }
};

// ===== 规则引擎 =====
const RULES = [
  { rCode:'R-001', name:'工作日加班费', category:'§12薪酬', mode:'NO_CALC', desc:'不作数不补不扣', risk:'MID' },
  { rCode:'R-002', name:'周末加班费', category:'§12薪酬', mode:'COMPTIME_ONLY', desc:'1:1转调休·不发200%', risk:'OK' },
  { rCode:'R-003', name:'法定节假日加班费', category:'§12薪酬', mode:'COMPTIME_ONLY', desc:'1:1转调休(机构)', risk:'HIGH' },
  { rCode:'R-004', name:'旷工扣款', category:'§5考勤', mode:'ABSENT_1X', desc:'按事假1倍扣', risk:'OK' },
  { rCode:'R-005', name:'迟到/缺卡扣款', category:'§5考勤', mode:'LATE_PER_TIME', desc:'10元/次+取消全勤', risk:'OK' },
  { rCode:'R-006', name:'病假扣款(有病历)', category:'§4假期', mode:'SICK_20', desc:'扣20%·发80%', risk:'OK' },
  { rCode:'R-007', name:'病假扣款(无病历)', category:'§4假期', mode:'SICK_100', desc:'按事假100%扣', risk:'OK' },
  { rCode:'R-008', name:'工龄工资', category:'§12薪酬', mode:'SENIORITY_100', desc:'100元/年·封顶10年', risk:'OK' },
  { rCode:'R-009', name:'试用期待遇', category:'§12薪酬', mode:'PROBATION_80', desc:'80%工资', risk:'OK' }
];
const RULE_CATEGORIES = { HOLIDAY:'§4假期', ATTENDANCE:'§5考勤', PAYROLL:'§12薪酬', APPROVAL:'审批', SOCIAL:'社保' };

const OVERRIDES = [];

// ===== 假期引擎 =====
const LEAVE_TYPES = [
  { type:'ANNUAL', name:'年假', unit:'day', paid:true, payRate:1 },
  { type:'PERSONAL', name:'事假', unit:'day', paid:false, payRate:0 },
  { type:'SICK', name:'病假', unit:'day', paid:true, payRate:0.8 },
  { type:'COMPTIME', name:'调休', unit:'hour', paid:true, payRate:1 }
];

function calcAnnualLeaveQuota({ employee, asOfDate }) {
  if (!employee || !employee.entryDate) return { quota: 0, yearsOfService: 0 };
  const asOf = new Date(asOfDate || new Date());
  const entry = new Date(employee.entryDate);
  let years = asOf.getFullYear() - entry.getFullYear();
  if (asOf < new Date(asOf.getFullYear(), entry.getMonth(), entry.getDate())) years--;
  let quota = 0;
  if (years >= 20) quota = 15;
  else if (years >= 10) quota = 10;
  else if (years >= 1) quota = 5;
  return { quota, yearsOfService: years, baseQuota: quota, calculationMethod: years < 1 ? '工龄不足1年无年假' : '按档位全额计算' };
}

// ===== 员工模型 =====
function getBusinessUnit(employee) {
  const bu = employee?.bu || employee?.businessUnit || 'GROUP_HQ';
  const map = { GROUP_HQ:'集团总部', BU_MEIHONG:'康源美宏', BU_FUZHI_EDU:'福祉教育', BU_QIXIANG:'耆祥' };
  return { code: bu, name: map[bu] || bu };
}
function getPayrollBand(employee) {
  const level = employee?.positionLevel || employee?.grade || 'L2';
  let band = 'BAND_D';
  if (level.startsWith('M4')) band = 'BAND_A';
  else if (level.startsWith('M3')) band = 'BAND_B';
  else if (level.startsWith('M1') || level.startsWith('M2')) band = 'BAND_C';
  return { band, name: DICT.PAYROLL_BAND[band] };
}
function calcYearsOfService(employee, asOfDate) {
  if (!employee?.entryDate) return 0;
  const asOf = new Date(asOfDate || new Date());
  const entry = new Date(employee.entryDate);
  let years = asOf.getFullYear() - entry.getFullYear();
  if (asOf < new Date(asOf.getFullYear(), entry.getMonth(), entry.getDate())) years--;
  return Math.max(0, years);
}
function calcAge(birthDate) {
  if (!birthDate) return 0;
  const now = new Date();
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

// ===== 驾驶舱 =====
function getGroupOverview(period) {
  return {
    totalEmployees: 314, monthlyPayrollCost: 4286000,
    payrollAccuracy: 99.95, selfConfirmRate: 98.7,
    timeReduction: 97.875, monthlyAnomalies: 25,
    period: period || '2026-08'
  };
}
function getBusinessUnitBreakdown(period) {
  return [
    { code:'BU_MEIHONG', name:'康源美宏', employees:168, monthlyCost:2680000, avgSalary:15952, monthlyAnomaly:12, buColor:'#CC5500' },
    { code:'BU_FUZHI_EDU', name:'福祉教育', employees:96, monthlyCost:1180000, avgSalary:12291, monthlyAnomaly:8, buColor:'#5B8BA6' },
    { code:'BU_QIXIANG', name:'耆祥', employees:50, monthlyCost:426000, avgSalary:8520, monthlyAnomaly:5, buColor:'#7BA05B' }
  ];
}
function getComplianceRiskSnapshot() {
  return {
    riskLevel: 'HIGH',
    items: [
      { type:'OVERTIME', desc:'法定节假日加班按调休处理，劳动法第44条(三)要求300%', severity:'HIGH' },
      { type:'OVERTIME', desc:'工作日加班不作数，劳动法第44条(一)要求150%', severity:'MID' },
      { type:'SOCIAL', desc:'社保公积金基数按实际工资缴纳，符合规定', severity:'OK' },
      { type:'LEAVE', desc:'病假扣款20%有病历合规', severity:'OK' }
    ]
  };
}

// ===== AI Agent =====
function answerQuestion(question) {
  const q = (question || '').toLowerCase();
  const rules = {
    '加班': '工作日加班不作数（效率问题）；周末加班1:1转调休；法定节假日加班转调休（高风险，可特殊覆盖为300%）',
    '年假': '工龄1-10年享5天，10-20年享10天，20年以上享15天',
    '病假': '有病历扣20%发80%，无病历按事假100%扣',
    '旷工': '按事假1倍扣（合规化调整，原3倍已废止）',
    '迟到': '10元/次+取消全勤奖',
    '社保': '养老8%+失业0.3%+医疗2%+大病固定+公积金8%~12%',
    '个税': '每月5000起征，7级累进3%-45%，专项附加扣除含子女1000/房贷1000/赡养老人2000等',
    '调休': '周末加班1:1结转，180天有效期',
    '试用期': '试用期工资80%',
    '工龄': '每满1年加100元/月，封顶10年=1000元/月'
  };
  for (const [k, v] of Object.entries(rules)) {
    if (q.includes(k)) return { answer: v, source: '康源集团人力资源管理制度' };
  }
  return { answer: '未匹配到相关规则，请咨询人力资源部或使用关键词（加班/年假/病假/旷工/社保/个税/调休/试用期/工龄）查询', source: 'AI规则引擎' };
}

// ===== 考勤汇总 =====
function summarizeAttendance(records, payrollMonth) {
  const stats = { total: records?.length || 0, late: 0, absent: 0, missingPunch: 0, leave: 0 };
  (records || []).forEach(r => {
    if (r.type === 'LATE') stats.late++;
    if (r.type === 'ABSENT') stats.absent++;
    if (r.type === 'MISS_PUNCH') stats.missingPunch++;
    if (r.type === 'LEAVE') stats.leave++;
  });
  return { month: payrollMonth, stats, summary: `本月共${stats.total}条考勤记录，迟到${stats.late}次，旷工${stats.absent}天，缺卡${stats.missingPunch}次` };
}

// ===== 薪酬计算（简化版 DAG）=====
function calcPayroll(params) {
  const { employee, year, month, personalLeaveDays=0, sickLeaveDays=0, absentDays=0, lateEarlyLeaveCount=0,
    performanceScore=0, workdayOvertimeHours=0, weekendOvertimeHours=0, holidayOvertimeHours=0,
    areaCode, payrollMonth, specialDeductionsMonthly={} } = params;

  const baseSalary = Number(params.baseSalary || 5000);
  const dailyRate = round2(baseSalary / STANDARD_PAY_DAYS);
  const hourlyRate = round2(dailyRate / STANDARD_WORK_HOURS);

  // 缺勤扣款
  const absentDeduction = round2(
    personalLeaveDays * dailyRate +
    sickLeaveDays * dailyRate * (sickLeaveDays > 0 ? (params.sickHasMedicalRecord !== false ? 0.2 : 1) : 0) +
    absentDays * dailyRate +
    lateEarlyLeaveCount * 10
  );

  // 绩效
  const performancePay = round2(Number(params.performanceStandard || 800) * performanceScore / 100);

  // 工龄工资
  const yos = calcYearsOfService(employee, new Date(year, month-1, 15));
  const seniorityPay = round2(Math.min(yos, 10) * 100);

  // 加班费（康源规则）
  let overtimePay = 0;
  const overtimeDetails = [];
  if (workdayOvertimeHours > 0) overtimeDetails.push({ type:'WORKDAY_OT', name:'平日加班(不作数)', hours:workdayOvertimeHours, amount:0, note:'企业规则：不作数' });
  if (weekendOvertimeHours > 0) overtimeDetails.push({ type:'WEEKEND_OT', name:'周末加班(转调休1:1)', hours:weekendOvertimeHours, amount:0, comptimeAccrued:weekendOvertimeHours });
  if (holidayOvertimeHours > 0) overtimeDetails.push({ type:'HOLIDAY_OT', name:'法定节假日(转调休)', hours:holidayOvertimeHours, amount:0, comptimeAccrued:holidayOvertimeHours });

  // 应发
  const grossPay = round2(baseSalary - absentDeduction + performancePay + seniorityPay + overtimePay);

  // 社保
  let socialTotal = 0, socialDetail = {};
  if (areaCode) {
    const model = findAreaVersion(areaCode, payrollMonth || `${year}-${String(month).padStart(2,'0')}-01`);
    if (model) {
      const social = model.calcSocialInsurance(grossPay);
      socialTotal = social.total;
      socialDetail = social;
    }
  }

  // 个税
  const taxResult = calculateMonthlyTax({ year, month, monthlyIncome: grossPay, socialTotalMonthly: socialTotal, specialDeductionsMonthly });

  // 实发
  const netPay = round2(grossPay - socialTotal - taxResult.monthlyTax);

  return {
    employeeId: employee?.id || employee?.empId || null,
    employeeName: employee?.name || null,
    month: `${year}-${String(month).padStart(2,'0')}`,
    baseSalary,
    absentDeduction: { total: absentDeduction, dailyRate },
    performancePay,
    seniorityPay: { total: seniorityPay, years: yos },
    overtimePay: { total: overtimePay, details: overtimeDetails, comptimeAccruedHours: weekendOvertimeHours + holidayOvertimeHours },
    grossPay,
    socialFund: { ...socialDetail, total: socialTotal },
    incomeTax: taxResult.monthlyTax,
    incomeTaxDetail: { taxableIncome: taxResult.taxableIncome, taxRate: taxResult.taxRate },
    netPay,
    dailyRateBreakdown: { standardPayDays: STANDARD_PAY_DAYS, dailyRate, hourlyRate }
  };
}

// ===== API 路由表 =====
const ROUTES = {
  'GET /api/health': () => ({ ok: true, name: 'kangyuan-hr-platform', timestamp: new Date().toISOString(), modules: ['payroll','tax','rule','override','leave','si','emp','attendance','brand','dict','cockpit','ai'] }),
  'GET /api/brand': () => ({ ok: true, brand: BRAND }),
  'GET /api/dictionary': () => ({ ok: true, enums: DICT }),
  'GET /api/rules': () => ({ ok: true, rules: RULES, categories: RULE_CATEGORIES }),
  'GET /api/rules/standards': () => ({ ok: true, result: {
    overtime: { weekday:{ policy:'NO_CALC', desc:'工作日加班不作数' }, weekend:{ policy:'COMPTIME_ONLY', ratio:'1:1' }, legalHoliday:{ policy:'COMPTIME_ONLY', desc:'法定节假日调休' }, executiveOverride:{ desc:'可特殊覆盖为300%' } },
    absent: { absentDeduction:'1倍日薪', lateOrMissingCard:'10元/次+取消全勤' },
    leave: { sickWithRecord:'扣20%', sickNoRecord:'扣100%', annual:{ '0-1年':0, '1-10年':5, '10-20年':10, '≥20年':15 }, comptimeExpire:'180天' },
    tax: { standard:5000, brackets:['3%','10%','20%','25%','30%','35%','45%'] },
    socialInsurance: { areas:['XA西安','TS天水','BY白银','PL平凉','LZ兰州'], personalRates:'养老8%+失业0.3%+医疗2%+大病+公积金8-12%' },
    overridePriority: ['员工级','岗位级','部门级','工作地级','全局默认']
  }}),
  'POST /api/rules/update': (body) => { const r = RULES.find(x => x.rCode === body.ruleId); if (r && body.updates) Object.assign(r, body.updates); return { ok: true, result: r }; },
  'GET /api/override/list': () => ({ ok: true, result: OVERRIDES }),
  'POST /api/override/add': (body) => { OVERRIDES.push({ ...body, createdAt: new Date().toISOString() }); return { ok: true, result: OVERRIDES[OVERRIDES.length-1] }; },
  'GET /api/tax/brackets': () => ({ ok: true, TAX_BRACKETS, SPECIAL_DEDUCTION_CONFIG, STANDARD_DEDUCTION_MONTHLY }),
  'POST /api/tax/monthly': (body) => ({ ok: true, result: calculateMonthlyTax(body || {}) }),
  'GET /api/si/areas': () => ({ ok: true, areas: listAllAreaCodes() }),
  'POST /api/si/calc': (body) => { const m = findAreaVersion(body.areaCode, body.payrollMonth); if (!m) return { ok:false, error:'未找到该地区社保版本' }; return { ok: true, result: m.calcSocialInsurance(body.salary, body.payrollMonth), areaInfo: m }; },
  'POST /api/leave/annual-quota': (body) => ({ ok: true, result: calcAnnualLeaveQuota(body || {}) }),
  'GET /api/leave/types': () => ({ ok: true, types: LEAVE_TYPES }),
  'POST /api/leave/apply': (body) => ({ ok: true, result: { id: 'LV'+Date.now(), status:'SUBMITTED', ...body } }),
  'POST /api/employee/profile': (body) => ({ ok: true, profile: body, yearsOfService: calcYearsOfService(body), age: calcAge(body.birthDate), businessUnit: getBusinessUnit(body), payrollBand: getPayrollBand(body), leaveEntitlement: calcAnnualLeaveQuota({ employee: body, asOfDate: new Date() }) }),
  'POST /api/attendance/monthly': (body) => ({ ok: true, result: summarizeAttendance(body.records, body.payrollMonth) }),
  'POST /api/payroll/calc': (body) => ({ ok: true, result: (body.employees || []).map(e => calcPayroll({ ...body, employee: e })) }),
  'POST /api/payroll/simulate': (body) => ({ ok: true, result: calcPayroll({ ...body, employee: body.employee }) }),
  'GET /api/cockpit/overview': (q) => ({ ok: true, result: getGroupOverview(q?.period) }),
  'GET /api/cockpit/bu-breakdown': (q) => ({ ok: true, result: getBusinessUnitBreakdown(q?.period) }),
  'GET /api/cockpit/compliance': () => ({ ok: true, result: getComplianceRiskSnapshot() }),
  'POST /api/ai/ask': (body) => ({ ok: true, result: answerQuestion(body?.question || '') })
};

// ===== 路由匹配 =====
function matchRoute(method, path) {
  const key = `${method} ${path}`;
  if (ROUTES[key]) return { handler: ROUTES[key], params: {} };
  // 支持 query 参数的 GET 路由
  if (method === 'GET') {
    for (const k of Object.keys(ROUTES)) {
      if (k.startsWith('GET ') && path === k.substring(4)) {
        return { handler: ROUTES[k], params: {} };
      }
    }
  }
  return null;
}

export async function handleRequest(method, path, body, query) {
  const route = matchRoute(method, path);
  if (!route) return { ok: false, error: `API not found: ${method} ${path}` };
  try {
    const args = method === 'GET' ? [query] : [body || {}];
    return await route.handler(...args);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export default { handleRequest };
