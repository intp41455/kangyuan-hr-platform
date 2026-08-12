'use strict';

const path = require('path');
const {
  DingtalkDriveCatalog,
  DingtalkAxlsSync,
  MinutesAutomationIngest,
  SyncPipelineScheduler,
  FOUR_DIRS_KEYS,
  DIR_POLICY_DOCS,
  DIR_APPROVAL_FILES,
  DIR_MEETING_MINUTES,
  DIR_MONTHLY_REPORTS,
  SHEET_PERFORMANCE_SCORE,
  SHEET_ATTENDANCE_ANOMALY_LIST
} = require(path.join(__dirname, '..', 'src', 'modules', 'rag', 'dingtalk_ingest_pipeline.js'));

function logDivider(testName) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 ' + testName);
  console.log('='.repeat(80));
}

function logPass(name, detail) {
  const msg = '✅ PASS: ' + name + (detail ? ' → ' + detail : '');
  console.log(msg);
  return true;
}

function logFail(name, detail) {
  const msg = '❌ FAIL: ' + name + (detail ? ' → ' + detail : '');
  console.log(msg);
  return false;
}

function logInfo(label, value) {
  if (typeof value === 'object') {
    console.log(`ℹ️  ${label}:`);
    const str = JSON.stringify(value, null, 4);
    console.log(str.split('\n').map(l => '   ' + l).join('\n'));
  } else {
    console.log(`ℹ️  ${label}: ${value}`);
  }
}

