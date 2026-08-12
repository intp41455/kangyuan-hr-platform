'use strict';

/**
 * 康源集团品牌集成自检验收
 * 验收项：
 *  1) 品牌配置模块加载（主色正确性、三大板块元数据完整）
 *  2) 员工模型：ENTITY_MAP扩展、BUSINESS_UNIT_MAP、getBusinessUnit()方法
 *  3) 数据字典：新增 BUSINESS_UNIT_CODE / LEGAL_ENTITY_CODE / AREA_CODE扩展
 *  4) 驾驶舱：getBusinessUnitBreakdown() / getGroupOverview() / getDashboardKPI()板块联动
 */

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch(e) { failed++; console.log('  ✗', name, '\n    ERROR:', e.message); }
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  康源集团品牌集成自检验收 — 2026-08                  ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// =================== 1) 品牌配置模块 ===================
console.log('一、品牌配置 kangyuan_brand_config.js');
const {
  BRAND_COLORS, GROUP_INFO, BUSINESS_UNITS, LEGAL_ENTITIES,
  DEPARTMENT_ARCHITECTURE, GROUP_MILESTONES, generateCssTokenString
} = require('../src/common/kangyuan_brand_config.js');

test('主色 PRIMARY RGB 必须严格等于 (204, 85, 0)', () => {
  assert.strictEqual(BRAND_COLORS.PRIMARY.rgb.r, 204);
  assert.strictEqual(BRAND_COLORS.PRIMARY.rgb.g, 85);
  assert.strictEqual(BRAND_COLORS.PRIMARY.rgb.b, 0);
  assert.strictEqual(BRAND_COLORS.PRIMARY.hex, '#CC5500');
  assert.strictEqual(BRAND_COLORS.PRIMARY.css, 'rgb(204, 85, 0)');
});

test('色阶 PALETTE.ORANGE_500 必须等于主色', () => {
  assert.deepStrictEqual(BRAND_COLORS.PALETTE.ORANGE_500.rgb, [204, 85, 0]);
  assert.strictEqual(BRAND_COLORS.PALETTE.ORANGE_500.hex, '#CC5500');
});

test('集团身份信息正确性（工商+官网核对）', () => {
  assert.strictEqual(GROUP_INFO.legalName, '陕西康源投资（集团）有限公司');
  assert.strictEqual(GROUP_INFO.shortName, '康源集团');
  assert.strictEqual(GROUP_INFO.foundingYear, 2004);
  assert.strictEqual(GROUP_INFO.chairman, '杨柳');
  assert.strictEqual(GROUP_INFO.ceo, '王力宏');
  assert.strictEqual(GROUP_INFO.cfo, '赵兴龙');
  assert.ok(GROUP_INFO.headquarters.address.includes('莲湖区'));
  assert.strictEqual(GROUP_INFO.headquarters.website, 'http://www.koayoung.com');
});

test('三大业务板块元数据完整性（6项关键字段）', () => {
  ['MEIHONG', 'FUZHI_EDU', 'QIXIANG'].forEach(key => {
    const bu = BUSINESS_UNITS[key];
    assert.ok(bu && bu.code, `${key}: code 必填`);
    assert.ok(bu.shortName && bu.fullName, `${key}: 名称完整`);
    assert.ok(bu.tagline, `${key}: tagline 必填`);
    assert.ok(bu.accentColor && bu.accentColor.hex, `${key}: accentColor 需含 HEX`);
    assert.ok(bu.icon && /[^\w\s]/.test(bu.icon), `${key}: icon 需为 emoji`);
    assert.strictEqual(typeof bu.establishedYear, 'number');
  });
  // 美宏：机构床位数
  assert.ok(BUSINESS_UNITS.MEIHONG.scaleSummary.totalBeds >= 1051, '美宏总床位必须>=1051');
  assert.ok(BUSINESS_UNITS.MEIHONG.scaleSummary.totalFacilities >= 9);
  // 耆祥：社区日照与服务人次
  assert.strictEqual(BUSINESS_UNITS.QIXIANG.scaleSummary.communityDayCareCenters, 30);
  assert.strictEqual(BUSINESS_UNITS.QIXIANG.scaleSummary.annualServiceTrips, 50000);
  // 福祉教育：合作院校数（6+）
  assert.ok(BUSINESS_UNITS.FUZHI_EDU.partners.length >= 6);
});

