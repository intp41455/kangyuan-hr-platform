'use strict';

/**
 * 陕西康源投资（集团）有限公司 — 品牌配置中心
 * 集成集团CI识别、三大业务板块元数据、组织架构、主色调系统
 * 数据来源：集团官网 www.koayoung.com 、工商注册信息、2025-2026官媒报道
 */

// ====== 一、品牌主色调系统 (Brand Color System) ======
// 集团指定主色：RGB(204, 85, 0) — 赭石暖橙，寓意温暖、夕阳、关怀
const BRAND_COLORS = Object.freeze({
  PRIMARY: Object.freeze({
    name: '康源橙',
    rgb: { r: 204, g: 85, b: 0 },
    hex: '#CC5500',
    hsl: { h: 25, s: 100, l: 40 },
    css: 'rgb(204, 85, 0)'
  }),
  // 衍生色阶（从浅到深）
  PALETTE: Object.freeze({
    ORANGE_50:  { hex: '#FFF3E6', rgb: [255, 243, 230], name: '康源橙 50（淡）' },
    ORANGE_100: { hex: '#FFE0C2', rgb: [255, 224, 194], name: '康源橙 100' },
    ORANGE_200: { hex: '#FFC599', rgb: [255, 197, 153], name: '康源橙 200' },
    ORANGE_300: { hex: '#FFA066', rgb: [255, 160, 102], name: '康源橙 300' },
    ORANGE_400: { hex: '#F27A1A', rgb: [242, 122, 26], name: '康源橙 400' },
    ORANGE_500: { hex: '#CC5500', rgb: [204, 85, 0],   name: '康源橙 500（主色）' },
    ORANGE_600: { hex: '#A84400', rgb: [168, 68, 0],   name: '康源橙 600（深）' },
    ORANGE_700: { hex: '#7F3300', rgb: [127, 51, 0],   name: '康源橙 700' },
    ORANGE_800: { hex: '#552200', rgb: [85, 34, 0],    name: '康源橙 800' }
  }),
  // 辅助色：温暖大地色系，契合养老行业温暖、安心调性
  ACCENT: Object.freeze({
    CREAM:      { hex: '#FAF3EA', rgb: [250, 243, 234], name: '米白（背景）' },
    WARM_GRAY:  { hex: '#8A7E72', rgb: [138, 126, 114], name: '暖灰（辅助文字）' },
    SAGE_GREEN: { hex: '#7BA05B', rgb: [123, 160, 91],  name: '鼠尾草绿（健康态）' },
    CLAY_BROWN: { hex: '#A67B5B', rgb: [166, 123, 91],  name: '粘土棕（机构板块）' },
    SKY_BLUE:   { hex: '#5B8BA6', rgb: [91, 139, 166],  name: '天青蓝（教育板块）' },
    TERRACOTTA: { hex: '#C1664A', rgb: [193, 102, 74],  name: '赤陶红（社区板块）' }
  }),
  // 语义状态色（基于主色调和体系定制）
  SEMANTIC: Object.freeze({
    SUCCESS: { hex: '#5D8C4F', rgb: [93, 140, 79],   name: '成功绿（非医疗绿）' },
    WARNING: { hex: '#D99A2E', rgb: [217, 154, 46],  name: '提醒琥珀黄' },
    DANGER:  { hex: '#B84233', rgb: [184, 66, 51],   name: '警示红（非猩红）' },
    INFO:    { hex: '#3F7FA3', rgb: [63, 127, 163],  name: '信息青蓝' }
  })
});

// ====== 二、集团身份元数据 ======
const GROUP_INFO = Object.freeze({
  legalName: '陕西康源投资（集团）有限公司',
  shortName: '康源集团',
  brandSlogan: '医康养健文娱 · 全产业链守护幸福晚年',
  brandMission: '让老人老有所养、老有所乐、老有所学、老有所依、老有所为',
  foundingYear: 2004,
  chairman: '杨柳',
  ceo: '王力宏',
  cfo: '赵兴龙',
  headquarters: {
    address: '陕西省西安市莲湖区西二环南段10号艺腾国际8F',
    phone: '029-89526911',
    website: 'http://www.koayoung.com'
  },
  industryTags: ['国家级服务业标准化试点', '国家智慧化示范', '陕西省医养结合典型案例', '西安市养老服务产教融合基地'],
  honors: [
    '中国老龄产业协会常务理事单位（2020-08）',
    '西安市老年医养结合学会会长单位（2020-07）',
    '陕西省老龄产业协会常务副会长单位（2021-03）',
    '国家级服务业标准化试点（2021-05入选）',
    '西安市医保定点护理院运营资质（2024）'
  ]
});

