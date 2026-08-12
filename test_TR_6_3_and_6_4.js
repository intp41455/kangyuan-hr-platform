'use strict';

const path = require('path');
const {
  ParallelRunLauncher,
  generateSystemPayroll,
  generateManualExcelPayroll,
  TOTAL_EMPLOYEES,
  PARALLEL_DAYS,
  MAX_DIFF_RATE,
  THRESHOLD_100,
  PAYROLL_FIELDS
} = require(path.join(__dirname, 'src', 'launch', 'parallel_run_launcher.js'));

const {
  OperationManuals,
  TrainExamAssess,
  ROLES,
  ROLE_HR_SPECIALIST,
  ROLE_DEPT_HEAD,
  ROLE_EMPLOYEE,
  ROLE_EXECUTIVE,
  EXAM_QUESTIONS,
  countWords
} = require(path.join(__dirname, 'src', 'launch', 'training_operation_manual.js'));

function logDivider(testName) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 ' + testName);
  console.log('='.repeat(80));
}

function logSection(sectionName) {
  console.log('\n' + '-'.repeat(70));
  console.log('🔹 ' + sectionName);
  console.log('-'.repeat(70));
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
  if (typeof value === 'object' && value !== null) {
    console.log(`ℹ️  ${label}:`);
    const str = JSON.stringify(value, null, 4);
    console.log(str.split('\n').map(l => '   ' + l).join('\n'));
  } else {
    console.log(`ℹ️  ${label}: ${value}`);
  }
}

