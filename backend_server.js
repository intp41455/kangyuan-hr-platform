'use strict';

const express = require('express');
const dayjs = require('dayjs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (允许前端跨域访问，部署到同域后其实不需要，但保留以防万一)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ========== 懒加载核心引擎模块 ==========
// 注意：Vercel Serverless Functions 冷启动时按需加载，不要顶层 require 所有东西
const loaders = {
  payroll: () => require('./src/modules/payroll/payroll_engine.js'),
  tax: () => require('./src/modules/payroll/tax_engine.js'),
  rule: () => require('./src/modules/rules/rule_engine.js'),
  override: () => require('./src/modules/rules/special_rule_override_engine.js'),
  leave: () => require('./src/modules/leave/leave_engine.js'),
  si: () => require('./src/modules/master_data/social_insurance_model.js'),
  emp: () => require('./src/modules/master_data/employee_model.js'),
  attendance: () => require('./src/modules/attendance/monthly_attendance_summary.js'),
  brand: () => require('./src/common/kangyuan_brand_config.js'),
  dict: () => require('./src/common/data_dictionary.js'),
  cockpit: () => require('./src/modules/dashboard/hr_executive_cockpit.js'),
  ai: () => require('./src/modules/ai/hr_ai_agent.js'),
};

function safe(fn, res, label = 'unknown') {
  try {
    return fn();
  } catch (err) {
    console.error(`[${label}]`, err && err.stack || err);
    return res.status(500).json({ ok: false, error: err && err.message || String(err), label });
  }
}

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'kangyuan-hr-platform',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    modules: Object.keys(loaders),
  });
});

// ========== 1. 薪酬引擎 ==========
app.post('/api/payroll/calc', (req, res) => safe(() => {
  const { PayrollEngine } = loaders.payroll();
  const engine = new PayrollEngine(req.body.config || {});
  const result = engine.run(req.body.employees || [], req.body.payrollMonth);
  res.json({ ok: true, result });
}, res, 'payroll.calc'));

app.post('/api/payroll/simulate', (req, res) => safe(() => {
  const { PayrollEngine } = loaders.payroll();
  const engine = new PayrollEngine(req.body.config || {});
  const result = engine.simulateSingle(req.body.employee || {}, req.body.payrollMonth, req.body.scenario);
  res.json({ ok: true, result });
}, res, 'payroll.simulate'));

// ========== 2. 个税 ==========
app.post('/api/tax/monthly', (req, res) => safe(() => {
  const tax = loaders.tax();
  const r = tax.calculateMonthlyTax(req.body || {});
  res.json({ ok: true, result: r });
}, res, 'tax.monthly'));

app.get('/api/tax/brackets', (req, res) => safe(() => {
  const { TAX_BRACKETS, SPECIAL_DEDUCTION_CONFIG, STANDARD_DEDUCTION_MONTHLY } = loaders.tax();
  res.json({ ok: true, TAX_BRACKETS, SPECIAL_DEDUCTION_CONFIG, STANDARD_DEDUCTION_MONTHLY });
}, res, 'tax.brackets'));

// ========== 3. 社保公积金 ==========
app.get('/api/si/areas', (req, res) => safe(() => {
  const { listAllAreaCodes, PRESET_AREA_CODES, PRESET_XIAN_AUG, PRESET_TIANSHUI, PRESET_BAIYIN, PRESET_PINGLIANG, PRESET_LANZHOU } = loaders.si();
  res.json({ ok: true, areas: listAllAreaCodes(), presets: { PRESET_XIAN_AUG, PRESET_TIANSHUI, PRESET_BAIYIN, PRESET_PINGLIANG, PRESET_LANZHOU } });
}, res, 'si.areas'));

app.post('/api/si/calc', (req, res) => safe(() => {
  const si = loaders.si();
  const { areaCode, salary, payrollMonth } = req.body;
  const model = si.findAreaVersion(areaCode, payrollMonth);
  if (!model) return res.status(404).json({ ok: false, error: '未找到该地区该月份的社保版本' });
  const r = model.calcSocialInsurance(salary, payrollMonth);
  res.json({ ok: true, result: r, areaInfo: model });
}, res, 'si.calc'));

