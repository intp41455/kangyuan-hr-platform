/**
 * 员工主数据模型 (Employee Master Data)
 * 来源: spec.md §4.23 员工花名册完整主数据结构 + §12.8补充社保个税豁免标记
 * Task 1.1 / SubTask 1.1 - v2 扩展版：22字段 + 8状态机 + 岗位标签4类
 */

const EMPLOYEE_STATUS = Object.freeze({
  PENDING_ONBOARDING: '入职待报到',
  PROBATION: '试用期',
  REGULAR: '正式',
  TRANSFERRING: '调动中',
  PROMOTING: '晋升中',
  PENDING_RESIGNATION: '待离职',
  RESIGNED: '离职',
  RETIRED: '退休'
});

const EMPLOYEE_STATUS_ORDER = [
  EMPLOYEE_STATUS.PENDING_ONBOARDING,
  EMPLOYEE_STATUS.PROBATION,
  EMPLOYEE_STATUS.REGULAR,
  EMPLOYEE_STATUS.TRANSFERRING,
  EMPLOYEE_STATUS.PROMOTING,
  EMPLOYEE_STATUS.PENDING_RESIGNATION,
  EMPLOYEE_STATUS.RESIGNED,
  EMPLOYEE_STATUS.RETIRED
];

const STATUS_TRANSITIONS = Object.freeze({
  [EMPLOYEE_STATUS.PENDING_ONBOARDING]: [EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.RESIGNED],
  [EMPLOYEE_STATUS.PROBATION]: [EMPLOYEE_STATUS.REGULAR, EMPLOYEE_STATUS.PENDING_RESIGNATION],
  [EMPLOYEE_STATUS.REGULAR]: [EMPLOYEE_STATUS.TRANSFERRING, EMPLOYEE_STATUS.PROMOTING, EMPLOYEE_STATUS.PENDING_RESIGNATION, EMPLOYEE_STATUS.RETIRED],
  [EMPLOYEE_STATUS.TRANSFERRING]: [EMPLOYEE_STATUS.REGULAR, EMPLOYEE_STATUS.PENDING_RESIGNATION],
  [EMPLOYEE_STATUS.PROMOTING]: [EMPLOYEE_STATUS.REGULAR, EMPLOYEE_STATUS.PENDING_RESIGNATION],
  [EMPLOYEE_STATUS.PENDING_RESIGNATION]: [EMPLOYEE_STATUS.RESIGNED, EMPLOYEE_STATUS.REGULAR],
  [EMPLOYEE_STATUS.RESIGNED]: [],
  [EMPLOYEE_STATUS.RETIRED]: []
});

const POSITION_TAGS = Object.freeze({
  EDUCATION: '教育岗',
  NON_EDUCATION: '非教育岗',
  FIELD: '外勤岗',
  EXECUTIVE_EXEMPT: '高管免打卡岗'
});

const { LEGAL_ENTITIES, BUSINESS_UNITS } = require('../../common/kangyuan_brand_config.js');

const ENTITY_MAP = Object.freeze({
  GROUP_HQ: LEGAL_ENTITIES.GROUP_HQ.name,
  FUZHI_EDU: LEGAL_ENTITIES.FUZHI_EDU.name,
  BOYAO_SH: LEGAL_ENTITIES.BOYAO_SH.name,
  MEIHONG: LEGAL_ENTITIES.MEIHONG.name,
  QIXIANG: LEGAL_ENTITIES.QIXIANG.name,
  SHUYUAN: LEGAL_ENTITIES.SHUYUAN_DAIJIAO.name
});

/**
 * 业务板块归属映射（员工按板块分类统计用）
 * BU_CODE → 板块中文名称 + 图标
 */
