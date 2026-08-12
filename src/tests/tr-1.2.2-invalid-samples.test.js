'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');

const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function calcIdCardCheckCode(first17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(first17.charAt(i), 10) * ID_CARD_WEIGHTS[i];
  }
  return ID_CARD_CHECK_CODES[sum % 11];
}

function luhnCheck(digitsStr) {
  let sum = 0;
  let alternate = false;
  for (let i = digitsStr.length - 1; i >= 0; i--) {
    let n = parseInt(digitsStr.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function makeValidIdCard(baseNum) {
  const prefix = '110101';
  const year = 1980 + (baseNum % 30);
  const month = String(((baseNum % 12) + 1)).padStart(2, '0');
  const day = String(((baseNum % 27) + 1)).padStart(2, '0');
  const seq = String(baseNum % 1000).padStart(3, '0');
  const first17 = prefix + year + month + day + seq;
  return first17 + calcIdCardCheckCode(first17);
}

function makeValidMobile(baseNum) {
  const tail = String(baseNum).padStart(10, '0');
  return '1' + tail.substring(tail.length - 10);
}

test('TR-1.2.2: 5条非法样本批量导入→对应错误信息正确，不入库（size=0）', async (t) => {
  const registry = new EmployeeRegistry();

  const CORRECT_ID_FIRST17 = '11010119850101006';
  const CORRECT_ID_CHECK = calcIdCardCheckCode(CORRECT_ID_FIRST17);
  const VALID_ID_CARD = CORRECT_ID_FIRST17 + CORRECT_ID_CHECK;
  const WRONG_CHECK_ID_CARD = CORRECT_ID_FIRST17 + '4';

  const CORRECT_LUHN_BANK = '6222021234567890128';
  const WRONG_LUHN_BANK = '6222021234567890123';

  console.log(`  [身份证校验位验证] first17="${CORRECT_ID_FIRST17}" → 正确末位=${CORRECT_ID_CHECK}，完整=${VALID_ID_CARD}`);
  console.log(`  [Luhn验证] 正确=${CORRECT_LUHN_BANK}(Luhn=${luhnCheck(CORRECT_LUHN_BANK)}) 错误=${WRONG_LUHN_BANK}(Luhn=${luhnCheck(WRONG_LUHN_BANK)})`);
  assert.equal(CORRECT_ID_CHECK, '8', `选择的身份证样例末位应为8，实际=${CORRECT_ID_CHECK}`);
  assert.equal(luhnCheck(CORRECT_LUHN_BANK), true, '基准银行卡Luhn应通过');
  assert.equal(luhnCheck(WRONG_LUHN_BANK), false, '错误银行卡Luhn应失败');

  const validBase = {
    name: '合法基准',
    idCard: makeValidIdCard(99),
    mobile: makeValidMobile(13900000001),
    payrollGrade: 'G05',
    entryDate: new Date(2022, 5, 15),
    dept1: '教育事业部',
    bankCard: CORRECT_LUHN_BANK
  };
  console.log(`  [基准校验] 基准ID卡末位校验位=${validBase.idCard.charAt(17)} Luhn通过=${luhnCheck(validBase.bankCard)}`);

  await t.test('5条非法样本构造并导入', () => {
    const invalidSamples = [
      {
        ...validBase,
        name: '身份证末位错',
        idCard: WRONG_CHECK_ID_CARD,
        mobile: makeValidMobile(13910000001),
        _expectErrContains: ['身份证校验位错误', '应为8']
      },
      {
        ...validBase,
        name: '手机号10位',
        idCard: makeValidIdCard(101),
        mobile: '1380000000',
        _expectErrContains: ['手机号长度错误', '应为11位', '实际10位']
      },
      {
        ...validBase,
        name: undefined,
        idCard: makeValidIdCard(102),
        mobile: makeValidMobile(13930000003),
        _expectErrContains: ['必填字段缺失', 'name']
      },
      {
        ...validBase,
        name: 'Luhn校验错',
        idCard: makeValidIdCard(103),
        mobile: makeValidMobile(13940000004),
        bankCard: WRONG_LUHN_BANK,
        _expectErrContains: ['银行卡Luhn校验失败']
      },
      {
        ...validBase,
        name: '薪级+部门缺失',
        idCard: makeValidIdCard(104),
        mobile: makeValidMobile(13950000005),
        payrollGrade: '',
        dept1: null,
        _expectErrContains: ['必填字段缺失', 'payrollGrade', 'dept1']
      }
    ];

    console.log(`  非法样本数=${invalidSamples.length}`);
    const result = registry.importFromArray(invalidSamples);

    console.log(`  [导入结果] success=${result.success}, failed.count=${result.failed.length}`);
    for (const f of result.failed) {
      console.log(`    行${f.row}: ${f.errors.join(' | ')}`);
    }

    assert.equal(result.success, 0, `成功数应为0，实际=${result.success}`);
    assert.equal(result.failed.length, 5, `失败数应为5，实际=${result.failed.length}`);
    assert.equal(registry.size, 0, `registry.size应=0，实际=${registry.size}`);

    for (let i = 0; i < invalidSamples.length; i++) {
      const sample = invalidSamples[i];
      const failedRow = result.failed.find(f => f.row === i + 1);
      assert.ok(failedRow, `第${i + 1}条样本应在failed列表中`);

      const allErrText = failedRow.errors.join(' ');
      for (const expectedSub of sample._expectErrContains) {
        assert.ok(
          allErrText.includes(expectedSub),
          `第${i + 1}条行${failedRow.row}错误信息应包含"${expectedSub}"，实际=${JSON.stringify(failedRow.errors)}`
        );
      }
      console.log(`  ✓ 行${failedRow.row} [${sample.name || 'name缺失'}] 命中期望关键字: ${sample._expectErrContains.join(', ')}`);
    }
  });

  await t.test('单测 validateIdCard / validateMobile / validateBankCard 独立API', () => {
    const r = new EmployeeRegistry();

    const idCard1 = WRONG_CHECK_ID_CARD;
    const errsId = r.validateIdCard(idCard1);
    console.log(`  validateIdCard(${idCard1}) = ${errsId.join(';')}`);
    assert.ok(errsId.length >= 1, '错误的身份证校验位应报错');
    assert.ok(errsId.join(' ').includes('应为8'), `应提示应为8，实际=${errsId.join(' ')}`);

    const idCardCorrect = VALID_ID_CARD;
    const errsIdOk = r.validateIdCard(idCardCorrect);
    console.log(`  validateIdCard(${idCardCorrect}) = ${errsIdOk.length === 0 ? 'OK(无错)' : errsIdOk.join(';')}`);
    assert.equal(errsIdOk.length, 0, '正确的身份证应通过校验');

    const mobile10 = '1380000000';
    const errsMob10 = r.validateMobile(mobile10);
    console.log(`  validateMobile(${mobile10}) = ${errsMob10.join(';')}`);
    assert.ok(errsMob10.length >= 1 && errsMob10.join(' ').includes('10位'), '10位手机号应报错长度');

    const mobileNon1 = '23800000000';
    const errsMob2 = r.validateMobile(mobileNon1);
    console.log(`  validateMobile(${mobileNon1}) = ${errsMob2.join(';')}`);
    assert.ok(errsMob2.length >= 1 && errsMob2.join(' ').includes('1开头'), '非1开头应报错');

    const badLuhn = WRONG_LUHN_BANK;
    const errsLuhn = r.validateBankCard(badLuhn);
    console.log(`  validateBankCard(${badLuhn}) LuhnOK=${luhnCheck(badLuhn)} errors=${errsLuhn.join(';')}`);
    assert.ok(errsLuhn.length >= 1 && errsLuhn.join(' ').includes('Luhn'), 'Luhn失败应报错');

    const goodLuhn = CORRECT_LUHN_BANK;
    const errsLuhnGood = r.validateBankCard(goodLuhn);
    console.log(`  validateBankCard(${goodLuhn}) LuhnOK=${luhnCheck(goodLuhn)} errors=${errsLuhnGood.length === 0 ? 'OK' : errsLuhnGood.join(';')}`);
    assert.equal(errsLuhnGood.length, 0, '正确Luhn银行卡应通过');

    console.log(`  ✓ 独立API校验函数测试通过`);
  });
});
