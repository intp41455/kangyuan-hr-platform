'use strict';

const { findAreaVersion, getAllAreaVersions } = require('../master_data/social_insurance_model.js');

const WORK_LOCATION_TO_AREA_CODE = Object.freeze({
  '西安': 'XA',
  'XA': 'XA',
  '天水': 'TS',
  'TS': 'TS',
  '白银': 'BY',
  'BY': 'BY',
  '平凉': 'PL',
  'PL': 'PL',
  '兰州': 'LZ',
  'LZ': 'LZ'
});

function round2(num) {
  return Math.round(num * 100) / 100;
}

function normalizePayrollMonth(payrollMonth) {
  if (!payrollMonth) return null;
  const s = String(payrollMonth).trim();
  if (/^\d{4}-\d{2}$/.test(s)) {
    return `${s}-15`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const m = s.match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, '0');
    const d = m[3] ? String(m[3]).padStart(2, '0') : '15';
    return `${y}-${mo}-${d}`;
  }
  return null;
}

class InconsistentError extends Error {
  constructor(message, details) {
    super(message || '社保核算与人工计算不一致');
    this.name = 'InconsistentError';
    this.details = details || null;
  }
}

function getAreaVersionLabel(areaModel) {
  if (!areaModel) return null;
  const d = areaModel.effectiveDate;
  if (!d) return 'unknown';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const areaCode = areaModel.areaCode;
  if (areaCode === 'XA') {
    if (m === 7) return `${y}H1`;
    if (m === 8) return `${y}H2`;
  }
  if (m <= 6) return `${y}H1`;
  return `${y}H2`;
}

function getBaseByPayrollMonth(areaCode, payrollMonth) {
  const ver = findAreaVersion(areaCode, payrollMonth);
  if (!ver) return null;
  return {
    version: getAreaVersionLabel(ver),
    baseLower: ver.baseLowerLimit,
    model: ver
  };
}

function calcSocialInsuranceV2({ employee, baseSalary, payrollMonth, workLocation }) {
  const loc = (workLocation || (employee && employee.workLocation) || '西安').toString();
  const areaCode = WORK_LOCATION_TO_AREA_CODE[loc];
  if (!areaCode) {
    throw new Error(`未知工作地「${loc}」，无法匹配社保地区`);
  }
  const normMonth = normalizePayrollMonth(payrollMonth) || '2026-08-15';
  const areaResult = getBaseByPayrollMonth(areaCode, normMonth);
  if (!areaResult) {
    throw new Error(`地区「${loc}」在 ${payrollMonth} 无有效社保版本`);
  }
  const { version, model } = areaResult;
  const baseUsed = model.calcBase(Number(baseSalary) || 0);

  const pensionPerson = round2(baseUsed * model.pensionRatio);
  const medicalPerson = round2(baseUsed * model.medicalRatio);
  const unemploymentPerson = round2(baseUsed * model.unemploymentRatio);
  const housingFundPerson = round2(baseUsed * model.housingFundRatio);
  const bigMedicalPerson = round2(model.bigMedicalSupplement || 0);
  const totalPerson = round2(pensionPerson + medicalPerson + unemploymentPerson + housingFundPerson + bigMedicalPerson);

  const manual = {
    baseUsed,
    pension: round2(baseUsed * model.pensionRatio),
    medical: round2(baseUsed * model.medicalRatio),
    unemployment: round2(baseUsed * model.unemploymentRatio),
    housingFund: round2(baseUsed * model.housingFundRatio),
    bigMedical: round2(model.bigMedicalSupplement || 0),
    total: 0
  };
  manual.total = round2(manual.pension + manual.medical + manual.unemployment + manual.housingFund + manual.bigMedical);

  const diffs = {
    pension: round2(pensionPerson - manual.pension),
    medical: round2(medicalPerson - manual.medical),
    unemployment: round2(unemploymentPerson - manual.unemployment),
    housingFund: round2(housingFundPerson - manual.housingFund),
    bigMedical: round2(bigMedicalPerson - manual.bigMedical),
    total: round2(totalPerson - manual.total)
  };

  const maxAbsDiff = Math.max(
    Math.abs(diffs.pension),
    Math.abs(diffs.medical),
    Math.abs(diffs.unemployment),
    Math.abs(diffs.housingFund),
    Math.abs(diffs.bigMedical),
    Math.abs(diffs.total)
  );

  const comparison = {
    manualCalc: {
      formula: `养老${baseUsed}×${model.pensionRatio} + 医疗${baseUsed}×${model.medicalRatio} + 失业${baseUsed}×${model.unemploymentRatio} + 公积金${baseUsed}×${model.housingFundRatio} + 大额医疗${model.bigMedicalSupplement}`,
      pension: manual.pension,
      medical: manual.medical,
      unemployment: manual.unemployment,
      housingFund: manual.housingFund,
      bigMedical: manual.bigMedical,
      total: manual.total
    },
    engineCalc: {
      pension: pensionPerson,
      medical: medicalPerson,
      unemployment: unemploymentPerson,
      housingFund: housingFundPerson,
      bigMedical: bigMedicalPerson,
      total: totalPerson
    },
    diffs,
    maxAbsDiff,
    passed: maxAbsDiff <= 0.01
  };

  if (!comparison.passed) {
    throw new InconsistentError(`社保核算与人工计算不一致，最大误差=${maxAbsDiff}元`, comparison);
  }

  return {
    养老个人: pensionPerson,
    医疗个人: medicalPerson,
    失业个人: unemploymentPerson,
    公积金个人: housingFundPerson,
    大额医疗补: bigMedicalPerson,
    合计个人部分: totalPerson,
    areaName: model.areaName,
    areaVersion: version,
    baseUsed,
    明细vs人工对比: comparison
  };
}

