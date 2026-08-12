'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SocialInsuranceAreaModel,
  findAreaVersion,
  getAllAreaVersions,
  PRESET_XIAN_JULY,
  PRESET_XIAN_AUG,
  PRESET_TIANSHUI,
  PRESET_BAIYIN,
  PRESET_PINGLIANG,
  PRESET_LANZHOU
} = require('../modules/master_data/social_insurance_model.js');

test('TR-1.4.1: 西安2026-07→医保基数4990；2026-08→医保基数5132', async (t) => {
  await t.test('findAreaVersion 匹配西安7月版本 (effectiveDate <= 2026-07-15)', () => {
    const ver = findAreaVersion('XA', '2026-07-15');
    assert.ok(ver, '西安7月版本应存在');
    assert.equal(ver.areaCode, 'XA');
    assert.equal(ver.areaName, '西安');
    assert.equal(ver.baseLowerLimit, 4990, '西安7月基数下限应为4990');
    assert.deepEqual(ver.effectiveDate, new Date('2026-07-01T00:00:00'));
  });

  await t.test('西安7月：工资低于下限→基数取下限4990，医保=4990×2%=99.8', () => {
    const ver = findAreaVersion('XA', '2026-07-31');
    const salary = 4000;
    const result = ver.calcSocialInsurance(salary, '2026-07-31');
    assert.equal(result.base, 4990, `西安7月基数应为4990（下限），实际=${result.base}`);
    assert.equal(result.medical, 4990 * 0.02, `西安7月医保=4990×2%=99.8，实际=${result.medical}`);
    assert.equal(result.medical, 99.8);
  });

  await t.test('findAreaVersion 匹配西安8月版本 (effectiveDate <= 2026-08-01)', () => {
    const ver = findAreaVersion('XA', '2026-08-01');
    assert.ok(ver, '西安8月版本应存在');
    assert.equal(ver.baseLowerLimit, 5132, '西安8月基数下限应为5132');
    assert.deepEqual(ver.effectiveDate, new Date('2026-08-01T00:00:00'));
  });

  await t.test('西安8月：工资低于下限→基数取下限5132，医保=5132×2%=102.64', () => {
    const ver = findAreaVersion('XA', '2026-08-15');
    const salary = 4000;
    const result = ver.calcSocialInsurance(salary, '2026-08-15');
    assert.equal(result.base, 5132, `西安8月基数应为5132（下限），实际=${result.base}`);
    assert.equal(result.medical, 5132 * 0.02, `西安8月医保=5132×2%=102.64，实际=${result.medical}`);
    assert.equal(result.medical, 102.64);
  });

  await t.test('西安 getAllAreaVersions 应返回2个版本并按生效日期排序', () => {
    const versions = getAllAreaVersions('XA');
    assert.equal(versions.length, 2, '西安应有2个版本');
    assert.ok(versions[0].effectiveDate.getTime() < versions[1].effectiveDate.getTime(), '版本按生效日期升序排列');
    assert.equal(versions[0].baseLowerLimit, 4990);
    assert.equal(versions[1].baseLowerLimit, 5132);
  });

  await t.test('跨版本边界：2026-07-31仍取7月版本；2026-08-01取8月版本', () => {
    const vJul = findAreaVersion('XA', '2026-07-31');
    const vAug = findAreaVersion('XA', '2026-08-01');
    assert.equal(vJul.baseLowerLimit, 4990);
    assert.equal(vAug.baseLowerLimit, 5132);
  });
});