// ========== 4. 规则引擎 ==========
app.get('/api/rules', (req, res) => safe(() => {
  const { RuleEngine, RULE_CATEGORIES } = loaders.rule();
  const re = new RuleEngine();
  res.json({ ok: true, rules: re.listAll(), categories: RULE_CATEGORIES });
}, res, 'rules.list'));

app.post('/api/rules/update', (req, res) => safe(() => {
  const { RuleEngine } = loaders.rule();
  const re = new RuleEngine();
  const r = re.updateRule(req.body.ruleId, req.body.updates);
  res.json({ ok: true, result: r });
}, res, 'rules.update'));

// ========== 5. 特殊人员规则覆盖 ==========
app.post('/api/override/add', (req, res) => safe(() => {
  const { SpecialRuleOverrideEngine } = loaders.override();
  const engine = new SpecialRuleOverrideEngine();
  const r = engine.addOverride(req.body || {});
  res.json({ ok: true, result: r });
}, res, 'override.add'));

app.get('/api/override/list', (req, res) => safe(() => {
  const { SpecialRuleOverrideEngine } = loaders.override();
  const engine = new SpecialRuleOverrideEngine();
  res.json({ ok: true, result: engine.listOverrides() });
}, res, 'override.list'));

// ========== 6. 假期引擎 ==========
app.post('/api/leave/annual-quota', (req, res) => safe(() => {
  const { LeaveEngine } = loaders.leave();
  const le = new LeaveEngine();
  const r = le.calcAnnualLeaveQuota({ employee: req.body.employee, asOfDate: req.body.asOfDate });
  res.json({ ok: true, result: r });
}, res, 'leave.annual-quota'));

app.get('/api/leave/types', (req, res) => safe(() => {
  const { LeaveEngine } = loaders.leave();
  const le = new LeaveEngine();
  res.json({ ok: true, types: le.listLeaveTypes() });
}, res, 'leave.types'));

app.post('/api/leave/apply', (req, res) => safe(() => {
  const { LeaveEngine } = loaders.leave();
  const le = new LeaveEngine();
  const r = le.submitLeaveRequest(req.body || {});
  res.json({ ok: true, result: r });
}, res, 'leave.apply'));

// ========== 7. 员工模型 ==========
app.post('/api/employee/profile', (req, res) => safe(() => {
  const { EmployeeModel } = loaders.emp();
  const emp = new EmployeeModel(req.body || {});
  res.json({
    ok: true,
    profile: emp.toJSON(),
    yearsOfService: emp.calcYearsOfService(),
    age: emp.calcAge(),
    businessUnit: emp.getBusinessUnit(),
    payrollBand: emp.getPayrollBand(),
    leaveEntitlement: emp.getLeaveEntitlement(),
  });
}, res, 'employee.profile'));

// ========== 8. 考勤 ==========
app.post('/api/attendance/monthly', (req, res) => safe(() => {
  const { MonthlyAttendanceSummary } = loaders.attendance();
  const s = new MonthlyAttendanceSummary(req.body.records || [], req.body.payrollMonth, req.body.config || {});
  const r = s.summarize();
  res.json({ ok: true, result: r });
}, res, 'attendance.monthly'));

// ========== 9. 品牌与板块配置 ==========
app.get('/api/brand', (req, res) => safe(() => {
  const brand = loaders.brand();
  res.json({ ok: true, brand });
}, res, 'brand'));

app.get('/api/dictionary', (req, res) => safe(() => {
  const dict = loaders.dict();
  res.json({ ok: true, enums: {
    BUSINESS_UNIT_CODE: dict.BUSINESS_UNIT_CODE,
    LEGAL_ENTITY_CODE: dict.LEGAL_ENTITY_CODE,
    EMPLOYMENT_STATUS: dict.EMPLOYMENT_STATUS,
    EMPLOYEE_TYPE: dict.EMPLOYEE_TYPE,
    WORK_LOCATION_CODE: dict.WORK_LOCATION_CODE,
    POSITION_LEVEL: dict.POSITION_LEVEL,
    PAYROLL_BAND: dict.PAYROLL_BAND,
    APPROVAL_ROUTING_MATRIX: dict.APPROVAL_ROUTING_MATRIX,
  }});
}, res, 'dictionary'));

