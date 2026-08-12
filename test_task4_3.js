const { RuleVersionManager, OperationAuditLog, AuditReportGenerator } = require('./src/modules/audit/compliance_audit_engine');

function logDivider(testName) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 ' + testName);
  console.log('='.repeat(60));
}

function logPass(name) {
  console.log('✅ PASS: ' + name);
}

function logFail(name, detail) {
  console.log('❌ FAIL: ' + name + ' - ' + detail);
}

function test_TR_4_3_1() {
  logDivider('TR-4.3.1 规则版本管理测试');
  const rvm = new RuleVersionManager();
  let passed = 0;
  let total = 0;

  total++;
  const v1 = rvm.updateRule({
    ruleId: 'SENIORITY_100',
    newValue: 100,
    changeUser: '系统初始化',
    approvalNumber: 'HR-INIT',
    changeReason: '初始规则建立'
  });
  if (v1.version === 'v1' && v1.value === 100) {
    logPass('v1版本创建成功 version=' + v1.version + ', value=' + v1.value);
    passed++;
  } else {
    logFail('v1版本创建', 'version=' + v1.version + ', value=' + v1.value);
  }

  total++;
  const v2 = rvm.updateRule({
    ruleId: 'SENIORITY_100',
    newValue: 150,
    changeUser: '王宁',
    approvalNumber: 'HR-2026-08-001',
    changeReason: '制度委员会决议'
  });
  if (v2.version === 'v2' && v2.value === 150) {
    logPass('v2版本创建成功 version=' + v2.version + ', value=' + v2.value);
    passed++;
  } else {
    logFail('v2版本创建', 'version=' + v2.version + ', value=' + v2.value);
  }

  total++;
  const latest = rvm.getRule('SENIORITY_100');
  if (latest && latest.value === 150 && latest.version === 'v2') {
    logPass('getRule最新版本=150 ✓');
    passed++;
  } else {
    logFail('getRule最新版本', 'value=' + (latest ? latest.value : 'null'));
  }

  total++;
  const v1Again = rvm.getRule('SENIORITY_100', 'v1');
  if (v1Again && v1Again.value === 100) {
    logPass('v1历史版本value=100 ✓');
    passed++;
  } else {
    logFail('v1历史版本', 'value=' + (v1Again ? v1Again.value : 'null'));
  }

  total++;
  const changeRecordComplete = v2.changeUser === '王宁' &&
    v2.approvalNumber === 'HR-2026-08-001' &&
    v2.changeReason === '制度委员会决议' &&
    v2.changeTime;
  if (changeRecordComplete) {
    logPass('变更记录完整: changeUser=' + v2.changeUser + ', approvalNumber=' + v2.approvalNumber + ', changeReason=' + v2.changeReason + ', changeTime=' + v2.changeTime);
    passed++;
  } else {
    logFail('变更记录完整性', JSON.stringify(v2));
  }

  total++;
  const rb = rvm.rollbackRule('SENIORITY_100', 'v1');
  const latestAfterRB = rvm.getRule('SENIORITY_100');
  if (rb && latestAfterRB && latestAfterRB.value === 100) {
    logPass('回滚成功: rollback后latest.value=' + latestAfterRB.value + ', 新版本=' + rb.version);
    passed++;
  } else {
    logFail('回滚操作', 'latestAfterRB.value=' + (latestAfterRB ? latestAfterRB.value : 'null'));
  }

  console.log('\n📊 TR-4.3.1 测试结果: ' + passed + '/' + total + ' 通过');
  return passed === total;
}

function test_TR_4_3_2() {
  logDivider('TR-4.3.2 操作审计日志测试');
  const audit = new OperationAuditLog();
  let passed = 0;
  let total = 0;

  total++;
  const logEntry = audit.log({
    operatorId: 'WANG001',
    operatorName: '王宁',
    ip: '192.168.1.10',
    operationType: 'ADD_DEDUCT',
    affectedEmpId: 'ZHAO001',
    fieldName: 'performancePay',
    beforeValue: 0,
    afterValue: 1000,
    approvalNumber: 'AP-2026-08-002'
  });
  if (logEntry.logId && logEntry.timestamp) {
    logPass('日志写入成功: logId=' + logEntry.logId);
    passed++;
  } else {
    logFail('日志写入', '缺少logId或timestamp');
  }

  total++;
  const results = audit.queryLogs({ filterType: 'ADD_DEDUCT' });
  if (results.length === 1) {
    logPass('queryLogs ADD_DEDUCT返回1条 ✓');
    passed++;
  } else {
    logFail('queryLogs数量', '返回=' + results.length);
  }

  total++;
  const r = results[0];
  const fieldComplete = r.operatorId === 'WANG001' &&
    r.beforeValue === 0 &&
    r.afterValue === 1000 &&
    r.ip === '192.168.1.10';
  if (fieldComplete) {
    logPass('字段完整: operatorId=' + r.operatorId + ', before=' + r.beforeValue + ', after=' + r.afterValue + ', ip=' + r.ip);
    passed++;
  } else {
    logFail('字段完整性', JSON.stringify({ operatorId: r.operatorId, before: r.beforeValue, after: r.afterValue, ip: r.ip }));
  }

  total++;
  const oldDate = new Date(Date.now() - 190 * 24 * 60 * 60 * 1000).toISOString();
  const oldLog = {
    operatorId: 'OLD001',
    operatorName: '旧用户',
    ip: '10.0.0.1',
    operationType: 'OLD_OP',
    affectedEmpId: 'EMP_OLD',
    fieldName: 'oldField',
    beforeValue: 0,
    afterValue: 1,
    approvalNumber: 'OLD-APPR',
    timestamp: oldDate,
    logId: 'LOG-OLD-MANUAL'
  };
  audit.logs.push(oldLog);
  const beforeClean = audit.logs.length;
  const cleanResult = audit.autocleanExpiredLogs();
  if (cleanResult.removed >= 1 && audit.logs.length === beforeClean - 1) {
    logPass('autocleanExpiredLogs清理190天前老日志: removed=' + cleanResult.removed + ', remaining=' + cleanResult.remaining);
    passed++;
  } else {
    logFail('过期日志清理', 'before=' + beforeClean + ', after=' + audit.logs.length + ', cleanResult=' + JSON.stringify(cleanResult));
  }

  total++;
  const hasOld = audit.logs.some(l => l.logId === 'LOG-OLD-MANUAL');
  if (!hasOld) {
    logPass('190天前老日志已被清理，只保留≥180天 ✓');
    passed++;
  } else {
    logFail('老日志残留', 'LOG-OLD-MANUAL仍然存在');
  }

  console.log('\n📊 TR-4.3.2 测试结果: ' + passed + '/' + total + ' 通过');
  return passed === total;
}