test('6 家核算主体正确映射', () => {
  const codes = Object.keys(LEGAL_ENTITIES);
  assert.ok(codes.includes('GROUP_HQ'));
  assert.ok(codes.includes('MEIHONG'));
  assert.ok(codes.includes('FUZHI_EDU'));
  assert.ok(codes.includes('QIXIANG'));
  assert.ok(codes.includes('BOYAO_SH'));
  assert.ok(codes.includes('SHUYUAN_DAIJIAO'));
  assert.strictEqual(codes.length, 6);
});

test('发展里程碑 ≥17 条且覆盖关键节点', () => {
  assert.ok(GROUP_MILESTONES.length >= 17);
  const years = GROUP_MILESTONES.map(m => m.year);
  [2004, 2017, 2019, 2021, 2022, 2024].forEach(y => {
    assert.ok(years.includes(y), `里程碑缺失关键年份：${y}`);
  });
});

test('CSS token 生成必须包含主色 + 三板块色变量', () => {
  const css = generateCssTokenString();
  assert.ok(css.includes('--ky-primary: #CC5500;'));
  assert.ok(css.includes('--ky-primary-rgb: 204, 85, 0;'));
  assert.ok(css.includes('--ky-bu-meihong:'));
  assert.ok(css.includes('--ky-bu-fuzhi:'));
  assert.ok(css.includes('--ky-bu-qixiang:'));
  assert.ok(css.startsWith(':root {'));
  assert.ok(css.endsWith('}'));
});

test('部门架构 4 大线齐全', () => {
  const archKeys = Object.keys(DEPARTMENT_ARCHITECTURE);
  assert.ok(archKeys.includes('GROUP_HQ'));
  assert.ok(archKeys.includes(BUSINESS_UNITS.MEIHONG.code));
  assert.ok(archKeys.includes(BUSINESS_UNITS.FUZHI_EDU.code));
  assert.ok(archKeys.includes(BUSINESS_UNITS.QIXIANG.code));
  const totalDepts = Object.values(DEPARTMENT_ARCHITECTURE)
    .reduce((s, l) => s + l.departments.length, 0);
  assert.ok(totalDepts >= 19, `部门总数应≥19，实际${totalDepts}`);
});

// =================== 2) 员工模型 ===================
console.log('\n二、员工模型 employee_model.js 扩展');
const {
  EmployeeModel, ENTITY_MAP, BUSINESS_UNIT_MAP, resolveBusinessUnitByEntity
} = require('../src/modules/master_data/employee_model.js');

test('ENTITY_MAP 扩展：集团 + 三板块 + 配套共 6 家', () => {
  const keys = Object.keys(ENTITY_MAP);
  ['GROUP_HQ','MEIHONG','FUZHI_EDU','QIXIANG','BOYAO_SH','SHUYUAN'].forEach(k => {
    assert.ok(ENTITY_MAP[k], `ENTITY_MAP.${k} 缺失`);
  });
  // 主体全称必须为中文（工资发放用）
  Object.values(ENTITY_MAP).forEach(v => {
    assert.ok(/[\u4e00-\u9fa5]/.test(v), `主体名需含中文：${v}`);
  });
});

test('BUSINESS_UNIT_MAP：4 分区 + 各自关联的主体', () => {
  const codes = Object.keys(BUSINESS_UNIT_MAP);
  assert.strictEqual(codes.length, 4);
  // 美宏板块关联 2 家核算主体（MEIHONG + 成都代缴）
  assert.deepStrictEqual(BUSINESS_UNIT_MAP.BU_MEIHONG.legalEntities, ['MEIHONG', 'SHUYUAN']);
  assert.deepStrictEqual(BUSINESS_UNIT_MAP.BU_FUZHI_EDU.legalEntities, ['FUZHI_EDU']);
  assert.deepStrictEqual(BUSINESS_UNIT_MAP.BU_QIXIANG.legalEntities, ['QIXIANG']);
  assert.deepStrictEqual(BUSINESS_UNIT_MAP.GROUP_HQ.legalEntities, ['GROUP_HQ', 'BOYAO_SH']);
});

