class PayrollGradeModel {
  constructor(data = {}) {
    Object.assign(this, {
      id: null,
      gradeCode: null,
      gradeName: null,
      baseSalaryRatio: 0.9,
      performanceRatio: 0.1,
      baseAmount: 0,
      performanceAmount: 0,
      probationRatio: 0.8
    }, data);
    if (this.baseAmount === 0 && this.performanceAmount === 0 && data.totalAmount) {
      this.baseAmount = Math.round(data.totalAmount * this.baseSalaryRatio);
      this.performanceAmount = Math.round(data.totalAmount * this.performanceRatio);
    }
  }

  get totalAmount() {
    return this.baseAmount + this.performanceAmount;
  }

  calcPerformancePay(score) {
    const validScore = Math.max(0, Math.min(100, score));
    return this.performanceAmount * (validScore / 100);
  }

  calcProbationPay() {
    return (this.baseAmount + this.performanceAmount) * this.probationRatio;
  }

  static createCustom(options) {
    const { gradeCode, gradeName, baseSalaryRatio, performanceRatio, totalAmount, probationRatio } = options;
    const baseAmount = Math.round(totalAmount * baseSalaryRatio);
    const performanceAmount = Math.round(totalAmount * performanceRatio);
    return new PayrollGradeModel({
      id: `CUSTOM_${Date.now()}`,
      gradeCode,
      gradeName,
      baseSalaryRatio,
      performanceRatio,
      baseAmount,
      performanceAmount,
      probationRatio: probationRatio || 0.8
    });
  }
}

const PRESET_GRADES = [
  new PayrollGradeModel({
    id: 'PRESET_EXPERT',
    gradeCode: 'EXPERT',
    gradeName: '专家级',
    baseSalaryRatio: 0.9,
    performanceRatio: 0.1,
    baseAmount: 0,
    performanceAmount: 0,
    probationRatio: 0.8
  }),
  new PayrollGradeModel({
    id: 'PRESET_VICE_PRESIDENT',
    gradeCode: 'VICE_PRESIDENT',
    gradeName: '副总级',
    baseSalaryRatio: 0.9,
    performanceRatio: 0.1,
    baseAmount: 10710,
    performanceAmount: 1190,
    probationRatio: 0.8
  }),
  new PayrollGradeModel({
    id: 'PRESET_INTERN',
    gradeCode: 'INTERN',
    gradeName: '实习生',
    baseSalaryRatio: 1.0,
    performanceRatio: 0.0,
    baseAmount: 0,
    performanceAmount: 0,
    probationRatio: 0.8
  }),
  new PayrollGradeModel({
    id: 'PRESET_SOCIAL_ONLY',
    gradeCode: 'SOCIAL_ONLY',
    gradeName: '社保代缴',
    baseSalaryRatio: 0.0,
    performanceRatio: 0.0,
    baseAmount: 0,
    performanceAmount: 0,
    probationRatio: 0.8
  })
];

const GRADE_MAP = {};
PRESET_GRADES.forEach(g => {
  GRADE_MAP[g.gradeCode] = g;
});

function getPresetGrade(gradeCode) {
  return GRADE_MAP[gradeCode] || null;
}

function addCustomGrade(grade) {
  if (grade instanceof PayrollGradeModel && grade.gradeCode) {
    PRESET_GRADES.push(grade);
    GRADE_MAP[grade.gradeCode] = grade;
    return grade;
  }
  return null;
}

module.exports = { PayrollGradeModel, PRESET_GRADES, getPresetGrade, addCustomGrade };