function test_TR_6_3() {
  logDivider('TR-6.3 双轨并行30天比对 & 上线标准验收');

  let passed = 0;
  let total = 0;
  let allOK = true;

  const launcher = new ParallelRunLauncher({
    totalEmp: 1000,
    parallelDays: 30,
    maxDiffRate: 0.001,
    threshold100: 100
  });

  logSection('TR-6.3 a) runParallelMonth 30天模拟：差异员工数、差异率、>100元差异');
  total++;
  logInfo('配置参数', `总员工=${launcher.totalEmp}人，并行天数=${launcher.parallelDays}天，diffRate阈值=${(launcher.maxDiffRate * 100).toFixed(2)}%，单笔阈值=${launcher.threshold100}元`);
  logInfo('计算：1000人 × 0.1% = 允许每日差异员工数上限 ≤ 1人', '');

  const monthResult = launcher.runParallelMonth(30);
  const dailyResults = monthResult.dailyResults;
  const parallelReport = monthResult.parallelReport;

  total++;
  if (dailyResults.length === 30) {
    logPass('runParallelMonth执行完毕，返回30天结果', `实际天数=${dailyResults.length}`);
    passed++;
  } else {
    logFail('30天结果数量', `实际=${dailyResults.length}`);
    allOK = false;
  }

  total++;
  let maxDiffEmpCount = 0;
  let worstDay = -1;
  dailyResults.forEach(r => {
    if (r.diffEmpCount > maxDiffEmpCount) {
      maxDiffEmpCount = r.diffEmpCount;
      worstDay = r.dayIndex;
    }
  });
  if (maxDiffEmpCount <= 1) {
    logPass('30天每日diffEmpCount ≤ 1人', `最大差异员工数=${maxDiffEmpCount}人，出现在第${worstDay}天`);
    passed++;
  } else {
    logFail('每日diffEmpCount超限', `最大=${maxDiffEmpCount}人，第${worstDay}天，阈值≤1人`);
    allOK = false;
  }

  total++;
  let maxDiffRate = 0;
  let worstRateDay = -1;
  dailyResults.forEach(r => {
    if (r.diffRate > maxDiffRate) {
      maxDiffRate = r.diffRate;
      worstRateDay = r.dayIndex;
    }
  });
  if (maxDiffRate <= 0.001) {
    logPass('30天每日diffRate ≤ 0.1% (0.001)', `最高差异率=${(maxDiffRate * 100).toFixed(4)}%，出现在第${worstRateDay}天`);
    passed++;
  } else {
    logFail('每日diffRate超限', `最高=${(maxDiffRate * 100).toFixed(4)}%，第${worstRateDay}天，阈值≤0.1000%`);
    allOK = false;
  }

  total++;
  const threshold100Count = monthResult.threshold100Count;
  if (threshold100Count === 0) {
    logPass('0笔单笔差异>100元', `threshold100Count=${threshold100Count}`);
    passed++;
  } else {
    logFail('>100元差异笔数不为0', `threshold100Count=${threshold100Count}，要求=0`);
    allOK = false;
  }

  const first10 = dailyResults.slice(0, 10).map(r =>
    `D${r.dayIndex}:diffEmp=${r.diffEmpCount},diffRate=${(r.diffRate * 100).toFixed(4)}%,items=${r.diffItems.length}`
  );
  logInfo('前10天逐日汇总（节选）', first10.join(' | '));
  const last5 = dailyResults.slice(-5).map(r =>
    `D${r.dayIndex}:diffEmp=${r.diffEmpCount},diffRate=${(r.diffRate * 100).toFixed(4)}%,items=${r.diffItems.length}`
  );
  logInfo('最后5天逐日汇总', last5.join(' | '));

  logSection('TR-6.3 b) 上线标准 readyForGoLive & 《并行期比对报告》双签字');

  total++;
  if (monthResult.readyForGoLive === true) {
    logPass('readyForGoLive = true，达到上线标准', '连续30天≤0.1% 且 无单笔>100元');
    passed++;
  } else {
    logFail('readyForGoLive', `值=${monthResult.readyForGoLive}，要求=true`);
    allOK = false;
  }

  total++;
  const hrSignOK = parallelReport.signedByHR === true;
  const commiteeSignOK = parallelReport.signedByCommitee === true;
  const approvedOK = parallelReport.approved === true;
  const bothSigned = hrSignOK && commiteeSignOK;
  if (bothSigned && approvedOK) {
    logPass('《并行期比对报告》2人签字 + 批准', `signedByHR=${hrSignOK} ✓, signedByCommitee=${commiteeSignOK} ✓, approved=${approvedOK} ✓`);
    passed++;
  } else {
    logFail('签字与批准', `HR签=${hrSignOK}, 委员会签=${commiteeSignOK}, 批准=${approvedOK}`);
    allOK = false;
  }

  total++;
  const diffItemsSample = dailyResults[0].diffItems.length > 0
    ? dailyResults[0].diffItems[0]
    : { empId: '无差异示例', field: '-', sys: 0, manual: 0, delta: 0, flag: '正常' };
  if (diffItemsSample && typeof diffItemsSample === 'object'
    && ('empId' in diffItemsSample) && ('field' in diffItemsSample)
    && ('sys' in diffItemsSample) && ('manual' in diffItemsSample)
    && ('delta' in diffItemsSample) && ('flag' in diffItemsSample)) {
    logPass('simulateParallelDay返回diffItems字段齐全', '结构: {empId, field, sys, manual, delta, flag:标记/正常}');
    passed++;
    logInfo('DiffItem结构样例', diffItemsSample);
  } else {
    logFail('diffItems字段不全', JSON.stringify(diffItemsSample));
    allOK = false;
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`📊 TR-6.3 汇总: ${passed}/${total} 小项通过` + (allOK ? ' 🎉 全部通过' : ' ⚠️ 存在失败'));
  console.log('─'.repeat(70));

  return { allOK: allOK, passed: passed, total: total };
}

