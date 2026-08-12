'use strict';

const {
  RulesRepository,
  CIPipelineEngine,
  GrayReleaseManager,
  getPRTemplate,
  validatePRTemplateFields
} = require('./src/modules/ci/github_rule_ci_pipeline');

function logDivider(testName) {
  console.log('\n' + '='.repeat(70));
  console.log('📋 ' + testName);
  console.log('='.repeat(70));
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
    console.log(`ℹ️  ${label}: ${JSON.stringify(value, null, 2)}`);
  } else {
    console.log(`ℹ️  ${label}: ${value}`);
  }
}

async function test_TR_4_4_1() {
  logDivider('TR-4.4.1 CI流水线：正常PR + 注入错误PR');
  let passedTests = 0;
  let totalTests = 0;
  let allOK = true;

  const ciEngine = new CIPipelineEngine();
  const repo = new RulesRepository(process.cwd());

  totalTests++;
  logInfo('【A】构造正常规则PR（修改工龄工资规则R-023）', '');
  const normalPR = {
    prId: 'PR-2026-08-011',
    changedFiles: ['rules/rule_R-023_seniority.json'],
    author: '王宁'
  };
  const normalRuleContent = {
    rCode: 'R-023',
    name: '工龄工资标准',
    category: '§12薪酬',
    seniorityMultiplier: 100,
    formula: 'context.seniorityYears * 100',
    effectiveDate: '2026-07-01'
  };
  const normalStagedFiles = [
    { filePath: 'rules/rule_R-023_seniority.json', ruleContent: normalRuleContent }
  ];

  totalTests++;
  const stagedList = repo.getRuleFilesStagedInPR(normalPR);
  if (stagedList.length === 1 && stagedList[0].includes('rule_R-023')) {
    logPass('RulesRepository.getRuleFilesStagedInPR → 检出1条规则文件', `stagedList=${JSON.stringify(stagedList)}`);
    passedTests++;
  } else {
    logFail('RulesRepository.getRuleFilesStagedInPR', `stagedList=${JSON.stringify(stagedList)}`);
    allOK = false;
  }

  totalTests++;
  logInfo('启动runPipeline → Step1~Step4', '');
  const pipelineResult = await ciEngine.runPipeline({ prData: normalPR, stagedRuleFiles: normalStagedFiles });
  console.log('');
  logInfo('Pipeline最终状态', `canMerge=${pipelineResult.canMerge}, status=${pipelineResult.status}`);
  logInfo('prBlockedComment', pipelineResult.prBlockedComment);
  pipelineResult.stepsResult.forEach(s => {
    logInfo(`  ${s.name}`, `status=${s.status}, passRate=${s.passRate}` +
      (s.empDiffRate !== undefined ? `, empDiffRate=${(s.empDiffRate * 100).toFixed(4)}%` : ''));
  });

  totalTests++;
  if (pipelineResult.canMerge === true) {
    logPass('正常PR → canMerge=true', '允许合并');
    passedTests++;
  } else {
    logFail('正常PR canMerge', `canMerge=${pipelineResult.canMerge}`);
    allOK = false;
  }

  totalTests++;
  if (pipelineResult.status === 'READY_TO_MERGE') {
    logPass('正常PR → status=READY_TO_MERGE', '✓');
    passedTests++;
  } else {
    logFail('正常PR status', `status=${pipelineResult.status}`);
    allOK = false;
  }

  totalTests++;
  const step1 = pipelineResult.stepsResult.find(s => s.step === 1);
  if (step1 && step1.passRate === '403/403') {
    logPass('Step1单元测试通过率=403/403', `passed=${step1.passed}/${step1.total}`);
    passedTests++;
  } else {
    logFail('Step1单元测试通过率', step1 ? step1.passRate : 'null');
    allOK = false;
  }

  totalTests++;
  const step2 = pipelineResult.stepsResult.find(s => s.step === 2);
  if (step2 && step2.passRate === '3/3') {
    logPass('Step2集成测试通过率=3/3', '3条核心流程全部通过');
    passedTests++;
  } else {
    logFail('Step2集成测试通过率', step2 ? step2.passRate : 'null');
    allOK = false;
  }

  totalTests++;
  const step3 = pipelineResult.stepsResult.find(s => s.step === 3);
  const step4 = pipelineResult.stepsResult.find(s => s.step === 4);
  const juneOK = step3 && step3.empDiffRate <= 0.001;
  const julyOK = step4 && step4.empDiffRate <= 0.001;
  if (juneOK && julyOK) {
    logPass('6/7月工资回放 empDiffRate≤0.1%',
      `6月=${(step3.empDiffRate * 100).toFixed(4)}%, 7月=${(step4.empDiffRate * 100).toFixed(4)}%`);
    passedTests++;
  } else {
    logFail('6/7月回放误差率',
      `6月=${step3 ? (step3.empDiffRate * 100).toFixed(4) + '%' : 'null'}, 7月=${step4 ? (step4.empDiffRate * 100).toFixed(4) + '%' : 'null'}`);
    allOK = false;
  }

  totalTests++;
  logInfo('\n【B】构造错误PR → 故意注入SENIORITY=300错误', '');
  const bugPR = {
    prId: 'PR-2026-08-012-BUG',
    changedFiles: ['rules/rule_R-023_buggy.json'],
    author: '测试人员'
  };
  const buggyRuleContent = {
    rCode: 'R-023',
    name: '工龄工资标准(错误版)',
    category: '§12薪酬',
    SENIORITY: 300,
    formula: 'context.seniorityYears * 300',
    effectiveDate: '2026-07-01'
  };
  const bugStagedFiles = [
    { filePath: 'rules/rule_R-023_buggy.json', ruleContent: buggyRuleContent }
  ];

  const bugPipelineResult = await ciEngine.runPipeline({ prData: bugPR, stagedRuleFiles: bugStagedFiles });
  console.log('');
  logInfo('【BUG PR】Pipeline最终状态',
    `canMerge=${bugPipelineResult.canMerge}, status=${bugPipelineResult.status}`);
  logInfo('prBlockedComment', bugPipelineResult.prBlockedComment);
  bugPipelineResult.stepsResult.forEach(s => {
    logInfo(`  ${s.name}`, `status=${s.status}, passRate=${s.passRate}`);
  });

  totalTests++;
  if (bugPipelineResult.canMerge === false) {
    logPass('错误PR → canMerge=false', '✓ 自动阻止合并');
    passedTests++;
  } else {
    logFail('错误PR canMerge', `canMerge=${bugPipelineResult.canMerge} （应阻止）`);
    allOK = false;
  }

  totalTests++;
  if (bugPipelineResult.prBlockedComment &&
    bugPipelineResult.prBlockedComment.reason === 'Step1单元测试FAILED') {
    logPass('prBlockedComment存在且reason正确',
      `reason=${bugPipelineResult.prBlockedComment.reason}, detail=${bugPipelineResult.prBlockedComment.detail}`);
    passedTests++;
  } else {
    logFail('prBlockedComment校验',
      bugPipelineResult.prBlockedComment ? JSON.stringify(bugPipelineResult.prBlockedComment) : 'null');
    allOK = false;
  }

  totalTests++;
  const bugStep1 = bugPipelineResult.stepsResult.find(s => s.step === 1);
  if (bugStep1 && bugStep1.status === 'FAIL' && bugStep1.failed === 1) {
    logPass('Step1单元测试：1条失败',
      `passed=${bugStep1.passed}, failed=${bugStep1.failed}`);
    passedTests++;
  } else {
    logFail('Step1失败断言', bugStep1 ? `status=${bugStep1.status}, failed=${bugStep1.failed}` : 'null');
    allOK = false;
  }

  console.log('\n📊 TR-4.4.1 测试结果: ' + passedTests + '/' + totalTests + ' 通过');
  return { allOK, passedTests, totalTests };
}

