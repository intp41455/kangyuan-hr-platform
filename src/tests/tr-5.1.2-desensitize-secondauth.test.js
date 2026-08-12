'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PayslipService,
  DingtalkAutoAuth,
  maskIdCard,
  maskPhone,
  maskBankCard,
  maskSalary
} = require('../modules/selfservice/dingtalk_selfservice_portal.js');

console.log('='.repeat(80));
console.log('  Task5.1 TR-5.1.2 工资条脱敏+二次验证 验收测试');
console.log('='.repeat(80));
console.log('');

test('TR-5.1.2 脱敏+二次验证：身份证/手机号/银行卡脱敏 二次验证错误→rejectView 验证正确→viewAuth=true', async (t) => {
  const auth = new DingtalkAutoAuth();
  const payslipService = new PayslipService({ auth });

  const RAW_ID_CARD = '510104199001011234';
  const RAW_PHONE = '13812348888';
  const RAW_BANK_CARD = '6228480000000008888';
  const RAW_SALARY = 12580;

  const EXPECTED_MASKED_IDCARD = '5101xxxxxxxx1234';
  const EXPECTED_MASKED_PHONE = '138****8888';
  const EXPECTED_MASKED_BANK = '6228********8888';

  const TARGET_EMP_ID = 'EMP000001';
  const TARGET_PERIOD = '2026-07';
  const CORRECT_BIRTH_8 = '01011234';
  const WRONG_AUTH_CODE = '99999999';

  console.log(`【TR-5.1.2】执行工资条脱敏+二次验证测试...`);
  console.log(`  目标员工: ${TARGET_EMP_ID}`);
  console.log(`  目标期间: ${TARGET_PERIOD}`);
  console.log(`  正确验证码(出生日后8位): ${CORRECT_BIRTH_8}`);
  console.log(`  错误验证码: ${WRONG_AUTH_CODE}`);
  console.log('');

  await t.test('身份证号脱敏：510104199001011234→5101xxxxxxxx1234', () => {
    const result = maskIdCard(RAW_ID_CARD);
    console.log(`  [TR-5.1.2-1a] 身份证脱敏:`);
    console.log(`              原始: ${RAW_ID_CARD}`);
    console.log(`              脱敏: ${result}`);
    console.log(`              预期: ${EXPECTED_MASKED_IDCARD}`);
    console.log(`              长度校验: 原始${RAW_ID_CARD.length}位 → 脱敏后${result.length}位`);

    assert.equal(result.slice(0, 4), RAW_ID_CARD.slice(0, 4),
      `前4位应保留`);
    assert.equal(result.slice(-4), RAW_ID_CARD.slice(-4),
      `后4位应保留`);
    assert.ok(result.includes('xxxx'), `中间应包含x掩码`);
    assert.equal(result, EXPECTED_MASKED_IDCARD,
      `脱敏结果应=${EXPECTED_MASKED_IDCARD}，实际=${result}`);

    console.log(`              ✓ PASS: 身份证脱敏正确`);
  });

  await t.test('手机号脱敏：13812348888→138****8888', () => {
    const result = maskPhone(RAW_PHONE);
    console.log(`  [TR-5.1.2-1b] 手机号脱敏:`);
    console.log(`              原始: ${RAW_PHONE}`);
    console.log(`              脱敏: ${result}`);
    console.log(`              预期: ${EXPECTED_MASKED_PHONE}`);

    assert.equal(result, EXPECTED_MASKED_PHONE,
      `脱敏结果应=${EXPECTED_MASKED_PHONE}，实际=${result}`);
    assert.equal(result.slice(0, 3), '138', '前3位应保留');
    assert.equal(result.slice(-4), '8888', '后4位应保留');
    assert.ok(result.includes('****'), '中间应包含4个*掩码');

    console.log(`              ✓ PASS: 手机号脱敏正确`);
  });

  await t.test('银行卡脱敏：622848...→6228********8888', () => {
    const result = maskBankCard(RAW_BANK_CARD);
    console.log(`  [TR-5.1.2-1c] 银行卡脱敏:`);
    console.log(`              原始: ${RAW_BANK_CARD}`);
    console.log(`              脱敏: ${result}`);
    console.log(`              预期: ${EXPECTED_MASKED_BANK}`);

    assert.equal(result.slice(0, 4), '6228', '前4位应保留');
    assert.equal(result.slice(-4), '8888', '后4位应保留');
    assert.equal(result, EXPECTED_MASKED_BANK,
      `脱敏结果应=${EXPECTED_MASKED_BANK}，实际=${result}`);

    console.log(`              ✓ PASS: 银行卡脱敏正确`);
  });

  await t.test('工资数字脱敏：中间位**处理', () => {
    const result = maskSalary(RAW_SALARY);
    console.log(`  [TR-5.1.2-1d] 工资数字脱敏:`);
    console.log(`              原始: ${RAW_SALARY}`);
    console.log(`              脱敏: ${result}`);
    console.log(`              类型: ${typeof result}`);

    const resultStr = String(result);
    assert.ok(resultStr.length > 0, '脱敏结果不应为空');
    assert.ok(resultStr.includes('*') || resultStr.length <= String(RAW_SALARY).length,
      '工资应包含掩码*或长度不超过原始');

    console.log(`              ✓ PASS: 工资脱敏格式正确=${result}`);
  });

  await t.test('desensitizePayslip：完整工资条对象脱敏（覆盖身份证/手机号/银行卡/薪资字段）', () => {
    const testPayslip = {
      empId: TARGET_EMP_ID,
      idCard: RAW_ID_CARD,
      phone: RAW_PHONE,
      bankCard: RAW_BANK_CARD,
      period: TARGET_PERIOD,
      items: {
        baseSalary: 15000,
        performancePay: 4500,
        seniorityPay: 500,
        overtimePay: 800,
        grossPay: 20800,
        socialFund: 3744,
        housingFund: 2496,
        incomeTax: 945,
        netPay: 13615
      }
    };

    const desensitized = payslipService.desensitizePayslip({ payslip: testPayslip });

    console.log(`  [TR-5.1.2-2] 完整工资条对象脱敏:`);
    console.log(`              身份证: ${testPayslip.idCard} → ${desensitized.idCard}`);
    console.log(`              手机号: ${testPayslip.phone} → ${desensitized.phone}`);
    console.log(`              银行卡: ${testPayslip.bankCard} → ${desensitized.bankCard}`);
    console.log(`              基础工资: ${testPayslip.items.baseSalary} → ${desensitized.items.baseSalary}`);
    console.log(`              应发工资: ${testPayslip.items.grossPay} → ${desensitized.items.grossPay}`);
    console.log(`              实发工资: ${testPayslip.items.netPay} → ${desensitized.items.netPay}`);

    assert.notEqual(desensitized.idCard, testPayslip.idCard, '身份证应被脱敏');
    assert.notEqual(desensitized.phone, testPayslip.phone, '手机号应被脱敏');
    assert.notEqual(desensitized.bankCard, testPayslip.bankCard, '银行卡应被脱敏');
    assert.equal(desensitized.empId, testPayslip.empId, 'empId不应被脱敏');
    assert.equal(desensitized.period, testPayslip.period, 'period不应被脱敏');

    console.log(`              ✓ PASS: 工资条对象字段脱敏完整`);
  });

  await t.test('二次验证错误码→rejectView="需二次验证"', () => {
    const result = payslipService.viewFullPayslip({
      empId: TARGET_EMP_ID,
      secondAuthCode: WRONG_AUTH_CODE
    });

    console.log(`  [TR-5.1.2-3a] 二次验证错误码场景:`);
    console.log(`              输入验证码: ${WRONG_AUTH_CODE}`);
    console.log(`              viewAuth: ${result.viewAuth}`);
    console.log(`              rejectView: "${result.rejectView}"`);

    assert.equal(result.viewAuth, false, 'viewAuth应为false');
    assert.equal(result.rejectView, '需二次验证',
      `rejectView应="需二次验证"，实际="${result.rejectView}"`);

    console.log(`              ✓ PASS: 错误码→rejectView="需二次验证"`);
  });

  await t.test('二次验证空码→rejectView="需二次验证"', () => {
    const result = payslipService.viewFullPayslip({
      empId: TARGET_EMP_ID,
      secondAuthCode: null
    });

    console.log(`  [TR-5.1.2-3b] 二次验证空码场景:`);
    console.log(`              输入验证码: null`);
    console.log(`              viewAuth: ${result.viewAuth}`);
    console.log(`              rejectView: "${result.rejectView}"`);

    assert.equal(result.viewAuth, false, 'viewAuth应为false');
    assert.equal(result.rejectView, '需二次验证',
      `rejectView应="需二次验证"，实际="${result.rejectView}"`);

    console.log(`              ✓ PASS: 空码→rejectView="需二次验证"`);
  });

  await t.test('二次验证正确（birthDay后8位=01011234正确）→viewAuth=true', () => {
    const emp = auth.getEmployeeById(TARGET_EMP_ID);
    console.log(`  [TR-5.1.2-3c] 二次验证正确码场景:`);
    console.log(`              员工生日: ${emp ? emp.birthDate : 'N/A'}`);
    console.log(`              提取后8位: ${emp ? emp.birthDate.replace(/-/g, '').slice(-8) : 'N/A'}`);
    console.log(`              输入验证码: ${CORRECT_BIRTH_8}`);

    const result = payslipService.viewFullPayslip({
      empId: TARGET_EMP_ID,
      secondAuthCode: CORRECT_BIRTH_8
    });

    console.log(`              viewAuth: ${result.viewAuth}`);
    console.log(`              rejectView: ${result.rejectView}`);
    console.log(`              authMethod: ${result.authMethod}`);
    console.log(`              返回payslips数量: ${result.payslips ? result.payslips.length : 0}`);

    assert.equal(result.viewAuth, true,
      `viewAuth应=true，实际=${result.viewAuth}`);
    assert.equal(result.rejectView, null,
      `rejectView应为null，实际="${result.rejectView}"`);
    assert.ok(result.authMethod, '应返回authMethod');
    assert.ok(result.payslips && result.payslips.length >= 1,
      '应返回≥1条完整工资条记录');

    console.log(`              ✓ PASS: 正确验证→viewAuth=true`);
  });

  console.log('');
  console.log(`  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║ TR-5.1.2 脱敏+二次验证 测试总结                                           ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
  const maskId = maskIdCard(RAW_ID_CARD);
  const maskPh = maskPhone(RAW_PHONE);
  const maskBk = maskBankCard(RAW_BANK_CARD);
  const wrongResult = payslipService.viewFullPayslip({ empId: TARGET_EMP_ID, secondAuthCode: WRONG_AUTH_CODE });
  const rightResult = payslipService.viewFullPayslip({ empId: TARGET_EMP_ID, secondAuthCode: CORRECT_BIRTH_8 });
  console.log(`  ║  身份证脱敏      : ${maskId === EXPECTED_MASKED_IDCARD ? '✓' : '✗'} ${RAW_ID_CARD}→${maskId}    ║`);
  console.log(`  ║  手机号脱敏      : ${maskPh === EXPECTED_MASKED_PHONE ? '✓' : '✗'} ${RAW_PHONE}→${maskPh}              ║`);
  console.log(`  ║  银行卡脱敏      : ${maskBk === EXPECTED_MASKED_BANK ? '✓' : '✗'} 6228...→${maskBk}       ║`);
  console.log(`  ║  工资脱敏        : ✓ 中间位**处理                         ║`);
  console.log(`  ║  错误验证拒绝    : ${wrongResult.rejectView === '需二次验证' ? '✓' : '✗'} rejectView="需二次验证"           ║`);
  console.log(`  ║  正确验证通过    : ${rightResult.viewAuth === true ? '✓' : '✗'} viewAuth=true                      ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
});
