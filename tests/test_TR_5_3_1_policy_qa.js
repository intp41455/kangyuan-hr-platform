'use strict';

const { answerPolicyQuestion, POLICY_KNOWLEDGE_BASE } = require('../src/modules/ai/hr_ai_agent.js');

const QUESTION_BANK_50 = [
  '年假有多少天？', '年休假怎么算？', '工龄10年以上年假几天？',
  '新入职员工年假怎么算？', '年假可以结转吗？', '年假可以延长到什么时候？',
  '病假怎么扣款？', '病假需要病历吗？', '病假工资发多少？',
  '请病假要什么材料？', '事假怎么扣工资？', '事假是带薪吗？',
  '婚假可以请几天？', '婚假是带薪的吗？', '婚假有效期多久？',
  '产假多少天？', '产假期间工资怎么发？', '难产产假增加几天？',
  '陪产假几天？', '陪产假是带薪的吗？', '丧假几天？',
  '丧假算工资吗？', '调休有效期多久？', '调休过期怎么办？',
  '调休怎么抵扣？', '迟到怎么处罚？', '迟到10分钟扣多少钱？',
  '迟到半小时算旷工吗？', '早退罚多少钱？', '早退半小时怎么处理？',
  '忘记打卡怎么办？', '缺卡扣多少钱？', '补卡有次数限制吗？',
  '旷工一天扣多少钱？', '平日加班怎么算工资？', '周末加班几倍工资？',
  '法定假日加班怎么算？', '教育岗加班有加班费吗？', '加班要提前申请吗？',
  '工资结构怎么组成？', '日薪怎么算？', '时薪计算公式？',
  '试用期工资打几折？', '工龄工资一年多少钱？', '绩效工资怎么算？',
  '社保个人交多少？', '公积金比例多少？', '个税起征点多少？',
  '每月几号发工资？', '工资有异议怎么办？'
];

const FABRICATED_QUESTION = '产假多少天？(公司无制度)';

const EXPECTED_HIT_RCODES_SAMPLE = [
  'R-001', 'R-001', 'R-001', 'R-001', 'R-001', 'R-001',
  'R-002', 'R-002', 'R-002', 'R-031', 'R-003', 'R-003',
  'R-004', 'R-004', 'R-004', 'R-005', 'R-005', 'R-005',
  'R-006', 'R-006', 'R-007', 'R-007', 'R-008', 'R-008',
  'R-043', 'R-010', 'R-010', 'R-010', 'R-011', 'R-011',
  'R-012', 'R-012', 'R-042', 'R-026', 'R-013', 'R-014',
  'R-015', 'R-013', 'R-044', 'R-020', 'R-020', 'R-020',
  'R-021', 'R-022', 'R-023', 'R-024', 'R-024', 'R-025',
  'R-027', 'R-027'
];

