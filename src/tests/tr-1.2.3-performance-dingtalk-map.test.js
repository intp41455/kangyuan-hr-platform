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
  const prefix = '610101';
  const year = 1960 + (baseNum % 55);
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
  let base = '622848' + String(10000000000 + baseNum).padStart(12, '0');
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
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧'];
  const names = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '华', '建', '文', '辉', '玲', '鑫', '斌', '波'];
  const depts = ['教育事业部', '养老运营部', '健康管理部', '行政人事部', '财务部', '技术研发部', '市场部', '法务合规部', '质量管理部', '供应链部'];
  const grades = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12'];

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const surname = surnames[idx % surnames.length];
    const name1 = names[(idx * 7) % names.length];
    const name2 = names[(idx * 11 + 3) % names.length];
    const fullName = idx % 3 === 0 ? surname + name1 : (idx % 3 === 1 ? surname + name1 + name2 : surname);
    employees.push({
      name: fullName,
      idCard: makeValidIdCard(idx + 1),
      mobile: makeValidMobile(idx + 13000000000),
      payrollGrade: grades[idx % grades.length],
      entryDate: new Date(2010 + (idx % 14), (idx % 12), (idx % 27) + 1),
      dept1: depts[idx % depts.length],
      entity: idx % 4 === 0 ? '陕西康源福祉教育科技' : (idx % 4 === 1 ? '上海康源博曜科技' : (idx % 4 === 2 ? '康源美宏养老' : '书院街代缴')),
      dept2: idx % 4 === 0 ? '综合组' : (idx % 4 === 1 ? '业务一组' : (idx % 4 === 2 ? '业务二组' : '支持组')),
      position: ['专员', '主管', '经理', '总监', '助理', '工程师', '顾问'][idx % 7],
      positionTag: ['教育岗', '非教育岗', '外勤岗', '高管免打卡岗'][idx % 4],
      workLocation: ['西安', '天水', '白银', '平凉', '兰州'][idx % 5],
      bankCard: makeValidBankCard(idx + 1),
      bankName: ['中国工商银行', '中国建设银行', '中国农业银行', '招商银行', '中国银行'][idx % 5],
      isFinance: idx % 29 === 0,
      exemptSocialTax: idx % 37 === 0,
      status: [EMPLOYEE_STATUS.REGULAR, EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.TRANSFERRING, EMPLOYEE_STATUS.PENDING_ONBOARDING][idx % 4]
    });
  }
  return employees;
}