function buildMultiDimSummary(payrollResults) {
  const emptyBlock = () => ({
    totalEmployees: 0,
    grossTotal: 0,
    netTotal: 0,
    socialTotal: 0,
    taxTotal: 0,
    deductionTotal: 0
  });

  const byDept = {};
  const byPosition = {};
  const byGrade = {};
  const byEntity = {};

  const addTo = (map, key, item) => {
    if (!key) key = '__未分类__';
    if (!map[key]) map[key] = emptyBlock();
    const b = map[key];
    const gross = Number(item.grossPay) || 0;
    const net = Number(item.netPay) || 0;
    const social = Number(item.socialFund && item.socialFund.total) || 0;
    const tax = Number(item.incomeTax) || 0;
    const deduction = round2(social + tax);
    b.totalEmployees += 1;
    b.grossTotal = round2(b.grossTotal + gross);
    b.netTotal = round2(b.netTotal + net);
    b.socialTotal = round2(b.socialTotal + social);
    b.taxTotal = round2(b.taxTotal + tax);
    b.deductionTotal = round2(b.deductionTotal + deduction);
  };

  if (Array.isArray(payrollResults)) {
    for (const item of payrollResults) {
      const dept1 = (item.employee && item.employee.dept1) || item.dept1 || null;
      const dept2 = (item.employee && item.employee.dept2) || item.dept2 || null;
      const deptKey = dept2 ? `${dept1 || ''}/${dept2}` : (dept1 || null);
      addTo(byDept, deptKey, item);

      const pos = (item.employee && item.employee.position) || item.position || null;
      addTo(byPosition, pos, item);

      const grade = (item.employee && item.employee.payrollGrade) || item.payrollGrade || item.baseSalaryBreakdown?.gradeCode || null;
      addTo(byGrade, grade, item);

      const entity = (item.employee && item.employee.entity) || item.entity || null;
      addTo(byEntity, entity, item);
    }
  }

  return { byDept, byPosition, byGrade, byEntity };
}

const ICBC_HEADER_REGEX = /^[A-Z0-9]{3,20}\|[\u4e00-\u9fa5A-Za-z0-9()（）\s]{2,50}\|\d{4}-\d{2}-\d{2}\|\d+\|\d+(\.\d{1,2})?$/;
const ICBC_ROW_REGEX = /^[0-9]{16,22}\|[\u4e00-\u9fa5A-Za-z·]{2,20}\|\d+(\.\d{1,2})?\|[\u4e00-\u9fa5A-Za-z0-9\s\-]{0,50}\|[0-9A-Z]{15,20}$/;

const CCB_HEADER_REGEX = /^序号,客户账号,客户姓名,交易金额\(元\),摘要,证件号码$/;
const CCB_ROW_REGEX = /^\d+,[0-9]{16,22},[\u4e00-\u9fa5A-Za-z·]{2,20},\d+(\.\d{1,2})?,[\u4e00-\u9fa5A-Za-z0-9\s\-]{0,50},[0-9A-Z]{15,20}$/;

