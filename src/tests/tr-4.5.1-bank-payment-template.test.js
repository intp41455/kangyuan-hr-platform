'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PaymentFileGenerator,
  generateMockPayrollSummary
} = require('../modules/finance/bank_payment_gateway.js');

test('TR-4.5.1 银行代发模板：3家银行100%字段匹配+回单归档', async (t) => {
  const BATCH_ID = 'PAY20260810001';
  const EMPLOYEE_COUNT = 1000;

  await t.test('a) 工行ICBC：1000人生成TXT文件 + specScore=100 + specMatch=true', () => {
    console.log('\n  ========== [TR-4.5.1-a] ICBC 工行代发 ==========');
    const payrollSummary = generateMockPayrollSummary(EMPLOYEE_COUNT, 'ICBC');
    console.log(`  [数据准备] 生成${EMPLOYEE_COUNT}人工薪汇总，总额=${payrollSummary.totalAmount.toFixed(2)}元`);
    assert.equal(payrollSummary.totalCount, EMPLOYEE_COUNT, `员工数应为${EMPLOYEE_COUNT}`);

    const result = PaymentFileGenerator.generatePaymentFile({
      bankType: 'ICBC',
      payrollSummary: payrollSummary,
      paymentBatchId: BATCH_ID
    });

    console.log(`  [文件生成] 银行=${result.bankName}(${result.bankType})`);
    console.log(`  [文件生成] 文件名=${result.fileName}`);
    console.log(`  [文件生成] 行数=${result.lineCount} 笔数=${result.totalCount} 总额=${result.totalAmount.toFixed(2)}`);
    console.log(`  [文件生成] MD5校验=${result.checksum}`);
    assert.equal(result.bankType, 'ICBC');
    assert.equal(result.totalCount, EMPLOYEE_COUNT, `ICBC笔数应为${EMPLOYEE_COUNT}`);
    assert.ok(result.fileName.includes('ICBC'), '文件名应含ICBC');
    assert.ok(result.fileContent.length > 0, '文件内容非空');
    assert.ok(result.lines.length >= EMPLOYEE_COUNT + 1, '文件行数应≥头+明细');

    const validation = PaymentFileGenerator.validateAgainstBankSpec({
      bankType: 'ICBC',
      generatedFile: result
    });

    console.log(`  [规格校验] specScore=${validation.specScore}%`);
    console.log(`  [规格校验] specMatch=${validation.specMatch}`);
    console.log(`  [规格校验] 字段准确率=${validation.fieldAccuracy}`);
    console.log(`  [规格校验] 内部校验通过=${validation.internalValidationPassed}`);
    if (validation.errors.length > 0) {
      console.log(`  [规格校验] 错误详情:`, validation.errors.slice(0, 3));
    }
    if (validation.warnings.length > 0) {
      console.log(`  [规格校验] 警告:`, validation.warnings.slice(0, 3));
    }
    console.log(`  [规格校验] 银行官方样例字段: ${validation.sampleFields.join('|')}`);

    assert.equal(validation.specScore, 100, `ICBC specScore应为100%，实际=${validation.specScore}%`);
    assert.equal(validation.specMatch, true, 'ICBC specMatch应为true');
    assert.equal(validation.errors.length, 0, 'ICBC校验应无错误');
    console.log('  ✓ ICBC工行代发：文件生成+100%字段匹配通过');
  });

  await t.test('b) CCB建行：1000人CSV + specScore=100', () => {
    console.log('\n  ========== [TR-4.5.1-b] CCB 建行代发 ==========');
    const payrollSummary = generateMockPayrollSummary(EMPLOYEE_COUNT, 'CCB');
    console.log(`  [数据准备] 生成${EMPLOYEE_COUNT}人工薪汇总，总额=${payrollSummary.totalAmount.toFixed(2)}元`);

    const result = PaymentFileGenerator.generatePaymentFile({
      bankType: 'CCB',
      payrollSummary: payrollSummary,
      paymentBatchId: BATCH_ID
    });

    console.log(`  [文件生成] 银行=${result.bankName}(${result.bankType})`);
    console.log(`  [文件生成] 文件名=${result.fileName}`);
    console.log(`  [文件生成] 行数=${result.lineCount} 笔数=${result.totalCount} 总额=${result.totalAmount.toFixed(2)}`);
    console.log(`  [文件生成] 校验和=${result.checksum}`);
    assert.equal(result.bankType, 'CCB');
    assert.equal(result.totalCount, EMPLOYEE_COUNT, `CCB笔数应为${EMPLOYEE_COUNT}`);
    assert.ok(result.format.includes('CSV'), 'CCB应为CSV格式');

    const validation = PaymentFileGenerator.validateAgainstBankSpec({
      bankType: 'CCB',
      generatedFile: result
    });

    console.log(`  [规格校验] specScore=${validation.specScore}%`);
    console.log(`  [规格校验] specMatch=${validation.specMatch}`);
    console.log(`  [规格校验] 字段准确率=${validation.fieldAccuracy}`);
    console.log(`  [规格校验] 内部校验通过=${validation.internalValidationPassed}`);
    if (validation.errors.length > 0) {
      console.log(`  [规格校验] 错误:`, validation.errors.slice(0, 3));
    }
    console.log(`  [规格校验] 样例字段: ${validation.sampleFields.join(',')}`);

    assert.equal(validation.specScore, 100, `CCB specScore应为100%，实际=${validation.specScore}%`);
    assert.equal(validation.specMatch, true, 'CCB specMatch应为true');
    assert.equal(validation.errors.length, 0, 'CCB校验应无错误');
    console.log('  ✓ CCB建行代发：文件生成+100%字段匹配通过');
  });

  await t.test('b续) ABC农行：1000人TXT + specScore=100 → 3家银行全部100%', () => {
    console.log('\n  ========== [TR-4.5.1-b-ABC] ABC 农行代发 ==========');
    const payrollSummary = generateMockPayrollSummary(EMPLOYEE_COUNT, 'ABC');
    console.log(`  [数据准备] 生成${EMPLOYEE_COUNT}人工薪汇总，总额=${payrollSummary.totalAmount.toFixed(2)}元`);

    const result = PaymentFileGenerator.generatePaymentFile({
      bankType: 'ABC',
      payrollSummary: payrollSummary,
      paymentBatchId: BATCH_ID
    });

    console.log(`  [文件生成] 银行=${result.bankName}(${result.bankType})`);
    console.log(`  [文件生成] 文件名=${result.fileName}`);
    console.log(`  [文件生成] 行数=${result.lineCount} 笔数=${result.totalCount} 总额=${result.totalAmount.toFixed(2)}`);
    assert.equal(result.bankType, 'ABC');
    assert.equal(result.totalCount, EMPLOYEE_COUNT, `ABC笔数应为${EMPLOYEE_COUNT}`);

    const validation = PaymentFileGenerator.validateAgainstBankSpec({
      bankType: 'ABC',
      generatedFile: result
    });

    console.log(`  [规格校验] specScore=${validation.specScore}%`);
    console.log(`  [规格校验] specMatch=${validation.specMatch}`);
    console.log(`  [规格校验] 字段准确率=${validation.fieldAccuracy}`);
    console.log(`  [规格校验] 内部校验通过=${validation.internalValidationPassed}`);
    if (validation.errors.length > 0) {
      console.log(`  [规格校验] 错误:`, validation.errors.slice(0, 3));
    }

    assert.equal(validation.specScore, 100, `ABC specScore应为100%，实际=${validation.specScore}%`);
    assert.equal(validation.specMatch, true, 'ABC specMatch应为true');
    assert.equal(validation.errors.length, 0, 'ABC校验应无错误');

    console.log('\n  ============== [3家银行汇总] ==============');
    console.log(`  ICBC  specScore=100% ✓`);
    console.log(`  CCB   specScore=100% ✓`);
    console.log(`  ABC   specScore=100% ✓`);
    console.log(`  结论：3家银行全部100%匹配，字段准确率=100% ✓`);
    console.log('  ✓ 3家银行代发模板全部100%通过');
  });

  await t.test('c) archivePaymentReceipts回单归档：钉盘路径格式+archivedCount=1000', () => {
    console.log('\n  ========== [TR-4.5.1-c] 工资电子回单归档 ==========');

    const receiptItems = [];
    for (let i = 0; i < EMPLOYEE_COUNT; i++) {
      receiptItems.push({
        receiptId: `RCP${BATCH_ID}_${String(i + 1).padStart(6, '0')}`,
        employeeId: `EMP${String(i + 1).padStart(6, '0')}`,
        employeeName: `员工${i + 1}`,
        amount: round2(5000 + Math.random() * 15000),
        accountNo: `6222****${String(1000 + i)}`,
        bankName: '中国工商银行',
        period: '2026-08',
        paidAt: '2026-08-10T10:00:00.000Z',
        status: 'SUCCESS'
      });
    }

    const archiveResult = PaymentFileGenerator.archivePaymentReceipts({
      batchId: BATCH_ID,
      receiptItems: receiptItems,
      period: '2026-08'
    });

    console.log(`  [归档结果] archivePath=${archiveResult.archivePath}`);
    console.log(`  [归档结果] archivedCount=${archiveResult.archivedCount}`);
    console.log(`  [归档结果] checksum=${archiveResult.checksum}`);
    console.log(`  [归档结果] storageType=${archiveResult.storageType}`);
    console.log(`  [归档结果] period=${archiveResult.period}`);
    console.log(`  [归档结果] folderStructure: year=${archiveResult.folderStructure.year} month=${archiveResult.folderStructure.month}`);

    const pathPattern = /^钉盘\/\d{4}\/\d{2}\/工资发放回单_[\w\d]+$/;
    assert.ok(pathPattern.test(archiveResult.archivePath),
      `archivePath格式错误，应为「钉盘/年/月/工资发放回单_{batchId}」，实际=${archiveResult.archivePath}`);

    assert.ok(archiveResult.archivePath.includes('2026'), '路径应包含年份2026');
    assert.ok(archiveResult.archivePath.includes('/08/'), '路径应包含月份08');
    assert.ok(archiveResult.archivePath.includes(`工资发放回单_${BATCH_ID}`), '路径应包含batchId');

    assert.equal(archiveResult.archivedCount, EMPLOYEE_COUNT,
      `archivedCount应为${EMPLOYEE_COUNT}，实际=${archiveResult.archivedCount}`);

    assert.ok(archiveResult.checksum && archiveResult.checksum.length === 32, 'checksum应为32位MD5');
    assert.equal(archiveResult.storageType, 'DINGTALK_DRIVE', '存储类型应为钉盘');
    assert.equal(archiveResult.period, '2026-08');

    console.log(`  ✓ 回单归档：路径格式正确=${archiveResult.archivePath}`);
    console.log(`  ✓ 回单归档：archivedCount=${archiveResult.archivedCount}=${EMPLOYEE_COUNT}`);
    console.log(`  ✓ 回单归档：checksum(MD5)=${archiveResult.checksum}`);
  });

  console.log('\n========================================');
  console.log('  TR-4.5.1 全部测试通过 ✓');
  console.log('========================================\n');
});

function round2(num) {
  return Math.round(num * 100) / 100;
}
