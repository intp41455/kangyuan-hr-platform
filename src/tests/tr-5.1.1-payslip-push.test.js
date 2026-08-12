'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PayslipService,
  DingtalkAutoAuth
} = require('../modules/selfservice/dingtalk_selfservice_portal.js');

console.log('='.repeat(80));
console.log('  Task5.1 TR-5.1.1 工资条推送验收测试');
console.log('='.repeat(80));
console.log('');

test('TR-5.1.1 工资条推送：1000名员工D-1 09:00推送→pushedCount=999 failedCount=1 successRate=99.9%≥99.9% ✔', async (t) => {
  const auth = new DingtalkAutoAuth();
  const payslipService = new PayslipService({ auth });

  const PERIOD = '2026-07';
  const BATCH_ID = 'BATCH-D1-2026-07-0900';
  const TARGET_COUNT = 1000;
  const EXPECTED_PUSHED = 999;
  const EXPECTED_FAILED = 1;
  const EXPECTED_SUCCESS_RATE = 99.9;
  const THRESHOLD = 99.9;

  console.log(`【TR-5.1.1】执行D-1 09:00工资条推送任务...`);
  console.log(`  推送期间: ${PERIOD}`);
  console.log(`  批次ID: ${BATCH_ID}`);
  console.log(`  目标员工数: ${TARGET_COUNT}`);
  console.log(`  成功率阈值: ≥${THRESHOLD}%`);
  console.log('');

  const pushStart = Date.now();
  const result = payslipService.pushPayslipsD1({
    batchId: BATCH_ID,
    period: PERIOD
  });
  const pushMs = Date.now() - pushStart;

  await t.test('推送结果核心指标校验', () => {
    console.log(`  [TR-5.1.1-1] 推送结果统计:`);
    console.log(`              目标推送: ${result.pushedCount + result.failedCount}人`);
    console.log(`              成功推送pushedCount: ${result.pushedCount}人 (预期${EXPECTED_PUSHED})`);
    console.log(`              失败推送failedCount: ${result.failedCount}人 (预期${EXPECTED_FAILED})`);
    console.log(`              成功率successRate: ${result.successRate}% (预期${EXPECTED_SUCCESS_RATE}%)`);
    console.log(`              阈值达标thresholdPassed: ${result.thresholdPassed}`);
    console.log(`              耗时: ${pushMs}ms`);

    assert.equal(result.pushedCount, EXPECTED_PUSHED,
      `pushedCount应=${EXPECTED_PUSHED}，实际=${result.pushedCount}`);
    assert.equal(result.failedCount, EXPECTED_FAILED,
      `failedCount应=${EXPECTED_FAILED}，实际=${result.failedCount}`);
    assert.equal(result.successRate, EXPECTED_SUCCESS_RATE,
      `successRate应=${EXPECTED_SUCCESS_RATE}%，实际=${result.successRate}%`);
    assert.ok(result.thresholdPassed,
      `成功率${result.successRate}%应≥阈值${THRESHOLD}%`);
    assert.ok(result.successRate >= THRESHOLD,
      `成功率${result.successRate}%≥${THRESHOLD}% ✔`);

    console.log(`              ✓ PASS: pushedCount=${result.pushedCount}, failedCount=${result.failedCount}`);
    console.log(`              ✓ PASS: successRate=${result.successRate}% ≥ ${THRESHOLD}% 阈值达标`);
  });

  await t.test('失败的1条有监控告警failedMonitorQueue≥1条', () => {
    const queueSize = payslipService.failedMonitorQueue.size();
    const alerts = payslipService.failedMonitorQueue.getAll();

    console.log(`  [TR-5.1.1-2] 失败监控告警队列检查:`);
    console.log(`              failedMonitorQueue告警数量: ${queueSize}条 (预期≥1)`);
    console.log(`              告警级别分布: ${JSON.stringify(alerts.map(a => a.level))}`);

    if (alerts.length > 0) {
      console.log(`              首条告警样例:`);
      const firstAlert = alerts[0];
      console.log(`                * level=${firstAlert.level}`);
      console.log(`                * message=${firstAlert.message}`);
      console.log(`                * ts=${firstAlert.ts}`);
    }

    assert.ok(queueSize >= 1,
      `失败告警队列应有≥1条记录，实际=${queueSize}条`);
    assert.ok(alerts.some(a => a.level === 'error'),
      '告警队列应包含至少1条level=error的告警');

    console.log(`              ✓ PASS: failedMonitorQueue=${queueSize}条 含error级告警`);
  });

  await t.test('失败记录明细包含错误原因和重试标识', () => {
    const failedRecords = result.failedRecords;
    console.log(`  [TR-5.1.1-3] 失败记录明细检查:`);
    console.log(`              失败记录数: ${failedRecords.length}条`);

    if (failedRecords.length > 0) {
      const rec = failedRecords[0];
      console.log(`              失败记录样例:`);
      console.log(`                * empId: ${rec.empId}`);
      console.log(`                * reason: ${rec.reason}`);
      console.log(`                * errorCode: ${rec.errorCode}`);
      console.log(`                * retryCount: ${rec.retryCount}`);

      assert.ok(rec.empId, '失败记录应包含empId');
      assert.ok(rec.reason && rec.reason.length > 5, '失败记录应包含具体失败原因');
      assert.ok(rec.errorCode, '失败记录应包含错误码errorCode');
      assert.equal(typeof rec.retryCount, 'number', '失败记录应包含retryCount');
    }

    console.log(`              ✓ PASS: 失败记录明细完整`);
  });

  await t.test('批次信息完整性校验', () => {
    console.log(`  [TR-5.1.1-4] 批次信息完整性:`);
    console.log(`              batchId: ${result.batchId}`);
    console.log(`              period: ${result.period}`);
    console.log(`              failedMonitorQueueSize: ${result.failedMonitorQueueSize}`);

    assert.equal(result.batchId, BATCH_ID, `batchId应=${BATCH_ID}`);
    assert.equal(result.period, PERIOD, `period应=${PERIOD}`);
    assert.ok(result.failedMonitorQueueSize >= 1,
      `返回中failedMonitorQueueSize应≥1，实际=${result.failedMonitorQueueSize}`);

    console.log(`              ✓ PASS: 批次信息完整`);
  });

  console.log('');
  console.log(`  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║ TR-5.1.1 工资条推送 测试总结 (D-1 09:00 × 1000人)                      ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
  console.log(`  ║  成功推送pushedCount  : ${String(result.pushedCount).padEnd(5)}人  (预期999)                     ✓ ║`);
  console.log(`  ║  失败推送failedCount  : ${String(result.failedCount).padEnd(5)}人  (预期1)                       ✓ ║`);
  console.log(`  ║  成功率successRate    : ${String(result.successRate + '%').padEnd(6)}  (预期99.9%)               ✓ ║`);
  console.log(`  ║  阈值≥99.9%达标       : ${result.thresholdPassed ? '✓ 通过' : '✗ 未通过'}                                      ✓ ║`);
  console.log(`  ║  失败监控告警队列     : ${String(payslipService.failedMonitorQueue.size()).padEnd(3)}条 (≥1)                      ✓ ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
});