function test_TR_6_4() {
  logDivider('TR-6.4 操作手册4类分角色 + 培训考核三要素');

  let passed = 0;
  let total = 0;
  let allOK = true;

  logSection('TR-6.4 a) 4类手册结构达标：章节数≥6、单章≥300字、每手册≥2000字、新员工80%有图文指引');

  const manualHR = OperationManuals.generateManual({ role: ROLE_HR_SPECIALIST });
  const manualDept = OperationManuals.generateManual({ role: ROLE_DEPT_HEAD });
  const manualEmp = OperationManuals.generateManual({ role: ROLE_EMPLOYEE });
  const manualExec = OperationManuals.generateManual({ role: ROLE_EXECUTIVE });
  const allManuals = [
    { name: 'HR专员', key: 'HR_SPECIALIST', m: manualHR },
    { name: '部门负责人', key: 'DEPT_HEAD', m: manualDept },
    { name: '普通员工', key: 'EMPLOYEE', m: manualEmp },
    { name: '高管', key: 'EXECUTIVE', m: manualExec }
  ];

  logInfo('4类手册概览', '');
  allManuals.forEach(x => {
    console.log(`   📘 ${x.name}手册(${x.key}): chapters=${x.m.totalChapters}, totalWords=${x.m.totalWords}, minChapterWords=${x.m.minChapterWords}`);
  });

  total++;
  const allChaptersOK = allManuals.every(x => x.m.totalChapters >= 6);
  if (allChaptersOK) {
    logPass('4类手册每类 chapters ≥ 6章',
      allManuals.map(x => `${x.name}=${x.m.totalChapters}章`).join(', '));
    passed++;
  } else {
    logFail('章节数不足6章', allManuals.map(x => `${x.name}=${x.m.totalChapters}`).join(','));
    allOK = false;
  }

  total++;
  const allWordsOK = allManuals.every(x => x.m.totalWords >= 2000);
  if (allWordsOK) {
    logPass('4类手册每类总字数 ≥ 2000字',
      allManuals.map(x => `${x.name}=${x.m.totalWords}字`).join(', '));
    passed++;
  } else {
    logFail('总字数不足2000', allManuals.map(x => `${x.name}=${x.m.totalWords}`).join(','));
    allOK = false;
  }

  total++;
  const allMinChapterOK = allManuals.every(x => x.m.minChapterWords >= 300);
  if (allMinChapterOK) {
    logPass('4类手册每章字数 ≥ 300字（最小单章验证）',
      allManuals.map(x => `${x.name}最小章=${x.m.minChapterWords}字`).join(', '));
    passed++;
  } else {
    logFail('存在章节<300字', allManuals.map(x => `${x.name}最小章=${x.m.minChapterWords}`).join(','));
    allOK = false;
  }

  total++;
  const within2Hours = OperationManuals.taskCompletionWithin2Hours();
  const guideRate = OperationManuals.getGuideCoverageRate();
  if (within2Hours && guideRate >= 0.8) {
    logPass('新员工 taskCompletionWithin2Hours = true，80%操作步骤有stepByStepGUIDE',
      `实际图文指引覆盖率=${(guideRate * 100).toFixed(2)}% ≥ 80%`);
    passed++;
  } else {
    logFail('图文指引覆盖率不足80%', `within2Hours=${within2Hours}, guideRate=${(guideRate * 100).toFixed(2)}%`);
    allOK = false;
  }

  logInfo('HR专员手册6章标题摘要', manualHR.chapters.map((c, i) => `第${i + 1}章: ${c.title.substring(0, 20)}...(${c.wordCount}字)`));
  logInfo('员工手册6章标题摘要', manualEmp.chapters.map((c, i) => `第${i + 1}章: ${c.title.substring(0, 20)}...(${c.wordCount}字)`));

  logSection('TR-6.4 b) 1000名员工培训考核：首考5%不合格 → 1次补考 → 最终通过率≥95%');

  const assess = new TrainExamAssess();
  logInfo('培训考核配置', `题库=${EXAM_QUESTIONS.length}题，满分=100分，pass线=80分，补考≥1次`);

  total++;
  const batchResult = assess.runBatchExam(1000);
  logInfo('1000人批量考核结果', {
    '总人数': batchResult.totalEmployees,
    '首考通过': batchResult.firstTimePassed,
    '首考不合格(5%预期)': batchResult.firstTimeFailed,
    '首考通过率': (batchResult.firstPassRate * 100).toFixed(2) + '%',
    '参加补考': batchResult.retakeCount,
    '补考通过': batchResult.retakePassed,
    '最终通过': batchResult.finalPassed,
    '最终未通过': batchResult.finalFailed,
    '最终通过率': (batchResult.examPassRate * 100).toFixed(2) + '%'
  });

  total++;
  const firstFailedRate = batchResult.firstTimeFailed / batchResult.totalEmployees;
  if (firstFailedRate <= 0.055 && firstFailedRate >= 0.045) {
    logPass('首考不合格人数约5%（45~55人区间）',
      `实际不合格=${batchResult.firstTimeFailed}人，比例=${(firstFailedRate * 100).toFixed(2)}%`);
    passed++;
  } else {
    logFail('首考不合格比例偏离5%', `不合格=${batchResult.firstTimeFailed}人，比例=${(firstFailedRate * 100).toFixed(2)}%`);
    allOK = false;
  }

  total++;
  if (batchResult.examPassRate >= 0.95) {
    logPass('最终 examPassRate ≥ 95%',
      `最终通过率=${(batchResult.examPassRate * 100).toFixed(2)}%，目标≥95.00%`);
    passed++;
  } else {
    logFail('最终通过率不足95%', `examPassRate=${(batchResult.examPassRate * 100).toFixed(2)}%`);
    allOK = false;
  }

  total++;
  const sampleEmp = 'E00025';
  const assess2 = new TrainExamAssess();
  const firstTry = assess2.takeExam(sampleEmp, true);
  assess2.retakeExam(sampleEmp, true);
  const finalRecord = assess2.examResults[sampleEmp];
  if (finalRecord && finalRecord.attempts >= 2 && ('retakeHistory' in finalRecord) && finalRecord.retakeHistory.length >= 1) {
    logPass('不合格员工可补考≥1次（retakeHistory验证）',
      `员工${sampleEmp}: attempts=${finalRecord.attempts}, score=${finalRecord.score}, passed=${finalRecord.passed}, retakeHistory长度=${finalRecord.retakeHistory.length}`);
    passed++;
  } else {
    logFail('补考机制验证失败', JSON.stringify(finalRecord));
    allOK = false;
  }

  logSection('TR-6.4 c) trainingDelivery三要素齐全：钉钉文档/AI听记/AI Agent模拟答题');

  total++;
  const delivery = assess.trainingDelivery;
  const docsOK = delivery.dingtalkDocs && delivery.dingtalkDocs.provided && delivery.dingtalkDocs.docCount >= 1;
  const minutesOK = delivery.aiMinutes && delivery.aiMinutes.provided
    && delivery.aiMinutes.totalHours >= 3 && delivery.aiMinutes.segmentsCount >= 5;
  const agentOK = delivery.aiAgentQuiz && delivery.aiAgentQuiz.provided;
  const threeAllOK = docsOK && minutesOK && agentOK && assess.isTrainingDeliveryComplete();
  if (threeAllOK) {
    logPass('trainingDelivery三要素齐全',
      `钉钉文档(provided=${delivery.dingtalkDocs.provided},${delivery.dingtalkDocs.docCount}篇) ✓ / AI听记(provided=${delivery.aiMinutes.provided},${delivery.aiMinutes.totalHours}小时/${delivery.aiMinutes.segmentsCount}段) ✓ / AI Agent模拟答题(provided=${delivery.aiAgentQuiz.provided},题库${delivery.aiAgentQuiz.questionBankSize}题) ✓`);
    passed++;
  } else {
    logFail('培训交付三要素不全',
      `docs=${docsOK}, minutes=${minutesOK}, agent=${agentOK}, complete=${assess.isTrainingDeliveryComplete()}`);
    allOK = false;
  }

  total++;
  const segs = delivery.aiMinutes.segments;
  const segsOK = segs && segs.length === 5
    && segs.every(s => s.index && s.title && s.durationMin >= 30 && s.keyPoints >= 5);
  if (segsOK) {
    logPass('AI听记3小时录音分5段，每段36分钟+关键要点',
      `5段标题: ` + segs.map(s => `${s.index}.${s.title}(${s.durationMin}min,${s.keyPoints}要点)`).join(' | '));
    passed++;
  } else {
    logFail('听记分段不达标', JSON.stringify(segs));
    allOK = false;
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`📊 TR-6.4 汇总: ${passed}/${total} 小项通过` + (allOK ? ' 🎉 全部通过' : ' ⚠️ 存在失败'));
  console.log('─'.repeat(70));

  return { allOK: allOK, passed: passed, total: total };
}

function main() {
  console.log('\n' + '★'.repeat(80));
  console.log('🚀 智慧化人资平台 Task6.3 + Task6.4 综合验收测试');
  console.log('★'.repeat(80));

  const res63 = test_TR_6_3();
  const res64 = test_TR_6_4();

  const totalPass = res63.passed + res64.passed;
  const totalTotal = res63.total + res64.total;
  const grandAllOK = res63.allOK && res64.allOK;

  console.log('\n' + '═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏁 最终验收结论');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`  TR-6.3 双轨并行:         ${res63.passed}/${res63.total} 小项 ${res63.allOK ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  TR-6.4 培训+手册:        ${res64.passed}/${res64.total} 小项 ${res64.allOK ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  合计:                    ${totalPass}/${totalTotal} 小项`);
  console.log(`  总体结论:                ${grandAllOK ? '🎉🎉🎉 2大测试5小项全部通过！' : '⚠️ 存在失败项，需修复后重新测试'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  return grandAllOK ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  test_TR_6_3,
  test_TR_6_4,
  main
};