test('TR-1.2.3: 10000条性能测试（findByMobile 100次<1秒）+ 钉钉映射双向查询', async (t) => {
  const registry = new EmployeeRegistry();

  await t.test('预填10000条模拟员工 → 导入全部成功', () => {
    const tStart = Date.now();
    const mock10000 = generateMockEmployees(10000, 0);
    const tGen = Date.now();
    console.log(`  生成10000条模拟数据耗时: ${tGen - tStart}ms`);

    const result = registry.importFromArray(mock10000, { createdBy: 'TR123-LOAD', approvalNo: 'APV-PERF-001' });
    const tImp = Date.now();
    console.log(`  导入10000条耗时: ${tImp - tGen}ms，success=${result.success} failed.count=${result.failed.length}`);

    assert.equal(result.success, 10000, `10000条全成功，实际success=${result.success}`);
    assert.equal(registry.size, 10000, `registry.size应=10000，实际=${registry.size}`);

    const emp500 = registry.findById('E000500');
    assert.ok(emp500, 'E000500应存在');
    console.log(`  ✓ E000500 预填成功 id=${emp500.id} name=${emp500.name} mobile=${emp500.mobile}`);
  });

  await t.test('findByMobile 100次查询 → 总耗时<1000ms（平均<10ms，远低于要求<50ms）', () => {
    const probeIndices = [];
    for (let i = 0; i < 100; i++) {
      probeIndices.push((i * 97 + 13) % 10000);
    }

    const probeMobiles = probeIndices.map(idx => makeValidMobile(idx + 13000000000));
    const probeExpectedIds = probeIndices.map(idx => 'E' + String(idx + 1).padStart(6, '0'));

    const start = process.hrtime.bigint();
    let hitCount = 0;
    for (let i = 0; i < probeMobiles.length; i++) {
      const found = registry.findByMobile(probeMobiles[i]);
      if (found && found.id === probeExpectedIds[i]) hitCount++;
    }
    const end = process.hrtime.bigint();
    const elapsedNs = Number(end - start);
    const elapsedMs = elapsedNs / 1e6;
    const avgMs = elapsedMs / probeMobiles.length;

    console.log(`  findByMobile 查询100次命中=${hitCount}/${probeMobiles.length}`);
    console.log(`  总耗时=${elapsedMs.toFixed(2)}ms 平均=${avgMs.toFixed(3)}ms/次`);
    console.log(`  性能目标: 平均<50ms → 实际${avgMs.toFixed(3)}ms ${avgMs < 50 ? '✓达标' : '✗未达标'}`);

    assert.equal(hitCount, probeMobiles.length, `100次查询应全部命中，命中=${hitCount}`);
    assert.ok(elapsedMs < 1000, `100次查询总耗时应<1000ms，实际=${elapsedMs.toFixed(2)}ms`);
    assert.ok(avgMs < 50, `单条平均耗时应<50ms，实际=${avgMs.toFixed(3)}ms`);
  });

  await t.test('findByName模糊查询：查找"张"开头 / "伟" / 特定全名', () => {
    const rZhang = registry.findByName('张');
    console.log(`  findByName("张") 模糊匹配数=${rZhang.length}`);
    assert.ok(rZhang.length >= 100, `姓张至少应有百人级匹配，实际=${rZhang.length}`);
    for (const e of rZhang.slice(0, 3)) {
      assert.ok(e.name.includes('张'), `模糊结果应含"张": ${e.name}`);
    }

    const rWei = registry.findByName('伟');
    console.log(`  findByName("伟") 模糊匹配数=${rWei.length}`);
    assert.ok(rWei.length >= 50, `含"伟"应有数十条匹配，实际=${rWei.length}`);

    const emp500 = registry.findById('E000500');
    const rExact500 = registry.findByName(emp500.name);
    const hit500 = rExact500.find(e => e.id === 'E000500');
    console.log(`  findByName("${emp500.name}") → 含E000500: ${!!hit500} 总数=${rExact500.length}`);
    assert.ok(hit500, `全名查询应命中E000500`);
  });

  await t.test('bindDingtalkUser: E000500 ↔ manager123 + deptId=D0101 → 双向查询一致', () => {
    const beforeBind = registry.getDingtalkBind('E000500');
    assert.equal(beforeBind, null, '绑定前应为null');

    const bindResult = registry.bindDingtalkUser('E000500', { dingtalkUserId: 'manager123', deptId: 'D0101' });
    console.log(`  bindDingtalkUser → dingtalkUserId=${bindResult.dingtalkUserId} deptId=${bindResult.deptId}`);
    assert.equal(bindResult.dingtalkUserId, 'manager123');
    assert.equal(bindResult.deptId, 'D0101');

    const readBind = registry.getDingtalkBind('E000500');
    console.log(`  getDingtalkBind(E000500) → ${JSON.stringify(readBind)}`);
    assert.equal(readBind.dingtalkUserId, 'manager123', '员工→钉钉userId映射错误');
    assert.equal(readBind.deptId, 'D0101', '员工→钉钉deptId映射错误');

    const reverseFound = registry.findByDingtalkUserId('manager123');
    console.log(`  findByDingtalkUserId("manager123") → id=${reverseFound ? reverseFound.id : null} name=${reverseFound ? reverseFound.name : null}`);
    assert.ok(reverseFound, '反向查询应命中');
    assert.equal(reverseFound.id, 'E000500', '钉钉userId→员工 反向映射错误');
    assert.equal(reverseFound.name, registry.findById('E000500').name, '双向查询姓名一致');

    const otherEmp = registry.findById('E000001');
    assert.throws(() => registry.bindDingtalkUser('E000001', { dingtalkUserId: 'manager123' }),
      /钉钉用户ID已绑定其他员工/,
      '重复绑定同一dingtalkUserId应抛出异常');

    const unbindOk = registry.unbindDingtalkUser('E000500');
    console.log(`  unbindDingtalkUser(E000500) → ${unbindOk}`);
    assert.equal(unbindOk, true);
    assert.equal(registry.getDingtalkBind('E000500'), null, '解绑后读应null');
    assert.equal(registry.findByDingtalkUserId('manager123'), null, '解绑后反向查询应null');

    const bindAgain = registry.bindDingtalkUser('E000500', { dingtalkUserId: 'manager123', deptId: 'D0101' });
    console.log(`  重新绑定恢复 → 双查: E000500.userId=${registry.getDingtalkBind('E000500').dingtalkUserId} | manager123→emp.id=${registry.findByDingtalkUserId('manager123').id}`);
    assert.equal(registry.getDingtalkBind('E000500').dingtalkUserId, 'manager123');
    assert.equal(registry.findByDingtalkUserId('manager123').id, 'E000500');

    console.log(`  ✓ 钉钉绑定/查询/解绑/重绑 双向一致性验证通过`);
  });
});
