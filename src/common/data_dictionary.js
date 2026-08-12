'use strict';

const { BUSINESS_UNITS, LEGAL_ENTITIES } = require('./kangyuan_brand_config.js');

// ===== 康源集团三大业务板块枚举（集团级分类统计标准） =====
const BUSINESS_UNIT_CODE = Object.freeze({
  GROUP_HQ: 'GROUP_HQ',
  MEIHONG: BUSINESS_UNITS.MEIHONG.code,
  FUZHI_EDU: BUSINESS_UNITS.FUZHI_EDU.code,
  QIXIANG: BUSINESS_UNITS.QIXIANG.code
});

const BUSINESS_UNIT_META = Object.freeze({
  GROUP_HQ:   { name: '集团总部', desc: '集团战略、投资、财务、人力、信息化等共享职能中心' },
  BU_MEIHONG: { name: '康源美宏（机构运营）', desc: '9家养老机构连锁运营，床位1300+，覆盖西安/成都/曲靖/德州' },
  BU_FUZHI_EDU:{ name: '康源福祉教育（人才培育）', desc: '产教融合养老人才培养，与6+大中专院校联合办学' },
  BU_QIXIANG: { name: '康源耆祥（社区居家）', desc: '西安30+社区日间照料中心与居家上门服务，年服务5万人次' }
});

// ===== 康源集团核算主体枚举（与工资表发放主体一一对应） =====
const LEGAL_ENTITY_CODE = Object.freeze({
  GROUP_HQ: LEGAL_ENTITIES.GROUP_HQ.code,
  MEIHONG: LEGAL_ENTITIES.MEIHONG.code,
  FUZHI_EDU: LEGAL_ENTITIES.FUZHI_EDU.code,
  QIXIANG: LEGAL_ENTITIES.QIXIANG.code,
  BOYAO_SH: LEGAL_ENTITIES.BOYAO_SH.code,
  SHUYUAN: LEGAL_ENTITIES.SHUYUAN_DAIJIAO.code
});

const LEGAL_ENTITY_META = Object.freeze({
  GROUP_HQ:   { name: LEGAL_ENTITIES.GROUP_HQ.name,   desc: '集团母公司，总部人员发放主体' },
  MEIHONG:    { name: LEGAL_ENTITIES.MEIHONG.name,    desc: '机构运营板块发薪主体（含西安8家机构）' },
  FUZHI_EDU:  { name: LEGAL_ENTITIES.FUZHI_EDU.name,  desc: '教育板块发薪主体（专任教师、辅导员、社培人员）' },
  QIXIANG:    { name: LEGAL_ENTITIES.QIXIANG.name,    desc: '社区居家板块发薪主体（站长、上门护理员、助餐等）' },
  BOYAO_SH:   { name: LEGAL_ENTITIES.BOYAO_SH.name,   desc: '贸易科技配套子公司' },
  SHUYUAN:    { name: LEGAL_ENTITIES.SHUYUAN_DAIJIAO.name, desc: '成都书院街长者屋异地项目代缴主体' }
});

const EMPLOYEE_STATUS = Object.freeze({
  PENDING_ONBOARD: 'PENDING_ONBOARD',
  PROBATION: 'PROBATION',
  REGULAR: 'REGULAR',
  TRANSFERRING: 'TRANSFERRING',
  PROMOTING: 'PROMOTING',
  PENDING_LEAVE: 'PENDING_LEAVE',
  LEFT: 'LEFT',
  RETIRED: 'RETIRED'
});

const EMPLOYEE_STATUS_META = Object.freeze({
  PENDING_ONBOARD: { name: '入职待报到', desc: '已发放offer并确认入职，尚未正式到岗报到的新员工' },
  PROBATION: { name: '试用期', desc: '已入职报到，处于试用期考察阶段的员工' },
  REGULAR: { name: '正式', desc: '通过试用期转正，签订正式劳动合同的员工' },
  TRANSFERRING: { name: '调动中', desc: '正在办理跨部门/跨地区岗位调动手续的员工' },
  PROMOTING: { name: '晋升中', desc: '正在办理职级或岗位晋升审批流程的员工' },
  PENDING_LEAVE: { name: '待离职', desc: '已提交离职申请，处于离职交接期的员工' },
  LEFT: { name: '离职', desc: '已完成离职手续，正式离开公司的员工' },
  RETIRED: { name: '退休', desc: '达到法定退休年龄，办理退休手续的员工' }
});

