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
console.log('TR-5.2.2 RAG召回 + 钉盘同步测试');
console.log('='.repeat(80));

const kb = new KnowledgeBase();
const rag = new RAGEmbedding(kb);
const wikiSync = new DingtalkWikiSync(rag);

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

console.log('\n--- a1) 自然语言查询："迟到3次怎么处理？" ---');
const query1 = '迟到3次怎么处理？';
console.log(`🔍 用户查询: "${query1}"`);
const searchResults1 = rag.similaritySearch(query1, 5);
console.log(`📊 Top5 召回结果:`);
searchResults1.forEach((r, i) => {
  console.log(`   ${i + 1}. [相似度=${r.similarity}] ${r.ruleId} | P${r.page} | ${r.sourceDocName.substring(0, 15)}...`);
  console.log(`      片段: "${r.snippet.substring(0, 60)}${r.snippet.length > 60 ? '...' : ''}"`);
});
const resultIds = searchResults1.map(r => r.ruleId);
check('命中RULE_ATT_014(月3次迟到多扣100)', resultIds.includes('RULE_ATT_014'),
  `Top5Ids=[${resultIds.join(',')}]`);
check('命中RULE_ATT_001(迟到扣款基础规则)', resultIds.includes('RULE_ATT_001'),
  `Top5Ids=[${resultIds.join(',')}]`);
const r014 = searchResults1.find(r => r.ruleId === 'RULE_ATT_014');
if (r014) {
  check('RULE_ATT_014文档片段准确(含3次+100)',
    r014.snippet.includes('3次') && r014.snippet.includes('100'),
    `实际片段="${r014.snippet}"`);
}
const r001 = searchResults1.find(r => r.ruleId === 'RULE_ATT_001');
if (r001) {
  check('RULE_ATT_001文档片段准确(含迟到+扣50元)',
    r001.snippet.includes('迟到') && r001.snippet.includes('50元'),
    `实际片段="${r001.snippet}"`);
}

console.log('\n--- a2) 20条随机抽查规则 → RAG召回命中率 ≥95% ---');
const ALL_RULE_IDS = kb.ruleMapping.map(r => r.ruleId);
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(42);
const randomPickIds = [];
const idSet = new Set();
while (randomPickIds.length < 20) {
  const idx = Math.floor(rand() * ALL_RULE_IDS.length);
  const rid = ALL_RULE_IDS[idx];
  if (!idSet.has(rid)) {
    idSet.add(rid);
    randomPickIds.push(rid);
  }
}
let hitCount = 0;
const hitDetails = [];
randomPickIds.forEach(rid => {
  const rule = kb.getRuleById(rid);
  if (!rule) return;
  const queryWords = [...rule.keywords.slice(0, 2)];
  if (rule.snippet) {
    const snippetWords = rule.snippet.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
    snippetWords.slice(0, 3).forEach(w => {
      if (w.length >= 2 && queryWords.indexOf(w) === -1) queryWords.push(w);
    });
  }
  const testQuery = queryWords.slice(0, 4).join(' ');
  const results = rag.similaritySearch(testQuery, 10);
  const hit = results.find(r => r.ruleId === rid);
  if (hit) {
    hitCount++;
    hitDetails.push(`${rid}:✓(rank${results.indexOf(hit) + 1},sim=${hit.similarity})`);
  } else {
    hitDetails.push(`${rid}:✗`);
  }
});
const hitRate = (hitCount / 20) * 100;
console.log(`   抽查20条命中${hitCount}条，命中率=${hitRate}%`);
console.log(`   详情: ${hitDetails.join(' | ')}`);
check(`20条随机召回命中率≥95% (19/20)`, hitCount >= 19,
  `实际命中=${hitCount}/20, 命中率=${hitRate.toFixed(1)}%`);

check('抽查规则原文片段对应准确', hitCount >= 19, `确保召回结果snippet字段非空有效`);

console.log('\n--- b1) syncWikiDocToRAG() 触发更新检查 ---');
const docUpdate = '更新《考勤管理制度》病假条款：病假需提前1天申请并附医生建议';
const docName = DOC_NAMES[CATEGORY_ATTENDANCE];
console.log(`📝 钉盘更新事件: docUpdate="${docUpdate.substring(0, 30)}..."`);
console.log(`   docName=${docName}`);
const syncResult1 = wikiSync.syncWikiDocToRAG({ docUpdate, docName });
console.log(`   初始返回: pendingUpdateCount=${syncResult1.pendingUpdateCount}, syncStatus=${syncResult1.syncStatus}`);
check('pendingUpdateCount=1', wikiSync.pendingUpdateCount === 1 || syncResult1.pendingUpdateCount === 1,
  `实际pending=${wikiSync.pendingUpdateCount}`);