async function test_TR_4_4_2() {
  logDivider('TR-4.4.2 灰度发布+回滚机制测试');
  let passedTests = 0;
  let totalTests = 0;
  let allOK = true;

  const grayMgr = new GrayReleaseManager();

  totalTests++;
  logInfo('【A】调用startGrayRelease("v2.0")', '');
  const grayState = grayMgr.startGrayRelease('v2.0', {
    triggeredBy: '王宁',
    approvalNo: 'HR-2026-08-012'
  });
  logInfo('灰度初始状态', grayState);

  totalTests++;
  if (grayState.status === 'GRAY_PERIOD') {
    logPass('灰度status=GRAY_PERIOD', '✓');
    passedTests++;
  } else {
    logFail('灰度status', `actual=${grayState.status}`);
    allOK = false;
  }

  totalTests++;
  if (grayState.daysLeft === 7) {
    logPass('daysLeft=7', `startDate=${grayState.startDate}`);
    passedTests++;
  } else {
    logFail('daysLeft值', `actual=${grayState.daysLeft}`);
    allOK = false;
  }

  totalTests++;
  if (grayState.canaryGroupSize === '测试部15人') {
    logPass('canaryGroupSize=测试部15人', '金丝雀群体正确');
    passedTests++;
  } else {
    logFail('canaryGroupSize', `actual=${grayState.canaryGroupSize}`);
    allOK = false;
  }

  totalTests++;
  logInfo('\n模拟每日递增：day=1→day=6 + daysOfStableNoIssues=true', '');
  for (let d = 1; d <= 6; d++) {
    grayMgr.dayIncrementTrigger(d, true);
  }
  const day6State = grayMgr.getReleaseState('v2.0');
  logInfo('day=6状态', day6State ? { daysLeft: day6State.daysLeft, status: day6State.status } : null);

  totalTests++;
  logInfo('day=7 + daysOfStableNoIssues=true → 应自动全量', '');
  const day7States = grayMgr.dayIncrementTrigger(7, true);
  const day7Final = Array.isArray(day7States) ? day7States[0] : day7States;
  logInfo('day=7最终状态', day7Final);

  totalTests++;
  if (day7Final.status === 'FULLY_DEPLOYED') {
    logPass('day=7稳定无问题 → 自动全量=FULLY_DEPLOYED', '✓ 灰度期7天届满');
    passedTests++;
  } else {
    logFail('自动全量状态', `actual=${day7Final.status}`);
    allOK = false;
  }

  totalTests++;
  if (day7Final.daysLeft === 0) {
    logPass('daysLeft=0', '✓ 灰度期已消耗完毕');
    passedTests++;
  } else {
    logFail('daysLeft=0', `actual=${day7Final.daysLeft}`);
    allOK = false;
  }

  totalTests++;
  logInfo('\n【B】另一个灰度版本v2.0-RollbackTest：day=3触发rollback', '');
  const grayMgr2 = new GrayReleaseManager();
  grayMgr2.startGrayRelease('v2.0-RBT', { canaryGroupSize: '测试部15人' });
  grayMgr2.dayIncrementTrigger(1, true);
  grayMgr2.dayIncrementTrigger(2, true);
  grayMgr2.dayIncrementTrigger(3, false);

  const rollbackResult = grayMgr2.rollbackTrigger({
    reason: '教育板块算薪BUG',
    rollbackVersion: 'v1.9'
  });
  logInfo('rollbackTrigger返回', rollbackResult);

  totalTests++;
  if (rollbackResult.status === 'ROLLED_BACK') {
    logPass('回滚后status=ROLLED_BACK', `reason=${rollbackResult.rollbackReason}`);
    passedTests++;
  } else {
    logFail('回滚status', `actual=${rollbackResult.status}`);
    allOK = false;
  }

  totalTests++;
  if (rollbackResult.rollbackToVersion === 'v1.9') {
    logPass('rollbackVersion=v1.9 恢复版本正确', `restoreVersion()已触发`);
    passedTests++;
  } else {
    logFail('rollbackToVersion', `actual=${rollbackResult.rollbackToVersion}`);
    allOK = false;
  }

  totalTests++;
  if (rollbackResult.rollbackReason === '教育板块算薪BUG') {
    logPass('rollbackReason正确记录', `=${rollbackResult.rollbackReason}`);
    passedTests++;
  } else {
    logFail('rollbackReason', `actual=${rollbackResult.rollbackReason}`);
    allOK = false;
  }

  console.log('\n📊 TR-4.4.2 测试结果: ' + passedTests + '/' + totalTests + ' 通过');
  return { allOK, passedTests, totalTests };
}