const ATTENDANCE_EXCEPTION = Object.freeze({
  LATE_10: 'LATE_10',
  LATE_30: 'LATE_30',
  EARLY_LEAVE: 'EARLY_LEAVE',
  MISS_CARD: 'MISS_CARD',
  ABSENT_WORK: 'ABSENT_WORK',
  OVERTIME_WEEKDAY: 'OVERTIME_WEEKDAY',
  OVERTIME_WEEKEND: 'OVERTIME_WEEKEND',
  OVERTIME_HOLIDAY: 'OVERTIME_HOLIDAY',
  LEAVE_PERSONAL: 'LEAVE_PERSONAL',
  LEAVE_SICK: 'LEAVE_SICK',
  LEAVE_ANNUAL: 'LEAVE_ANNUAL',
  LEAVE_MARRIAGE: 'LEAVE_MARRIAGE',
  LEAVE_MATERNITY: 'LEAVE_MATERNITY',
  LEAVE_PATERNITY: 'LEAVE_PATERNITY',
  LEAVE_FUNERAL: 'LEAVE_FUNERAL',
  OFFSET_OVERTIME: 'OFFSET_OVERTIME',
  FIELDWORK_UNAPPROVED: 'FIELDWORK_UNAPPROVED',
  TRIP_UNAPPROVED: 'TRIP_UNAPPROVED'
});

const ATTENDANCE_EXCEPTION_META = Object.freeze({
  LATE_10: { name: '迟到≤10分钟', desc: '上班时间后10分钟以内到岗的迟到行为' },
  LATE_30: { name: '迟到>10分钟', desc: '上班时间后超过10分钟到岗的迟到行为' },
  EARLY_LEAVE: { name: '早退', desc: '未到下班时间提前离岗的行为' },
  MISS_CARD: { name: '缺卡', desc: '工作日上下班缺少打卡记录且未补卡' },
  ABSENT_WORK: { name: '旷工', desc: '未请假或请假未获批准擅自不到岗' },
  OVERTIME_WEEKDAY: { name: '工作日加班', desc: '正常工作日下班后的延长工作时间' },
  OVERTIME_WEEKEND: { name: '周末加班', desc: '周六周日的加班工作时间' },
  OVERTIME_HOLIDAY: { name: '法定假日加班', desc: '国家法定节假日的加班工作时间' },
  LEAVE_PERSONAL: { name: '事假', desc: '因个人事务申请的无薪假期' },
  LEAVE_SICK: { name: '病假', desc: '因患病或非因工负伤申请的医疗期假期' },
  LEAVE_ANNUAL: { name: '年假', desc: '根据工作年限享受的带薪年休假' },
  LEAVE_MARRIAGE: { name: '婚假', desc: '员工本人结婚依法享受的带薪假期' },
  LEAVE_MATERNITY: { name: '产假', desc: '女员工生育依法享受的产假假期' },
  LEAVE_PATERNITY: { name: '陪产假', desc: '男员工配偶生育享受的陪护假期' },
  LEAVE_FUNERAL: { name: '丧假', desc: '直系亲属去世依法享受的丧葬假期' },
  OFFSET_OVERTIME: { name: '调休', desc: '用加班时长折算抵扣正常工作日的休息' },
  FIELDWORK_UNAPPROVED: { name: '外勤未审批', desc: '外勤打卡但未提前提交外勤审批' },
  TRIP_UNAPPROVED: { name: '出差未审批', desc: '出差期间但未提前提交出差审批' }
});

const LEAVE_TYPE = Object.freeze({
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  PERSONAL: 'PERSONAL',
  MARRIAGE: 'MARRIAGE',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
  FUNERAL: 'FUNERAL',
  OFFSET: 'OFFSET'
});

const LEAVE_TYPE_META = Object.freeze({
  ANNUAL: { name: '年假', desc: '职工带薪年休假，按工龄5-15天/年' },
  SICK: { name: '病假', desc: '医疗期病假，需提供医院诊断证明' },
  PERSONAL: { name: '事假', desc: '个人事假，无薪，需提前申请' },
  MARRIAGE: { name: '婚假', desc: '本人结婚，3天带薪婚假' },
  MATERNITY: { name: '产假', desc: '女职工生育产假，国家法定98天+地方奖励' },
  PATERNITY: { name: '陪产假', desc: '男职工配偶生育陪产假，15天' },
  FUNERAL: { name: '丧假', desc: '直系亲属(父母/配偶/子女)去世，3天' },
  OFFSET: { name: '调休', desc: '加班时长兑换的休息，需在有效期内使用' }
});

