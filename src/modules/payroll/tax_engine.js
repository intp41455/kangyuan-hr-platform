'use strict';

const TAX_BRACKETS = Object.freeze([
  { upperLimit: 36000, rate: 0.03, quickDeduction: 0 },
  { upperLimit: 144000, rate: 0.10, quickDeduction: 2520 },
  { upperLimit: 300000, rate: 0.20, quickDeduction: 16920 },
  { upperLimit: 420000, rate: 0.25, quickDeduction: 31920 },
  { upperLimit: 660000, rate: 0.30, quickDeduction: 52920 },
  { upperLimit: 960000, rate: 0.35, quickDeduction: 85920 },
  { upperLimit: Infinity, rate: 0.45, quickDeduction: 181920 }
]);

const SPECIAL_DEDUCTION_CONFIG = Object.freeze({
  childrenPerChild: 1000,
  mortgage: 1000,
  rentTier1: 1500,
  rentTier2: 1100,
  rentTier3: 800,
  elderlyOnlyChild: 2000,
  continuingEduMonthly: 400,
  continuingEduYearlyCert: 3600,
  infantPerChild: 2000
});

const STANDARD_DEDUCTION_MONTHLY = 5000;

function findTaxBracket(cumulativeTaxableIncome) {
  for (const bracket of TAX_BRACKETS) {
    if (cumulativeTaxableIncome <= bracket.upperLimit) {
      return bracket;
    }
  }
  return TAX_BRACKETS[TAX_BRACKETS.length - 1];
}

function calcCumulativeTax(cumulativeTaxableIncome) {
  if (cumulativeTaxableIncome <= 0) {
    return {
      taxableIncome: 0,
      taxRate: 0,
      quickDeduction: 0,
      cumulativeTax: 0
    };
  }
  const bracket = findTaxBracket(cumulativeTaxableIncome);
  const cumulativeTax = cumulativeTaxableIncome * bracket.rate - bracket.quickDeduction;
  return {
    taxableIncome: cumulativeTaxableIncome,
    taxRate: bracket.rate,
    quickDeduction: bracket.quickDeduction,
    cumulativeTax: Math.max(0, cumulativeTax)
  };
}

function calcSpecialDeductionsMonthlyTotal(specialDeductionsMonthly = {}) {
  const {
    children = 0,
    mortgage = 0,
    rent = 0,
    elderly = 0,
    continuingEdu = 0,
    infant = 0
  } = specialDeductionsMonthly;
  return children + mortgage + rent + elderly + continuingEdu + infant;
}

function calculateMonthlyTax({
  year,
  month,
  monthlyIncome,
  socialTotalMonthly,
  specialDeductionsMonthly = {}
}) {
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`无效的年月参数: year=${year}, month=${month}`);
  }
  if (monthlyIncome === undefined || monthlyIncome === null || monthlyIncome < 0) {
    throw new Error(`月收入必须是非负数, 实际=${monthlyIncome}`);
  }
  if (socialTotalMonthly === undefined || socialTotalMonthly === null || socialTotalMonthly < 0) {
    throw new Error(`社保月度合计必须是非负数, 实际=${socialTotalMonthly}`);
  }

  const currentMonths = month;
  const previousMonths = month - 1;
  const specialDeductionMonthly = calcSpecialDeductionsMonthlyTotal(specialDeductionsMonthly);

  const cumTaxFreeIncome = 0;
  const cumOtherDeduction = 0;

  const cumIncome = monthlyIncome * currentMonths;
  const cumStandardDeduction = STANDARD_DEDUCTION_MONTHLY * currentMonths;
  const cumSocialDeduction = socialTotalMonthly * currentMonths;
  const cumSpecialDeduction = specialDeductionMonthly * currentMonths;
  const cumTaxableIncome = cumIncome - cumTaxFreeIncome - cumStandardDeduction - cumSocialDeduction - cumSpecialDeduction - cumOtherDeduction;

  const currentResult = calcCumulativeTax(cumTaxableIncome);

  let monthlyTax;
  if (previousMonths === 0) {
    monthlyTax = currentResult.cumulativeTax;
  } else {
    const prevCumIncome = monthlyIncome * previousMonths;
    const prevCumStandardDeduction = STANDARD_DEDUCTION_MONTHLY * previousMonths;
    const prevCumSocialDeduction = socialTotalMonthly * previousMonths;
    const prevCumSpecialDeduction = specialDeductionMonthly * previousMonths;
    const prevCumTaxableIncome = prevCumIncome - cumTaxFreeIncome - prevCumStandardDeduction - prevCumSocialDeduction - prevCumSpecialDeduction - cumOtherDeduction;
    const prevResult = calcCumulativeTax(prevCumTaxableIncome);
    monthlyTax = currentResult.cumulativeTax - prevResult.cumulativeTax;
  }

  monthlyTax = Math.max(0, Math.round(monthlyTax * 100) / 100);

  return {
    taxableIncome: Math.max(0, Math.round(cumTaxableIncome * 100) / 100),
    taxRate: currentResult.taxRate,
    quickDeduction: currentResult.quickDeduction,
    monthlyTax,
    cumulativeTax: Math.max(0, Math.round(currentResult.cumulativeTax * 100) / 100)
  };
}

module.exports = {
  TAX_BRACKETS,
  SPECIAL_DEDUCTION_CONFIG,
  STANDARD_DEDUCTION_MONTHLY,
  findTaxBracket,
  calcCumulativeTax,
  calcSpecialDeductionsMonthlyTotal,
  calculateMonthlyTax
};