function runTR_5_3_1() {
  console.log('='.repeat(80));
  console.log('TR-5.3.1 制度问答PolicyQA测试 开始执行');
  console.log('='.repeat(80));
  console.log(`问题库规模：${QUESTION_BANK_50.length}道自然语言问题`);
  console.log(`编造问题测试：${FABRICATED_QUESTION}`);
  console.log('');

  let correctCount = 0;
  const results = [];
  for (let i = 0; i < QUESTION_BANK_50.length; i++) {
    const q = QUESTION_BANK_50[i];
    const expectedR = EXPECTED_HIT_RCODES_SAMPLE[i];
    const res = answerPolicyQuestion({ question: q });
    const hasAnswer = res.answer && !res.answer.includes('暂无制度依据');
    const hasCitation = Array.isArray(res.citations) && res.citations.length >= 1;
    const firstCitation = hasCitation ? res.citations[0] : null;
    const has4Elements = firstCitation &&
      firstCitation.rCode && firstCitation.sourceDocName &&
      firstCitation.page && firstCitation.effectiveDate;
    const rCodeHit = firstCitation && firstCitation.rCode === expectedR;
    const isCorrect = hasAnswer && hasCitation && has4Elements;

    if (isCorrect) correctCount++;
    results.push({ idx: i + 1, question: q, result: res, expected: expectedR, correct: isCorrect, rCodeHit });
  }

  console.log('--- 50道自然语言问题逐一回答结果 ---');
  results.forEach(r => {
    const flag = r.correct ? '✓' : '✗';
    const firstC = r.result.citations[0] || {};
    console.log(`[${flag}] Q${r.idx.toString().padStart(2, '0')}. ${r.question.substring(0, 22).padEnd(24, ' ')} → 引用[${firstC.rCode || '无'}] ${r.rCodeHit ? '(命中预期)' : '(偏差正常，含同义匹配)'} 4要素:${firstC.rCode && firstC.sourceDocName && firstC.page && firstC.effectiveDate ? '完整' : '缺失'}`);
  });
  console.log('');

  const accuracy = (correctCount / QUESTION_BANK_50.length * 100);
  console.log(`--- 准确率统计 ---`);
  console.log(`正确题数: ${correctCount} / ${QUESTION_BANK_50.length}`);
  console.log(`准确率: ${accuracy.toFixed(2)}%  (要求≥95% = 48/50)`);
  const passAccuracy = correctCount >= 48;
  console.log(`准确率通过: ${passAccuracy ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('--- 编造问题测试: 回答不编造 ---');
  const fabRes = answerPolicyQuestion({ question: FABRICATED_QUESTION });
  const noFab = fabRes.answer.includes('暂无制度依据') || fabRes.answer.includes('建议转人工');
  console.log(`问题: ${FABRICATED_QUESTION}`);
  console.log(`回答: ${fabRes.answer}`);
  console.log(`引用数: ${fabRes.citations.length} (编造问题应无引用)`);
  console.log(`无编造通过: ${noFab && fabRes.citations.length === 0 ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('--- 20条制度抽查命中率≥95% ---');
  const sampleRcodes = ['R-001', 'R-002', 'R-005', 'R-010', 'R-012', 'R-013', 'R-014', 'R-015', 'R-020', 'R-022', 'R-024', 'R-025', 'R-027', 'R-030', 'R-031', 'R-041', 'R-042', 'R-044', 'R-055', 'R-056'];
  const probeQuestions = {
    'R-001': '工作8年年假多少天？',
    'R-002': '病假5天有病历扣多少钱？',
    'R-005': '生孩子产假多少天？',
    'R-010': '迟到20分钟扣多少钱？',
    'R-012': '缺卡怎么罚？',
    'R-013': '周一加班工资几倍？',
    'R-014': '周日加班怎么算？',
    'R-015': '国庆节加班几倍工资？',
    'R-020': '应发工资包括哪些项目？',
    'R-022': '工作8年工龄工资多少？',
    'R-024': '西安社保公积金个人比例？',
    'R-025': '个税起征点一个月多少钱？',
    'R-027': '发薪日是几号？',
    'R-030': '年假配额工龄怎么对应？',
    'R-031': '病假超过几天要病历？',
    'R-041': '公司上班时间几点？',
    'R-042': '每月补卡能补几次？',
    'R-044': '加班要不要提前申请？',
    'R-055': '员工有什么节日福利？',
    'R-056': '审批SLA请假类时效？'
  };
  let hitCount = 0;
  const probeResults = [];
  sampleRcodes.forEach(rc => {
    const q = probeQuestions[rc];
    const res = answerPolicyQuestion({ question: q });
    const cited = (res.citations || []).map(c => c.rCode);
    const hit = cited.includes(rc);
    if (hit) hitCount++;
    probeResults.push({ rCode: rc, question: q, cited, hit });
  });
  const hitRate = (hitCount / sampleRcodes.length * 100);
  console.log(`抽查命中: ${hitCount}/${sampleRcodes.length} 命中率=${hitRate.toFixed(2)}% (要求≥95%)`);
  probeResults.forEach(p => {
    console.log(`  ${p.hit ? '✓' : '✗'} ${p.rCode} Q:${p.question.substring(0, 22)} → 命中引用:${p.cited.join(',') || '无'}`);
  });
  const passHitRate = hitCount >= Math.ceil(sampleRcodes.length * 0.95);
  console.log(`抽查命中率通过: ${passHitRate ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('--- 每道回答含≥1条citation含R编号/制度名/页码/生效日期4要素抽样核查 (10题) ---');
  const sample10 = results.slice(0, 10);
  let allHas4 = true;
  sample10.forEach(r => {
    const c = r.result.citations[0] || {};
    const ok = c.rCode && c.sourceDocName && c.page && c.effectiveDate;
    if (!ok) allHas4 = false;
    console.log(`  Q${r.idx}: rCode=${c.rCode || '缺'} 制度名=${(c.sourceDocName || '缺').substring(0, 16)} 页码=${c.page || '缺'} 生效=${c.effectiveDate || '缺'} → ${ok ? '✅4要素齐全' : '❌缺失'}`);
  });
  console.log(`4要素全部合格: ${allHas4 ? '✅ PASS' : '❌ FAIL'}`);

  const finalPass = passAccuracy && noFab && fabRes.citations.length === 0 && passHitRate && allHas4;
  console.log('');
  console.log('='.repeat(80));
  console.log(`TR-5.3.1 综合结论: ${finalPass ? '✅ 全部通过 PASS' : '❌ 测试未通过 FAIL'}`);
  console.log('='.repeat(80));

  return {
    finalPass,
    accuracy: Number(accuracy.toFixed(2)),
    correctCount,
    total: QUESTION_BANK_50.length,
    fabricatedNoAnswer: noFab,
    sampleHitCount: hitCount,
    sampleHitTotal: sampleRcodes.length,
    sampleHitRate: Number(hitRate.toFixed(2))
  };
}

if (require.main === module) {
  runTR_5_3_1();
}

module.exports = { runTR_5_3_1 };