const APPROVAL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVING: 'APPROVING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  TRANSFERRED: 'TRANSFERRED'
});

const APPROVAL_STATUS_META = Object.freeze({
  DRAFT: { name: '草稿', desc: '审批单已创建但尚未提交，可编辑修改' },
  PENDING: { name: '待审批', desc: '审批单已提交，等待第一位审批人处理' },
  APPROVING: { name: '审批中', desc: '审批流程进行中，部分节点已通过' },
  APPROVED: { name: '已通过', desc: '全部审批节点通过，流程结束生效' },
  REJECTED: { name: '已驳回', desc: '被审批人驳回，流程终止' },
  CANCELLED: { name: '已撤销', desc: '申请人主动撤销，流程终止' },
  TRANSFERRED: { name: '已转交', desc: '审批人转交给他人代为审批' }
});

const AREA_CODE = Object.freeze({
  // 陕西省 — 总部核心
  XA_LIANHU:  'XA_LIANHU',
  XA_YANTA:   'XA_YANTA',
  XA_WEIYANG: 'XA_WEIYANG',
  XA_CHANGAN: 'XA_CHANGAN',
  // 跨省项目城市
  CD:  'CD',
  QJ:  'QJ',
  DZ:  'DZ',
  // 预留甘肃省（原体系兼容）
  TS: 'TS', BY: 'BY', PL: 'PL', LZ: 'LZ'
});

const AREA_CODE_META = Object.freeze({
  XA_LIANHU:  { name: '西安·莲湖区', desc: '集团总部、美宏总部、福祉教育总部、耆祥总部所在地（艺腾国际）' },
  XA_YANTA:   { name: '西安·雁塔区', desc: '南城长者屋、电子城长者屋、派瑞康护理院运营区域' },
  XA_WEIYANG: { name: '西安·未央区', desc: '荣华康源·北城长者屋运营区域' },
  XA_CHANGAN: { name: '西安·长安区', desc: '长德养老、社区日照中心布局区域' },
  CD:         { name: '成都·锦江区', desc: '康源美宏·书院街长者屋（跨省首店，日式介护）' },
  QJ:         { name: '云南·曲靖', desc: '异地项目 - 逸晖·颐养中心康养综合体' },
  DZ:         { name: '山东·德州', desc: '山东区域合作养老机构运营' },
  TS: { name: '甘肃·天水', desc: '陇东南区域运营中心' },
  BY: { name: '甘肃·白银', desc: '兰白都市圈节点城市' },
  PL: { name: '甘肃·平凉', desc: '陕甘宁交汇区域' },
  LZ: { name: '甘肃·兰州', desc: '西北区域运营中心' }
});

const ENUM_TYPES = Object.freeze([
  'BUSINESS_UNIT_CODE',
  'LEGAL_ENTITY_CODE',
  'EMPLOYEE_STATUS',
  'ATTENDANCE_EXCEPTION',
  'LEAVE_TYPE',
  'APPROVAL_STATUS',
  'AREA_CODE'
]);

const _employeeCounter = { value: 0 };
const _positionCounter = { value: 0 };
const _deptRootCounter = { value: 0 };
const _deptChildCounters = {};

function genEmployeeId() {
  _employeeCounter.value += 1;
  return 'E' + String(_employeeCounter.value).padStart(6, '0');
}

function genPositionId() {
  _positionCounter.value += 1;
  return 'P' + String(_positionCounter.value).padStart(4, '0');
}

function genDeptId(parentDeptId) {
  if (!parentDeptId) {
    _deptRootCounter.value += 1;
    return 'D' + String(_deptRootCounter.value).padStart(2, '0');
  }
  if (typeof parentDeptId !== 'string' || !/^D\d{2,}$/.test(parentDeptId)) {
    throw new Error(`genDeptId: 父部门编码格式无效: ${parentDeptId}`);
  }
  if (!_deptChildCounters[parentDeptId]) {
    _deptChildCounters[parentDeptId] = 0;
  }
  _deptChildCounters[parentDeptId] += 1;
  return parentDeptId + String(_deptChildCounters[parentDeptId]).padStart(2, '0');
}

