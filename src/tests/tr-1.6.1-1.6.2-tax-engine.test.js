'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateMonthlyTax,
  calcCumulativeTax
} = require('../modules/payroll/tax_engine.js');

test('TR-1.6.1: 2026年1月，月入10000，社保1500，无专项附加→本月个税=105元', async (t) => {
  await t.test('累计应纳税所得额=10000-5000-1500=3500', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 1,
      monthlyIncome: 10000,
      socialTotalMonthly: 1500,
      specialDeductionsMonthly: {
        children: 0,
        mortgage: 0,
        rent: 0,
        elderly: 0,
        continuingEdu: 0,
        infant: 0
      }
    });
    assert.equal(result.taxableIncome, 3500, `累计应纳税所得额应为3500，实际=${result.taxableIncome}`);
  });

  await t.test('3500适用3%税率，速算扣除数0', () => {
    const cumResult = calcCumulativeTax(3500);
    assert.equal(cumResult.taxRate, 0.03, `税率应为3%，实际=${cumResult.taxRate}`);
    assert.equal(cumResult.quickDeduction, 0, `速算扣除数应为0，实际=${cumResult.quickDeduction}`);
  });

  await t.test('本月个税=3500×3%=105元', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 1,
      monthlyIncome: 10000,
      socialTotalMonthly: 1500,
      specialDeductionsMonthly: {}
    });
    assert.equal(result.taxRate, 0.03, `税率应为3%，实际=${result.taxRate}`);
    assert.equal(result.quickDeduction, 0, `速算扣除数应为0，实际=${result.quickDeduction}`);
    assert.equal(result.monthlyTax, 105, `本月个税应为105元，实际=${result.monthlyTax}`);
    assert.equal(result.cumulativeTax, 105, `累计个税应为105元，实际=${result.cumulativeTax}`);
  });

  await t.test('省略specialDeductionsMonthly参数默认为0，结果一致', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 1,
      monthlyIncome: 10000,
      socialTotalMonthly: 1500
    });
    assert.equal(result.monthlyTax, 105, `省略专项附加时本月个税应为105元，实际=${result.monthlyTax}`);
  });
});

test('TR-1.6.2: 2026年3月，月入50000，社保5000/月，专项附加5000/月→本月个税精确计算', async (t) => {
  const specialDeductionsMonthly = {
    children: 2000,
    mortgage: 1000,
    rent: 0,
    elderly: 2000,
    continuingEdu: 0,
    infant: 0
  };

  await t.test('专项附加合计=子女2000+房贷1000+赡养2000=5000/月', () => {
    const total = 2000 + 1000 + 0 + 2000 + 0 + 0;
    assert.equal(total, 5000, `专项附加月度合计应为5000，实际=${total}`);
  });

  await t.test('第1个月：累计应纳税所得额=50000-5000-5000-5000=35000→3%→个税1050', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 1,
      monthlyIncome: 50000,
      socialTotalMonthly: 5000,
      specialDeductionsMonthly
    });
    assert.equal(result.taxableIncome, 35000, `第1月累计应纳税所得额应为35000，实际=${result.taxableIncome}`);
    assert.equal(result.taxRate, 0.03, `第1月税率应为3%，实际=${result.taxRate}`);
    assert.equal(result.quickDeduction, 0, `第1月速算扣除数应为0，实际=${result.quickDeduction}`);
    assert.equal(result.monthlyTax, 1050, `第1月本月个税应为1050元，实际=${result.monthlyTax}`);
    assert.equal(result.cumulativeTax, 1050, `第1月累计个税应为1050元，实际=${result.cumulativeTax}`);
  });

  await t.test('第2个月：累计=100000-10000-10000-10000=70000→10%-2520=4480→本月=4480-1050=3430', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 2,
      monthlyIncome: 50000,
      socialTotalMonthly: 5000,
      specialDeductionsMonthly
    });
    assert.equal(result.taxableIncome, 70000, `第2月累计应纳税所得额应为70000，实际=${result.taxableIncome}`);
    assert.equal(result.taxRate, 0.10, `第2月税率应为10%，实际=${result.taxRate}`);
    assert.equal(result.quickDeduction, 2520, `第2月速算扣除数应为2520，实际=${result.quickDeduction}`);
    assert.equal(result.cumulativeTax, 4480, `第2月累计个税应为4480元，实际=${result.cumulativeTax}`);
    assert.equal(result.monthlyTax, 3430, `第2月本月个税应为3430元(4480-1050)，实际=${result.monthlyTax}`);
  });

  await t.test('第3个月：累计=150000-15000-15000-15000=105000→10%-2520=7980→本月=7980-4480=3500', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 3,
      monthlyIncome: 50000,
      socialTotalMonthly: 5000,
      specialDeductionsMonthly
    });
    assert.equal(result.taxableIncome, 105000, `第3月累计应纳税所得额应为105000，实际=${result.taxableIncome}`);
    assert.equal(result.taxRate, 0.10, `第3月税率应为10%，实际=${result.taxRate}`);
    assert.equal(result.quickDeduction, 2520, `第3月速算扣除数应为2520，实际=${result.quickDeduction}`);
    assert.equal(result.cumulativeTax, 7980, `第3月累计个税应为7980元，实际=${result.cumulativeTax}`);
    assert.equal(result.monthlyTax, 3500, `第3月本月个税应为3500元(7980-4480)，实际=${result.monthlyTax}`);
  });

  await t.test('税务局标准模拟：累计3月105000×10%-2520-前2月4480=本月3500，误差≤1元', () => {
    const result = calculateMonthlyTax({
      year: 2026,
      month: 3,
      monthlyIncome: 50000,
      socialTotalMonthly: 5000,
      specialDeductionsMonthly
    });
    const expectedMonthlyTax = 3500;
    const diff = Math.abs(result.monthlyTax - expectedMonthlyTax);
    assert.ok(diff <= 1, `本月个税误差=${diff}元，应≤1元。实际本月个税=${result.monthlyTax}，预期=${expectedMonthlyTax}`);
    assert.equal(result.monthlyTax, expectedMonthlyTax, `本月个税精确值应为3500元，实际=${result.monthlyTax}`);
  });

  await t.test('前3个月个税合计=1050+3430+3500=7980=累计个税', () => {
    const m1 = calculateMonthlyTax({ year: 2026, month: 1, monthlyIncome: 50000, socialTotalMonthly: 5000, specialDeductionsMonthly }).monthlyTax;
    const m2 = calculateMonthlyTax({ year: 2026, month: 2, monthlyIncome: 50000, socialTotalMonthly: 5000, specialDeductionsMonthly }).monthlyTax;
    const m3 = calculateMonthlyTax({ year: 2026, month: 3, monthlyIncome: 50000, socialTotalMonthly: 5000, specialDeductionsMonthly });
    const sumMonthly = m1 + m2 + m3.monthlyTax;
    assert.equal(sumMonthly, 7980, `前3月本月个税合计=1050+3430+3500=7980，实际=${sumMonthly}`);
    assert.equal(sumMonthly, m3.cumulativeTax, `前3月本月个税合计应等于第3月累计个税，实际月度合计=${sumMonthly}，累计=${m3.cumulativeTax}`);
  });
});