test('resolveBusinessUnitByEntity：主体→板块反推', () => {
  assert.strictEqual(resolveBusinessUnitByEntity('MEIHONG'),   'BU_MEIHONG');
  assert.strictEqual(resolveBusinessUnitByEntity('SHUYUAN'),  'BU_MEIHONG'); // 成都代缴归美宏
  assert.strictEqual(resolveBusinessUnitByEntity('FUZHI_EDU'),'BU_FUZHI_EDU');
  assert.strictEqual(resolveBusinessUnitByEntity('QIXIANG'),  'BU_QIXIANG');
  assert.strictEqual(resolveBusinessUnitByEntity('GROUP_HQ'), 'GROUP_HQ');
  assert.strictEqual(resolveBusinessUnitByEntity('BOYAO_SH'), 'GROUP_HQ');  // 配套子公司归总部
  assert.strictEqual(resolveBusinessUnitByEntity('UNKNOWN'),  'GROUP_HQ');  // 兜底
});

test('EmployeeModel.getBusinessUnit()：美宏介护士案例', () => {
  const nurse = new EmployeeModel({
    id: 'E000301', name: '张护理', entity: 'MEIHONG',
    position: '介护士', dept1: '机构运营中心',
    entryDate: new Date('2022-05-18')
  });
  const bu = nurse.getBusinessUnit();
  assert.strictEqual(bu.buCode, 'BU_MEIHONG');
  assert.strictEqual(bu.name, '康源美宏');
  assert.ok(bu.icon.includes('🏥'));
});

test('EmployeeModel.getBusinessUnit()：耆祥站长案例（entity为中文全称）', () => {
  const master = new EmployeeModel({
    id: 'E000430', name: '李站长', entity: ENTITY_MAP.QIXIANG, // 中文全称
    entryDate: new Date('2023-02-01')
  });
  const bu = master.getBusinessUnit();
  assert.strictEqual(bu.buCode, 'BU_QIXIANG');
  assert.strictEqual(bu.name, '康源耆祥');
});

test('EmployeeModel.getBusinessUnit()：福祉教育教师', () => {
  const teacher = new EmployeeModel({
    id: 'E000480', name: '王老师', entity: 'FUZHI_EDU',
    entryDate: new Date('2021-09-01')
  });
  assert.strictEqual(teacher.getBusinessUnit().buCode, 'BU_FUZHI_EDU');
});

// =================== 3) 数据字典 ===================
console.log('\n三、数据字典 data_dictionary.js 扩展');
const dd = require('../src/common/data_dictionary.js');

test('ENUM_TYPES：新增 2 套枚举后应为 7 套', () => {
  assert.deepStrictEqual(dd.ENUM_TYPES, [
    'BUSINESS_UNIT_CODE', 'LEGAL_ENTITY_CODE',
    'EMPLOYEE_STATUS', 'ATTENDANCE_EXCEPTION', 'LEAVE_TYPE',
    'APPROVAL_STATUS', 'AREA_CODE'
  ]);
});

test('BUSINESS_UNIT_CODE：4 类板块值及 META 完整性', () => {
  assert.strictEqual(Object.keys(dd.BUSINESS_UNIT_CODE).length, 4);
  ['GROUP_HQ','MEIHONG','FUZHI_EDU','QIXIANG'].forEach(k => {
    assert.ok(dd.BUSINESS_UNIT_META[dd.BUSINESS_UNIT_CODE[k]],
      `BUSINESS_UNIT ${k} 缺 meta`);
  });
});

test('LEGAL_ENTITY_CODE：6 家核算主体齐全', () => {
  assert.strictEqual(Object.keys(dd.LEGAL_ENTITY_CODE).length, 6);
  assert.strictEqual(dd.LEGAL_ENTITY_META.QIXIANG.name,
    '西安康源耆祥居家养老服务有限公司');
});

test('AREA_CODE：11 个区域（西安4区+3省项目市+甘肃4市）', () => {
  const codes = Object.keys(dd.AREA_CODE);
  assert.strictEqual(codes.length, 11);
  // 西安4区
  ['XA_LIANHU','XA_YANTA','XA_WEIYANG','XA_CHANGAN'].forEach(c => {
    assert.ok(dd.AREA_CODE_META[c], `区域编码 ${c} 缺 meta`);
  });
  // 跨省
  assert.ok(dd.AREA_CODE_META.CD.name.includes('成都'));
  assert.ok(dd.AREA_CODE_META.QJ.name.includes('曲靖'));
  assert.ok(dd.AREA_CODE_META.DZ.name.includes('德州'));
});