function _resetCounters() {
  _employeeCounter.value = 0;
  _positionCounter.value = 0;
  _deptRootCounter.value = 0;
  Object.keys(_deptChildCounters).forEach(k => delete _deptChildCounters[k]);
}

const _ENUM_MAP = {
  BUSINESS_UNIT_CODE,
  LEGAL_ENTITY_CODE,
  EMPLOYEE_STATUS,
  ATTENDANCE_EXCEPTION,
  LEAVE_TYPE,
  APPROVAL_STATUS,
  AREA_CODE
};

const _ENUM_META_MAP = {
  BUSINESS_UNIT_CODE: BUSINESS_UNIT_META,
  LEGAL_ENTITY_CODE: LEGAL_ENTITY_META,
  EMPLOYEE_STATUS: EMPLOYEE_STATUS_META,
  ATTENDANCE_EXCEPTION: ATTENDANCE_EXCEPTION_META,
  LEAVE_TYPE: LEAVE_TYPE_META,
  APPROVAL_STATUS: APPROVAL_STATUS_META,
  AREA_CODE: AREA_CODE_META
};

function listAllEnums() {
  const result = {};
  for (const type of ENUM_TYPES) {
    const enumObj = _ENUM_MAP[type];
    const metaObj = _ENUM_META_MAP[type];
    result[type] = Object.keys(enumObj).map(key => {
      // 兼容两套枚举映射：
      // A) 原枚举：enumObj键=meta键 (EMPLOYEE_STATUS等 key=code)
      // B) 新枚举：enumObj键=别名(MEIHONG)，值=meta键(BU_MEIHONG)
      const code = enumObj[key];
      const metaKey = (metaObj[key] !== undefined) ? key : code;
      const meta = metaObj[metaKey] || { name: String(code), desc: '' };
      return {
        code: code,
        name: meta.name,
        description: meta.desc || ''
      };
    });
  }
  return result;
}

function validateEnum(type, value) {
  if (!ENUM_TYPES.includes(type)) {
    return false;
  }
  const enumObj = _ENUM_MAP[type];
  return Object.values(enumObj).includes(value);
}

function genIdInfo(value) {
  if (typeof value !== 'string' || value.length < 2) {
    return null;
  }
  const prefix = value.charAt(0);
  const body = value.slice(1);

  if (prefix === 'E' && /^\d{6}$/.test(body)) {
    return {
      type: 'EMPLOYEE',
      typeName: '员工编码',
      prefix: 'E',
      sequence: parseInt(body, 10),
      raw: value,
      rule: 'E + 6位自增序号，首位为E000001'
    };
  }

  if (prefix === 'P' && /^\d{4}$/.test(body)) {
    return {
      type: 'POSITION',
      typeName: '岗位编码',
      prefix: 'P',
      sequence: parseInt(body, 10),
      raw: value,
      rule: 'P + 4位自增序号，首位为P0001'
    };
  }

  if (prefix === 'D' && /^(\d{2})+$/.test(body) && body.length >= 2 && body.length % 2 === 0) {
    const level = body.length / 2;
    const levelNames = ['', '一级部门', '二级部门', '三级部门', '四级部门'];
    const segments = [];
    for (let i = 0; i < body.length; i += 2) {
      segments.push(body.slice(i, i + 2));
    }
    const parentCode = segments.length > 1
      ? 'D' + segments.slice(0, -1).join('')
      : null;
    return {
      type: 'DEPARTMENT',
      typeName: levelNames[level] || `${level}级部门`,
      prefix: 'D',
      level: level,
      segments: segments,
      sequence: parseInt(segments[segments.length - 1], 10),
      parentDeptId: parentCode,
      raw: value,
      rule: `D + 每级2位自增序号，共${level}级(层级码${level}×2位)`
    };
  }

  return null;
}

