/**
 * 社保地区主数据模型 (Social Insurance Area Master Data)
 * 来源: Task 1.4 智慧化人资平台社保公积金计算
 * 支持多版本：同一areaCode按effectiveDate生效区间匹配不同版本
 */

const VALID_HOUSING_FUND_RATIOS = Object.freeze([0.08, 0.10, 0.12]);

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function parseDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`无效日期格式：${dateStr}`);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

class SocialInsuranceAreaModel {
  constructor(data = {}) {
    if (data.housingFundRatio !== undefined && !VALID_HOUSING_FUND_RATIOS.includes(data.housingFundRatio)) {
      throw new Error(`公积金比例必须是0.08/0.10/0.12之一，实际=${data.housingFundRatio}`);
    }
    Object.assign(this, {
      areaCode: null,
      areaName: null,
      pensionRatio: 0.08,
      unemploymentRatio: 0.003,
      medicalRatio: 0.02,
      bigMedicalSupplement: 8,
      housingFundRatio: 0.08,
      baseLowerLimit: 0,
      baseUpperLimit: Infinity,
      effectiveDate: null
    }, data);
    if (this.effectiveDate) {
      this.effectiveDate = parseDate(this.effectiveDate);
    }
  }

  get validHousingFundRatios() {
    return [...VALID_HOUSING_FUND_RATIOS];
  }

  setHousingFundRatio(ratio) {
    if (!VALID_HOUSING_FUND_RATIOS.includes(ratio)) {
      throw new Error(`公积金比例必须是0.08/0.10/0.12之一，实际=${ratio}`);
    }
    this.housingFundRatio = ratio;
    return this;
  }

  calcBase(salary) {
    return clamp(salary, this.baseLowerLimit, this.baseUpperLimit);
  }

  calcPension(salary) {
    const base = this.calcBase(salary);
    return base * this.pensionRatio;
  }

  calcUnemployment(salary) {
    const base = this.calcBase(salary);
    return base * this.unemploymentRatio;
  }

  calcMedical(salary) {
    const base = this.calcBase(salary);
    return base * this.medicalRatio;
  }

  calcHousingFund(salary) {
    const base = this.calcBase(salary);
    return base * this.housingFundRatio;
  }

  calcSocialInsurance(salary, payrollMonth) {
    const base = this.calcBase(salary);
    const pension = base * this.pensionRatio;
    const unemployment = base * this.unemploymentRatio;
    const medical = base * this.medicalRatio;
    const housingFund = base * this.housingFundRatio;
    const total = pension + unemployment + medical + this.bigMedicalSupplement + housingFund;
    return {
      base,
      pension,
      unemployment,
      medical,
      bigMedicalSupplement: this.bigMedicalSupplement,
      housingFund,
      total
    };
  }
}

const AREA_VERSION_MAP = {};

function _ensureAreaList(areaCode) {
  if (!AREA_VERSION_MAP[areaCode]) {
    AREA_VERSION_MAP[areaCode] = [];
  }
  return AREA_VERSION_MAP[areaCode];
}

function registerAreaVersion(version) {
  const model = version instanceof SocialInsuranceAreaModel ? version : new SocialInsuranceAreaModel(version);
  if (!model.areaCode) {
    throw new Error('areaCode不能为空');
  }
  if (!model.effectiveDate) {
    throw new Error('effectiveDate不能为空');
  }
  const list = _ensureAreaList(model.areaCode);
  list.push(model);
  list.sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
  return model;
}

function findAreaVersion(areaCode, payrollMonth) {
  const list = AREA_VERSION_MAP[areaCode];
  if (!list || list.length === 0) return null;
  const checkDate = parseDate(payrollMonth);
  let matched = null;
  for (const ver of list) {
    if (ver.effectiveDate.getTime() <= checkDate.getTime()) {
      matched = ver;
    } else {
      break;
    }
  }
  return matched;
}

function getAllAreaVersions(areaCode) {
  return AREA_VERSION_MAP[areaCode] ? [...AREA_VERSION_MAP[areaCode]] : [];
}

function listAllAreaCodes() {
  return Object.keys(AREA_VERSION_MAP);
}

const PRESET_XIAN_JULY = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'XA',
  areaName: '西安',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 8,
  housingFundRatio: 0.08,
  baseLowerLimit: 4990,
  baseUpperLimit: 24975,
  effectiveDate: '2026-07-01'
}));

const PRESET_XIAN_AUG = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'XA',
  areaName: '西安',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 8,
  housingFundRatio: 0.10,
  baseLowerLimit: 5132,
  baseUpperLimit: 25660,
  effectiveDate: '2026-08-01'
}));

const PRESET_TIANSHUI = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'TS',
  areaName: '天水',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 5,
  housingFundRatio: 0.08,
  baseLowerLimit: 7000,
  baseUpperLimit: 21000,
  effectiveDate: '2026-01-01'
}));

const PRESET_BAIYIN = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'BY',
  areaName: '白银',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 5,
  housingFundRatio: 0.08,
  baseLowerLimit: 6500,
  baseUpperLimit: 19500,
  effectiveDate: '2026-01-01'
}));

const PRESET_PINGLIANG = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'PL',
  areaName: '平凉',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 5,
  housingFundRatio: 0.08,
  baseLowerLimit: 6000,
  baseUpperLimit: 18000,
  effectiveDate: '2026-01-01'
}));

const PRESET_LANZHOU = registerAreaVersion(new SocialInsuranceAreaModel({
  areaCode: 'LZ',
  areaName: '兰州',
  pensionRatio: 0.08,
  unemploymentRatio: 0.003,
  medicalRatio: 0.02,
  bigMedicalSupplement: 5,
  housingFundRatio: 0.08,
  baseLowerLimit: 7500,
  baseUpperLimit: 22500,
  effectiveDate: '2026-01-01'
}));

const PRESET_AREA_CODES = Object.freeze(['XA', 'TS', 'BY', 'PL', 'LZ']);

module.exports = {
  SocialInsuranceAreaModel,
  VALID_HOUSING_FUND_RATIOS,
  registerAreaVersion,
  findAreaVersion,
  getAllAreaVersions,
  listAllAreaCodes,
  PRESET_AREA_CODES,
  PRESET_XIAN_JULY,
  PRESET_XIAN_AUG,
  PRESET_TIANSHUI,
  PRESET_BAIYIN,
  PRESET_PINGLIANG,
  PRESET_LANZHOU
};