function test_TR_4_3_3() {
  logDivider('TR-4.3.3 审计报告生成测试');
  const gen = new AuditReportGenerator();
  let passed = 0;
  let total = 0;

  total++;
  const report = gen.generateAuditReportPDF({ year: 2026, month: 8 });
  if (report.sections && report.sections.length === 8) {
    logPass('generateAuditReportPDF sections.length=8 ✓');
    passed++;
  } else {
    logFail('章节数量', 'sections.length=' + (report.sections ? report.sections.length : 0));
  }

  total++;
  const expectedSectionIds = ['employeeRoster', 'attendanceSummary', 'leaveBalance', 'payrollSummary', 'socialSummary', 'ruleVersions', 'operationLogs', 'approvalSLA'];
  const expectedTitles = ['HR花名册', '考勤汇总', '假期余额', '薪酬汇总', '社保公积金', '规则版本记录', '操作审计日志', '审批SLA报告'];
  const idsMatch = expectedSectionIds.every((id, idx) => report.sections[idx].sectionId === id);
  const titlesMatch = expectedTitles.every((t, idx) => report.sections[idx].title === t);
  if (idsMatch && titlesMatch) {
    logPass('8大章节完整: ' + expectedTitles.join(' | '));
    passed++;
  } else {
    logFail('章节匹配', 'ids=' + JSON.stringify(report.sections.map(s => s.sectionId)));
  }

  total++;
  const allHaveKeys = report.sections.every(s => s.contentKeys && s.contentKeys.length >= 1);
  if (allHaveKeys) {
    const counts = report.sections.map(s => s.title + '(' + s.contentKeys.length + '个keys)').join(', ');
    logPass('每章节contentKeys≥1: ' + counts);
    passed++;
  } else {
    logFail('contentKeys完整性', JSON.stringify(report.sections.map(s => ({ id: s.sectionId, keys: s.contentKeys ? s.contentKeys.length : 0 }))));
  }

  total++;
  const validation = gen.validateReportSections(report);
  if (validation.contentValid === '8/8') {
    logPass('validateReportSections contentValid=8/8 ✓');
    passed++;
  } else {
    logFail('validateReportSections', 'contentValid=' + validation.contentValid);
  }

  total++;
  const titlesOK = JSON.stringify(validation.sectionTitles) === JSON.stringify(expectedTitles);
  if (titlesOK) {
    logPass('sectionTitles顺序正确: ' + JSON.stringify(validation.sectionTitles));
    passed++;
  } else {
    logFail('sectionTitles匹配', 'actual=' + JSON.stringify(validation.sectionTitles));
  }

  total++;
  const download = gen.simulateDownloadAuditPDF();
  if (download.format === 'PDF标准A4' && download.pages === 18 && download.sections === 8 && download.pages >= 8) {
    logPass('simulateDownloadAuditPDF: format=' + download.format + ', pages=' + download.pages + '≥8, sections=' + download.sections + ' ✓ PDF格式规范');
    passed++;
  } else {
    logFail('simulateDownloadAuditPDF', JSON.stringify(download));
  }

  console.log('\n📊 TR-4.3.3 测试结果: ' + passed + '/' + total + ' 通过');
  return passed === total;
}

function main() {
  console.log('\n🚀 智慧化人资平台 Task4.3 - 合规审计引擎 测试启动');
  console.log('📁 核心文件: src/modules/audit/compliance_audit_engine.js');

  const r1 = test_TR_4_3_1();
  const r2 = test_TR_4_3_2();
  const r3 = test_TR_4_3_3();

  console.log('\n' + '#'.repeat(60));
  console.log('#  🏁 全部测试结果汇总');
  console.log('#'.repeat(60));
  console.log('#  TR-4.3.1 规则版本管理  : ' + (r1 ? '✅ PASS' : '❌ FAIL'));
  console.log('#  TR-4.3.2 操作审计日志  : ' + (r2 ? '✅ PASS' : '❌ FAIL'));
  console.log('#  TR-4.3.3 审计报告生成  : ' + (r3 ? '✅ PASS' : '❌ FAIL'));
  console.log('#'.repeat(60));
  const allPass = r1 && r2 && r3;
  console.log('#  总体结论: ' + (allPass ? '🎉 3个测试全部通过' : '⚠️ 存在失败用例'));
  console.log('#'.repeat(60) + '\n');

  return allPass ? 0 : 1;
}

process.exit(main());