const ABC_TXT_HEADER_REGEX = /^企业编号[\|,]\s*[\u4e00-\u9fa5A-Za-z0-9()（）\s]{2,50}[\|,]\s*日期[\|,]\s*\d{4}-\d{2}-\d{2}[\|,]\s*笔数[\|,]\s*\d+[\|,]\s*总金额[\|,]\s*\d+(\.\d{1,2})?$/;
const ABC_TXT_ROW_REGEX = /^\d+[\|,]\s*[0-9]{16,22}[\|,]\s*[\u4e00-\u9fa5A-Za-z·]{2,20}[\|,]\s*\d+(\.\d{1,2})?[\|,]\s*[\u4e00-\u9fa5A-Za-z0-9\s\-]{0,50}[\|,]\s*[0-9A-Z]{15,20}$/;

const ABC_CSV_HEADER_REGEX = /^序号,银行账号,户名,发放金额\(元\),备注,证件号码$/;
const ABC_CSV_ROW_REGEX = /^\d+,[0-9]{16,22},[\u4e00-\u9fa5A-Za-z·]{2,20},\d+(\.\d{1,2})?,[\u4e00-\u9fa5A-Za-z0-9\s\-]{0,50},[0-9A-Z]{15,20}$/;

function validateIcbcTxt(content) {
  const lines = content.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) throw new Error('ICBC TXT至少需1表头+1数据行');
  if (!ICBC_HEADER_REGEX.test(lines[0])) {
    throw new Error(`ICBC表头格式不匹配：${lines[0]}`);
  }
  const amounts = [];
  for (let i = 1; i < lines.length; i++) {
    if (!ICBC_ROW_REGEX.test(lines[i])) {
      throw new Error(`ICBC第${i + 1}行格式不匹配：${lines[i]}`);
    }
    const parts = lines[i].split('|');
    amounts.push(Number(parts[2]));
  }
  const sumFromRows = round2(amounts.reduce((a, b) => a + b, 0));
  const headerAmount = Number(lines[0].split('|')[4]);
  if (Math.abs(sumFromRows - headerAmount) > 0.01) {
    throw new Error(`ICBC表头总金额${headerAmount}≠逐笔合计${sumFromRows}`);
  }
  return { lines: lines.length - 1, totalAmount: sumFromRows, valid: true };
}

function validateCcbCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 3) throw new Error('CCB CSV至少需1表头+1数据行+1SUM行');
  if (!CCB_HEADER_REGEX.test(lines[0])) {
    throw new Error(`CCB表头格式不匹配：${lines[0]}`);
  }
  const amounts = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('=SUM(') || lines[i].startsWith('"=SUM(') || lines[i].startsWith('合计')) {
      continue;
    }
    if (!CCB_ROW_REGEX.test(lines[i])) {
      throw new Error(`CCB第${i + 1}行格式不匹配：${lines[i]}`);
    }
    const parts = lines[i].split(',');
    amounts.push(Number(parts[3]));
  }
  const sumFromRows = round2(amounts.reduce((a, b) => a + b, 0));
  const sumLine = lines.find(l => l.includes('=SUM('));
  if (sumLine) {
    const m = sumLine.match(/=SUM\(D(\d+):D(\d+)\)/);
    if (!m) throw new Error(`CCB SUM公式格式错误：${sumLine}`);
  }
  return { lines: amounts.length, totalAmount: sumFromRows, valid: true, hasSumFormula: !!sumLine };
}

function validateAbcTxt(content) {
  const lines = content.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) throw new Error('ABC TXT至少需1表头+1数据行');
  if (!ABC_TXT_HEADER_REGEX.test(lines[0])) {
    throw new Error(`ABC TXT表头格式不匹配：${lines[0]}`);
  }
  const amounts = [];
  for (let i = 1; i < lines.length; i++) {
    if (!ABC_TXT_ROW_REGEX.test(lines[i])) {
      throw new Error(`ABC TXT第${i + 1}行格式不匹配：${lines[i]}`);
    }
    const parts = lines[i].split(/[\|,]/).map(s => s.trim());
    amounts.push(Number(parts[3]));
  }
  const sumFromRows = round2(amounts.reduce((a, b) => a + b, 0));
  const headerParts = lines[0].split(/[\|,]/).map(s => s.trim());
  const headerAmount = Number(headerParts[headerParts.length - 1]);
  if (Math.abs(sumFromRows - headerAmount) > 0.01) {
    throw new Error(`ABC TXT表头总金额${headerAmount}≠逐笔合计${sumFromRows}`);
  }
  return { lines: amounts.length, totalAmount: sumFromRows, valid: true };
}

function validateAbcCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 3) throw new Error('ABC CSV至少需1表头+1数据行+1SUM行');
  if (!ABC_CSV_HEADER_REGEX.test(lines[0])) {
    throw new Error(`ABC CSV表头格式不匹配：${lines[0]}`);
  }
  const amounts = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('=SUM(') || lines[i].startsWith('"=SUM(') || lines[i].startsWith('合计')) {
      continue;
    }
    if (!ABC_CSV_ROW_REGEX.test(lines[i])) {
      throw new Error(`ABC CSV第${i + 1}行格式不匹配：${lines[i]}`);
    }
    const parts = lines[i].split(',');
    amounts.push(Number(parts[3]));
  }
  const sumFromRows = round2(amounts.reduce((a, b) => a + b, 0));
  const sumLine = lines.find(l => l.includes('=SUM('));
  if (sumLine) {
    const m = sumLine.match(/=SUM\(D(\d+):D(\d+)\)/);
    if (!m) throw new Error(`ABC CSV SUM公式格式错误：${sumLine}`);
  }
  return { lines: amounts.length, totalAmount: sumFromRows, valid: true, hasSumFormula: !!sumLine };
}

function generateIcbcTxt({ enterpriseCode, enterpriseName, payrollDate, employeePayments }) {
  const dateStr = normalizePayrollMonth(payrollDate)?.slice(0, 10) || '2026-08-15';
  const totalAmount = round2(employeePayments.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const totalCount = employeePayments.length;
  let lines = [];
  lines.push(`${enterpriseCode}|${enterpriseName}|${dateStr}|${totalCount}|${totalAmount.toFixed(2)}`);
  let idx = 0;
  for (const e of employeePayments) {
    idx++;
    const account = String(e.bankCard || e.account || '').replace(/\s/g, '');
    const name = String(e.name || '').trim();
    const amount = round2(Number(e.amount) || 0).toFixed(2);
    const remark = String(e.remark || e.note || `${dateStr}工资`).trim();
    const idCard = String(e.idCard || e.idCardNumber || '').replace(/\s/g, '').toUpperCase();
    lines.push(`${account}|${name}|${amount}|${remark}|${idCard}`);
  }
  const content = lines.join('\n') + '\n';
  const validation = validateIcbcTxt(content);
  return {
    format: 'ICBC_TXT',
    content,
    fileName: `ICBC_代发_${enterpriseCode}_${dateStr.replace(/-/g, '')}.txt`,
    validation
  };
}

function generateCcbCsv({ payrollDate, employeePayments }) {
  const dateStr = normalizePayrollMonth(payrollDate)?.slice(0, 10) || '2026-08-15';
  let lines = [];
  lines.push('序号,客户账号,客户姓名,交易金额(元),摘要,证件号码');
  let idx = 0;
  for (const e of employeePayments) {
    idx++;
    const account = String(e.bankCard || e.account || '').replace(/\s/g, '');
    const name = String(e.name || '').trim();
    const amount = round2(Number(e.amount) || 0).toFixed(2);
    const summary = String(e.summary || e.remark || `${dateStr}工资`).trim();
    const idCard = String(e.idCard || e.idCardNumber || '').replace(/\s/g, '').toUpperCase();
    lines.push(`${idx},${account},${name},${amount},${summary},${idCard}`);
  }
  const sumFromRow = round2(employeePayments.reduce((s, e) => s + (Number(e.amount) || 0), 0)).toFixed(2);
  lines.push(`合计,,,"=SUM(D2:D${idx + 1})",${sumFromRow},`);
  const content = lines.join('\n') + '\n';
  const validation = validateCcbCsv(content);
  return {
    format: 'CCB_CSV',
    content,
    fileName: `CCB_代发_${dateStr.replace(/-/g, '')}.csv`,
    validation
  };
}

function generateAbcTxt({ enterpriseCode, enterpriseName, payrollDate, employeePayments }) {
  const dateStr = normalizePayrollMonth(payrollDate)?.slice(0, 10) || '2026-08-15';
  const totalAmount = round2(employeePayments.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const totalCount = employeePayments.length;
  let lines = [];
  lines.push(`企业编号|${enterpriseName}|日期|${dateStr}|笔数|${totalCount}|总金额|${totalAmount.toFixed(2)}`);
  let idx = 0;
  for (const e of employeePayments) {
    idx++;
    const account = String(e.bankCard || e.account || '').replace(/\s/g, '');
    const name = String(e.name || '').trim();
    const amount = round2(Number(e.amount) || 0).toFixed(2);
    const remark = String(e.remark || e.note || `${dateStr}工资`).trim();
    const idCard = String(e.idCard || e.idCardNumber || '').replace(/\s/g, '').toUpperCase();
    lines.push(`${idx}|${account}|${name}|${amount}|${remark}|${idCard}`);
  }
  const content = lines.join('\n') + '\n';
  const validation = validateAbcTxt(content);
  return {
    format: 'ABC_TXT',
    content,
    fileName: `ABC_代发_${enterpriseCode}_${dateStr.replace(/-/g, '')}.txt`,
    validation
  };
}

function generateAbcCsv({ payrollDate, employeePayments }) {
  const dateStr = normalizePayrollMonth(payrollDate)?.slice(0, 10) || '2026-08-15';
  let lines = [];
  lines.push('序号,银行账号,户名,发放金额(元),备注,证件号码');
  let idx = 0;
  for (const e of employeePayments) {
    idx++;
    const account = String(e.bankCard || e.account || '').replace(/\s/g, '');
    const name = String(e.name || '').trim();
    const amount = round2(Number(e.amount) || 0).toFixed(2);
    const remark = String(e.remark || e.note || `${dateStr}工资`).trim();
    const idCard = String(e.idCard || e.idCardNumber || '').replace(/\s/g, '').toUpperCase();
    lines.push(`${idx},${account},${name},${amount},${remark},${idCard}`);
  }
  const sumFromRow = round2(employeePayments.reduce((s, e) => s + (Number(e.amount) || 0), 0)).toFixed(2);
  lines.push(`合计,,,"=SUM(D2:D${idx + 1})",${sumFromRow},`);
  const content = lines.join('\n') + '\n';
  const validation = validateAbcCsv(content);
  return {
    format: 'ABC_CSV',
    content,
    fileName: `ABC_代发_${dateStr.replace(/-/g, '')}.csv`,
    validation
  };
}

function buildBaseDeltaTrace(areaCode, monthFrom, monthTo) {
  const normFrom = normalizePayrollMonth(monthFrom);
  const normTo = normalizePayrollMonth(monthTo);
  const verFrom = findAreaVersion(areaCode, normFrom);
  const verTo = findAreaVersion(areaCode, normTo);
  if (!verFrom || !verTo) return null;
  const baseFrom = verFrom.baseLowerLimit;
  const baseTo = verTo.baseLowerLimit;
  const deltaBreakdown = {
    养老: round2((baseTo - baseFrom) * verTo.pensionRatio),
    医疗: round2((baseTo - baseFrom) * verTo.medicalRatio),
    失业: round2((baseTo - baseFrom) * verTo.unemploymentRatio),
    公积金: round2(baseTo * verTo.housingFundRatio - baseFrom * verFrom.housingFundRatio),
    大额医疗: round2((verTo.bigMedicalSupplement || 0) - (verFrom.bigMedicalSupplement || 0))
  };
  deltaBreakdown.合计 = round2(
    deltaBreakdown.养老 + deltaBreakdown.医疗 + deltaBreakdown.失业 +
    deltaBreakdown.公积金 + deltaBreakdown.大额医疗
  );
  return {
    monthFrom: monthFrom,
    monthTo: monthTo,
    baseFrom,
    baseTo,
    versionFrom: getAreaVersionLabel(verFrom),
    versionTo: getAreaVersionLabel(verTo),
    deltaBreakdown
  };
}

module.exports = {
  WORK_LOCATION_TO_AREA_CODE,
  InconsistentError,
  round2,
  normalizePayrollMonth,
  getAreaVersionLabel,
  calcSocialInsuranceV2,
  buildMultiDimSummary,
  generateIcbcTxt,
  generateCcbCsv,
  generateAbcTxt,
  generateAbcCsv,
  validateIcbcTxt,
  validateCcbCsv,
  validateAbcTxt,
  validateAbcCsv,
  ICBC_HEADER_REGEX,
  ICBC_ROW_REGEX,
  CCB_HEADER_REGEX,
  CCB_ROW_REGEX,
  ABC_TXT_HEADER_REGEX,
  ABC_TXT_ROW_REGEX,
  ABC_CSV_HEADER_REGEX,
  ABC_CSV_ROW_REGEX,
  buildBaseDeltaTrace
};
