'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { DingtalkClient, DingtalkContactSync, CONFLICT_STRATEGY } = require('../integrations/dingtalk_contact_sync.js');

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
  const prefix = '610101';
  const year = 1985 + (baseNum % 30);
  const month = String(((baseNum % 12) + 1)).padStart(2, '0');
  const day = String(((baseNum % 27) + 1)).padStart(2, '0');
  const seq = String(100 + baseNum % 900).padStart(3, '0');
  const first17 = prefix + year + month + day + seq;
  return first17 + calcIdCardCheckCode(first17);
}

function makeValidMobile(baseNum) {
  const tail = String(13800000000 + baseNum).padStart(10, '0');
  return '1' + tail.substring(tail.length - 10);
}

test('TR-2.1.1: mock钉钉通讯录新增3名→加速轮询后主数据自动新增3名(幂等)', async (t) => {
  const registry = new EmployeeRegistry();
  const client = new DingtalkClient({ mode: 'mock' });

  client.configureFailure({ pullFailCount: 0, pullPermanentFail: false });

  const sync = new DingtalkContactSync({
    client,
    registry,
    mode: 'mock',
    conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY,
    pollIntervalMs: 60 * 60 * 1000,
    accelerationFactor: 6000000
  });
  sync.poller.stop();

  await t.test('初始状态：registry已有来自mock的2名初始员工 → size=2', async () => {
    const initResult = await sync.pullFromDingtalk();
    console.log(`  [初始拉取] success=${initResult.success}, updated=${initResult.updated}, conflicts=${initResult.conflicts}`);
    console.log(`  registry.size=${registry.size}`);

    assert.ok(registry.size >= 2, `初始员工数应≥2，实际=${registry.size}`);

    const emp1 = registry.findByDingtalkUserId('DT000001');
    assert.ok(emp1, 'DT000001应存在');
    console.log(`  ✓ 初始员工: ${emp1.id} name=${emp1.name} dept1=${emp1.dept1} dept2=${emp1.dept2}`);
  });

  await t.test('向mock钉钉新增3名全新员工 → 钉钉侧共5名', () => {
    const newUsers = [
      {
        name: '王强',
        mobile: makeValidMobile(101),
        idCard: makeValidIdCard(101),
        deptId: 'D01020101',
        position: '课程研发工程师',
        entryDate: '2023-03-01',
        payrollGrade: 'G04',
        entity: '陕西康源福祉教育科技'
      },
      {
        name: '赵敏',
        mobile: makeValidMobile(102),
        idCard: makeValidIdCard(102),
        deptId: 'D01030101',
        position: '护士长',
        entryDate: '2022-09-10',
        payrollGrade: 'G05',
        entity: '康源美宏养老'
      },
      {
        name: '刘洋',
        mobile: makeValidMobile(103),
        idCard: makeValidIdCard(103),
        deptId: 'D01060201',
        position: '前端开发工程师',
        entryDate: '2024-01-15',
        payrollGrade: 'G05',
        entity: '陕西康源福祉教育科技'
      }
    ];

    newUsers.forEach(u => {
      const added = client.addMockUser(u);
      console.log(`  [钉钉侧新增] DT用户=${added.dingtalkUserId} name=${added.name} mobile=${added.mobile} dept1=${added.dept1} dept2=${added.dept2}`);
    });

    const dtAll = client._mockUsers.size;
    console.log(`  钉钉侧总用户数=${dtAll}`);
    assert.equal(dtAll, 5, `钉钉侧用户数应为5，实际=${dtAll}`);
  });

  await t.test('加速setTimeout：首次pullFromDingtalk → 主数据新增3名(size=5)', async () => {
    const beforeSize = registry.size;
    console.log(`  拉取前registry.size=${beforeSize}`);

    const result = await new Promise((resolve) => {
      setTimeout(async () => {
        const r = await sync.pullFromDingtalk();
        resolve(r);
      }, 10);
    });

    console.log(`  [加速拉取] success=${result.success}, updated=${result.updated}, conflicts=${result.conflicts}`);
    console.log(`  registry.size=${registry.size}`);

    assert.equal(registry.size, 5, `新增3名后总size应为5，实际=${registry.size}`);
    assert.equal(result.success, 3, `新增成功数应为3，实际=${result.success}`);

    const added1 = registry.findByMobile(makeValidMobile(101));
    const added2 = registry.findByMobile(makeValidMobile(102));
    const added3 = registry.findByMobile(makeValidMobile(103));

    assert.ok(added1, '王强应存在');
    assert.ok(added2, '赵敏应存在');
    assert.ok(added3, '刘洋应存在');

    console.log(`  ✓ 新增员工1: ${added1.id} name=${added1.name} dept1=${added1.dept1} dept2=${added1.dept2}`);
    console.log(`  ✓ 新增员工2: ${added2.id} name=${added2.name} dept1=${added2.dept1} dept2=${added2.dept2}`);
    console.log(`  ✓ 新增员工3: ${added3.id} name=${added3.name} dept1=${added3.dept1} dept2=${added3.dept2}`);
  });

  await t.test('幂等验证：再次pullFromDingtalk(相同3名) → 主数据size仍=5，不重复新增', async () => {
    const beforeSize = registry.size;
    const result = await sync.pullFromDingtalk();

    console.log(`  [幂等拉取] success=${result.success}, updated=${result.updated}, conflicts=${result.conflicts}`);
    console.log(`  registry.size 前=${beforeSize} 后=${registry.size}`);

    assert.equal(registry.size, 5, `幂等验证：size仍应=5，实际=${registry.size}`);
    assert.equal(result.success, 0, `幂等验证：新增success应为0，实际=${result.success}`);

    console.log(`  ✓ 幂等验证通过：size保持${registry.size}，未重复新增`);
  });

  sync.stop();
  console.log('\n  ===== TR-2.1.1 测试完成 拉取成功 =====\n');
});

module.exports = { makeValidIdCard, makeValidMobile };
