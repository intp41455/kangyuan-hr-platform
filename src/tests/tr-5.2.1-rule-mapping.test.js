const path = require('path');
const {
  KnowledgeBase,
  RAGEmbedding,
  DingtalkWikiSync,
  ALL_CATEGORIES,
  CATEGORY_ATTENDANCE,
  CATEGORY_HR,
  CATEGORY_LEAVE,
  CATEGORY_OVERTIME,
  CATEGORY_APPROVAL,
  CATEGORY_PAYROLL,
  CATEGORY_SOCIAL,
  CATEGORY_TAX,
  DOC_NAMES
} = require(path.join(__dirname, '..', 'modules', 'rag', 'hr_knowledge_base.js'));

console.log('='.repeat(80));
console.log('TR-5.2.1 规则映射测试');
console.log('='.repeat(80));

const kb = new KnowledgeBase();
const passed = [];
const failed = [];

function check(name, condition, detail) {
  if (condition) {
    passed.push(name);
    console.log(`✅ PASS: ${name}` + (detail ? ` - ${detail}` : ''));
  } else {
    failed.push(name);
    console.log(`❌ FAIL: ${name}` + (detail ? ` - ${detail}` : ''));
  }
}

console.log('\n--- a) 规则映射完整性检查 ---');
const mapping = kb.ruleMapping;
check('buildRuleDocMapping()返回数组', Array.isArray(mapping), `类型=${typeof mapping}`);
check('mapping总数=403条', mapping.length === 403, `实际=${mapping.length}条`);

const ruleIds = mapping.map(r => r.ruleId);
const uniqueIds = new Set(ruleIds);
check('每条ruleId唯一', uniqueIds.size === ruleIds.length, `唯一=${uniqueIds.size}, 总=${ruleIds.length}, 重复=${ruleIds.length - uniqueIds.size}`);

const validDocNames = Object.values(DOC_NAMES);
let invalidCatCount = 0;
let invalidDocCount = 0;
mapping.forEach(r => {
  if (!ALL_CATEGORIES.includes(r.category)) invalidCatCount++;
  if (!validDocNames.includes(r.sourceDocName)) invalidDocCount++;
});
check('category∈8大类', invalidCatCount === 0, `无效category=${invalidCatCount}`);
check('sourceDocName有效', invalidDocCount === 0, `无效doc=${invalidDocCount}`);
const missingRate = ((invalidCatCount + invalidDocCount) / (mapping.length * 2)) * 100;
check(`缺失率=0%`, missingRate === 0, `缺失率=${missingRate.toFixed(2)}%`);

console.log('\n--- b) 8大类规则数量分布检查 ---');
const catShortNames = {
  [CATEGORY_ATTENDANCE]: '考勤(CATEGORY_ATTENDANCE)',
  [CATEGORY_HR]: '人资(CATEGORY_HR)',
  [CATEGORY_LEAVE]: '假期(CATEGORY_LEAVE)',
  [CATEGORY_OVERTIME]: '加班(CATEGORY_OVERTIME)',
  [CATEGORY_APPROVAL]: '审批(CATEGORY_APPROVAL)',
  [CATEGORY_PAYROLL]: '薪酬(CATEGORY_PAYROLL)',
  [CATEGORY_SOCIAL]: '社保(CATEGORY_SOCIAL)',
  [CATEGORY_TAX]: '个税(CATEGORY_TAX)'
};
ALL_CATEGORIES.forEach(cat => {
  const rules = kb.getRulesByCategory(cat);
  const isAtt = cat === CATEGORY_ATTENDANCE;
  const threshold = isAtt ? 80 : 10;
  const ok = rules.length >= threshold;
  const name = catShortNames[cat];
  check(`${name}数量≥${threshold}条`, ok, `实际=${rules.length}条`);
});

console.log('\n--- c) 每条规则字段完整性检查 ---');
let emptySnippetCount = 0;
let invalidDateCount = 0;
let insufficientKwCount = 0;
mapping.forEach(r => {
  if (!r.snippet || String(r.snippet).trim() === '') emptySnippetCount++;
  if (!r.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveDate)) invalidDateCount++;
  if (!r.keywords || r.keywords.length < 2) insufficientKwCount++;
});
check('每条snippet非空', emptySnippetCount === 0, `空snippet=${emptySnippetCount}`);
check('每条effectiveDate有效(YYYY-MM-DD)', invalidDateCount === 0, `无效日期=${invalidDateCount}`);
check('每条keywords≥2个', insufficientKwCount === 0, `不足=${insufficientKwCount}`);

console.log('\n--- d) 抽查RULE_ATT_001(迟到扣款) ---');
const ruleAtt001 = kb.getRuleById('RULE_ATT_001');
check('RULE_ATT_001存在', ruleAtt001 !== undefined, ruleAtt001 ? '找到' : '缺失');
if (ruleAtt001) {
  check('RULE_ATT_001匹配《考勤管理制度》', 
    ruleAtt001.sourceDocName === '考勤管理制度康源发〔2024〕06号.pdf',
    `实际文档=${ruleAtt001.sourceDocName}`);
  check('RULE_ATT_001页码P5或接近',
    ruleAtt001.page >= 1 && ruleAtt001.page <= 20,
    `实际页码=P${ruleAtt001.page}`);
  check('RULE_ATT_001片段包含"迟到10分钟内扣50元"',
    ruleAtt001.snippet.includes('迟到10分钟内扣50元'),
    `实际片段="${ruleAtt001.snippet.substring(0, 50)}..."`);
  console.log(`   📄 详情: ruleId=${ruleAtt001.ruleId}, category=${ruleAtt001.category}`);
  console.log(`      sourceDocName=${ruleAtt001.sourceDocName}`);
  console.log(`      page=P${ruleAtt001.page}, effectiveDate=${ruleAtt001.effectiveDate}`);
  console.log(`      snippet="${ruleAtt001.snippet}"`);
  console.log(`      keywords=[${ruleAtt001.keywords.join(', ')}]`);
}

console.log('\n--- 附加抽查：RULE_ATT_014(月3次迟到) ---');
const ruleAtt014 = kb.getRuleById('RULE_ATT_014');
if (ruleAtt014) {
  console.log(`   📄 RULE_ATT_014: snippet="${ruleAtt014.snippet}"`);
  console.log(`      page=P${ruleAtt014.page}, doc=${ruleAtt014.sourceDocName}`);
}

console.log('\n' + '='.repeat(80));
console.log(`TR-5.2.1 测试结果: 通过 ${passed.length}/${passed.length + failed.length}`);
console.log('='.repeat(80));
if (failed.length > 0) {
  console.log('❌ 失败项:');
  failed.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log('🎉 全部通过！TR-5.2.1 ✓');
  process.exit(0);
}
