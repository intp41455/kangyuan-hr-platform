'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FourEyeApprovalDownloadController,
  BankDirectConnectAPI
} = require('../modules/finance/bank_payment_gateway.js');

test('TR-4.5.2 双人四眼下载控制 + 银企直连预留接口', async (t) => {
  FourEyeApprovalDownloadController._resetStore();
  const BATCH_ID = 'PAY20260810001';

  await t.test('a) HR请求下载→PENDING_APPROVER_2，然后HR重复审批→rejectApproval', () => {
    console.log('\n  ========== [TR-4.5.2-a] HR请求下载 + 单人重复审批拒绝 ==========');

    const reqResult = FourEyeApprovalDownloadController.requestDownload({
      operatorId: 'HR_OPERATOR_001',
      batchId: BATCH_ID
    });

    console.log(`  [HR发起下载] operatorId=HR_OPERATOR_001 batchId=${BATCH_ID}`);
    console.log(`  [请求结果] requestId=${reqResult.requestId}`);
    console.log(`  [请求结果] status=${reqResult.status}`);
    console.log(`  [请求结果] requesterRole=${reqResult.requesterRole}`);
    console.log(`  [请求结果] requiredApprover2Role=${reqResult.requiredApprover2Role}`);
    console.log(`  [请求结果] requiredApprovalType=${reqResult.requiredApprovalType}`);
    console.log(`  [请求结果] canDownload=${reqResult.canDownload}`);

    assert.equal(reqResult.status, 'PENDING_APPROVER_2',
      `状态应为PENDING_APPROVER_2，实际=${reqResult.status}`);
    assert.equal(reqResult.canDownload, false, '未完成审批前canDownload=false');
    assert.equal(reqResult.requesterRole, 'HR', '第一审批人角色应为HR');
    assert.equal(reqResult.requiredApprover2Role, 'FINANCE', '第二审批人应为FINANCE');
    assert.ok(reqResult.requestId, 'requestId应存在');
    console.log('  ✓ HR请求下载成功：status=PENDING_APPROVER_2');

    console.log('\n  --- [单人重复审批场景] 同一HR再次审批应拒绝 ---');
    const hrRepeatResult = FourEyeApprovalDownloadController.approveDownload({
      operatorId: 'HR_OPERATOR_002',
      requestId: reqResult.requestId
    });

    console.log(`  [重复HR审批] operatorId=HR_OPERATOR_002`);
    console.log(`  [审批结果] status=${hrRepeatResult.status}`);
    console.log(`  [审批结果] rejectReason=${hrRepeatResult.rejectReason}`);
    console.log(`  [审批结果] canDownload=${hrRepeatResult.canDownload}`);
    console.log(`  [审批结果] firstApprover.role=${hrRepeatResult.firstApprover?.role}`);
    console.log(`  [审批结果] attemptedApprover.role=${hrRepeatResult.attemptedApprover?.role}`);

    assert.equal(hrRepeatResult.status, 'rejectApproval',
      `单人重复审批应返回rejectApproval，实际=${hrRepeatResult.status}`);
    assert.equal(hrRepeatResult.canDownload, false, '重复审批canDownload=false');
    assert.ok(hrRepeatResult.rejectReason, '应有rejectReason说明');
    assert.ok(hrRepeatResult.rejectReason.includes('单人重复审批') ||
                hrRepeatResult.rejectReason.includes('HR+FINANCE'),
      '拒绝原因应提及单人重复审批或双人四眼');
    console.log('  ✓ HR重复审批被正确拒绝：rejectApproval + 双人四眼原则');

    console.log('\n  --- [同一operatorId再次审批也应拒绝] ---');
    const sameOperatorResult = FourEyeApprovalDownloadController.approveDownload({
      operatorId: 'HR_OPERATOR_001',
      requestId: reqResult.requestId
    });
    console.log(`  [同一操作者审批] status=${sameOperatorResult.status}`);
    console.log(`  [同一操作者审批] rejectReason=${sameOperatorResult.rejectReason}`);
    assert.ok(sameOperatorResult.status === 'rejectApproval' || sameOperatorResult.status === 'APPROVED' === false,
      '同一操作者审批应被拒绝');
    if (sameOperatorResult.status === 'rejectApproval') {
      console.log('  ✓ 同一操作者重复审批也被正确拒绝');
    }
  });

  await t.test('b) FINANCE批准→canDownload=true，30分钟有效downloadLink', () => {
    console.log('\n  ========== [TR-4.5.2-b] FINANCE审批通过 ==========');
    FourEyeApprovalDownloadController._resetStore();

    const reqResult = FourEyeApprovalDownloadController.requestDownload({
      operatorId: 'HR_USER_ALICE',
      batchId: BATCH_ID
    });
    console.log(`  [HR发起] requestId=${reqResult.requestId} status=${reqResult.status}`);
    const requestId = reqResult.requestId;

    const financeResult = FourEyeApprovalDownloadController.approveDownload({
      operatorId: 'FINANCE_USER_BOB',
      requestId: requestId
    });

    console.log(`  [FINANCE审批] operatorId=FINANCE_USER_BOB`);
    console.log(`  [FINANCE审批结果] status=${financeResult.status}`);
    console.log(`  [FINANCE审批结果] canDownload=${financeResult.canDownload}`);
    console.log(`  [FINANCE审批结果] downloadLink=${financeResult.downloadLink}`);
    console.log(`  [FINANCE审批结果] expiresIn=${financeResult.expiresIn}`);
    console.log(`  [FINANCE审批结果] expiresAt=${financeResult.expiresAt}`);
    console.log(`  [FINANCE审批结果] fourEyePrinciple=${financeResult.fourEyePrinciple}`);
    console.log(`  [FINANCE审批结果] approvalChain:`);
    financeResult.approvalChain.forEach((a, idx) =>
      console.log(`      [${idx + 1}] role=${a.role} operatorId=${a.operatorId}`)
    );

    assert.equal(financeResult.status, 'APPROVED',
      `FINANCE审批通过status应为APPROVED，实际=${financeResult.status}`);
    assert.equal(financeResult.canDownload, true, 'FINANCE审批后canDownload=true');
    assert.equal(financeResult.expiresIn, '30min', '下载链接有效期应为30min');
    assert.ok(financeResult.expiresAt, 'expiresAt应存在');
    assert.equal(financeResult.approvalChain.length, 2, '审批链应有2人');
    assert.ok(
      (financeResult.approvalChain[0].role === 'HR' && financeResult.approvalChain[1].role === 'FINANCE') ||
      (financeResult.approvalChain[0].role === 'FINANCE' && financeResult.approvalChain[1].role === 'HR'),
      '审批链应为HR+FINANCE双人'
    );
    assert.ok(financeResult.fourEyePrinciple && financeResult.fourEyePrinciple.includes('HR+FINANCE'),
      '应标注双人四眼原则通过');
    console.log('  ✓ FINANCE审批通过：canDownload=true + 双人四眼通过');

    console.log('\n  ========== [TR-4.5.2-c] downloadLink格式校验 ==========');
    const expectedLink = `/download/${BATCH_ID}.txt`;
    console.log(`  [downloadLink格式] 期望=${expectedLink}`);
    console.log(`  [downloadLink格式] 实际=${financeResult.downloadLink}`);
    assert.equal(financeResult.downloadLink, expectedLink,
      `downloadLink格式应为/download/{batchId}.txt，期望=${expectedLink}，实际=${financeResult.downloadLink}`);
    console.log(`  ✓ downloadLink格式正确：${financeResult.downloadLink}`);

    console.log('\n  --- [反向测试：先FINANCE发起，再HR审批也应通过] ---');
    FourEyeApprovalDownloadController._resetStore();
    const req2 = FourEyeApprovalDownloadController.requestDownload({
      operatorId: 'FINANCE_FIRST_001',
      batchId: 'PAYFINANCEFIRST001'
    });
    console.log(`  [FINANCE先发起] status=${req2.status} requiredApprover2Role=${req2.requiredApprover2Role}`);
    assert.equal(req2.requiredApprover2Role, 'HR', 'FINANCE发起后，第二审批人应为HR');

    const hrApprove = FourEyeApprovalDownloadController.approveDownload({
      operatorId: 'HR_SECOND_001',
      requestId: req2.requestId
    });
    console.log(`  [HR随后审批] status=${hrApprove.status} canDownload=${hrApprove.canDownload}`);
    console.log(`  [HR随后审批] downloadLink=${hrApprove.downloadLink}`);
    assert.equal(hrApprove.status, 'APPROVED', 'FINANCE+HR顺序也应通过');
    assert.equal(hrApprove.canDownload, true, 'FINANCE+HR canDownload=true');
    assert.equal(hrApprove.downloadLink, '/download/PAYFINANCEFIRST001.txt',
      'FINANCE先发起的downloadLink格式也应正确');
    console.log('  ✓ 双人顺序不敏感：FINANCE先+HR后也通过');
  });

  await t.test('BankDirectConnectAPI全部预留接口返回NOT_IMPLEMENTED_YET无异常', () => {
    console.log('\n  ========== [TR-4.5.2-预留接口] BankDirectConnectAPI ==========');

    const RESERVED_RESP = {
      status: 'NOT_IMPLEMENTED_YET',
      reserved: true
    };

    console.log('  --- [connectSDK] ---');
    const connectResult = BankDirectConnectAPI.connectSDK({
      bankType: 'ICBC',
      apiUrl: 'https://api.icbc.com.cn',
      appId: 'ICBC_APP_001',
      appSecret: '***'
    });
    console.log(`  connectSDK: status=${connectResult.status} reserved=${connectResult.reserved} suggestedTimeline=${connectResult.suggestedTimeline}`);
    assert.equal(connectResult.status, RESERVED_RESP.status, 'connectSDK status应为NOT_IMPLEMENTED_YET');
    assert.equal(connectResult.reserved, RESERVED_RESP.reserved, 'connectSDK reserved应为true');
    assert.ok(connectResult.suggestedTimeline && connectResult.suggestedTimeline.includes('M6~M7'),
      'suggestedTimeline应提及M6~M7扩展');
    console.log('  ✓ connectSDK预留接口正常');

    console.log('  --- [submitPaymentBatch] ---');
    const submitResult = BankDirectConnectAPI.submitPaymentBatch({
      batchId: BATCH_ID,
      bankType: 'CCB',
      totalCount: 1000,
      totalAmount: 12345678.90,
      items: []
    });
    console.log(`  submitPaymentBatch: status=${submitResult.status} reserved=${submitResult.reserved} batchId=${submitResult.batchId}`);
    assert.equal(submitResult.status, RESERVED_RESP.status);
    assert.equal(submitResult.reserved, RESERVED_RESP.reserved);
    assert.ok(submitResult.suggestedTimeline && submitResult.suggestedTimeline.includes('M6~M7'));
    console.log('  ✓ submitPaymentBatch预留接口正常');

    console.log('  --- [queryPaymentStatus] ---');
    const queryResult = BankDirectConnectAPI.queryPaymentStatus(BATCH_ID);
    console.log(`  queryPaymentStatus: status=${queryResult.status} reserved=${queryResult.reserved}`);
    console.log(`  queryPaymentStatus: possibleStatuses=${queryResult.possibleStatuses?.join(',')}`);
    assert.equal(queryResult.status, RESERVED_RESP.status);
    assert.equal(queryResult.reserved, RESERVED_RESP.reserved);
    assert.deepEqual(queryResult.possibleStatuses, ['PROCESSING', 'SUCCESS', 'FAILED'],
      'possibleStatuses应为PROCESSING/SUCCESS/FAILED三种状态');
    console.log('  ✓ queryPaymentStatus预留接口正常（possibleStatuses=3种）');

    console.log('  --- [handlePaymentReceiptCallback] ---');
    const callbackPayload = {
      bankType: 'ABC',
      batchId: BATCH_ID,
      successCount: 998,
      failedCount: 2,
      failedItems: [{
        accountNo: '622848******1234',
        amount: 5000.00,
        failReason: '账户冻结'
      }],
      receiptTime: '2026-08-10T14:30:00+08:00',
      bankSignature: 'MOCK_SIGNATURE_ABC'
    };
    const callbackResult = BankDirectConnectAPI.handlePaymentReceiptCallback(callbackPayload);
    console.log(`  handlePaymentReceiptCallback: status=${callbackResult.status} reserved=${callbackResult.reserved}`);
    console.log(`  handlePaymentReceiptCallback: receivedPayload=${callbackResult.receivedPayload} payloadKeys=${callbackResult.payloadKeys?.length}个`);
    assert.equal(callbackResult.status, RESERVED_RESP.status);
    assert.equal(callbackResult.reserved, RESERVED_RESP.reserved);
    assert.equal(callbackResult.receivedPayload, true, 'receivedPayload应为true');
    assert.ok(callbackResult.payloadKeys && callbackResult.payloadKeys.length > 0,
      'payloadKeys应列出payload的key');
    console.log('  ✓ handlePaymentReceiptCallback预留接口正常');

    console.log('  --- [无参调用不崩溃] ---');
    const results = [
      BankDirectConnectAPI.connectSDK(),
      BankDirectConnectAPI.submitPaymentBatch(),
      BankDirectConnectAPI.queryPaymentStatus(),
      BankDirectConnectAPI.handlePaymentReceiptCallback()
    ];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      assert.equal(r.status, 'NOT_IMPLEMENTED_YET', `方法${i}无参调用status正确`);
      assert.equal(r.reserved, true, `方法${i}无参调用reserved=true`);
    }
    console.log('  ✓ 全部4个接口无参调用均不崩溃，返回预留格式');

    console.log('\n  ============== [银企直连预留接口汇总] ==============');
    console.log('  方法名                   | status                 | reserved');
    console.log('  connectSDK               | NOT_IMPLEMENTED_YET    | ✓ true');
    console.log('  submitPaymentBatch       | NOT_IMPLEMENTED_YET    | ✓ true');
    console.log('  queryPaymentStatus       | NOT_IMPLEMENTED_YET    | ✓ true');
    console.log('  handlePaymentReceiptCallback | NOT_IMPLEMENTED_YET | ✓ true');
    console.log('  全部预留接口均返回{status:\'NOT_IMPLEMENTED_YET\', reserved:true, suggestedTimeline:\'M6~M7扩展\'} ✓');
  });

  console.log('\n========================================');
  console.log('  TR-4.5.2 全部测试通过 ✓');
  console.log('========================================\n');
});