async function test_TR_4_4_3() {
  logDivider('TR-4.4.3 PR模板校验测试');
  let passedTests = 0;
  let totalTests = 0;
  let allOK = true;

  totalTests++;
  const template = getPRTemplate();
  logInfo('getPRTemplate()返回', template);

  totalTests++;
  const expectedFields = ['制度委员会审批单号', '变更影响范围', '回滚计划版本号'];
  const fieldsMatch = template.requiredFields &&
    template.requiredFields.length === 3 &&
    expectedFields.every(f => template.requiredFields.includes(f));
  if (fieldsMatch) {
    logPass('requiredFields包含3个必填字段', `=${template.requiredFields.join(' | ')}`);
    passedTests++;
  } else {
    logFail('requiredFields匹配', template.requiredFields ? JSON.stringify(template.requiredFields) : 'null');
    allOK = false;
  }

  totalTests++;
  logInfo('\n【A】完整PRBody校验', '');
  const completeBody = `
# 规则变更PR

## 制度委员会审批单号：HR-2026-08-003

## 变更影响范围
教育板块、薪酬模块、工龄工资公式(R-023)，影响全部员工工龄工资计算

## 回滚计划版本号：v1.9

### 变更说明
根据2026年8月制度委员会决议调整工龄系数
`;
  const validResult = validatePRTemplateFields({ prBody: completeBody });
  logInfo('validatePRTemplateFields结果', validResult);

  totalTests++;
  if (validResult.templatePass === true) {
    logPass('完整PR → templatePass=true', '全部必填字段VALID');
    passedTests++;
  } else {
    logFail('完整PR templatePass', `=${validResult.templatePass}, missing=${JSON.stringify(validResult.missingFields)}`);
    allOK = false;
  }

  totalTests++;
  if (validResult.missingFields && validResult.missingFields.length === 0) {
    logPass('missingFields为空数组[]', '无缺失字段');
    passedTests++;
  } else {
    logFail('missingFields空', JSON.stringify(validResult.missingFields));
    allOK = false;
  }

  totalTests++;
  logInfo('\n【B】缺失审批单号PRBody校验', '');
  const incompleteBody = `
# 规则变更PR (不完整)

## 变更影响范围
薪酬模块局部调整

## 回滚计划版本号：v1.9

缺失：制度委员会审批单号
`;
  const invalidResult = validatePRTemplateFields({ prBody: incompleteBody });
  logInfo('缺失字段校验结果', invalidResult);

  totalTests++;
  if (invalidResult.templatePass === false) {
    logPass('缺失审批单号 → templatePass=false', '✓');
    passedTests++;
  } else {
    logFail('缺失字段templatePass', `=${invalidResult.templatePass}`);
    allOK = false;
  }

  totalTests++;
  const missingApproval = invalidResult.missingFields &&
    invalidResult.missingFields.includes('制度委员会审批单号');
  if (missingApproval) {
    logPass('missingFields=["制度委员会审批单号"]', `actual=${JSON.stringify(invalidResult.missingFields)}`);
    passedTests++;
  } else {
    logFail('missingFields缺失审批单号断言', JSON.stringify(invalidResult.missingFields));
    allOK = false;
  }

  totalTests++;
  if (invalidResult.canMerge === false) {
    logPass('缺失字段 → canMerge=false（不允许合并）', '✓');
    passedTests++;
  } else {
    logFail('canMerge应为false', `=${invalidResult.canMerge}`);
    allOK = false;
  }

  console.log('\n📊 TR-4.4.3 测试结果: ' + passedTests + '/' + totalTests + ' 通过');
  return { allOK, passedTests, totalTests };
}