// ========== 10. 高管驾驶舱 ==========
app.get('/api/cockpit/overview', (req, res) => safe(() => {
  const { HRExecutiveCockpit } = loaders.cockpit();
  const c = new HRExecutiveCockpit();
  const r = c.getGroupOverview(req.query.period || null);
  res.json({ ok: true, result: r });
}, res, 'cockpit.overview'));

app.get('/api/cockpit/bu-breakdown', (req, res) => safe(() => {
  const { HRExecutiveCockpit } = loaders.cockpit();
  const c = new HRExecutiveCockpit();
  const r = c.getBusinessUnitBreakdown(req.query.period || null);
  res.json({ ok: true, result: r });
}, res, 'cockpit.bu-breakdown'));

app.get('/api/cockpit/compliance', (req, res) => safe(() => {
  const { HRExecutiveCockpit } = loaders.cockpit();
  const c = new HRExecutiveCockpit();
  const r = c.getComplianceRiskSnapshot();
  res.json({ ok: true, result: r });
}, res, 'cockpit.compliance'));

// ========== 11. AI 人资 Agent ==========
app.post('/api/ai/ask', (req, res) => safe(() => {
  const { HRAIAgent } = loaders.ai();
  const agent = new HRAIAgent(req.body.config || {});
  const r = agent.answer(req.body.question, req.body.context || {});
  res.json({ ok: true, result: r });
}, res, 'ai.ask'));

// ========== 12. 规则对照表（用户核对用） ==========
app.get('/api/rules/standards', (req, res) => safe(() => {
  res.json({
    ok: true,
    result: {
      overtime: {
        weekday: { policy: 'NO_CALC', desc: '工作日加班不作数，视为效率问题', legalRisk: '中-劳动法44条(一)150%', color: 'warning' },
        weekend: { policy: 'COMPTIME_ONLY', ratio: '1:1', desc: '周末加班转调休不发加班费', legalRisk: '低-地方支持调休', color: 'success' },
        legalHoliday: { policy: 'COMPTIME_ONLY', desc: '法定节假日加班调休(机构)，总部放假不加班', legalRisk: '高-劳动法44条(三)必须300%，不可调休', color: 'danger' },
        executiveOverride: { desc: '可通过 override 引擎为特定人员开启 300% 工资' },
      },
      absent: {
        absentDeduction: '1 倍日薪（按事假处理，原 3 倍已废止合规化）',
        lateOrMissingCard: '10 元/次 + 取消全勤',
      },
      leave: {
        sickWithRecord: '扣 20%（发 80%）',
        sickNoRecord: '扣 100%（按事假）',
        annual: { '0~1年': 0, '1~10年': 5, '10~20年': 10, '≥20年': 15 },
        comptimeExpire: '180 天',
      },
      tax: {
        standard: 5000,
        brackets: ['3%', '10%', '20%', '25%', '30%', '35%', '45%'],
        specialDeduction: { children: 1000, mortgage: 1000, rent: [1500, 1100, 800], elderly: 2000, infant: 2000 },
      },
      socialInsurance: {
        areas: ['XA 西安', 'TS 天水', 'BY 白银', 'PL 平凉', 'LZ 兰州'],
        personalRates: '养老8% + 失业0.3% + 医疗2% + 大病(5/8元固定) + 公积金8%/10%/12%',
      },
      overridePriority: ['员工级', '岗位级', '部门级', '工作地级', '全局默认'],
    },
  });
}, res, 'rules.standards'));

// ========== 404 ==========
app.use('/api/*', (req, res) => {
  res.status(404).json({ ok: false, error: 'API not found', path: req.path });
});

module.exports = app;