// ====== 三、三大业务板块元数据 ======
const BUSINESS_UNITS = Object.freeze({
  // ====== 板块一：康源美宏 — 机构养老运营 ======
  MEIHONG: Object.freeze({
    code: 'BU_MEIHONG',
    shortName: '康源美宏',
    fullName: '陕西康源美宏养老服务有限公司',
    legalEntity: '陕西康源美宏养老服务有限公司',
    tagline: '机构4.0 · 社区嵌入式 · 医养结合连锁',
    businessScope: '养老机构运营、长照护理、失智照护、安宁疗护、日间照料',
    registeredCapital: 4620, // 万元
    establishedYear: 2017,
    legalRep: '杨柳',
    headquarters: GROUP_INFO.headquarters,
    accentColor: BRAND_COLORS.ACCENT.CLAY_BROWN,
    icon: '🏥',
    // 运营实体
    facilities: [
      { name: '康源中成·城市颐养中心', city: '西安', type: '机构4.0综合体', beds: 200, opened: '2024', status: '运营中' },
      { name: '康源养老·壹心长者屋', city: '西安', type: '失智专区特色', beds: 80, opened: '2022-04', status: '运营中' },
      { name: '康源养老·南城长者屋', city: '西安', type: '长照机构', beds: 120, opened: '2021-10', status: '运营中' },
      { name: '康源养老·康隆西城长者屋', city: '西安', type: '社区嵌入式', beds: 90, opened: '2019-05', status: '运营中' },
      { name: '荣华康源·北城长者屋', city: '西安', type: '医养结合', beds: 150, opened: '2020-04', status: '运营中' },
      { name: '康源养老·电子城长者屋', city: '西安', type: '养护院', beds: 100, opened: '2020', status: '运营中' },
      { name: '康源美宏·书院街长者屋（成都）', city: '成都', type: '日式介护中心', beds: 80, opened: '2019-01', status: '运营中' },
      { name: '派瑞康养老护理院', city: '西安', type: '护理院', beds: 180, opened: '2019-10', status: '运营中' },
      { name: '云南逸晖·颐养中心', city: '曲靖', type: '异地康养综合体', beds: 300, opened: '2024筹建', status: '筹建中' }
    ],
    scaleSummary: {
      operationCities: ['西安', '成都', '德州', '曲靖'],
      totalFacilities: 9,
      totalBeds: 1300,
      cumulativeSeniors: '数万人次',
      specialties: ['日式介护', '失智照护（时光疗愈站）', '非药物干预', '医保定点护理院']
    },
    jobCategories: ['介护长', '介护士', '护理主任', '康复治疗师', '社工师', '营养配餐师', '机构院长', '养护主管']
  }),

  // ====== 板块二：福祉教育 — 护理人才培育 ======
  FUZHI_EDU: Object.freeze({
    code: 'BU_FUZHI_EDU',
    shortName: '康源福祉教育',
    fullName: '陕西康源福祉教育科技有限公司',
    legalEntity: '陕西康源福祉教育科技有限公司',
    tagline: '产教融合 · 养老人才培养龙头板块',
    businessScope: '养老人才学历教育、社会培训、管理人才交流、产学研合作',
    registeredCapital: 100, // 万元
    establishedYear: 2019,
    legalRep: '杨柳',
    headquarters: GROUP_INFO.headquarters,
    accentColor: BRAND_COLORS.ACCENT.SKY_BLUE,
    icon: '🎓',
    partners: [
      '陕西中医药大学', '四川中医药高等专科学校', '四川卫生康复职业学院',
      '铜川职业技术学院', '汉中市第一职业中等专科学校', '南郑区职教中心'
    ],
    teachingFeatures: ['年轻化', '专业化', '国际化', '实战化'],
    teachingMode: '在校实训 · 假期见习 · 国外研修 · 基地实习',
    faculty: {
      nationalAcademicLeader: 1, // 国家级学科带头人（副教授）
      provincialExperts: '若干',
      japanCertifiedCoaches: '多支实操教练队伍',
      foreignExperts: '多位外籍养老教育专家'
    },
    programs: [
      { name: '老年服务与管理专业', level: '大中专', mode: '康源介护订单班' },
      { name: '护理（老年护理方向）', level: '大中专', mode: '联合办学' },
      { name: '老年健康管理', level: '新增方向', mode: '专业共建' },
      { name: '康源福祉学院（二级学院）', level: '本科合作', mode: '筹建推进中' }
    ],
    socialRoles: ['课题研究', '标准制定', '论坛举办', '项目咨询', '竞赛评审', '1+X职业教育试点'],
    jobCategories: ['专业教师', '实操教练', '辅导员', '培训讲师', '校企合作专员', '教务管理', '教研主管']
  }),

  // ====== 板块三：耆祥 — 社区居家上门 ======
  QIXIANG: Object.freeze({
    code: 'BU_QIXIANG',
    shortName: '康源耆祥',
    fullName: '西安康源耆祥居家养老服务有限公司',
    legalEntity: '西安康源耆祥居家养老服务有限公司',
    tagline: '15分钟银龄乐活圈 · 社区居家服务专家',
    businessScope: '社区日间照料、居家上门服务、老年助餐、慢病管理、智慧养老、旅居享老',
    registeredCapital: 500, // 万元
    establishedYear: 2022,
    legalRep: '赵兴龙',
    headquarters: GROUP_INFO.headquarters,
    accentColor: BRAND_COLORS.ACCENT.TERRACOTTA,
    icon: '🏡',
    scaleSummary: {
      communityDayCareCenters: 30, // 西安30余个社区日间照料中心
      staffCount: 70, // 专兼职工作人员超70人
      annualServiceTrips: 50000, // 年服务人次5万+
      coverageArea: '西安市全域社区布局'
    },
    serviceLines: [
      { name: '老年兴趣大学', items: ['智能手机教学', '秦腔戏曲', '舞蹈形体', '手工画作'] },
      { name: '健康管家', items: ['中医理疗', '慢病管理', '三甲义诊进社区'] },
      { name: '互助活动', items: ['低龄帮高龄结对', '公益剪发', '公益磨刀'] },
      { name: '代际客厅', items: ['亲子烘焙坊', '祖孙读书角'] },
      { name: '老年餐厅', items: ['普惠助餐', '糖尿病低糖餐单定制'] },
      { name: '上门服务（10大类）', items: ['助浴', '助洁', '助医', '康复护理', '排泄护理', '褥疮预防', '生命监测', '代购代办'] },
      { name: '旅游旅居', items: ['候鸟文化周', '银龄文艺队', '生态徒步', '非遗手作主题线路'] }
    ],
    representativeStations: [
      '长丰园日间照料中心', '牡丹庄园日间照料中心',
      '惠北社区日照中心', '远东东社区日照中心', '五一社区日照中心',
      '西仪社区老年餐厅'
    ],
    jobCategories: ['社区站长', '养老顾问', '上门护理员', '助餐厨师', '活动策划', '健康管理师', '旅居领队']
  })
});