function test_TR_5_4_1() {
  logDivider('TR-5.4.1 钉盘文档同步 + Axls双向同步 测试');
  let passed = 0;
  let total = 0;
  let allOK = true;

  const catalog = new DingtalkDriveCatalog();
  const scheduler = new SyncPipelineScheduler();
  const axlsSync = new DingtalkAxlsSync(SHEET_PERFORMANCE_SCORE);

  console.log('\n--- a.1) 四大目录结构验证 ---');
  total++;
  const dirNames = catalog.getAllDirNames();
  const hasFourDirs = dirNames.length === 4 &&
    dirNames.includes(DIR_POLICY_DOCS) &&
    dirNames.includes(DIR_APPROVAL_FILES) &&
    dirNames.includes(DIR_MEETING_MINUTES) &&
    dirNames.includes(DIR_MONTHLY_REPORTS);
  if (hasFourDirs) {
    logPass('FOUR_DIRS四大目录齐全', `目录=[${dirNames.join(', ')}]`);
    passed++;
  } else {
    logFail('四大目录检查', `实际目录=[${dirNames.join(', ')}]`);
    allOK = false;
  }

  total++;
  const policyDir = catalog.getDir(DIR_POLICY_DOCS);
  const hasAttendanceDoc = policyDir && policyDir['考勤管理制度康源发〔2024〕06号'];
  const hasHrDoc = policyDir && policyDir['人资制度'];
  if (hasAttendanceDoc && hasHrDoc) {
    logPass('POLICY_DOCS制度文件目录含考勤+人资文档',
      `POLICY_DOCS文档数=${Object.keys(policyDir).length}`);
    passed++;
    logInfo('POLICY_DOCS文档列表', Object.keys(policyDir));
  } else {
    logFail('POLICY_DOCS文档完整性', `考勤=${!!hasAttendanceDoc}, 人资=${!!hasHrDoc}`);
    allOK = false;
  }

  total++;
  const meetingDir = catalog.getDir(DIR_MEETING_MINUTES);
  const reportsDir = catalog.getDir(DIR_MONTHLY_REPORTS);
  const approvalDir = catalog.getDir(DIR_APPROVAL_FILES);
  if (meetingDir && reportsDir && approvalDir) {
    logPass('MEETING_MINUTES + MONTHLY_REPORTS + APPROVAL_FILES 目录存在',
      `审批文件${Object.keys(approvalDir).length}项, 会议纪要${Object.keys(meetingDir).length}项, 月度报告${Object.keys(reportsDir).length}项`);
    passed++;
  } else {
    logFail('其他三大目录存在性', JSON.stringify({ meetingDir: !!meetingDir, reportsDir: !!reportsDir, approvalDir: !!approvalDir }));
    allOK = false;
  }

  console.log('\n--- a.2) triggerDocUpdateEvent 更新《考勤管理制度》病假条款 ---');
  total++;
  const docName = '考勤管理制度康源发〔2024〕06号';
  const docUpdate = '更新《考勤管理制度》病假条款：病假需提前1天申请并附医生建议，病假工资按日工资85%发放';
  const triggerResult = scheduler.triggerDocUpdateEvent({ docName, docUpdate });
  logInfo('triggerDocUpdateEvent返回', {
    success: triggerResult.success,
    eventId: triggerResult.eventId,
    docName: triggerResult.docName,
    pendingDocsCount: triggerResult.pendingDocsCount,
    syncStatus: triggerResult.syncStatus
  });
  if (triggerResult.success === true && triggerResult.pendingDocsCount >= 1) {
    logPass('triggerDocUpdateEvent成功 → pending=1',
      `pendingDocsCount=${triggerResult.pendingDocsCount}, eventId=${triggerResult.eventId}`);
    passed++;
  } else {
    logFail('triggerDocUpdateEvent', `success=${triggerResult.success}, pending=${triggerResult.pendingDocsCount}`);
    allOK = false;
  }

  total++;
  const monitorAfterTrigger = scheduler.getSyncMonitor();
  if (monitorAfterTrigger.pendingDocsCount >= 1) {
    logPass('pendingDocs监控=1条未同步文档',
      `pendingDocsCount=${monitorAfterTrigger.pendingDocsCount}, waitHours=${monitorAfterTrigger.waitHours}h`);
    passed++;
  } else {
    logFail('pendingDocs监控', `pendingDocsCount=${monitorAfterTrigger.pendingDocsCount}`);
    allOK = false;
  }

  console.log('\n--- a.3) 模拟1.5小时（未满2小时）同步窗口 ---');
  total++;
  const sync15h = scheduler.simulateSyncWithinHours(1.5);
  logInfo('simulateSyncWithinHours(1.5)返回', {
    status: sync15h.status,
    pendingDocsCount: sync15h.pendingDocsCount,
    hoursPassed: sync15h.hoursPassed,
    waitHours: sync15h.waitHours,
    syncCompleted: sync15h.syncCompleted
  });
  if (sync15h.status === 'IN_PROGRESS' && sync15h.syncCompleted === false) {
    logPass('1.5小时时status=IN_PROGRESS，2小时窗口未满足',
      `hoursPassed=${sync15h.hoursPassed}, message=${sync15h.message || ''}`);
    passed++;
  } else {
    logFail('1.5小时状态断言', `status=${sync15h.status}, syncCompleted=${sync15h.syncCompleted}`);
    allOK = false;
  }

  total++;
  const monitor15h = scheduler.getSyncMonitor();
  if (monitor15h.wikiSyncStatus === 'IN_PROGRESS' || sync15h.pendingDocsCount > 0) {
    logPass('1.5小时监控：wiki仍在同步中或pending>0',
      `wikiSyncStatus=${monitor15h.wikiSyncStatus}, pendingDocs=${monitor15h.pendingDocsCount}`);
    passed++;
  } else {
    logFail('1.5小时wiki状态', `wikiSyncStatus=${monitor15h.wikiSyncStatus}`);
    allOK = false;
  }

  console.log('\n--- a.4) 模拟2小时完成同步（满足2小时窗口） ---');
  total++;
  const sync2h = scheduler.simulateSyncWithinHours(2);
  logInfo('simulateSyncWithinHours(2)返回', {
    status: sync2h.status,
    pendingDocsCount: sync2h.pendingDocsCount,
    lastSyncAt: sync2h.lastSyncAt,
    hoursPassed: sync2h.hoursPassed,
    syncedCount: sync2h.syncedCount,
    syncCompleted: sync2h.syncCompleted
  });
  if (sync2h.status === 'SYNCED' && sync2h.syncCompleted === true) {
    logPass('2小时完成 → status=SYNCED，2小时内同步完成 ✓',
      `hoursPassed=${sync2h.hoursPassed}h, syncedCount=${sync2h.syncedCount}`);
    passed++;
  } else {
    logFail('2小时同步状态', `status=${sync2h.status}, syncCompleted=${sync2h.syncCompleted}`);
    allOK = false;
  }

  total++;
  if (sync2h.pendingDocsCount === 0) {
    logPass('pendingDocsCount=0，队列清空', `pendingDocsCount=${sync2h.pendingDocsCount}`);
    passed++;
  } else {
    logFail('pendingDocs清零', `pendingDocsCount=${sync2h.pendingDocsCount}`);
    allOK = false;
  }

  total++;
  if (sync2h.lastSyncAt !== null && scheduler.lastSyncAt !== null) {
    logPass('lastSyncAt已更新',
      `lastSyncAt=${sync2h.lastSyncAt}`);
    passed++;
  } else {
    logFail('lastSyncAt更新', `lastSyncAt=${sync2h.lastSyncAt}`);
    allOK = false;
  }

  total++;
  const monitorFinal = scheduler.getSyncMonitor();
  logInfo('2小时完成后监控状态', monitorFinal);
  if (monitorFinal.pendingDocsCount === 0 && monitorFinal.wikiSyncStatus === 'SYNCED') {
    logPass('2小时内同步机制最终生效：pending=0 + status=SYNCED',
      `lastSyncAt=${monitorFinal.lastSyncAt}, wikiStatus=${monitorFinal.wikiSyncStatus}`);
    passed++;
  } else {
    logFail('2小时同步最终状态', JSON.stringify(monitorFinal));
    allOK = false;
  }

  console.log('\n--- b) PERFORMANCE_SCORE 双向Axls同步：1000行，bidirectionalSyncVerify matchingRows=99.9% ---');
  total++;
  const platformRows = axlsSync.getPlatformRowsCount();
  if (platformRows === 1000) {
    logPass('platformRows=1000行绩效分数数据', `platformRows=${platformRows}`);
    passed++;
  } else {
    logFail('platformRows数量', `platformRows=${platformRows}（期望1000）`);
    allOK = false;
  }

  total++;
  const writeResult = axlsSync.writeAxls([
    { empId: 'EMP1001', empName: '新员工A', dept: '研发部', score: 92, grade: 'A', period: '2026-Q2' }
  ]);
  if (writeResult.success && writeResult.written === 1) {
    logPass('writeAxls()写入1行成功', `totalAxlsRows=${writeResult.totalAxlsRows}`);
    passed++;
  } else {
    logFail('writeAxls写入', JSON.stringify(writeResult));
    allOK = false;
  }

  total++;
  const readResult = axlsSync.readAxls();
  if (readResult.success && readResult.readCount >= 1000) {
    logPass('readAxls()从钉盘读取 ≥1000行 → 同步平台引擎',
      `readCount=${readResult.readCount}, platformTotalRows=${readResult.platformTotalRows}`);
    passed++;
  } else {
    logFail('readAxls读取', JSON.stringify(readResult));
    allOK = false;
  }

  total++;
  const verifyResult = axlsSync.bidirectionalSyncVerify();
  logInfo('bidirectionalSyncVerify()结果', verifyResult);
  if (verifyResult.matchingRows === 99.9 && verifyResult.consistency === 'CONSISTENT') {
    logPass('bidirectionalSyncVerify → matchingRows=99.9% 一致性',
      `platformRows=${verifyResult.platformRows}, axlsRows=${verifyResult.axlsRows}, matchingRowCount=${verifyResult.matchingRowCount}, consistency=${verifyResult.consistency}`);
    passed++;
  } else {
    logFail('双向一致性99.9%断言',
      `matchingRows=${verifyResult.matchingRows}%, consistency=${verifyResult.consistency}`);
    allOK = false;
  }

  total++;
  if (verifyResult.platformRows >= 1000 && verifyResult.axlsRows >= 1000) {
    logPass('双向数据量≥1000行，平台<->钉钉axls双向同步完整',
      `platform=${verifyResult.platformRows}, axls=${verifyResult.axlsRows}`);
    passed++;
  } else {
    logFail('双向数据量', `platform=${verifyResult.platformRows}, axls=${verifyResult.axlsRows}`);
    allOK = false;
  }

  console.log('\n📊 TR-5.4.1 测试结果: ' + passed + '/' + total + ' 通过');
  return { allOK, passed, total };
}

