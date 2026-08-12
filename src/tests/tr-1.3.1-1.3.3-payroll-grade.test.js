'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PayrollGradeModel, getPresetGrade, addCustomGrade } = require('../modules/master_data/payroll_grade_model.js');

test('TR-1.3.1: 副总级 绩效100分→1190元；90分→1071元；80分→952元', async (t) => {
  await t.test('验证副总级预置薪级字段完整性', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    assert.ok(vicePresident, '副总级薪级应存在');
    assert.equal(vicePresident.gradeCode, 'VICE_PRESIDENT');
    assert.equal(vicePresident.gradeName, '副总级');
    assert.equal(vicePresident.baseSalaryRatio, 0.9);
    assert.equal(vicePresident.performanceRatio, 0.1);
    assert.equal(vicePresident.baseAmount, 10710);
    assert.equal(vicePresident.performanceAmount, 1190);
    assert.equal(vicePresident.probationRatio, 0.8);
    assert.equal(vicePresident.totalAmount, 11900, '副总级标准总薪资=10710+1190=11900元');
  });

  await t.test('副总级绩效100分→1190元', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    const pay = vicePresident.calcPerformancePay(100);
    assert.equal(pay, 1190, `绩效100分应为1190元，实际=${pay}元`);
  });

  await t.test('副总级绩效90分→1071元', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    const pay = vicePresident.calcPerformancePay(90);
    assert.equal(pay, 1071, `绩效90分应为1071元，实际=${pay}元`);
  });

  await t.test('副总级绩效80分→952元', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    const pay = vicePresident.calcPerformancePay(80);
    assert.equal(pay, 952, `绩效80分应为952元，实际=${pay}元`);
  });

  await t.test('绩效分数边界：0分→0元；超100分按100算；负分按0算', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    assert.equal(vicePresident.calcPerformancePay(0), 0);
    assert.equal(vicePresident.calcPerformancePay(120), 1190);
    assert.equal(vicePresident.calcPerformancePay(-10), 0);
  });
});

test('TR-1.3.2: 副总级试用期工资=11900×80%=9520元(精确)', async (t) => {
  await t.test('试用期工资精确计算', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    const probationPay = vicePresident.calcProbationPay();
    assert.equal(probationPay, 9520, `试用期工资应为9520元，实际=${probationPay}元`);
  });

  await t.test('试用期工资计算逻辑验证：(基础+绩效)×试用比例', () => {
    const vicePresident = getPresetGrade('VICE_PRESIDENT');
    const expected = (vicePresident.baseAmount + vicePresident.performanceAmount) * vicePresident.probationRatio;
    assert.equal(vicePresident.calcProbationPay(), expected);
    assert.equal(expected, 9520);
  });

  await t.test('其他预置薪级试用期比例默认80%', () => {
    const expert = getPresetGrade('EXPERT');
    const intern = getPresetGrade('INTERN');
    const social = getPresetGrade('SOCIAL_ONLY');
    assert.equal(expert.probationRatio, 0.8);
    assert.equal(intern.probationRatio, 0.8);
    assert.equal(social.probationRatio, 0.8);
  });
});

test('TR-1.3.3: 自定义8:2业务岗(基数10000=8000基础+2000绩效)→100分绩效=2000元', async (t) => {
  await t.test('createCustom 创建8:2业务岗', () => {
    const businessGrade = PayrollGradeModel.createCustom({
      gradeCode: 'BUSINESS_8_2',
      gradeName: '业务岗(8:2)',
      baseSalaryRatio: 0.8,
      performanceRatio: 0.2,
      totalAmount: 10000
    });
    assert.equal(businessGrade.gradeCode, 'BUSINESS_8_2');
    assert.equal(businessGrade.gradeName, '业务岗(8:2)');
    assert.equal(businessGrade.baseSalaryRatio, 0.8);
    assert.equal(businessGrade.performanceRatio, 0.2);
    assert.equal(businessGrade.baseAmount, 8000, '基础薪资应为8000元');
    assert.equal(businessGrade.performanceAmount, 2000, '绩效薪资应为2000元');
    assert.equal(businessGrade.totalAmount, 10000, '总薪资应为10000元');
  });

  await t.test('8:2业务岗 100分绩效=2000元', () => {
    const businessGrade = PayrollGradeModel.createCustom({
      gradeCode: 'BUSINESS_8_2',
      gradeName: '业务岗(8:2)',
      baseSalaryRatio: 0.8,
      performanceRatio: 0.2,
      totalAmount: 10000
    });
    const pay = businessGrade.calcPerformancePay(100);
    assert.equal(pay, 2000, `100分绩效应为2000元，实际=${pay}元`);
  });

  await t.test('8:2业务岗 其他分数验证', () => {
    const businessGrade = PayrollGradeModel.createCustom({
      gradeCode: 'BUSINESS_8_2',
      gradeName: '业务岗(8:2)',
      baseSalaryRatio: 0.8,
      performanceRatio: 0.2,
      totalAmount: 10000
    });
    assert.equal(businessGrade.calcPerformancePay(90), 1800);
    assert.equal(businessGrade.calcPerformancePay(50), 1000);
    assert.equal(businessGrade.calcPerformancePay(0), 0);
  });

  await t.test('addCustomGrade 注册自定义薪级到全局', () => {
    const businessGrade = PayrollGradeModel.createCustom({
      gradeCode: 'BUSINESS_8_2_SALES',
      gradeName: '销售岗(8:2)',
      baseSalaryRatio: 0.8,
      performanceRatio: 0.2,
      totalAmount: 10000
    });
    const added = addCustomGrade(businessGrade);
    assert.ok(added, '添加自定义薪级应成功');
    const found = getPresetGrade('BUSINESS_8_2_SALES');
    assert.ok(found, '通过getPresetGrade应能查找到注册的自定义薪级');
    assert.equal(found.gradeName, '销售岗(8:2)');
  });

  await t.test('8:2业务岗试用期工资=10000×80%=8000元', () => {
    const businessGrade = PayrollGradeModel.createCustom({
      gradeCode: 'BUSINESS_8_2',
      gradeName: '业务岗(8:2)',
      baseSalaryRatio: 0.8,
      performanceRatio: 0.2,
      totalAmount: 10000
    });
    const probationPay = businessGrade.calcProbationPay();
    assert.equal(probationPay, 8000, `试用期工资应为8000元，实际=${probationPay}元`);
  });
});