// ====== 四、核算主体映射（与现有ENTITY_MAP兼容扩展） ======
const LEGAL_ENTITIES = Object.freeze({
  GROUP_HQ: {
    code: 'GROUP_HQ',
    name: '陕西康源投资（集团）有限公司',
    type: '母公司/集团总部',
    defaultTaxArea: 'XA'
  },
  MEIHONG: {
    code: 'MEIHONG',
    name: '陕西康源美宏养老服务有限公司',
    businessUnit: BUSINESS_UNITS.MEIHONG.code,
    type: '子公司（机构运营）',
    defaultTaxArea: 'XA'
  },
  FUZHI_EDU: {
    code: 'FUZHI_EDU',
    name: '陕西康源福祉教育科技有限公司',
    businessUnit: BUSINESS_UNITS.FUZHI_EDU.code,
    type: '子公司（人才教育）',
    defaultTaxArea: 'XA'
  },
  QIXIANG: {
    code: 'QIXIANG',
    name: '西安康源耆祥居家养老服务有限公司',
    businessUnit: BUSINESS_UNITS.QIXIANG.code,
    type: '子公司（社区居家）',
    defaultTaxArea: 'XA'
  },
  BOYAO_SH: {
    code: 'BOYAO_SH',
    name: '上海康源博曜科技有限公司',
    businessUnit: 'GROUP_HQ',
    type: '贸易/科技配套',
    defaultTaxArea: 'XA'
  },
  SHUYUAN_DAIJIAO: {
    code: 'SHUYUAN',
    name: '书院街代缴（成都项目）',
    businessUnit: BUSINESS_UNITS.MEIHONG.code,
    type: '异地项目代缴',
    defaultTaxArea: 'XA'
  }
});