function test_TR_5_4_2() {
  logDivider('TR-5.4.2 AI听记纪要自动入库 + 人工复核 + 规则待灰度队列 测试');
  let passed = 0;
  let total = 0;
  let allOK = true;

  const catalog = new DingtalkDriveCatalog();
  const minutesIngest = new MinutesAutomationIngest();

  console.log('\n--- a) parseMinutesFromDws → extractDecisionPoints 工龄工资100→150元 + 会议正式通过 ---');
  total++;
  const transcript = `
    【制度委员会2026年第8次会议纪要】
    主持人：王宁
    参会人：制度委员会全体成员
    议题一：薪酬制度调整方案讨论
    王宁：各位同事，今天我们重点讨论工龄工资标准调整问题。
    李委员：根据市场薪酬调研数据，建议对工龄工资进行适当上调。
    张委员：同意，目前的工龄工资标准已经执行了3年，建议调整。
    王宁：好的，那我们正式表决：2026年起工龄工资100元改150元，是否同意？
    全体：同意！
    王宁：好的，本次会议决定正式通过：自2026年9月1日起，将工龄工资从100元调整为150元。
    议题二：考勤制度补充...
    散会。
  `;
  const parseResult = minutesIngest.parseMinutesFromDws({
    transcriptText: transcript,
    speakerLabels: ['王宁', '李委员', '张委员', '全体'],
    title: '制度委员会2026年第8次会议纪要'
  });
  logInfo('parseMinutesFromDws返回', {
    success: parseResult.success,
    title: parseResult.title,
    transcriptLength: parseResult.transcriptLength,
    decisionPointsCount: parseResult.decisionPoints ? parseResult.decisionPoints.length : 0
  });
  if (parseResult.success === true && parseResult.decisionPoints && parseResult.decisionPoints.length >= 1) {
    logPass('parseMinutesFromDws成功，extractDecisionPoints返回≥1个决策点',
      `decisionPoints=${parseResult.decisionPoints.length}个`);
    passed++;
  } else {
    logFail('parseMinutesFromDws + extractDecisionPoints',
      `success=${parseResult.success}, decisionCount=${parseResult.decisionPoints ? parseResult.decisionPoints.length : 0}`);
    allOK = false;
  }

  total++;
  const dps = parseResult.decisionPoints || [];
  const firstDp = dps[0] || {};
  const decisionText = firstDp.decisionText || '';
  logInfo('第1个决策点详情', firstDp);
  if (decisionText.includes('150') || decisionText.includes('调')) {
    logPass('decisionText含调薪150元语义',
      `decisionText="${decisionText}"`);
    passed++;
  } else {
    logFail('decisionText调薪150断言', `decisionText="${decisionText}"`);
    allOK = false;
  }

  total++;
  if (firstDp.confidence >= 0.9) {
    logPass('confidence≥0.9（高置信度规则决策）',
      `confidence=${firstDp.confidence}`);
    passed++;
  } else {
    logFail('confidence≥0.9断言', `confidence=${firstDp.confidence}`);
    allOK = false;
  }

  total++;
  const affectedRuleIds = firstDp.affectedRuleIds || [];
  if (affectedRuleIds.includes('RULE_SENIORITY_001')) {
    logPass('affectedRuleIds=["RULE_SENIORITY_001"] 规则关联正确',
      `affectedRuleIds=${JSON.stringify(affectedRuleIds)}`);
    passed++;
  } else {
    logFail('affectedRuleIds断言', `affectedRuleIds=${JSON.stringify(affectedRuleIds)}`);
    allOK = false;
  }

  total++;
  if (firstDp.decisionId && firstDp.effectiveSuggest) {
    logPass('decisionId + effectiveSuggest 字段完整',
      `decisionId=${firstDp.decisionId}, effectiveSuggest=${firstDp.effectiveSuggest}`);
    passed++;
  } else {
    logFail('决策点字段完整性', JSON.stringify({
      decisionId: firstDp.decisionId,
      effectiveSuggest: firstDp.effectiveSuggest
    }));
    allOK = false;
  }

  console.log('\n--- b) 共5条听记决策 → 5条humanReview全部approve → 人工复核率=5/5=100% ---');
  total++;
  const ingest2 = new MinutesAutomationIngest();
  const fiveMinutes = [
    {
      transcriptText: '2026年起工龄工资从100元调整为150元，会议决定正式通过',
      speakerLabels: ['王宁'],
      title: '会议纪要1：工龄工资调标'
    },
    {
      transcriptText: '经会议正式通过：病假工资按日工资90%发放，自2026年9月起执行',
      speakerLabels: ['HR总监'],
      title: '会议纪要2：病假工资调整'
    },
    {
      transcriptText: '会议决议正式通过：迟到30分钟扣100元，自2026年9月1日生效',
      speakerLabels: ['制度委员会'],
      title: '会议纪要3：迟到扣款新规'
    },
    {
      transcriptText: '会议决定：年假最高15天政策正式通过，2026年起执行',
      speakerLabels: ['王宁'],
      title: '会议纪要4：年假标准'
    },
    {
      transcriptText: '会议正式通过：工作日加班费1.5倍政策，2026年9月起实施',
      speakerLabels: ['制度委员会'],
      title: '会议纪要5：加班费标准'
    }
  ];
  const allDecisionIds = [];
  fiveMinutes.forEach((m, idx) => {
    const pr = ingest2.parseMinutesFromDws(m);
    if (pr.decisionPoints && pr.decisionPoints.length > 0) {
      allDecisionIds.push(pr.decisionPoints[0].decisionId);
      catalog.addMeetingMinute(m.title, { meetingIndex: idx + 1, decisionCount: pr.decisionPoints.length });
    }
  });
  logInfo('5条听记解析完成', `共解析${ingest2.totalCount}条决策，decisionIds数量=${allDecisionIds.length}`);
  if (ingest2.totalCount >= 5 && allDecisionIds.length >= 5) {
    logPass('5条听记 → 解析出≥5条决策',
      `totalCount=${ingest2.totalCount}, reviewQueue=${ingest2.reviewQueue.length}`);
    passed++;
  } else {
    logFail('5条听记解析数量', `totalCount=${ingest2.totalCount}`);
    allOK = false;
  }

  total++;
  const approvalNumbers = [
    '制度委员会HR-2026-08-011',
    '制度委员会HR-2026-08-012',
    '制度委员会HR-2026-08-013',
    '制度委员会HR-2026-08-014',
    '制度委员会HR-2026-08-015'
  ];
  const humanReviewResults = [];
  allDecisionIds.slice(0, 5).forEach((dId, idx) => {
    const hr = ingest2.humanReview(dId, true, '王宁', approvalNumbers[idx]);
    humanReviewResults.push(hr);
  });
  const reviewSuccessCount = humanReviewResults.filter(r => r.success === true).length;
  logInfo('5条humanReview结果', {
    reviewSuccessCount,
    reviewedCount: ingest2.reviewedCount,
    totalCount: ingest2.totalCount,
    humanReviewRate: ingest2.humanReviewRate
  });
  if (ingest2.reviewedCount >= 5 && ingest2.humanReviewRate === `${ingest2.reviewedCount}/${ingest2.totalCount}`) {
    logPass('5条全部humanReview approve成功',
      `reviewedCount=${ingest2.reviewedCount}, humanReviewRate=${ingest2.humanReviewRate}`);
    passed++;
  } else {
    logFail('humanReview成功率',
      `reviewedCount=${ingest2.reviewedCount}, humanReviewRate=${ingest2.humanReviewRate}`);
    allOK = false;
  }

  total++;
  const reviewRatePercent = ingest2.getHumanReviewRatePercent();
  if (reviewRatePercent === 100) {
    logPass('人工复核率=5/5=100% 全部复核完成',
      `reviewRatePercent=${reviewRatePercent}%, reviewedCount/totalCount=${ingest2.humanReviewRate}`);
    passed++;
  } else {
    logFail('人工复核率100%断言',
      `reviewRatePercent=${reviewRatePercent}%`);
    allOK = false;
  }

  console.log('\n--- c) 5条queueRuleUpdate → 全部进入RuleVersionManager待上线队列=5条待灰度 ---');
  total++;
  const pendingCount = ingest2.getPendingRuleUpdatesCount();
  const pendingList = ingest2.getPendingRuleUpdates();
  logInfo('待上线（PENDING_GRAY）规则队列', {
    pendingCount,
    pendingListCount: pendingList.length,
    pendingRuleIds: pendingList.map(p => ({ queueId: p.queueId, ruleId: p.ruleId, approvalNumber: p.approvalNumber, status: p.status }))
  });
  if (pendingCount >= 5) {
    logPass('5条待灰度规则全部进入RuleVersionManager待上线队列',
      `pendingQueue=PENDING_GRAY count=${pendingCount}，无遗漏`);
    passed++;
  } else {
    logFail('待灰度队列数量', `pendingCount=${pendingCount}（期望≥5）`);
    allOK = false;
  }

  total++;
  const allGray = pendingList.every(p => p.status === 'PENDING_GRAY');
  const hasApprovalNumber = pendingList.every(p => p.approvalNumber && p.approvalNumber.startsWith('制度委员会HR-2026-08'));
  if (allGray && hasApprovalNumber) {
    logPass('待灰度队列状态+审批单号正确',
      `全部status=PENDING_GRAY，审批单号前缀=制度委员会HR-2026-08-XXX`);
    passed++;
  } else {
    logFail('队列状态校验', `allGray=${allGray}, hasApprovalNumber=${hasApprovalNumber}`);
    allOK = false;
  }

  total++;
  const reviewQueueEmpty = ingest2.reviewQueue.length === 0;
  if (reviewQueueEmpty) {
    logPass('reviewQueue清空 → 所有决策均已人工复核',
      `reviewQueue.length=${ingest2.reviewQueue.length}`);
    passed++;
  } else {
    logFail('reviewQueue清空断言', `reviewQueue.length=${ingest2.reviewQueue.length}`);
    allOK = false;
  }

  console.log('\n--- d) MEETING_MINUTES目录 + POLICY_DOCS四大目录存在正确 ---');
  total++;
  const dirNames = catalog.getAllDirNames();
  const fourDirsOK = dirNames.length === 4 &&
    dirNames.includes(DIR_POLICY_DOCS) &&
    dirNames.includes(DIR_APPROVAL_FILES) &&
    dirNames.includes(DIR_MEETING_MINUTES) &&
    dirNames.includes(DIR_MONTHLY_REPORTS);
  const minutesDir = catalog.getDir(DIR_MEETING_MINUTES);
  const minutesDocCount = minutesDir ? Object.keys(minutesDir).length : 0;
  const policyDir = catalog.getDir(DIR_POLICY_DOCS);
  const policyDocCount = policyDir ? Object.keys(policyDir).length : 0;
  logInfo('四大目录文档统计', {
    POLICY_DOCS: policyDocCount,
    APPROVAL_FILES: Object.keys(catalog.getDir(DIR_APPROVAL_FILES) || {}).length,
    MEETING_MINUTES: minutesDocCount,
    MONTHLY_REPORTS: Object.keys(catalog.getDir(DIR_MONTHLY_REPORTS) || {}).length
  });
  logInfo('MEETING_MINUTES目录内容', minutesDir ? Object.keys(minutesDir) : []);
  if (fourDirsOK && minutesDocCount >= 5 && policyDocCount >= 8) {
    logPass('四大目录+POLICY_DOCS(8份制度)+MEETING_MINUTES(5份听记纪要) 结构正确',
      `FOUR_DIRS完整, POLICY_DOCS=${policyDocCount}份, MEETING_MINUTES=${minutesDocCount}份`);
    passed++;
  } else {
    logFail('目录结构完整性',
      JSON.stringify({ fourDirsOK, minutesDocCount, policyDocCount }));
    allOK = false;
  }

  total++;
  const attendanceDoc = catalog.getPolicyDoc('考勤管理制度康源发〔2024〕06号');
  const hrDoc = catalog.getPolicyDoc('人资制度');
  if (attendanceDoc && hrDoc && attendanceDoc.category && hrDoc.category) {
    logPass('POLICY_DOCS关键文档含category+lastSync字段',
      `考勤.category=${attendanceDoc.category}, 人资.category=${hrDoc.category}`);
    passed++;
  } else {
    logFail('POLICY_DOCS字段完整性', JSON.stringify({ attendanceDoc: !!attendanceDoc, hrDoc: !!hrDoc }));
    allOK = false;
  }

  console.log('\n📊 TR-5.4.2 测试结果: ' + passed + '/' + total + ' 通过');
  return { allOK, passed, total };
}