async function main() {
  console.log('\n🚀🚀🚀 智慧化人资平台 Task4.4 - GitHub规则CI流水线+灰度+PR模板 测试启动 🚀🚀🚀');
  console.log('📁 核心文件: src/modules/ci/github_rule_ci_pipeline.js');
  console.log('📁 关联集成: RuleVersionManager(Task4.3) + RuleEngine(Task1.7)');

  try {
    const r1Result = await test_TR_4_4_1();
    const r1 = r1Result.allOK;

    const r2Result = await test_TR_4_4_2();
    const r2 = r2Result.allOK;

    const r3Result = await test_TR_4_4_3();
    const r3 = r3Result.allOK;

    console.log('\n' + '#'.repeat(70));
    console.log('#  🏁🏁🏁 Task4.4 全部测试结果汇总 🏁🏁🏁');
    console.log('#'.repeat(70));
    console.log('#  TR-4.4.1 CI流水线(正常+错误PR) : ' + (r1 ? '✅ PASS' : '❌ FAIL') +
      `  (${r1Result.passedTests}/${r1Result.totalTests})`);
    console.log('#  TR-4.4.2 灰度发布+回滚机制     : ' + (r2 ? '✅ PASS' : '❌ FAIL') +
      `  (${r2Result.passedTests}/${r2Result.totalTests})`);
    console.log('#  TR-4.4.3 PR模板必填校验        : ' + (r3 ? '✅ PASS' : '❌ FAIL') +
      `  (${r3Result.passedTests}/${r3Result.totalTests})`);
    console.log('#'.repeat(70));
    const allPass = r1 && r2 && r3;
    console.log('#  总体结论: ' + (allPass ? '🎉🎉🎉 3个测试全部通过 🎉🎉🎉' : '⚠️ 存在失败用例，请检查'));
    console.log('#'.repeat(70) + '\n');

    return allPass ? 0 : 1;
  } catch (err) {
    console.error('\n💥💥💥 主流程异常:', err);
    console.error(err.stack);
    return 1;
  }
}

main().then(code => {
  process.exit(code);
}).catch(err => {
  console.error('致命异常:', err);
  process.exit(1);
});