function generateDictionaryMarkdown() {
  const lines = [];
  lines.push('# 智慧化人资平台 数据字典');
  lines.push('');
  lines.push(`> 生成时间: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 一、编码规则');
  lines.push('');
  lines.push('### 1.1 员工编码 (Employee ID)');
  lines.push('');
  lines.push('- **格式**: `E` + 6位十进制自增序号');
  lines.push('- **示例**: E000001、E000002、E000003 ...');
  lines.push('- **起点**: 从 E000001 开始，按生成顺序自增');
  lines.push('- **适用**: 员工花名册唯一标识，全局唯一且不可修改');
  lines.push('');

  lines.push('### 1.2 部门编码 (Department ID)');
  lines.push('');
  lines.push('- **格式**: `D` + 层级码(每级2位十进制自增序号)');
  lines.push('- **一级部门**: D + 2位序号，如 D01、D02、D03 ...');
  lines.push('- **二级部门**: 父编码 + 2位子序号，如 D0101、D0102 ...');
  lines.push('- **三级部门**: 父编码 + 2位子序号，如 D010101、D010102 ...');
  lines.push('- **示例**:');
  lines.push('  - 一级: D01 (教育事业部)');
  lines.push('  - 二级: D0101 (教学部 → 教育事业部下属)');
  lines.push('  - 三级: D010101 (语文教研组 → 教学部下属)');
  lines.push('- **规则**: 每新增一层子部门追加2位，支持最多N级扩展');
  lines.push('');

  lines.push('### 1.3 岗位编码 (Position ID)');
  lines.push('');
  lines.push('- **格式**: `P` + 4位十进制自增序号');
  lines.push('- **示例**: P0001、P0002、P0003 ...');
  lines.push('- **起点**: 从 P0001 开始，按生成顺序自增');
  lines.push('- **适用**: 岗位体系唯一标识，跨部门复用同一岗位编码');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 二、枚举字典');
  lines.push('');

  const _renderEnumTable = (type, title) => {
    const items = listAllEnums()[type];
    lines.push(`### ${title} (${type})`);
    lines.push('');
    lines.push('| 代码值 | 中文名称 | 说明 |');
    lines.push('|--------|----------|------|');
    for (const item of items) {
      lines.push(`| ${item.code} | ${item.name} | ${item.description} |`);
    }
    lines.push('');
  };

  _renderEnumTable('BUSINESS_UNIT_CODE', '2.1 集团业务板块（3+1）');
  _renderEnumTable('LEGAL_ENTITY_CODE', '2.2 核算/发薪主体（6家）');
  _renderEnumTable('EMPLOYEE_STATUS', '2.3 员工状态');
  _renderEnumTable('ATTENDANCE_EXCEPTION', '2.4 考勤异常类型');
  _renderEnumTable('LEAVE_TYPE', '2.5 假期类型');
  _renderEnumTable('APPROVAL_STATUS', '2.6 审批状态');
  _renderEnumTable('AREA_CODE', '2.7 工作地区编码');

  lines.push('---');
  lines.push('');
  lines.push('## 三、API 方法速查');
  lines.push('');
  lines.push('| 方法 | 说明 |');
  lines.push('|------|------|');
  lines.push('| `genEmployeeId()` | 生成下一个员工编码 E000001 ~ |');
  lines.push('| `genDeptId(parentDeptId?)` | 生成部门编码，无子参生成一级部门，传入父编码生成子部门 |');
  lines.push('| `genPositionId()` | 生成下一个岗位编码 P0001 ~ |');
  lines.push('| `listAllEnums()` | 返回全部5套枚举的完整清单(代码/名称/说明) |');
  lines.push('| `validateEnum(type, value)` | 校验 value 是否为 type 枚举的合法代码值 |');
  lines.push('| `genIdInfo(value)` | 反解编码字符串，返回类型/层级/序号/父编码等信息 |');
  lines.push('| `generateDictionaryMarkdown()` | 生成本字典 Markdown 文档字符串 |');
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  BUSINESS_UNIT_CODE,
  BUSINESS_UNIT_META,
  LEGAL_ENTITY_CODE,
  LEGAL_ENTITY_META,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_META,
  ATTENDANCE_EXCEPTION,
  ATTENDANCE_EXCEPTION_META,
  LEAVE_TYPE,
  LEAVE_TYPE_META,
  APPROVAL_STATUS,
  APPROVAL_STATUS_META,
  AREA_CODE,
  AREA_CODE_META,
  ENUM_TYPES,
  genEmployeeId,
  genDeptId,
  genPositionId,
  _resetCounters,
  listAllEnums,
  validateEnum,
  genIdInfo,
  generateDictionaryMarkdown
};