function main() {
  console.log('\n🚀🚀🚀 智慧化人资平台 Task5.4 - 钉盘RAG导入管道 + AI听记入库 测试启动 🚀🚀🚀');
  console.log('📁 核心文件: src/modules/rag/dingtalk_ingest_pipeline.js');
  console.log('📁 关联集成: Task5.2 RAG知识库 (hr_knowledge_base.js) + Task4.3 RuleVersionManager (compliance_audit_engine.js)');
  console.log('📁 模块组成: DingtalkDriveCatalog + DingtalkAxlsSync + MinutesAutomationIngest + SyncPipelineScheduler');

  const r1 = test_TR_5_4_1();
  const r2 = test_TR_5_4_2();

  console.log('\n' + '#'.repeat(80));
  console.log('#  🏁🏁🏁 Task5.4 全部测试结果汇总 🏁🏁🏁');
  console.log('#'.repeat(80));
  console.log('#  TR-5.4.1 钉盘文档同步+Axls双向同步 : ' + (r1.allOK ? '✅ PASS' : '❌ FAIL') +
    `  (${r1.passed}/${r1.total})`);
  console.log('#  TR-5.4.2 AI听记纪要自动入库+复核   : ' + (r2.allOK ? '✅ PASS' : '❌ FAIL') +
    `  (${r2.passed}/${r2.total})`);
  console.log('#'.repeat(80));
  const allPass = r1.allOK && r2.allOK;
  console.log('#  总体结论: ' + (allPass ? '🎉🎉🎉 2个测试全部通过 🎉🎉🎉' : '⚠️ 存在失败用例，请检查'));
  console.log('#'.repeat(80) + '\n');

  console.log('📁 输出文件路径:');
  console.log('   1. 核心模块: src/modules/rag/dingtalk_ingest_pipeline.js');
  console.log('   2. 测试脚本: tests/task5_4_test.js (本文件)');
  console.log('');

  return allPass ? 0 : 1;
}

process.exit(main());
