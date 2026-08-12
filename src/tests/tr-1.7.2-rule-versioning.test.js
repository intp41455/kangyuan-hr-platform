'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RuleEngine,
  generateSkeletonRules
} = require('../modules/rules/rule_engine.js');

test('TR-1.7.2: updateRule修改R-023（工龄工资100→150元，审批单制度委-2026-087）→版本号从v1.0→v2.0，changedBy/approvalNo/reason/time完整记录', async (t) => {
  const engine = new RuleEngine();
  const testChangedBy = '王宁（人力资源部）';
  const testApprovalNo = '制度委-2026-087';
  const testReason = '集团经营班子决议，工龄工资标准从100元/年提升至150元/年，自2026年8月1日起执行';

  await t.test('先批量注册403条骨架规则', () => {
    const rules = generateSkeletonRules();
    const result = engine.batchRegisterRules(rules);
    assert.equal(result.success.length, 403, `批量注册成功数应为403，实际=${result.success.length}`);
    console.log(`  ✓ 前置：批量注册403条规则完成`);
  });

  await t.test('R-023初始状态：版本v1.0，公式为100元/年工龄', () => {
    const rule = engine.getRule('R-023');
    assert.equal(rule.rCode, 'R-023', 'rCode应为R-023');
    assert.equal(rule.name, '工龄工资标准', '初始name应为"工龄工资标准"');
    assert.ok(rule.formula, '初始formula应存在');
    assert.ok(rule.formula.includes('100'), `初始公式应包含100，实际=${rule.formula}`);
    const versions = engine.getRuleVersions('R-023');
    assert.equal(versions.length, 1, `初始版本记录数应为1，实际=${versions.length}`);
    assert.equal(versions[0].version, '1.0', `初始版本号应为v1.0，实际=v${versions[0].version}`);
    assert.equal(versions[0].major, 1, `初始主版本号应为1，实际=${versions[0].major}`);
    assert.equal(versions[0].minor, 0, `初始次版本号应为0，实际=${versions[0].minor}`);
    console.log(`  ✓ R-023初始版本: v${versions[0].version}`);
    console.log(`  ✓ 初始公式: ${rule.formula}`);
  });

  await t.test('执行updateRule：工龄工资100→150，审批单制度委-2026-087', () => {
    const beforeUpdateTime = new Date();
    beforeUpdateTime.setMilliseconds(beforeUpdateTime.getMilliseconds() - 1);

    const patch = {
      name: '工龄工资标准（2026年修订）',
      formula: 'context.seniorityYears * 150',
      source: {
        documentName: '康源集团薪酬管理制度2026年修订版',
        page: 23,
        approvalNo: testApprovalNo
      }
    };
    const meta = {
      changedBy: testChangedBy,
      approvalNo: testApprovalNo,
      reason: testReason
    };

    const result = engine.updateRule('R-023', patch, meta);

    assert.ok(result, 'updateRule应返回结果');
    assert.ok(result.rule, '应返回更新后的rule');
    assert.ok(result.version, '应返回新版本记录');

    const { rule, version } = result;
    assert.equal(rule.rCode, 'R-023');
    assert.equal(rule.name, '工龄工资标准（2026年修订）', `name更新失败，实际=${rule.name}`);
    assert.ok(rule.formula.includes('150'), `公式应包含150，实际=${rule.formula}`);
    assert.equal(version.version, '2.0', `新版本号应为v2.0，实际=v${version.version}`);
    assert.equal(version.major, 2, `新主版本号应为2，实际=${version.major}`);
    assert.equal(version.minor, 0, `新次版本号应为0，实际=${version.minor}`);
    assert.equal(version.changedBy, testChangedBy, `changedBy不匹配，实际=${version.changedBy}`);
    assert.equal(version.approvalNo, testApprovalNo, `approvalNo不匹配，实际=${version.approvalNo}`);
    assert.equal(version.reason, testReason, `reason不匹配，实际=${version.reason}`);
    assert.ok(version.time instanceof Date, 'time应为Date对象');
    assert.ok(version.time >= beforeUpdateTime, `更新时间应晚于操作前时间`);
    assert.ok(version.snapshot, '新版本应包含snapshot快照');
    assert.equal(version.snapshot.rCode, 'R-023', 'snapshot.rCode应为R-023');

    console.log(`  ✓ updateRule执行成功`);
    console.log(`  ✓ 版本升级: v1.0 → v${version.version}`);
    console.log(`  ✓ changedBy: ${version.changedBy}`);
    console.log(`  ✓ approvalNo: ${version.approvalNo}`);
    console.log(`  ✓ reason: ${version.reason.substring(0, 30)}...`);
    console.log(`  ✓ 变更时间: ${version.time.toISOString()}`);
    console.log(`  ✓ 更新公式: ${rule.formula}`);
  });

  await t.test('验证版本历史记录完整：v1.0和v2.0两条记录', () => {
    const versions = engine.getRuleVersions('R-023');
    assert.equal(versions.length, 2, `版本历史应有2条记录，实际=${versions.length}`);
    assert.equal(versions[0].version, '1.0', `第1条记录版本应为v1.0，实际=v${versions[0].version}`);
    assert.equal(versions[0].changedBy, 'system', `v1.0的changedBy应为system，实际=${versions[0].changedBy}`);
    assert.equal(versions[0].approvalNo, 'INIT', `v1.0的approvalNo应为INIT，实际=${versions[0].approvalNo}`);
    assert.equal(versions[1].version, '2.0', `第2条记录版本应为v2.0，实际=v${versions[1].version}`);
    assert.equal(versions[1].changedBy, testChangedBy, `v2.0的changedBy应为${testChangedBy}`);
    assert.equal(versions[1].approvalNo, testApprovalNo, `v2.0的approvalNo应为${testApprovalNo}`);
    assert.equal(versions[1].reason, testReason, `v2.0的reason不匹配`);
    assert.ok(versions[0].time <= versions[1].time, 'v1.0时间应早于v2.0时间');

    console.log(`  ✓ 版本历史记录数: ${versions.length}条`);
    console.log(`    [1] v${versions[0].version} by ${versions[0].changedBy} @ ${versions[0].time.toISOString()}`);
    console.log(`    [2] v${versions[1].version} by ${versions[1].changedBy} @ ${versions[1].time.toISOString()}`);
  });

  await t.test('验证v2.0 snapshot快照内容与当前一致', () => {
    const rule = engine.getRule('R-023');
    const versions = engine.getRuleVersions('R-023');
    const v2Snapshot = versions[1].snapshot;
    assert.equal(v2Snapshot.name, rule.name, `snapshot.name与当前rule.name不一致`);
    assert.equal(v2Snapshot.formula, rule.formula, `snapshot.formula与当前rule.formula不一致`);
    assert.equal(v2Snapshot.category, rule.category, `snapshot.category与当前rule.category不一致`);
    assert.equal(v2Snapshot.source.approvalNo, rule.source.approvalNo, `snapshot.source.approvalNo与当前不一致`);
    console.log(`  ✓ v2.0 snapshot与当前规则内容一致`);
  });

  await t.test('执行R-023规则，验证更新后计算结果为150元/年工龄', async () => {
    const context = { seniorityYears: 5 };
    const result = await engine.executeRules(['R-023'], context, { timeoutMs: 1000 });
    const r023Value = result.results['R-023'];
    const expected = 5 * 150;
    assert.equal(r023Value, expected, `5年工龄应得${expected}元，实际=${r023Value}`);
    console.log(`  ✓ 规则执行验证: 5年工龄 × 150元 = ${r023Value}元 ✓`);
  });

  await t.test('rollbackRule回滚R-023到v1.0，版本号自动递增到v3.0', () => {
    const beforeRollbackTime = new Date();
    beforeRollbackTime.setMilliseconds(beforeRollbackTime.getMilliseconds() - 1);

    const rollbackResult = engine.rollbackRule('R-023', '1.0');
    assert.ok(rollbackResult, 'rollbackRule应返回结果');
    assert.equal(rollbackResult.rollbackFrom, '2.0', `应从v2.0回滚，实际=${rollbackResult.rollbackFrom}`);
    assert.equal(rollbackResult.rollbackTo, '1.0', `应回滚到v1.0，实际=${rollbackResult.rollbackTo}`);
    assert.equal(rollbackResult.newVersion.version, '3.0', `回滚后新版本号应为v3.0，实际=v${rollbackResult.newVersion.version}`);
    assert.equal(rollbackResult.newVersion.major, 3, `新主版本号应为3，实际=${rollbackResult.newVersion.major}`);
    assert.equal(rollbackResult.newVersion.changedBy, 'rollback', `回滚记录的changedBy应为rollback`);
    assert.ok(rollbackResult.newVersion.approvalNo.includes('1.0'), `回滚approvalNo应记录目标版本，实际=${rollbackResult.newVersion.approvalNo}`);
    assert.ok(rollbackResult.newVersion.reason.includes('回滚到版本1.0'), `回滚reason应说明，实际=${rollbackResult.newVersion.reason}`);
    assert.ok(rollbackResult.newVersion.time >= beforeRollbackTime, '回滚时间应晚于操作前时间');

    const versions = engine.getRuleVersions('R-023');
    assert.equal(versions.length, 3, `回滚后版本历史应有3条记录，实际=${versions.length}`);

    const rule = engine.getRule('R-023');
    assert.ok(rule.formula.includes('100'), `回滚后公式应恢复为100，实际=${rule.formula}`);
    assert.equal(rule.name, '工龄工资标准', `回滚后name应恢复为"工龄工资标准"，实际=${rule.name}`);

    console.log(`  ✓ 回滚操作: v2.0 → v1.0`);
    console.log(`  ✓ 新版本号: v${rollbackResult.newVersion.version}`);
    console.log(`  ✓ 回滚后公式: ${rule.formula}`);
    console.log(`  ✓ 版本历史记录数: ${versions.length}条`);
    console.log(`    [3] v${versions[2].version} by ${versions[2].changedBy} @ ${versions[2].time.toISOString()}`);
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.7.2 测试通过: 规则版本管理验证成功');
  console.log('  - R-023初始版本: v1.0 (公式=100元/年)');
  console.log('  - updateRule升级: v1.0 → v2.0');
  console.log(`  -   changedBy: ${testChangedBy}`);
  console.log(`  -   approvalNo: ${testApprovalNo}`);
  console.log(`  -   reason: 工龄工资标准调整`);
  console.log('  -   时间戳: 自动写入 ✓');
  console.log('  -   公式更新: 100 → 150元/年');
  console.log('  - 执行验证: 5年工龄=750元 ✓');
  console.log('  - rollbackRule: v2.0→v1.0，新版本号v3.0');
  console.log('  - 版本历史完整记录: 3条 ✓');
  console.log('═══════════════════════════════════════════════\n');
});