const BUSINESS_UNIT_MAP = Object.freeze({
  [BUSINESS_UNITS.MEIHONG.code]: {
    name: BUSINESS_UNITS.MEIHONG.shortName,
    fullName: BUSINESS_UNITS.MEIHONG.fullName,
    tagline: BUSINESS_UNITS.MEIHONG.tagline,
    icon: BUSINESS_UNITS.MEIHONG.icon,
    legalEntities: [LEGAL_ENTITIES.MEIHONG.code, LEGAL_ENTITIES.SHUYUAN_DAIJIAO.code]
  },
  [BUSINESS_UNITS.FUZHI_EDU.code]: {
    name: BUSINESS_UNITS.FUZHI_EDU.shortName,
    fullName: BUSINESS_UNITS.FUZHI_EDU.fullName,
    tagline: BUSINESS_UNITS.FUZHI_EDU.tagline,
    icon: BUSINESS_UNITS.FUZHI_EDU.icon,
    legalEntities: [LEGAL_ENTITIES.FUZHI_EDU.code]
  },
  [BUSINESS_UNITS.QIXIANG.code]: {
    name: BUSINESS_UNITS.QIXIANG.shortName,
    fullName: BUSINESS_UNITS.QIXIANG.fullName,
    tagline: BUSINESS_UNITS.QIXIANG.tagline,
    icon: BUSINESS_UNITS.QIXIANG.icon,
    legalEntities: [LEGAL_ENTITIES.QIXIANG.code]
  },
  GROUP_HQ: {
    name: '集团总部',
    fullName: LEGAL_ENTITIES.GROUP_HQ.name,
    tagline: '战略 · 投资 · 共享服务中心',
    icon: '🏢',
    legalEntities: [LEGAL_ENTITIES.GROUP_HQ.code, LEGAL_ENTITIES.BOYAO_SH.code]
  }
});

/**
 * 根据核算主体代码反推所属业务板块
 */
function resolveBusinessUnitByEntity(entityCode) {
  for (const [buCode, buInfo] of Object.entries(BUSINESS_UNIT_MAP)) {
    if (buInfo.legalEntities.includes(entityCode)) return buCode;
  }
  return 'GROUP_HQ';
}

const DEFAULT_SENIORITY_PAY_CONFIG = Object.freeze({
  perYear: 100,
  capYears: 10
});

class InvalidStatusTransitionError extends Error {
  constructor(from, to) {
    super(`非法状态跳转：从「${from}」无法直接跳转到「${to}」`);
    this.name = 'InvalidStatusTransitionError';
    this.fromStatus = from;
    this.toStatus = to;
  }
}

/**
 * @typedef {Object} Employee
 * @property {string} id              - 员工唯一工号 [1]
 * @property {string} name            - 姓名 [2]
 * @property {string} idCard          - 身份证号 [3]
 * @property {string} mobile          - 手机号 [4]
 * @property {string} entity          - 核算主体 ENTITY_MAP [5]
 * @property {string} dept1           - 一级部门/项目 [6]
 * @property {string} dept2           - 二级部门(机构/部门) [7]
 * @property {string} position        - 岗位名称 [8]
 * @property {string} positionTag     - 岗位标签 POSITION_TAGS [9]
 * @property {string} directLeader    - 直接上级 [10]
 * @property {Date}   entryDate       - 入职日期 [11]
 * @property {Date|null} regularDate  - 转正日期，null=特聘专家等无试用期 [12]
 * @property {string} status          - 员工状态 EMPLOYEE_STATUS (8状态) [13]
 * @property {string} payrollGrade    - 岗位薪级编码 [14]
 * @property {string} workLocation    - 常驻工作地 [15]
 * @property {Date|null} firstWorkDate - 首次开始工作日期（工龄计算源） [16]
 * @property {boolean} exemptSocialTax - 社保个税豁免标记（特聘/退休返聘适用）§12.8 [17]
 * @property {string} bankCard        - 工资卡号 [18]
 * @property {string} bankName        - 开户行 [19]
 * @property {boolean} isFinance      - 是否财务人员（审批链路标识） [20]
 * @property {Object} history         - {调动:[],调岗:[],调薪:[]} 变更留痕 [21]
 * @property {Date}   createdAt       - [22]
 * @property {Date}   updatedAt
 */
class EmployeeModel {
  constructor(data, config = {}) {
    this._seniorityPayConfig = Object.assign({}, DEFAULT_SENIORITY_PAY_CONFIG, config.seniorityPay || {});

    Object.assign(this, {
      id: null, name: null, idCard: null, mobile: null,
      entity: null, dept1: null, dept2: null, position: null,
      positionTag: null,
      directLeader: null, entryDate: null, regularDate: null,
      status: EMPLOYEE_STATUS.PENDING_ONBOARDING, payrollGrade: null,
      workLocation: '西安', firstWorkDate: null,
      exemptSocialTax: false, bankCard: null, bankName: null,
      isFinance: false, history: { transfers: [], promotions: [], adjustments: [] },
      createdAt: new Date(), updatedAt: new Date()
    }, data);
  }