test('generateDictionaryMarkdown：输出应包含 7 个枚举章节', () => {
  const md = dd.generateDictionaryMarkdown();
  const buCount = (md.match(/### 2\.\d /g) || []).length;
  assert.strictEqual(buCount, 7, `Markdown 枚举章节应=7，实际${buCount}`);
  assert.ok(md.includes('集团业务板块（3+1）'));
  assert.ok(md.includes('核算/发薪主体（6家）'));
  assert.ok(md.includes('工作地区编码'));
});

// =================== 4) 高管驾驶舱 ===================
console.log('\n四、高管驾驶舱 hr_executive_cockpit.js 板块联动');
const { HRDashboard } = require('../src/modules/dashboard/hr_executive_cockpit.js');
const dash = new HRDashboard();

test('getBusinessUnitBreakdown：4 板块数据结构 + 汇总校验', () => {
  const res = dash.getBusinessUnitBreakdown('2026-08');
  assert.strictEqual(res.headcountBreakdown.length, 4);
  // 各板块员工数之和应等于总部汇总
  const sumEmp = res.headcountBreakdown.reduce((s, b) => s + b.totalEmployees, 0);
  const sumPay = res.headcountBreakdown.reduce((s, b) => s + b.avgMonthlyPayroll, 0);
  assert.strictEqual(sumEmp, res.totals.totalEmployees, '员工总数汇总不一致');
  assert.strictEqual(sumPay, res.totals.avgMonthlyPayroll, '薪酬总额汇总不一致');
  // 各板块色值字段存在
  res.headcountBreakdown.forEach(b => {
    assert.ok(b.accentColor && b.accentColor.startsWith('#'), `板块 ${b.name} 缺accentColor`);
    assert.ok(b.icon, `板块 ${b.name} 缺icon`);
  });
  // 品牌色输出
  assert.strictEqual(res.brandColors.primary, '#CC5500');
  assert.strictEqual(res.brandColors.primaryRgb, 'rgb(204,85,0)');
  assert.ok(res.brandColors.cssTokens.includes('--ky-primary:'));
});

test('getBusinessUnitBreakdown：特色指标存在（板块专属维度）', () => {
  const res = dash.getBusinessUnitBreakdown('2026-08');
  const meihong = res.headcountBreakdown.find(b => b.buCode === 'BU_MEIHONG');
  assert.strictEqual(meihong.totalBeds, 1300);
  assert.strictEqual(meihong.facilitiesTotal, 9);
  assert.ok(typeof meihong.bedOccupancy === 'number');

  const qixiang = res.headcountBreakdown.find(b => b.buCode === 'BU_QIXIANG');
  assert.strictEqual(qixiang.communityStations, 30);
  assert.strictEqual(qixiang.annualServiceTrips, 50000);
  assert.ok(qixiang.monthlyServiceTrips > 0);

  const fuzhi = res.headcountBreakdown.find(b => b.buCode === 'BU_FUZHI_EDU');
  assert.ok(fuzhi.partnerSchools >= 6);
  assert.ok(fuzhi.enrolledStudents >= 800);
  assert.ok(fuzhi.graduatedCums >= 1500);
});

test('getGroupOverview：全产业链（上游/中游/下游）+里程碑齐全', () => {
  const res = dash.getGroupOverview('2026-08');
  assert.ok(res.valueChain && res.valueChain.upstream);
  assert.ok(res.valueChain.midstream.title.includes('机构承载端'));
  assert.ok(res.valueChain.downstream.indicators.length === 4);
  assert.strictEqual(res.milestones.length, GROUP_MILESTONES.length);
  assert.strictEqual(res.groupInfo.chairman, '杨柳');
  assert.ok(res.groupInfo.honors.length >= 5);
});

test('getDashboardKPI：businessUnitSummary 存在并映射4板块', () => {
  const res = dash.getDashboardKPI('2026-08');
  assert.ok(res.businessUnitSummary && res.businessUnitSummary.length === 4);
  const sumShare = res.businessUnitSummary.reduce((s, u) => s + u.payrollShare, 0);
  // 百分比总和应接近100%
  assert.ok(sumShare > 99 && sumShare < 101, `薪酬占比合计=${sumShare}%，应为~100%`);
});

// =================== 汇总 ===================
console.log('\n═════════════════════════════════════════════════════');
const total = passed + failed;
const rate = Math.round(passed / total * 10000) / 100;
console.log(`  合计：${total} 项 · 通过 ${passed} · 失败 ${failed} · 通过率 ${rate}%`);
console.log('═════════════════════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
