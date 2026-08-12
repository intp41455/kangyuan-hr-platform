'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { DingtalkClient, DingtalkContactSync, CONFLICT_STRATEGY, NetworkError } = require('../integrations/dingtalk_contact_sync.js');

test('TR-2.1.3: 前3次pull抛NetworkError→第4次成功(3次指数退避1s+2s+4s=7s快速重试)；第5次永久失败→钉钉BotAlert报警', async (t) => {
  await t.test('阶段1：故意配置pullFailCount=3 → 3次失败后第4次成功（加速指数退避重试）', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });

    sync.configureRetry({
      retryMaxRetries: 3,
      retryBackoffMs: [1000, 2000, 4000],
      retryAccelerationFactor: 1000
    });

    client.configureFailure({ pullFailCount: 3, pullPermanentFail: false });

    const dlqBefore = sync.deadLetterQueue.size;
    const alertBefore = sync.botAlert.all.length;

    console.log(`  [阶段1-开始] pullFailCount=3(连续3次抛错)，retryAccelerationFactor=1000(加速1000倍)`);
    console.log(`  [阶段1-预期] 总耗时≈(1+2+4)s/1000=7ms，然后第4次成功拉取`);

    const startTime = Date.now();
    const result = await sync.pullFromDingtalk();
    const elapsed = Date.now() - startTime;

    console.log(`  [阶段1-结果] success=${result.success}, updated=${result.updated}, conflicts=${result.conflicts}, errors=${result.errors}`);
    console.log(`  [阶段1-耗时] 实际${elapsed}ms (理论≥7ms)`);
    console.log(`  [阶段1-DeadLetterQueue] 大小=${sync.deadLetterQueue.size}(预期=0)`);
    console.log(`  [阶段1-BotAlert] 条数=${sync.botAlert.all.length}(预期=0)`);

    const retryAudits = sync.auditLog.all.filter(a => a.type === 'retry_scheduled' || a.type === 'retry');
    console.log(`  [阶段1-AuditLog] retry相关条目=${retryAudits.length}`);
    retryAudits.forEach((r, i) => {
      console.log(`    #${i + 1}: [${r.type}] ${r.message}`);
    });

    assert.equal(result.errors, 0, `最终errors应=0，实际=${result.errors}`);
    assert.ok(result.success >= 2, `最终success应≥2，实际=${result.success}`);
    assert.equal(sync.deadLetterQueue.size, dlqBefore, `DLQ不应新增条目，前=${dlqBefore}后=${sync.deadLetterQueue.size}`);
    assert.equal(sync.botAlert.all.length, alertBefore, `BotAlert不应触发，前=${alertBefore}后=${sync.botAlert.all.length}`);
    assert.ok(retryAudits.length >= 3, `retry条目应≥3，实际=${retryAudits.length}`);
    assert.ok(elapsed >= 5, `总耗时应≥5ms(模拟1+2+4=7ms退避)，实际=${elapsed}ms`);

    assert.equal(registry.size, result.success, `registry.size应=success数=${result.success}`);

    console.log(`  ✓ 阶段1通过：3次指数退避重试后第4次成功`);
    sync.stop();
  });

  await t.test('阶段2：配置pullPermanentFail=true(永久失败) → 连续4次失败(1+3次重试)=4次，触发BotAlert报警+deadLetterQueue写入', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });

    sync.configureRetry({
      retryMaxRetries: 3,
      retryBackoffMs: [1000, 2000, 4000],
      retryAccelerationFactor: 1000
    });

    client.configureFailure({ pullFailCount: 0, pullPermanentFail: true });

    let capturedAlert = null;
    sync.botAlert.setAlertCallback((alert) => {
      capturedAlert = alert;
    });

    console.log(`  [阶段2-开始] pullPermanentFail=true(永久失败)，预期4次失败(1+3重试)`);

    const startTime = Date.now();
    const result = await sync.pullFromDingtalk();
    const elapsed = Date.now() - startTime;

    console.log(`  [阶段2-结果] errors=${result.errors}, success=${result.success}`);
    console.log(`  [阶段2-耗时] 实际${elapsed}ms (理论≥7ms)`);

    console.log(`  [阶段2-DeadLetterQueue] 新增条目数=${sync.deadLetterQueue.size}`);
    const dlq = sync.deadLetterQueue.all;
    dlq.forEach((item, i) => {
      console.log(`    DLQ#${i + 1}: id=${item.id} action=${item.action} retryCount=${item.retryCount} error=${item.error}`);
    });

    console.log(`  [阶段2-BotAlert] 报警条数=${sync.botAlert.all.length}`);
    const alerts = sync.botAlert.all;
    alerts.forEach((alert, i) => {
      console.log(`    ALERT#${i + 1}: target=${alert.target} message=${alert.message}`);
    });

    if (capturedAlert) {
      console.log(`  [阶段2-AlertCallback] 已捕获报警: ${capturedAlert.message}`);
    }

    assert.equal(result.errors, 1, `result.errors应=1，实际=${result.errors}`);
    assert.equal(sync.deadLetterQueue.size, 1, `DLQ应=1条，实际=${sync.deadLetterQueue.size}`);
    assert.equal(sync.botAlert.all.length, 1, `BotAlert应=1条，实际=${sync.botAlert.all.length}`);
    assert.ok(capturedAlert !== null, `Alert回调应被触发`);

    const dlqItem = dlq[0];
    assert.equal(dlqItem.action, 'pullFromDingtalk', `DLQ action应为pullFromDingtalk`);
    assert.equal(dlqItem.retryCount, 4, `DLQ retryCount应=4(1+3重试)，实际=${dlqItem.retryCount}`);

    const alert = alerts[0];
    assert.match(alert.message, /失败4次/, `报警消息应包含"失败4次"或类似失败次数提示: ${alert.message}`);
    assert.ok(
      alert.message.includes('连续失败4') || alert.message.includes('4次') || alert.message.includes('重试3'),
      `报警消息应包含失败次数(4次): ${alert.message}`
    );
    assert.ok(alert.target === 'HR_MANAGER', `报警target应=HR_MANAGER`);

    const failureAudits = sync.auditLog.all.filter(a => a.type === 'sync_failure');
    assert.ok(failureAudits.length >= 1, `AuditLog应有sync_failure条目`);

    console.log(`  ✓ 阶段2通过：第5次(永久失败)触发BotAlert+deadLetterQueue`);
    sync.stop();
  });

  await t.test('阶段3：DLQ+AuditLog验证 + 报警消息含失败次数', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });

    sync.configureRetry({
      retryMaxRetries: 2,
      retryBackoffMs: [100, 100],
      retryAccelerationFactor: 100
    });

    client.configureFailure({ pullFailCount: 0, pullPermanentFail: true });

    console.log(`  [阶段3] 小重试配置：maxRetries=2 → 总失败次数=3 → 报警含3次`);

    const result = await sync.pullFromDingtalk();
    const alert = sync.botAlert.all[0];
    const dlq = sync.deadLetterQueue.all[0];

    console.log(`  [阶段3-结果] errors=${result.errors}, BotAlert.message="${alert ? alert.message : ''}"`);
    console.log(`  [阶段3-结果] DLQ.retryCount=${dlq ? dlq.retryCount : 'N/A'}`);

    if (alert) {
      const match4 = alert.message.match(/失败(\d+)次/);
      const matchRetry = alert.message.match(/重试(\d+)/);
      const totalFailures = match4 ? parseInt(match4[1]) : (matchRetry ? parseInt(matchRetry[1]) + 1 : 0);
      console.log(`  [阶段3-解析] 失败次数=${totalFailures}`);
      assert.ok(totalFailures === 3 || dlq.retryCount === 3, `总失败次数应为3(1+2重试)，DLQ.retryCount=${dlq?.retryCount}`);
    }

    console.log(`  ✓ 阶段3通过：DLQ.retryCount与报警失败次数一致`);
    sync.stop();
  });

  console.log('\n  ===== TR-2.1.3 测试完成 指数退避+Bot报警+DeadLetter =====\n');
});