test('TR-1.4.2: 西安8月公积金比例10%基数10000→公积金个人=1000，大额医疗补=8', async (t) => {
  await t.test('西安8月公积金比例字段应为0.10（10%）', () => {
    const ver = findAreaVersion('XA', '2026-08-15');
    assert.equal(ver.housingFundRatio, 0.10, `西安8月公积金比例应为10%，实际=${ver.housingFundRatio}`);
    assert.equal(ver.bigMedicalSupplement, 8, `西安大额医疗补应为8元，实际=${ver.bigMedicalSupplement}`);
  });

  await t.test('工资10000在上下限之间→基数=10000', () => {
    const ver = findAreaVersion('XA', '2026-08-31');
    const salary = 10000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    assert.equal(result.base, 10000, `基数应为10000，实际=${result.base}`);
  });

  await t.test('基数10000×公积金10%=1000元；大额医疗补=8元', () => {
    const ver = findAreaVersion('XA', '2026-08-31');
    const salary = 10000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    assert.equal(result.housingFund, 1000, `公积金个人应为1000元，实际=${result.housingFund}`);
    assert.equal(result.bigMedicalSupplement, 8, `大额医疗补应为8元，实际=${result.bigMedicalSupplement}`);
  });

  await t.test('各项明细：养老800+失业30+医疗200+大额8+公积金1000=2038', () => {
    const ver = findAreaVersion('XA', '2026-08-31');
    const salary = 10000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    assert.equal(result.pension, 800);
    assert.equal(result.unemployment, 30);
    assert.equal(result.medical, 200);
    assert.equal(result.bigMedicalSupplement, 8);
    assert.equal(result.housingFund, 1000);
    assert.equal(result.total, 2038, `合计应为2038元，实际=${result.total}`);
  });

  await t.test('公积金比例校验：仅允许0.08/0.10/0.12，其他值抛错', () => {
    assert.throws(() => {
      new SocialInsuranceAreaModel({ housingFundRatio: 0.15 });
    }, /公积金比例必须是0.08\/0.10\/0.12之一/);
    assert.throws(() => {
      const m = new SocialInsuranceAreaModel();
      m.setHousingFundRatio(0.05);
    }, /公积金比例必须是0.08\/0.10\/0.12之一/);
  });
});

