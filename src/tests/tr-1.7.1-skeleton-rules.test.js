'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RuleEngine,
  RULE_CATEGORIES,
  generateSkeletonRules,
  CircularDependencyError
} = require('../modules/rules/rule_engine.js');

test('TR-1.7.1: 批量注册403条骨架规则→全部解析成功，无循环依赖', async (t) => {
  const engine = new RuleEngine();

  await t.test('生成403条规则骨架数据', () => {
    const rules = generateSkeletonRules();
    assert.equal(rules.length, 403, `应生成403条规则，实际=${rules.length}`);
    console.log(`  ✓ 生成规则总数: ${rules.length}条`);
  });

  await t.test('§4假期规则 R-001~R-187 共187条', () => {
    const rules = generateSkeletonRules();
    const holidayRules = rules.filter(r => r.category === RULE_CATEGORIES.HOLIDAY);
    assert.equal(holidayRules.length, 187, `§4假期规则应为187条，实际=${holidayRules.length}`);
    assert.equal(holidayRules[0].rCode, 'R-001', '假期规则起始编号应为R-001');
    assert.equal(holidayRules[holidayRules.length - 1].rCode, 'R-187', '假期规则结束编号应为R-187');
    console.log(`  ✓ §4假期规则: ${holidayRules.length}条 (R-001~R-187)`);
  });

  await t.test('§5考勤规则 R-188~R-318 共131条', () => {
    const rules = generateSkeletonRules();
    const attendanceRules = rules.filter(r => r.category === RULE_CATEGORIES.ATTENDANCE);
    assert.equal(attendanceRules.length, 131, `§5考勤规则应为131条，实际=${attendanceRules.length}`);
    assert.equal(attendanceRules[0].rCode, 'R-188', '考勤规则起始编号应为R-188');
    assert.equal(attendanceRules[attendanceRules.length - 1].rCode, 'R-318', '考勤规则结束编号应为R-318');
    console.log(`  ✓ §5考勤规则: ${attendanceRules.length}条 (R-188~R-318)`);
  });

  await t.test('§12薪酬规则 R-319~R-403 共85条', () => {
    const rules = generateSkeletonRules();
    const payrollRules = rules.filter(r => r.category === RULE_CATEGORIES.PAYROLL);
    assert.equal(payrollRules.length, 85, `§12薪酬规则应为85条，实际=${payrollRules.length}`);
    assert.equal(payrollRules[0].rCode, 'R-319', '薪酬规则起始编号应为R-319');
    assert.equal(payrollRules[payrollRules.length - 1].rCode, 'R-403', '薪酬规则结束编号应为R-403');
    console.log(`  ✓ §12薪酬规则: ${payrollRules.length}条 (R-319~R-403)`);
  });

  await t.test('R编号连续且唯一', () => {
    const rules = generateSkeletonRules();
    const codes = rules.map(r => r.rCode).sort();
    for (let i = 0; i < 403; i++) {
      const expected = `R-${String(i + 1).padStart(3, '0')}`;
      assert.equal(codes[i], expected, `R编号不连续，第${i + 1}个应为${expected}，实际=${codes[i]}`);
    }
    const uniqueSet = new Set(codes);
    assert.equal(uniqueSet.size, 403, 'R编号应全部唯一');
    console.log(`  ✓ R编号连续且唯一: 100%`);
  });

  await t.test('每条规则Schema完整', () => {
    const rules = generateSkeletonRules();
    let validCount = 0;
    for (const rule of rules) {
      try {
        assert.ok(rule.id, `${rule.rCode}缺少id`);
        assert.ok(rule.rCode, `${rule.rCode}缺少rCode`);
        assert.ok(/^R-\d{3}$/.test(rule.rCode), `${rule.rCode}格式错误`);
        assert.ok(rule.name, `${rule.rCode}缺少name`);
        assert.ok(rule.category, `${rule.rCode}缺少category`);
        assert.ok(Object.values(RULE_CATEGORIES).includes(rule.category), `${rule.rCode}category无效`);
        assert.ok(rule.source, `${rule.rCode}缺少source`);
        assert.ok(rule.source.documentName, `${rule.rCode}缺少source.documentName`);
        assert.ok(rule.source.approvalNo, `${rule.rCode}缺少source.approvalNo`);
        validCount++;
      } catch (err) {
        console.log(`  ✗ Schema验证失败: ${rule.rCode} - ${err.message}`);
        throw err;
      }
    }
    assert.equal(validCount, 403, `全部403条规则Schema应完整有效，实际=${validCount}`);
    console.log(`  ✓ Schema完整性验证: ${validCount}/${403}条`);
  });

  await t.test('批量注册403条规则，无失败', () => {
    const rules = generateSkeletonRules();
    const result = engine.batchRegisterRules(rules);
    assert.equal(result.success.length, 403, `批量注册成功数应为403，实际=${result.success.length}`);
    assert.equal(result.failed.length, 0, `批量注册失败数应为0，实际=${result.failed.length}`);
    console.log(`  ✓ 批量注册结果: 成功${result.success.length}条, 失败${result.failed.length}条`);
  });

  await t.test('注册后getRule可查询，每条rule有version=1.0', () => {
    const rules = generateSkeletonRules();
    for (const rule of rules) {
      const queried = engine.getRule(rule.rCode);
      assert.ok(queried, `${rule.rCode}查询不到`);
      const versions = engine.getRuleVersions(rule.rCode);
      assert.equal(versions.length, 1, `${rule.rCode}版本记录数应为1，实际=${versions.length}`);
      assert.equal(versions[0].version, '1.0', `${rule.rCode}初始版本应为1.0，实际=${versions[0].version}`);
    }
    console.log(`  ✓ 注册后版本验证: 全部403条v1.0`);
  });

  await t.test('listRulesByCategory按类别统计正确', () => {
    const holiday = engine.listRulesByCategory(RULE_CATEGORIES.HOLIDAY);
    const attendance = engine.listRulesByCategory(RULE_CATEGORIES.ATTENDANCE);
    const payroll = engine.listRulesByCategory(RULE_CATEGORIES.PAYROLL);
    assert.equal(holiday.length, 187, `按类别查询假期规则应为187条，实际=${holiday.length}`);
    assert.equal(attendance.length, 131, `按类别查询考勤规则应为131条，实际=${attendance.length}`);
    assert.equal(payroll.length, 85, `按类别查询薪酬规则应为85条，实际=${payroll.length}`);
    const total = holiday.length + attendance.length + payroll.length;
    assert.equal(total, 403, `三类规则合计应为403条，实际=${total}`);
    console.log(`  ✓ 按类别查询: 假期${holiday.length}+考勤${attendance.length}+薪酬${payroll.length}=${total}条`);
  });

  await t.test('executeRules执行全部规则，拓扑排序无循环依赖抛出', async () => {
    const rules = generateSkeletonRules();
    const allCodes = rules.map(r => r.rCode);
    try {
      const result = await engine.executeRules(allCodes, {}, { timeoutMs: 5000 });
      assert.ok(result.executionOrder, '应返回executionOrder');
      assert.equal(result.executionOrder.length, 403, `拓扑排序后执行顺序应包含403条规则，实际=${result.executionOrder.length}`);
      const successCount = result.executionLog.filter(e => e.status === 'success').length;
      assert.equal(successCount, 403, `应全部执行成功，实际=${successCount}/403`);
      console.log(`  ✓ 拓扑排序执行: ${result.executionOrder.length}条，无循环依赖`);
      console.log(`  ✓ 全部执行成功: ${successCount}/403`);
    } catch (err) {
      if (err instanceof CircularDependencyError) {
        console.log(`  ✗ 检测到循环依赖: ${err.cyclePath.join(' → ')}`);
        throw err;
      }
      throw err;
    }
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.7.1 测试通过: 403条骨架规则批量注册成功');
  console.log('  - §4假期: 187条 (R-001~R-187)');
  console.log('  - §5考勤: 131条 (R-188~R-318)');
  console.log('  - §12薪酬: 85条 (R-319~R-403)');
  console.log('  - Schema完整性: 100% (403/403)');
  console.log('  - 初始版本: 全部v1.0');
  console.log('  - DAG拓扑排序: 无循环依赖');
  console.log('  - 批量执行成功: 403/403条');
  console.log('═══════════════════════════════════════════════\n');
});