// ====== 五、部门架构（按三大板块+总部职能划分） ======
const DEPARTMENT_ARCHITECTURE = Object.freeze({
  // 集团总部职能
  GROUP_HQ: {
    label: '集团总部',
    color: BRAND_COLORS.PRIMARY.hex,
    departments: [
      { code: 'D01', name: '董事会办公室', parent: null, roles: ['董事长秘书', '战略研究'] },
      { code: 'D02', name: '人力资源部', parent: null, roles: ['HR总监', '招聘主管', '薪酬主管', '培训主管'] },
      { code: 'D03', name: '财务管理部', parent: null, roles: ['CFO', '会计主管', '出纳', '税务'] },
      { code: 'D04', name: '品牌市场部', parent: null, roles: ['品牌总监', '新媒体运营', '活动策划'] },
      { code: 'D05', name: '法务合规审计部', parent: null, roles: ['法务', '审计', '合规'] },
      { code: 'D06', name: '信息技术部', parent: null, roles: ['IT经理', '系统管理员', '数据分析师'] }
    ]
  },
  // 美宏机构运营线
  [BUSINESS_UNITS.MEIHONG.code]: {
    label: '康源美宏 · 机构养老运营',
    color: BUSINESS_UNITS.MEIHONG.accentColor.hex,
    departments: [
      { code: 'D11', name: '机构运营中心', parent: null, roles: ['运营总监', '区域经理', '机构院长'] },
      { code: 'D12', name: '护理部', parent: null, roles: ['护理主任', '介护长', '康复师', '社工师'] },
      { code: 'D13', name: '医养结合部', parent: null, roles: ['医务主管', '医保专员', '护理院管理'] },
      { code: 'D14', name: '餐饮与后勤', parent: null, roles: ['营养配餐师', '后勤主管', '工程维修'] },
      { code: 'D15', name: '长者营销与入住', parent: null, roles: ['营销经理', '养老顾问', '客户关系'] }
    ]
  },
  // 福祉教育线
  [BUSINESS_UNITS.FUZHI_EDU.code]: {
    label: '康源福祉教育 · 人才培育',
    color: BUSINESS_UNITS.FUZHI_EDU.accentColor.hex,
    departments: [
      { code: 'D21', name: '学历教育中心', parent: null, roles: ['教学主任', '专业教师', '辅导员'] },
      { code: 'D22', name: '社会培训部', parent: null, roles: ['培训主管', '实操教练', '招生'] },
      { code: 'D23', name: '校企合作部', parent: null, roles: ['合作专员', '实习就业主管'] },
      { code: 'D24', name: '智库研究中心', parent: null, roles: ['研究员', '标准制定', '学术会议'] }
    ]
  },
  // 耆祥社区居家线
  [BUSINESS_UNITS.QIXIANG.code]: {
    label: '康源耆祥 · 社区居家上门',
    color: BUSINESS_UNITS.QIXIANG.accentColor.hex,
    departments: [
      { code: 'D31', name: '社区日照运营中心', parent: null, roles: ['社区运营经理', '站长', '活动策划'] },
      { code: 'D32', name: '上门服务部', parent: null, roles: ['上门主管', '护理员', '助浴师', '健康管家'] },
      { code: 'D33', name: '助餐事业部', parent: null, roles: ['餐饮主管', '厨师', '营养师', '配送员'] },
      { code: 'D34', name: '智慧养老与旅居部', parent: null, roles: ['智慧平台运营', '旅居产品', '客户运营'] }
    ]
  }
});

