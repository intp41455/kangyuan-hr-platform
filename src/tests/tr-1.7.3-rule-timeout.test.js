'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RuleEngine,
  RULE_TIMEOUT_MS,
  RuleTimeoutError,
  CircularDependencyError,
  generateSkeletonRules
} = require('../modules/rules/rule_engine.js');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('TR-1.7.3: executeRules注册一条sleep(6秒)的超时规则→执行抛出RuleTimeoutError', async (t) => {
  const engine = new RuleEngine();
  const TIMEOUT_CODE_SLOW = 'R-901';
  const TIMEOUT_CODE_NORMAL = 'R-902';

  await t.test('验证RULE_TIMEOUT_MS默认值=5000ms（5秒）', () => {
    assert.equal(RULE_TIMEOUT_MS, 5000, `RULE_TIMEOUT_MS默认值应为5000ms，实际=${RULE_TIMEOUT_MS}`);
    console.log(`  ✓ 默认超时阈值: ${RULE_TIMEOUT_MS}ms (${RULE_TIMEOUT_MS / 1000}秒)`);
  });

  await t.test('注册异步sleep(6秒)的超时规则R-901', () => {
    const slowRule = {
      id: 'timeout-test-slow',
      rCode: TIMEOUT_CODE_SLOW,
      name: '测试用超时规则（6秒异步等待）',
      category: '审批',
      formula: async (context) => {
        await delay(6000);
        return context.value || 'slow-done';
      },
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: {
        documentName: '测试用规则集',
        page: 901,
        approvalNo: 'TEST-TIMEOUT-001'
      }
    };
    const registered = engine.registerRule(slowRule);
    assert.ok(registered, `规则${TIMEOUT_CODE_SLOW}应注册成功`);
    assert.equal(registered.rCode, TIMEOUT_CODE_SLOW);
    console.log(`  ✓ 注册超时规则: ${TIMEOUT_CODE_SLOW} (内置6秒异步delay)`);
  });

  await t.test('注册正常规则R-902（快速返回）', () => {
    const normalRule = {
      id: 'timeout-test-normal',
      rCode: TIMEOUT_CODE_NORMAL,
      name: '测试用正常规则（快速返回）',
      category: '审批',
      formula: (context) => {
        return (context.baseValue || 100) * 2;
      },
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: {
        documentName: '测试用规则集',
        page: 902,
        approvalNo: 'TEST-TIMEOUT-002'
      }
    };
    const registered = engine.registerRule(normalRule);
    assert.ok(registered, `规则${TIMEOUT_CODE_NORMAL}应注册成功`);
    assert.equal(registered.rCode, TIMEOUT_CODE_NORMAL);
    console.log(`  ✓ 注册正常规则: ${TIMEOUT_CODE_NORMAL} (快速返回)`);
  });

  await t.test('单独执行R-902（正常规则）→快速返回结果', async () => {
    const startTime = Date.now();
    const result = await engine.executeRules(
      [TIMEOUT_CODE_NORMAL],
      { baseValue: 200 },
      { timeoutMs: 5000 }
    );
    const elapsed = Date.now() - startTime;
    assert.equal(result.results[TIMEOUT_CODE_NORMAL], 400,
      `正常规则应返回200×2=400，实际=${result.results[TIMEOUT_CODE_NORMAL]}`);
    assert.ok(elapsed < 1000, `正常规则执行应<1000ms，实际=${elapsed}ms`);
    console.log(`  ✓ 正常规则执行: 结果=${result.results[TIMEOUT_CODE_NORMAL]}, 耗时=${elapsed}ms`);
  });

  await t.test('单独执行R-901（超时规则）→抛出RuleTimeoutError', async () => {
    let caughtError = null;
    const startTime = Date.now();
    try {
      await engine.executeRules(
        [TIMEOUT_CODE_SLOW],
        { value: 'test' },
        { timeoutMs: 5000 }
      );
    } catch (err) {
      caughtError = err;
    }
    const elapsed = Date.now() - startTime;

    assert.ok(caughtError, `应捕获到异常，但实际未抛出`);
    assert.ok(caughtError instanceof RuleTimeoutError,
      `异常类型应为RuleTimeoutError，实际=${caughtError ? caughtError.constructor.name : 'NONE'}`);
    assert.equal(caughtError.rCode, TIMEOUT_CODE_SLOW,
      `异常中的rCode应为${TIMEOUT_CODE_SLOW}，实际=${caughtError.rCode}`);
    assert.equal(caughtError.timeoutMs, 5000,
      `异常中的timeoutMs应为5000，实际=${caughtError.timeoutMs}`);
    assert.ok(caughtError.message.includes(TIMEOUT_CODE_SLOW),
      `异常消息应包含规则编号，实际=${caughtError.message}`);
    assert.ok(caughtError.message.includes('5000'),
      `异常消息应包含超时毫秒数，实际=${caughtError.message}`);
    assert.ok(elapsed < 7000, `超时熔断应在<7秒内触发，实际等待=${elapsed}ms`);
    assert.ok(elapsed >= 4900, `超时熔断应在≥4.9秒触发，实际等待=${elapsed}ms`);

    console.log(`  ✓ 捕获异常类型: ${caughtError.constructor.name}`);
    console.log(`  ✓ 异常rCode: ${caughtError.rCode}`);
    console.log(`  ✓ 异常timeoutMs: ${caughtError.timeoutMs}ms`);
    console.log(`  ✓ 异常消息: ${caughtError.message}`);
    console.log(`  ✓ 熔断触发时间: ${elapsed}ms (约5秒)`);
  });

  await t.test('批量注册403条骨架规则后，执行超时规则仍正确抛出', async () => {
    const batchEngine = new RuleEngine();
    const rules = generateSkeletonRules();
    const batchResult = batchEngine.batchRegisterRules(rules);
    assert.equal(batchResult.success.length, 403, `批量注册成功应为403，实际=${batchResult.success.length}`);

    const slowRuleWithDeps = {
      id: 'timeout-test-with-deps',
      rCode: 'R-950',
      name: '超时测试规则（依赖其他规则）',
      category: '审批',
      formula: async (context, results) => {
        const base = results['R-023'] || 0;
        await delay(6000);
        return base * 2;
      },
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: {
        documentName: '测试用规则集',
        page: 950,
        approvalNo: 'TEST-TIMEOUT-050'
      }
    };
    batchEngine.registerRule(slowRuleWithDeps);
    console.log(`  ✓ 403条骨架规则+超时规则 注册完成`);

    let caughtError = null;
    const startTime = Date.now();
    try {
      await batchEngine.executeRules(
        ['R-950'],
        { seniorityYears: 3 },
        { timeoutMs: 5000 }
      );
    } catch (err) {
      caughtError = err;
    }
    const elapsed = Date.now() - startTime;

    assert.ok(caughtError, `依赖其他规则的超时规则仍应抛出异常`);
    assert.ok(caughtError instanceof RuleTimeoutError,
      `即使有依赖仍应为RuleTimeoutError，实际=${caughtError.constructor.name}`);
    assert.equal(caughtError.rCode, 'R-950', `异常rCode应为R-950`);
    assert.ok(elapsed < 7000, `批量注册后超时熔断仍应<7秒触发，实际=${elapsed}ms`);
    assert.ok(elapsed >= 4900, `批量注册后超时熔断应≥4.9秒触发，实际=${elapsed}ms`);

    console.log(`  ✓ 复杂场景（403条+依赖）超时熔断: ${caughtError.constructor.name} @ ${elapsed}ms`);
  });

  await t.test('循环依赖测试：A→B→A，应抛出CircularDependencyError', async () => {
    const depEngine = new RuleEngine();
    depEngine.registerRule({
      id: 'cycle-A',
      rCode: 'R-801',
      name: '循环依赖测试A',
      category: '审批',
      formula: `$R802 + 10`,
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: { documentName: '循环测试', page: 1, approvalNo: 'CYCLE-001' }
    });
    depEngine.registerRule({
      id: 'cycle-B',
      rCode: 'R-802',
      name: '循环依赖测试B',
      category: '审批',
      formula: `$R801 + 20`,
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: { documentName: '循环测试', page: 2, approvalNo: 'CYCLE-002' }
    });
    console.log(`  ✓ 注册循环依赖规则 R-801↔R-802 ($R801↔$R802)`);

    let caughtError = null;
    try {
      await depEngine.executeRules(['R-801'], {}, { timeoutMs: 3000 });
    } catch (err) {
      caughtError = err;
    }
    assert.ok(caughtError, `循环依赖应抛出异常，但未抛出`);
    assert.ok(caughtError instanceof CircularDependencyError,
      `应为CircularDependencyError，实际=${caughtError ? caughtError.constructor.name : 'NONE'}`);
    assert.ok(caughtError.cyclePath, `异常应包含cyclePath`);
    assert.ok(caughtError.cyclePath.length >= 2, `cyclePath应≥2个节点`);
    console.log(`  ✓ 循环依赖检测: ${caughtError.cyclePath.join(' → ')}`);
    console.log(`  ✓ 异常类型: ${caughtError.constructor.name}`);
    console.log(`  ✓ 异常消息: ${caughtError.message}`);
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.7.3 测试通过: 超时熔断与循环依赖检测验证成功');
  console.log(`  - 默认超时阈值: ${RULE_TIMEOUT_MS}ms`);
  console.log('  - 正常规则R-902: <1000ms返回 ✓');
  console.log('  - 超时规则R-901 (6秒异步delay): ');
  console.log('      5秒触发熔断 ✓');
  console.log('      抛出RuleTimeoutError ✓');
  console.log('      rCode字段正确 ✓');
  console.log('      timeoutMs字段正确 ✓');
  console.log('      错误消息包含规则信息 ✓');
  console.log('  - 复杂场景（403条+依赖）: 超时熔断仍正常工作 ✓');
  console.log('  - 循环依赖检测(R-801↔R-802):');
  console.log('      抛出CircularDependencyError ✓');
  console.log('      cyclePath完整展示循环链路 ✓');
  console.log('═══════════════════════════════════════════════\n');
});