test('TR-1.4.3: 5地各抽1人社保五险+公积金+大额合计与人工计算误差≤0.01元', async (t) => {
  await t.test('天水：基数7000（取下限），养老560+失业21+医疗140+大额5+公积金560=1286', () => {
    const ver = findAreaVersion('TS', '2026-08-31');
    assert.equal(ver.areaName, '天水');
    assert.equal(ver.baseLowerLimit, 7000);
    const salary = 5000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    const expectedPension = 7000 * 0.08;
    const expectedUnemployment = 7000 * 0.003;
    const expectedMedical = 7000 * 0.02;
    const expectedBigMedical = 5;
    const expectedHousingFund = 7000 * 0.08;
    const expectedTotal = expectedPension + expectedUnemployment + expectedMedical + expectedBigMedical + expectedHousingFund;
    assert.equal(result.base, 7000);
    assert.equal(result.pension, expectedPension);
    assert.equal(result.unemployment, expectedUnemployment);
    assert.equal(result.medical, expectedMedical);
    assert.equal(result.bigMedicalSupplement, expectedBigMedical);
    assert.equal(result.housingFund, expectedHousingFund);
    assert.ok(Math.abs(result.total - expectedTotal) <= 0.01, `天水合计误差=${Math.abs(result.total - expectedTotal)}应≤0.01`);
    assert.equal(result.total, 1286, `天水合计应为1286，实际=${result.total}`);
  });

  await t.test('白银：基数6500（取下限），养老520+失业19.5+医疗130+大额5+公积金520=1194.5', () => {
    const ver = findAreaVersion('BY', '2026-08-31');
    assert.equal(ver.areaName, '白银');
    assert.equal(ver.baseLowerLimit, 6500);
    const salary = 5000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    const expectedPension = 6500 * 0.08;
    const expectedUnemployment = 6500 * 0.003;
    const expectedMedical = 6500 * 0.02;
    const expectedBigMedical = 5;
    const expectedHousingFund = 6500 * 0.08;
    const expectedTotal = expectedPension + expectedUnemployment + expectedMedical + expectedBigMedical + expectedHousingFund;
    assert.equal(result.base, 6500);
    assert.equal(result.pension, expectedPension);
    assert.equal(result.unemployment, expectedUnemployment);
    assert.equal(result.medical, expectedMedical);
    assert.equal(result.bigMedicalSupplement, expectedBigMedical);
    assert.equal(result.housingFund, expectedHousingFund);
    assert.ok(Math.abs(result.total - expectedTotal) <= 0.01, `白银合计误差=${Math.abs(result.total - expectedTotal)}应≤0.01`);
    assert.equal(result.total, 1194.5, `白银合计应为1194.5，实际=${result.total}`);
  });

  await t.test('平凉：基数6000（取下限），养老480+失业18+医疗120+大额5+公积金480=1103', () => {
    const ver = findAreaVersion('PL', '2026-08-31');
    assert.equal(ver.areaName, '平凉');
    assert.equal(ver.baseLowerLimit, 6000);
    const salary = 5000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    const expectedPension = 6000 * 0.08;
    const expectedUnemployment = 6000 * 0.003;
    const expectedMedical = 6000 * 0.02;
    const expectedBigMedical = 5;
    const expectedHousingFund = 6000 * 0.08;
    const expectedTotal = expectedPension + expectedUnemployment + expectedMedical + expectedBigMedical + expectedHousingFund;
    assert.equal(result.base, 6000);
    assert.equal(result.pension, expectedPension);
    assert.equal(result.unemployment, expectedUnemployment);
    assert.equal(result.medical, expectedMedical);
    assert.equal(result.bigMedicalSupplement, expectedBigMedical);
    assert.equal(result.housingFund, expectedHousingFund);
    assert.ok(Math.abs(result.total - expectedTotal) <= 0.01, `平凉合计误差=${Math.abs(result.total - expectedTotal)}应≤0.01`);
    assert.equal(result.total, 1103, `平凉合计应为1103，实际=${result.total}`);
  });

  await t.test('兰州：基数7500（取下限），养老600+失业22.5+医疗150+大额5+公积金600=1377.5', () => {
    const ver = findAreaVersion('LZ', '2026-08-31');
    assert.equal(ver.areaName, '兰州');
    assert.equal(ver.baseLowerLimit, 7500);
    const salary = 5000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    const expectedPension = 7500 * 0.08;
    const expectedUnemployment = 7500 * 0.003;
    const expectedMedical = 7500 * 0.02;
    const expectedBigMedical = 5;
    const expectedHousingFund = 7500 * 0.08;
    const expectedTotal = expectedPension + expectedUnemployment + expectedMedical + expectedBigMedical + expectedHousingFund;
    assert.equal(result.base, 7500);
    assert.equal(result.pension, expectedPension);
    assert.equal(result.unemployment, expectedUnemployment);
    assert.equal(result.medical, expectedMedical);
    assert.equal(result.bigMedicalSupplement, expectedBigMedical);
    assert.equal(result.housingFund, expectedHousingFund);
    assert.ok(Math.abs(result.total - expectedTotal) <= 0.01, `兰州合计误差=${Math.abs(result.total - expectedTotal)}应≤0.01`);
    assert.equal(result.total, 1377.5, `兰州合计应为1377.5，实际=${result.total}`);
  });

  await t.test('西安8月：基数10000（区间内），养老800+失业30+医疗200+大额8+公积金1000=2038', () => {
    const ver = findAreaVersion('XA', '2026-08-31');
    assert.equal(ver.areaName, '西安');
    const salary = 10000;
    const result = ver.calcSocialInsurance(salary, '2026-08-31');
    const expectedPension = 10000 * 0.08;
    const expectedUnemployment = 10000 * 0.003;
    const expectedMedical = 10000 * 0.02;
    const expectedBigMedical = 8;
    const expectedHousingFund = 10000 * 0.10;
    const expectedTotal = expectedPension + expectedUnemployment + expectedMedical + expectedBigMedical + expectedHousingFund;
    assert.equal(result.base, 10000);
    assert.equal(result.pension, expectedPension);
    assert.equal(result.unemployment, expectedUnemployment);
    assert.equal(result.medical, expectedMedical);
    assert.equal(result.bigMedicalSupplement, expectedBigMedical);
    assert.equal(result.housingFund, expectedHousingFund);
    assert.ok(Math.abs(result.total - expectedTotal) <= 0.01, `西安8月合计误差=${Math.abs(result.total - expectedTotal)}应≤0.01`);
    assert.equal(result.total, 2038, `西安8月合计应为2038，实际=${result.total}`);
  });

  await t.test('5地5人总计人工校验：1286+1194.5+1103+1377.5+2038=6999', () => {
    const ts = findAreaVersion('TS', '2026-08-31').calcSocialInsurance(5000, '2026-08-31').total;
    const by = findAreaVersion('BY', '2026-08-31').calcSocialInsurance(5000, '2026-08-31').total;
    const pl = findAreaVersion('PL', '2026-08-31').calcSocialInsurance(5000, '2026-08-31').total;
    const lz = findAreaVersion('LZ', '2026-08-31').calcSocialInsurance(5000, '2026-08-31').total;
    const xa = findAreaVersion('XA', '2026-08-31').calcSocialInsurance(10000, '2026-08-31').total;
    const sum = ts + by + pl + lz + xa;
    const expectedSum = 1286 + 1194.5 + 1103 + 1377.5 + 2038;
    assert.equal(expectedSum, 6999);
    assert.ok(Math.abs(sum - expectedSum) <= 0.01, `5地合计误差=${Math.abs(sum - expectedSum)}应≤0.01`);
    assert.equal(sum, 6999, `5地总计应为6999元，实际=${sum}`);
  });
});