// ====== 六、集团发展里程碑（可视化数据） ======
const GROUP_MILESTONES = Object.freeze([
  { year: 2004, title: '集团创立', desc: '董事会通过进军养老产业战略决议' },
  { year: 2008, title: '多元化布局', desc: '成立天盛进出口、科威天时环保，形成跨产业投资框架' },
  { year: 2012, title: '养老启航', desc: '正式立项养老板块，赴日欧澳考察全球养老模式' },
  { year: 2014, title: '日本研修通道', desc: '成为日中介护事业交流协会理事单位' },
  { year: 2015, title: '介护研修制度化', desc: '选送优秀介护师赴日研修机制建立' },
  { year: 2017, title: '日医战略合作', desc: '与日本日医集团（日本销量第一养老公司）签署战略合作协议' },
  { year: 2017, title: '美宏成立', desc: '陕西康源美宏养老服务有限公司注册成立，注册资本4620万' },
  { year: 2017, title: '校企融合开局', desc: '与四川中医药高等专科学校签署长期战略合作协议' },
  { year: 2018, title: '西北首家日式介护', desc: '康源和意日间照料中心开业（西北首家日式介护服务中心）' },
  { year: 2019, title: '福祉教育成立', desc: '陕西康源福祉教育科技有限公司注册成立' },
  { year: 2019, title: '成都书院街开业', desc: '跨省扩张，康源美宏书院街长者屋（成都）开业' },
  { year: 2019, title: '医养结合签约', desc: '旗下机构与土门社区卫生服务中心签订医养结合协议' },
  { year: 2020, title: '常春藤河北布局', desc: '康源常春藤健康管理（河北）有限公司成立' },
  { year: 2020, title: '荣华康源北城开业', desc: '携手荣华乐养打造的北城长者屋试运营' },
  { year: 2020, title: '介护订单班开班', desc: '福祉教育与南郑区职教中心合办老年服务与管理介护班正式开课' },
  { year: 2020, title: '行业协会任职', desc: '当选中国老龄产业协会常务理事单位、西安市老年医养结合学会会长单位' },
  { year: 2021, title: '耆祥布局启动', desc: '惠北、远东东、五一社区3家日照中心相继开业' },
  { year: 2021, title: '国家级标准化试点', desc: '成功入选国家级服务业标准化试点项目' },
  { year: 2021, title: '省级协会任职', desc: '当选陕西省老龄产业协会常务副会长单位' },
  { year: 2022, title: '耆祥公司化运作', desc: '西安康源耆祥居家养老服务有限公司注册成立，注册资本500万' },
  { year: 2022, title: '庆阳职院签约', desc: '康源集团与庆阳职业技术学院签署合作协议' },
  { year: 2023, title: '床位破千 · 标准验收', desc: '机构总床位1051张；通过国家标准化试点、国家智慧化示范验收' },
  { year: 2024, title: '机构4.0发布', desc: '康源中成·颐养中心开业；首批医保定点护理院运营；云南逸晖项目启动' }
]);

// ====== 七、导出 CSS token 生成方法 ======
function generateCssTokenString() {
  const lines = [':root {'];
  // 主色变量
  lines.push(`  --ky-primary: ${BRAND_COLORS.PRIMARY.hex};`);
  lines.push(`  --ky-primary-rgb: ${BRAND_COLORS.PRIMARY.rgb.r}, ${BRAND_COLORS.PRIMARY.rgb.g}, ${BRAND_COLORS.PRIMARY.rgb.b};`);
  // 色阶
  Object.entries(BRAND_COLORS.PALETTE).forEach(([key, val]) => {
    lines.push(`  --ky-${key.toLowerCase()}: ${val.hex};`);
  });
  // 辅助色
  Object.entries(BRAND_COLORS.ACCENT).forEach(([key, val]) => {
    lines.push(`  --ky-accent-${key.toLowerCase().replace(/_/g, '-')}: ${val.hex};`);
  });
  // 语义色
  Object.entries(BRAND_COLORS.SEMANTIC).forEach(([key, val]) => {
    lines.push(`  --ky-${key.toLowerCase()}: ${val.hex};`);
  });
  // 业务板块色
  lines.push(`  --ky-bu-meihong: ${BUSINESS_UNITS.MEIHONG.accentColor.hex};`);
  lines.push(`  --ky-bu-fuzhi: ${BUSINESS_UNITS.FUZHI_EDU.accentColor.hex};`);
  lines.push(`  --ky-bu-qixiang: ${BUSINESS_UNITS.QIXIANG.accentColor.hex};`);
  lines.push('}');
  return lines.join('\n');
}

module.exports = {
  BRAND_COLORS,
  GROUP_INFO,
  BUSINESS_UNITS,
  LEGAL_ENTITIES,
  DEPARTMENT_ARCHITECTURE,
  GROUP_MILESTONES,
  generateCssTokenString
};
