'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { EMPLOYEE_STATUS } = require('../modules/master_data/employee_model.js');

const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function calcIdCardCheckCode(first17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(first17.charAt(i), 10) * ID_CARD_WEIGHTS[i];
  }
  return ID_CARD_CHECK_CODES[sum % 11];
}

function makeValidIdCard(baseNum) {
  const prefix = '110101';
  const year = 1970 + (baseNum % 40);
  const month = String(((baseNum % 12) + 1)).padStart(2, '0');
  const day = String(((baseNum % 27) + 1)).padStart(2, '0');
  const seq = String(baseNum % 1000).padStart(3, '0');
  const first17 = prefix + year + month + day + seq;
  return first17 + calcIdCardCheckCode(first17);
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

function makeValidBankCard(baseNum) {
  let base = '622202' + String(1000000000 + baseNum).padStart(12, '0');
  base = base.substring(0, 18);
  for (let c = 0; c <= 9; c++) {
    const candidate = base + String(c);
    if (luhnCheck(candidate)) return candidate;
  }
  return base + '0';
}

function makeValidMobile(baseNum) {
  const tail = String(baseNum).padStart(10, '0');
  return '1' + tail.substring(tail.length - 10);
}

function generateMockEmployees(count, startIdx = 0) {
  const employees = [];
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗'];
  const names = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平'];
  const depts = ['教育事业部', '养老运营部', '健康管理部', '行政人事部', '财务部', '技术研发部', '市场部', '法务合规部'];
  const grades = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10'];

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const surname = surnames[idx % surnames.length];
    const name = names[(idx * 3) % names.length];
    employees.push({
      name: surname + name,
      idCard: makeValidIdCard(idx + 1),
      mobile: makeValidMobile(idx + 13800000000),
      payrollGrade: grades[idx % grades.length],
      entryDate: new Date(2020 + (idx % 5), (idx % 12), (idx % 27) + 1),
      dept1: depts[idx % depts.length],
      entity: '陕西康源福祉教育科技',
      dept2: idx % 2 === 0 ? '综合组' : '业务组',
      position: idx % 2 === 0 ? '专员' : '主管',
      positionTag: idx % 2 === 0 ? '教育岗' : '非教育岗',
      workLocation: idx % 3 === 0 ? '西安' : (idx % 3 === 1 ? '天水' : '兰州'),
      bankCard: makeValidBankCard(idx + 1),
      bankName: '中国工商银行',
      isFinance: idx % 17 === 0,
      exemptSocialTax: idx % 23 === 0,
      status: [EMPLOYEE_STATUS.REGULAR, EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.PENDING_ONBOARDING][idx % 3]
    });
  }
  return employees;
}

test('TR-1.2.1: 100条合法批量导入成功 + 重复导入幂等（记录数仍100）', async (t) => {
  const registry = new EmployeeRegistry();

  await t.test('首次导入100条合法模拟数据 → success=100, failed=0', () => {
    const mock100 = generateMockEmployees(100, 0);
    const result = registry.importFromArray(mock100, { createdBy: 'TR121', approvalNo: 'APV-121' });

    console.log(`  [首次导入] success=${result.success}, failed.count=${result.failed.length}`);
    if (result.failed.length > 0) {
      const firstFew = result.failed.slice(0, 3).map(f => `行${f.row}: ${f.errors.join(';')}`).join(' | ');
      console.log(`  失败示例: ${firstFew}`);
    }

    assert.equal(result.success, 100, `首次导入成功数应为100，实际=${result.success}`);
    assert.equal(result.failed.length, 0, `首次导入失败数应为0，实际=${result.failed.length}`);
    assert.equal(registry.size, 100, `registry.size应为100，实际=${registry.size}`);

    const emp1 = registry.findById('E000001');
    assert.ok(emp1, 'E000001应存在');
    assert.equal(emp1.id, 'E000001', `首条员工ID应为E000001，实际=${emp1.id}`);
    assert.equal(emp1.createdBy, 'TR121', `createdBy应记录为TR121，实际=${emp1.createdBy}`);
    assert.equal(emp1.approvalNo, 'APV-121', `approvalNo应记录为APV-121，实际=${emp1.approvalNo}`);

    console.log(`  ✓ 首条员工 id=${emp1.id} name=${emp1.name} mobile=${emp1.mobile} idCard=${emp1.idCard}`);
    console.log(`  ✓ 末条员工 id=E${String(100).padStart(6, '0')} name=${registry.findById('E000100').name}`);
  });

  await t.test('重复导入相同100条 → 幂等，记录数仍=100', () => {
    const beforeSize = registry.size;
    assert.equal(beforeSize, 100, `导入前size应=100，实际=${beforeSize}`);

    const mock100Again = generateMockEmployees(100, 0);
    const result2 = registry.importFromArray(mock100Again, { createdBy: 'TR121-2', approvalNo: 'APV-121-2' });

    console.log(`  [第二次导入] success=${result2.success}, failed.count=${result2.failed.length}`);
    if (result2.failed.length > 0) {
      const skipped = result2.failed.filter(f => f.skipped).length;
      console.log(`  其中幂等跳过: ${skipped}条`);
    }

    assert.equal(result2.success, 0, `重复导入成功数应为0，实际=${result2.success}`);
    assert.equal(result2.failed.length, 100, `重复导入失败/跳过数应为100，实际=${result2.failed.length}`);
    assert.equal(registry.size, 100, `重复导入后size仍应=100，实际=${registry.size}`);

    const emp1 = registry.findById('E000001');
    assert.equal(emp1.createdBy, 'TR121', `幂等验证：createdBy不应被覆盖，仍=TR121`);

    console.log(`  ✓ 幂等验证通过：size保持${registry.size}，首次createdBy未覆盖`);
  });

  await t.test('补充导入全新50条 → success=50，总size=150', () => {
    const newMock50 = generateMockEmployees(50, 100);
    const result3 = registry.importFromArray(newMock50, { createdBy: 'TR121-3' });

    console.log(`  [第三次导入(新50条)] success=${result3.success}, failed.count=${result3.failed.length}`);
    assert.equal(result3.success, 50, `全新50条成功数应为50，实际=${result3.success}`);
    assert.equal(registry.size, 150, `总size应=150，实际=${registry.size}`);

    const emp150 = registry.findById('E000150');
    assert.ok(emp150, 'E000150应存在');
    console.log(`  ✓ E000150 id=${emp150.id} name=${emp150.name}`);
  });
});

module.exports = { generateMockEmployees, makeValidIdCard, makeValidBankCard, makeValidMobile };