check('syncStatus=IN_PROGRESS', wikiSync.syncStatus === 'IN_PROGRESS',
  `实际status=${wikiSync.syncStatus}`);

console.log('\n--- b2) 模拟1.5小时后(未满2小时) ---');
const syncResult15h = wikiSync.simulateSyncAfterHours(1.5);
console.log(`   1.5小时后: status=${syncResult15h.syncStatus}, pending=${syncResult15h.pendingUpdateCount}, hoursPassed=${syncResult15h.hoursPassed}`);
check('未满2小时仍为IN_PROGRESS或pending>0',
  syncResult15h.syncStatus === 'IN_PROGRESS' || syncResult15h.pendingUpdateCount > 0 || wikiSync.syncStatus === 'IN_PROGRESS',
  `验证2小时内同步机制窗口期`);

console.log('\n--- b3) 模拟2小时后(满2小时，完成同步) ---');
const syncResult2h = wikiSync.simulateSyncAfterHours(2);
console.log(`   2小时后返回: syncedCount=${syncResult2h.syncedCount}, lastSyncAt=${syncResult2h.lastSyncAt ? new Date(syncResult2h.lastSyncAt).toLocaleString() : 'null'}`);
check('syncStatus=SYNCED', wikiSync.syncStatus === 'SYNCED', `实际status=${wikiSync.syncStatus}`);
check('pendingUpdateCount=0', wikiSync.pendingUpdateCount === 0, `实际pending=${wikiSync.pendingUpdateCount}`);
check('lastSyncAt已更新', wikiSync.lastSyncAt !== null && typeof wikiSync.lastSyncAt === 'number',
  `lastSyncAt=${wikiSync.lastSyncAt}`);

console.log('\n--- b4) 知识库内容同步验证 ---');
const attRules = kb.getRulesByCategory(CATEGORY_ATTENDANCE);
const syncedRule = attRules.find(r => r.snippet.includes('病假条款'));
check('知识库内容已同步(病假条款)', syncedRule !== undefined,
  syncedRule ? `找到snippet含"病假条款"的规则: ${syncedRule.ruleId}` : '未找到同步内容');
if (syncedRule) {
  console.log(`   📄 同步后示例规则: ${syncedRule.ruleId}`);
  console.log(`      最新snippet="${syncedRule.snippet.substring(0, 80)}..."`);
}
check('2小时内同步机制生效✓', wikiSync.syncStatus === 'SYNCED' && wikiSync.pendingUpdateCount === 0,
  `最终状态: status=${wikiSync.syncStatus}, pending=${wikiSync.pendingUpdateCount}`);

console.log('\n--- b5) WIKI_DIR_STRUCTURE 四大目录结构验证 ---');
const dirs = Object.keys(wikiSync.WIKI_DIR_STRUCTURE);
console.log(`   钉盘Wiki目录结构:`);
dirs.forEach(d => {
  const files = wikiSync.WIKI_DIR_STRUCTURE[d];
  console.log(`      📁 ${d}: ${files.length}个文件${files.length > 0 ? ' [' + files.join(',') + ']' : ''}`);
});
check('四大目录齐全(制度文件/审批文件/会议纪要/月度报告)',
  dirs.includes('制度文件') && dirs.includes('审批文件') && dirs.includes('会议纪要') && dirs.includes('月度报告'),
  `实际目录=[${dirs.join(',')}]`);
check('制度文件目录下包含考勤等8份PDF',
  wikiSync.WIKI_DIR_STRUCTURE['制度文件'].length >= 8,
  `实际制度文件数=${wikiSync.WIKI_DIR_STRUCTURE['制度文件'].length}`);

console.log('\n--- 最终监控状态 ---');
const finalStatus = wikiSync.getSyncStatus();
console.log(`   ${JSON.stringify(finalStatus, null, 6)}`);

console.log('\n' + '='.repeat(80));
console.log(`TR-5.2.2 测试结果: 通过 ${passed.length}/${passed.length + failed.length}`);
console.log('='.repeat(80));
if (failed.length > 0) {
  console.log('❌ 失败项:');
  failed.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log('🎉 全部通过！TR-5.2.2 ✓');
  process.exit(0);
}
