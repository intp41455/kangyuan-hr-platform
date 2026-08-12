'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EMPLOYEE_STATUS,
  ATTENDANCE_EXCEPTION,
  LEAVE_TYPE,
  APPROVAL_STATUS,
  AREA_CODE,
  ENUM_TYPES,
  genEmployeeId,
  genDeptId,
  genPositionId,
  _resetCounters,
  listAllEnums,
  validateEnum
} = require('../common/data_dictionary.js');

test('TR-1.8.1: 枚举字符串化检查、编码生成器、validateEnum100样本校验', async (t) => {
  await t.test('EMPLOYEE_STATUS枚举值全字符串化：无数字魔法值', () => {
    const keys = Object.keys(EMPLOYEE_STATUS);
    let numericFound = [];
    for (const k of keys) {
      const v = EMPLOYEE_STATUS[k];
      if (typeof v !== 'string') {
        numericFound.push(`${k}类型=${typeof v}值=${v}`);
      }
      if (!isNaN(Number(v))) {
        numericFound.push(`${k}值=${v}可转数字`);
      }
    }
    assert.equal(numericFound.length, 0, `枚举值应全字符串化无数字，发现: ${numericFound.join('; ')}`);
    console.log(`  ✓ EMPLOYEE_STATUS 共${keys.length}项 全字符串化无数字魔法值: 100%`);
    console.log(`    项目: ${keys.join('、')}`);
  });

  await t.test('所有5套枚举：值全字符串化、键值互等', () => {
    const allEnums = { EMPLOYEE_STATUS, ATTENDANCE_EXCEPTION, LEAVE_TYPE, APPROVAL_STATUS, AREA_CODE };
    for (const name of Object.keys(allEnums)) {
      const enumObj = allEnums[name];
      const keys = Object.keys(enumObj);
      for (const k of keys) {
        const v = enumObj[k];
        assert.equal(typeof v, 'string', `${name}.${k}值非字符串: typeof=${typeof v}`);
        assert.equal(k, v, `${name}键值应互等: ${k} !== ${v}`);
        assert.ok(isNaN(Number(v)), `${name}.${k}值${v}可转数字（数字魔法值）`);
      }
      console.log(`  ✓ ${name}: 共${keys.length}项 键值互等+全字符串化: 100%`);
    }
  });

  await t.test('genEmployeeId连续生成3个: E000001 / E000002 / E000003', () => {
    _resetCounters();
    const id1 = genEmployeeId();
    const id2 = genEmployeeId();
    const id3 = genEmployeeId();
    assert.equal(id1, 'E000001', `第1个应为E000001，实际=${id1}`);
    assert.equal(id2, 'E000002', `第2个应为E000002，实际=${id2}`);
    assert.equal(id3, 'E000003', `第3个应为E000003，实际=${id3}`);
    console.log(`  ✓ genEmployeeId 连续3个: ${id1} → ${id2} → ${id3}`);
  });

  await t.test("genDeptId('D01')第一个子部门 = D0101", () => {
    _resetCounters();
    const firstChild = genDeptId('D01');
    assert.equal(firstChild, 'D0101', `D01的第一个子部门应为D0101，实际=${firstChild}`);
    const secondChild = genDeptId('D01');
    assert.equal(secondChild, 'D0102', `D01的第二个子部门应为D0102，实际=${secondChild}`);
    const siblingChild = genDeptId('D02');
    assert.equal(siblingChild, 'D0201', `D02的第一个子部门应为D0201，实际=${siblingChild}`);
    const rootDept = genDeptId();
    assert.equal(rootDept, 'D01', `无根参生成的一级部门第一个应为D01，实际=${rootDept}`);
    console.log(`  ✓ genDeptId: D01→${firstChild} / D01→${secondChild} / D02→${siblingChild} / 根→${rootDept}`);
  });

  await t.test('genPositionId前3个: P0001 / P0002 / P0003', () => {
    _resetCounters();
    const p1 = genPositionId();
    const p2 = genPositionId();
    const p3 = genPositionId();
    assert.equal(p1, 'P0001', `第1个岗位编码应为P0001，实际=${p1}`);
    assert.equal(p2, 'P0002', `第2个应为P0002，实际=${p2}`);
    assert.equal(p3, 'P0003', `第3个应为P0003，实际=${p3}`);
    console.log(`  ✓ genPositionId 连续3个: ${p1} → ${p2} → ${p3}`);
  });

  await t.test('validateEnum: 100个随机样本 100%正确校验', () => {
    const allEnums = { EMPLOYEE_STATUS, ATTENDANCE_EXCEPTION, LEAVE_TYPE, APPROVAL_STATUS, AREA_CODE };
    const allValuesByType = {};
    for (const type of ENUM_TYPES) {
      allValuesByType[type] = Object.values(allEnums[type]);
    }

    let totalCases = 0;
    let passCases = 0;
    const wrongCases = [];

    for (const type of ENUM_TYPES) {
      const validValues = allValuesByType[type];
      for (const v of validValues) {
        totalCases++;
        const result = validateEnum(type, v);
        if (result === true) passCases++;
        else wrongCases.push(`[合法值误判为无效] type=${type} value=${v}`);
      }
    }

    const invalidSamples = [
      ['EMPLOYEE_STATUS', 'INVALID_STATUS'],
      ['EMPLOYEE_STATUS', 1],
      ['EMPLOYEE_STATUS', 'pending_onboard'],
      ['ATTENDANCE_EXCEPTION', 'LATE_1H'],
      ['ATTENDANCE_EXCEPTION', 'LATE_10_MIN'],
      ['LEAVE_TYPE', 'COMPASSIONATE'],
      ['LEAVE_TYPE', 'ANNUAL_LEAVE'],
      ['APPROVAL_STATUS', 'PROCESSING'],
      ['APPROVAL_STATUS', 'DONE'],
      ['AREA_CODE', 'BJ'],
      ['AREA_CODE', 'SH'],
      ['NONEXISTENT_ENUM', 'FOO']
    ];

    for (const [type, value] of invalidSamples) {
      totalCases++;
      const result = validateEnum(type, value);
      if (result === false) passCases++;
      else wrongCases.push(`[非法值误判为有效] type=${type} value=${String(value)}`);
    }

    const sampleCount = 100 - totalCases;
    const allTypes = Object.keys(allEnums);
    const charPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
    for (let i = 0; i < sampleCount; i++) {
      const type = allTypes[i % allTypes.length];
      const len = 4 + (i % 8);
      let randomStr = '';
      for (let j = 0; j < len; j++) {
        randomStr += charPool.charAt(Math.floor(Math.random() * charPool.length));
      }
      const isValidReal = allValuesByType[type].includes(randomStr);
      const checkResult = validateEnum(type, randomStr);
      totalCases++;
      if (checkResult === isValidReal) {
        passCases++;
      } else {
        wrongCases.push(`[随机样本误判] type=${type} value=${randomStr} 实=${isValidReal} 检=${checkResult}`);
      }
    }

    assert.equal(totalCases, 100, `总样本数应为100，实际=${totalCases}`);
    assert.equal(passCases, 100, `正确校验应为100，实际=${passCases}/100，错误: ${wrongCases.slice(0,5).join(' | ')}`);
    const rate = Math.round(passCases / totalCases * 100);
    console.log(`  ✓ validateEnum: 样本${totalCases}个，正确${passCases}个，准确率=${rate}%`);
  });

  await t.test('listAllEnums返回5套枚举且字段完整', () => {
    const all = listAllEnums();
    const keys = Object.keys(all);
    assert.equal(keys.length, 5, `listAllEnums应返回5套枚举，实际=${keys.length}套: ${keys.join(',')}`);
    for (const type of ENUM_TYPES) {
      assert.ok(Array.isArray(all[type]), `${type}应为数组`);
      for (const item of all[type]) {
        assert.equal(typeof item.code, 'string', `${type} item缺少code`);
        assert.equal(typeof item.name, 'string', `${type} item缺少name`);
        assert.equal(typeof item.description, 'string', `${type} item缺少description`);
      }
      console.log(`  ✓ listAllEnums.${type}: ${all[type].length}项`);
    }
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.8.1 测试全部通过:');
  console.log('  - EMPLOYEE_STATUS枚举: 全字符串化 无数字魔法值 ✓');
  console.log('  - 全部5套枚举: 键值互等 全字符串 ✓');
  console.log('  - genEmployeeId: E000001 → E000002 → E000003 ✓');
  console.log('  - genDeptId("D01"): 首子=D0101 ✓');
  console.log('  - genPositionId: P0001 → P0002 → P0003 ✓');
  console.log('  - validateEnum: 100随机样本 准确率=100% ✓');
  console.log('  - listAllEnums: 5套枚举字段完整 ✓');
  console.log('═══════════════════════════════════════════════\n');
});