  /**
   * 状态机流转：合法状态跳转
   * @param {string} targetStatus - 目标状态（来自EMPLOYEE_STATUS）
   * @param {Object} meta - 跳转元数据，会写入history
   * @throws {InvalidStatusTransitionError} 非法跳转时抛出异常，状态保持不变
   */
  transitionTo(targetStatus, meta = {}) {
    const fromStatus = this.status;
    const allowed = STATUS_TRANSITIONS[fromStatus] || [];

    if (!allowed.includes(targetStatus)) {
      throw new InvalidStatusTransitionError(fromStatus, targetStatus);
    }

    const transitionRecord = {
      from: fromStatus,
      to: targetStatus,
      date: new Date(),
      meta
    };

    this.status = targetStatus;
    this.updatedAt = new Date();

    if (targetStatus === EMPLOYEE_STATUS.TRANSFERRING) {
      this.history.transfers.push(transitionRecord);
    } else if (targetStatus === EMPLOYEE_STATUS.PROMOTING) {
      this.history.promotions.push(transitionRecord);
    }
    this.history.adjustments.push(transitionRecord);

    return this;
  }

  /** 查询当前状态允许跳转的目标状态列表 */
  getAllowedTransitions() {
    return [...(STATUS_TRANSITIONS[this.status] || [])];
  }

  /**
   * §4.6+§5.5 工龄计算（单位：年，不满1年不计）
   * 双记录：firstWorkDate优先，没有则entryDate
   */
  calcYearsOfService(asOfDate = new Date()) {
    const start = this.firstWorkDate || this.entryDate;
    if (!start) return 0;
    const diff = new Date(asOfDate).getTime() - new Date(start).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }

  /**
   * §4.6 工龄工资：司龄年数×100元/年，不满1年不计
   * 10年封顶可配置（通过构造函数 config.seniorityPay = {perYear, capYears}）
   */
  calcSeniorityPay(asOfDate = new Date()) {
    const years = this.calcYearsOfService(asOfDate);
    const { perYear, capYears } = this._seniorityPayConfig;
    const cappedYears = Math.min(years, capYears);
    return cappedYears * perYear;
  }

  /**
   * §4.18 试用期判定：按regularDate精确判定
   * 规则：asOfDate < regularDate 时为 true；asOfDate >= regularDate 时为 false
   * 无regularDate时，若status=PROBATION则认为是试用期
   */
  isProbation(asOfDate = new Date()) {
    const checkDate = new Date(asOfDate);
    checkDate.setHours(0, 0, 0, 0);

    if (!this.regularDate) {
      return this.status === EMPLOYEE_STATUS.PROBATION;
    }

    const regular = new Date(this.regularDate);
    regular.setHours(0, 0, 0, 0);

    return checkDate < regular;
  }

  /**
   * 获取所属业务板块（基于 entity 字段自动反推）
   * 返回 BU_CODE + 中文名称 + 图标 + tagline 的组合对象
   */
  getBusinessUnit() {
    // 允许在 entity 字段里直接存 ENTITY_MAP 的 key（如 'MEIHONG'）或中文全称
    let entityCode = this.entity;
    // 如果传入的是中文全称，反查其对应的 key
    if (entityCode) {
      const foundKey = Object.entries(ENTITY_MAP).find(([, name]) => name === entityCode);
      if (foundKey) entityCode = foundKey[0];
    }
    const buCode = resolveBusinessUnitByEntity(entityCode);
    const buInfo = BUSINESS_UNIT_MAP[buCode] || BUSINESS_UNIT_MAP.GROUP_HQ;
    return {
      buCode,
      ...buInfo
    };
  }

  /** 设置岗位标签 */
  setPositionTag(tag) {
    const validTags = Object.values(POSITION_TAGS);
    if (!validTags.includes(tag)) {
      throw new Error(`无效岗位标签「${tag}」，有效值：${validTags.join('、')}`);
    }
    this.positionTag = tag;
    this.updatedAt = new Date();
    return this;
  }

  /** 工龄工资配置运行时调整 */
  setSeniorityPayConfig(config) {
    Object.assign(this._seniorityPayConfig, config);
    return this;
  }

  getSeniorityPayConfig() {
    return Object.assign({}, this._seniorityPayConfig);
  }
}

module.exports = {
  EmployeeModel,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_ORDER,
  STATUS_TRANSITIONS,
  POSITION_TAGS,
  ENTITY_MAP,
  BUSINESS_UNIT_MAP,
  resolveBusinessUnitByEntity,
  DEFAULT_SENIORITY_PAY_CONFIG,
  InvalidStatusTransitionError
};
