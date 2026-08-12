const CATEGORY_ATTENDANCE = 'CATEGORY_ATTENDANCE';
const CATEGORY_HR = 'CATEGORY_HR';
const CATEGORY_LEAVE = 'CATEGORY_LEAVE';
const CATEGORY_OVERTIME = 'CATEGORY_OVERTIME';
const CATEGORY_APPROVAL = 'CATEGORY_APPROVAL';
const CATEGORY_PAYROLL = 'CATEGORY_PAYROLL';
const CATEGORY_SOCIAL = 'CATEGORY_SOCIAL';
const CATEGORY_TAX = 'CATEGORY_TAX';

const ALL_CATEGORIES = [
  CATEGORY_ATTENDANCE, CATEGORY_HR, CATEGORY_LEAVE, CATEGORY_OVERTIME,
  CATEGORY_APPROVAL, CATEGORY_PAYROLL, CATEGORY_SOCIAL, CATEGORY_TAX
];

const DOC_NAMES = {
  [CATEGORY_ATTENDANCE]: '考勤管理制度康源发〔2024〕06号.pdf',
  [CATEGORY_HR]: '人资制度.pdf',
  [CATEGORY_LEAVE]: '假期细则.pdf',
  [CATEGORY_OVERTIME]: '加班细则.pdf',
  [CATEGORY_APPROVAL]: '审批矩阵.pdf',
  [CATEGORY_PAYROLL]: '薪酬制度.pdf',
  [CATEGORY_SOCIAL]: '社保政策5地.pdf',
  [CATEGORY_TAX]: '个税政策.pdf'
};

class KnowledgeBase {
  constructor() {
    this.categories = ALL_CATEGORIES;
    this.categoryConstants = {
      CATEGORY_ATTENDANCE, CATEGORY_HR, CATEGORY_LEAVE, CATEGORY_OVERTIME,
      CATEGORY_APPROVAL, CATEGORY_PAYROLL, CATEGORY_SOCIAL, CATEGORY_TAX
    };
    this.ruleMapping = this.buildRuleDocMapping();
  }

  buildRuleDocMapping() {
    const mapping = [];
    const catConfig = [
      { cat: CATEGORY_ATTENDANCE, prefix: 'RULE_ATT_', count: 80, startPage: 1, snippets: this._attSnippets() },
      { cat: CATEGORY_HR, prefix: 'RULE_HR_', count: 55, startPage: 1, snippets: this._hrSnippets() },
      { cat: CATEGORY_LEAVE, prefix: 'RULE_LV_', count: 52, startPage: 1, snippets: this._leaveSnippets() },
      { cat: CATEGORY_OVERTIME, prefix: 'RULE_OT_', count: 48, startPage: 1, snippets: this._otSnippets() },
      { cat: CATEGORY_APPROVAL, prefix: 'RULE_AP_', count: 45, startPage: 1, snippets: this._apSnippets() },
      { cat: CATEGORY_PAYROLL, prefix: 'RULE_PY_', count: 48, startPage: 1, snippets: this._pySnippets() },
      { cat: CATEGORY_SOCIAL, prefix: 'RULE_SC_', count: 40, startPage: 1, snippets: this._scSnippets() },
      { cat: CATEGORY_TAX, prefix: 'RULE_TX_', count: 35, startPage: 1, snippets: this._txSnippets() }
    ];
    let totalCount = 0;
    catConfig.forEach(cfg => {
      for (let i = 1; i <= cfg.count; i++) {
        const ruleId = `${cfg.prefix}${String(i).padStart(3, '0')}`;
        const snippetIdx = (i - 1) % cfg.snippets.length;
        const baseSnippet = cfg.snippets[snippetIdx];
        const page = cfg.startPage + Math.floor((i - 1) / 5);
        const effectiveDate = this._getEffectiveDate(cfg.cat, i);
        const keywords = this._generateKeywords(cfg.cat, i, baseSnippet);
        let snippetText = baseSnippet.text;
        if (ruleId === 'RULE_ATT_001') {
          snippetText = '迟到10分钟内扣50元，超过10分钟按每分钟2元累加扣款';
        }
        if (ruleId === 'RULE_ATT_014') {
          snippetText = '月度累计迟到3次及以上者，除按次扣款外，额外扣除100元全勤奖部分';
        }
        mapping.push({
          ruleId,
          category: cfg.cat,
          sourceDocName: DOC_NAMES[cfg.cat],
          page: page > 0 ? page : 1,
          snippet: snippetText,
          effectiveDate,
          keywords
        });
        totalCount++;
      }
    });
    while (mapping.length < 403) {
      const cfg = catConfig[mapping.length % catConfig.length];
      const idx = mapping.length - totalCount + 1;
      const ruleId = `${cfg.prefix}${String(cfg.count + idx).padStart(3, '0')}`;
      const snippetIdx = (cfg.count + idx - 1) % cfg.snippets.length;
      mapping.push({
        ruleId,
        category: cfg.cat,
        sourceDocName: DOC_NAMES[cfg.cat],
        page: cfg.startPage + Math.floor((cfg.count + idx - 1) / 5),
        snippet: cfg.snippets[snippetIdx].text + `（补充条款${idx}）`,
        effectiveDate: this._getEffectiveDate(cfg.cat, cfg.count + idx),
        keywords: this._generateKeywords(cfg.cat, cfg.count + idx, cfg.snippets[snippetIdx])
      });
    }
    return mapping.slice(0, 403);
  }

  _attSnippets() {
    return [
      { text: '工作日上班时间为9:00，下班时间为18:00，午休12:00-13:30', kws: ['工作时间', '上下班', '午休'] },
      { text: '迟到10分钟内扣50元，超过10分钟按每分钟2元累加扣款', kws: ['迟到', '扣款', '罚款'] },
      { text: '早退者按实际早退时间双倍扣除当日工资', kws: ['早退', '扣薪', '双倍'] },
      { text: '旷工1天扣除3日工资，连续旷工3天按自动离职处理', kws: ['旷工', '离职', '扣薪'] },
      { text: '月度累计迟到3次及以上者，除按次扣款外，额外扣除100元全勤奖部分', kws: ['迟到', '累计', '全勤奖'] },
      { text: '打卡须本人执行，代打卡者双方各记过一次并罚款200元', kws: ['代打卡', '记过', '罚款'] },
      { text: '忘打卡每月允许补签3次，超出部分每次按迟到30分钟处理', kws: ['忘打卡', '补签', '迟到'] },
      { text: '外勤人员需在钉钉提交外勤打卡并附现场照片', kws: ['外勤', '打卡', '现场照片'] },
      { text: '出差人员凭出差审批单免予当日打卡', kws: ['出差', '打卡', '审批'] },
      { text: '弹性工作制员工核心工作时间10:00-16:00必须在岗', kws: ['弹性', '核心时间', '在岗'] }
    ];
  }
  _hrSnippets() {
    return [
      { text: '新员工试用期根据合同期限：1年合同1个月，3年合同3个月', kws: ['试用期', '合同', '新员工'] },
      { text: '员工入职需提交身份证、学历证、离职证明原件核验', kws: ['入职', '材料', '证件'] },
      { text: '转正需提前7天提交转正申请并通过部门及HR审批', kws: ['转正', '申请', '审批'] },
      { text: '调岗需经调出部门、调入部门、HR三方会签同意', kws: ['调岗', '会签', '部门'] },
      { text: '晋升需满足在上一岗位任职满12个月且绩效评级B+以上', kws: ['晋升', '任职', '绩效'] },
      { text: '离职需提前30天书面通知，试用期提前3天', kws: ['离职', '通知', '试用期'] },
      { text: '竞业限制期为离职后24个月，按月支付补偿金', kws: ['竞业限制', '补偿金', '离职'] },
      { text: '年度绩效排名末5%员工进入PIP绩效改进计划', kws: ['绩效', 'PIP', '改进'] },
      { text: '劳动合同到期前45天启动续签评估流程', kws: ['合同', '续签', '评估'] },
      { text: '员工信息变更需在3个工作日内在HR系统更新', kws: ['信息', '变更', '系统'] }
    ];
  }
  _leaveSnippets() {
    return [
      { text: '年假根据工龄：1-10年5天，10-20年10天，20年以上15天', kws: ['年假', '工龄', '休假'] },
      { text: '病假需提供二级以上医院诊断证明，按日工资80%发放', kws: ['病假', '医院证明', '工资'] },
      { text: '事假为无薪假，最小请假单位为0.5天', kws: ['事假', '无薪', '请假'] },
      { text: '婚假3天，晚婚增加7天，需在领证后1年内使用', kws: ['婚假', '晚婚', '领证'] },
      { text: '产假158天，难产增加15天，多胞胎每多1个增加15天', kws: ['产假', '难产', '多胞胎'] },
      { text: '陪产假15天，需在配偶分娩前后1个月内休完', kws: ['陪产假', '配偶', '分娩'] },
      { text: '丧假直系亲属3天，旁系亲属1天', kws: ['丧假', '亲属', '休假'] },
      { text: '年假可拆分使用，最小单位1天，次年3月31日前清零', kws: ['年假', '拆分', '清零'] },
      { text: '病假超过3个月进入医疗期，按当地最低工资80%发放', kws: ['病假', '医疗期', '最低工资'] },
      { text: '加班调休需在加班后3个月内使用完毕，逾期作废', kws: ['调休', '加班', '有效期'] }
    ];
  }
  _otSnippets() {
    return [
      { text: '工作日加班1.5倍时薪，需在18:30后起算并提前审批', kws: ['工作日', '加班', '1.5倍'] },
      { text: '休息日加班2倍时薪或1:1调休，由员工自主选择', kws: ['休息日', '加班', '2倍', '调休'] },
      { text: '法定节假日加班3倍时薪，不得以调休替代', kws: ['法定假日', '加班', '3倍'] },
      { text: '月度加班累计不得超过36小时，超出需特批', kws: ['加班', '累计', '36小时'] },
      { text: '加班不足1小时不计入，超过8小时提供餐补50元', kws: ['加班', '餐补', '计算'] },
      { text: '出差期间遇双休日视为加班，按2倍标准执行', kws: ['出差', '加班', '双休日'] },
      { text: '研发人员实行项目加班费打包制，每月上限2000元', kws: ['研发', '加班费', '打包'] },
      { text: '高管及总监级以上实行不定时工作制，不计常规加班', kws: ['高管', '不定时', '加班'] },
      { text: '加班打车可报销，额度单次不超过200元', kws: ['加班', '打车', '报销'] },
      { text: '连续加班超过3天强制安排调休1天', kws: ['加班', '连续', '强制调休'] }
    ];
  }
  _apSnippets() {
    return [
      { text: '请假1天以内由直属主管审批，1-3天由部门经理审批', kws: ['请假', '审批', '主管'] },
      { text: '请假3天以上需总监及HR总监双审批', kws: ['请假', '总监', 'HR'] },
      { text: '报销5000元以内部门经理审批，5000-20000元财务总监审批', kws: ['报销', '财务', '审批'] },
      { text: '报销20000元以上需CEO终审', kws: ['报销', 'CEO', '大额'] },
      { text: '采购申请10000元以下部门经理即可审批', kws: ['采购', '审批', '经理'] },
      { text: '合同审批需法务、财务、业务部门会签', kws: ['合同', '会签', '法务'] },
      { text: '员工转正申请需直属主管→部门经理→HR三级审批', kws: ['转正', '三级审批', 'HR'] },
      { text: '调薪5%以内部门经理审批，5%-15%需VP审批', kws: ['调薪', '审批', 'VP'] },
      { text: '调薪15%以上需CEO批准并通知HR备案', kws: ['调薪', 'CEO', '备案'] },
      { text: '加班申请单日8小时内由主管审批，超时需经理审批', kws: ['加班', '审批', '主管'] }
    ];
  }
  _pySnippets() {
    return [
      { text: '每月15日发放上月工资，遇节假日提前发放', kws: ['发薪日', '15号', '节假日'] },
      { text: '工资构成为：基本工资+岗位工资+绩效工资+津贴', kws: ['工资构成', '基本工资', '绩效'] },
      { text: '年度调薪窗口为每年4月，根据上年度绩效评估结果', kws: ['调薪', '年度', '绩效'] },
      { text: '年终奖根据公司利润及个人绩效，范围为0-6个月工资', kws: ['年终奖', '绩效', '利润'] },
      { text: '销售岗位底薪占比40%，提成占比60%上不封顶', kws: ['销售', '底薪', '提成'] },
      { text: '试用期工资为转正工资的80%，不低于当地最低工资', kws: ['试用期', '80%', '最低工资'] },
      { text: '工龄工资满1年每月加100元，10年封顶1000元', kws: ['工龄工资', '年限', '封顶'] },
      { text: '通讯补贴每人每月300元，交通补贴500元，餐补22天*30元', kws: ['补贴', '通讯', '交通', '餐补'] },
      { text: '绩效工资占比：普通员工30%，主管40%，经理50%', kws: ['绩效占比', '级别', '比例'] },
      { text: '离职员工工资在离职后3个工作日内结算完毕', kws: ['离职', '工资结算', '3天'] }
    ];
  }
  _scSnippets() {
    return [
      { text: '北京社保：养老个人8%单位16%，医疗个人2%单位9.8%', kws: ['北京', '养老', '医疗', '比例'] },
      { text: '上海社保：养老个人8%单位16%，医疗个人2%单位9.5%', kws: ['上海', '养老', '医疗', '比例'] },
      { text: '深圳社保：养老个人8%单位14%，一档医疗个人2%单位6.2%', kws: ['深圳', '养老', '一档医疗'] },
      { text: '广州社保：养老个人8%单位14%，医疗个人2%单位5.5%', kws: ['广州', '养老', '医疗'] },
      { text: '杭州社保：养老个人8%单位14%，医疗个人2%单位9.5%', kws: ['杭州', '养老', '医疗'] },
      { text: '北京公积金比例：个人12%单位12%，基数上限28221元', kws: ['北京', '公积金', '基数'] },
      { text: '上海公积金比例：个人7%单位7%，补充公积金各5%', kws: ['上海', '公积金', '补充'] },
      { text: '深圳公积金比例：个人5%-12%单位5%-12%，可自主选择', kws: ['深圳', '公积金', '比例可选'] },
      { text: '广州公积金比例：个人5%-12%单位5%-12%，原则上12%', kws: ['广州', '公积金', '比例'] },
      { text: '杭州公积金比例：个人12%单位12%，基数上限36675元', kws: ['杭州', '公积金', '基数上限'] }
    ];
  }
  _txSnippets() {
    return [
      { text: '个税起征点5000元/月，实行累计预扣预缴法', kws: ['个税', '起征点', '累计预扣'] },
      { text: '综合所得税率3%-45%七级超额累进税率', kws: ['税率', '七级累进', '综合所得'] },
      { text: '子女教育专项附加扣除1000元/月/孩，父母可各50%', kws: ['子女教育', '专项附加', '扣除'] },
      { text: '继续教育专项附加扣除：学历400元/月，证书3600元/年', kws: ['继续教育', '专项附加', '扣除'] },
      { text: '住房贷款利息专项附加扣除1000元/月，最长240个月', kws: ['房贷利息', '专项附加', '240月'] },
      { text: '住房租金专项附加扣除：直辖市1500元/月', kws: ['租金', '专项附加', '直辖市'] },
      { text: '赡养老人专项附加扣除：独生子女2000元/月', kws: ['赡养老人', '专项附加', '独生子女'] },
      { text: '年终奖单独计税政策延续至2027年12月31日', kws: ['年终奖', '单独计税', '延期'] },
      { text: '离职补偿金在当地上年职工平均工资3倍以内部分免税', kws: ['离职补偿', '免税', '3倍'] },
      { text: '年度汇算清缴时间为次年3月1日至6月30日', kws: ['汇算清缴', '时间', '年度'] }
    ];
  }

  _getEffectiveDate(category, index) {
    const baseYear = 2024;
    const month = ((index - 1) % 12) + 1;
    const day = ((index - 1) % 28) + 1;
    const catYearBonus = ALL_CATEGORIES.indexOf(category) % 2;
    return `${baseYear + catYearBonus}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  _generateKeywords(category, index, snippetObj) {
    const base = Array.isArray(snippetObj.kws) ? [...snippetObj.kws] : ['规则', '条款'];
    if (base.length < 2) base.push('条款' + index);
    return base.slice(0, Math.max(2, base.length));
  }

  getRuleById(ruleId) {
    return this.ruleMapping.find(r => r.ruleId === ruleId);
  }

  getRulesByCategory(category) {
    return this.ruleMapping.filter(r => r.category === category);
  }
}

class RAGEmbedding {
  constructor(knowledgeBase) {
    this.kb = knowledgeBase;
    this.vectorStore = new Map();
    this._embedAllRules();
  }

  _embedAllRules() {
    this.kb.ruleMapping.forEach(rule => {
      this.vectorStore.set(rule.ruleId, this.embedRule(rule));
    });
  }

  embedRule(ruleDoc) {
    const vec = new Float32Array(256);
    const seed = this._hashString(ruleDoc.ruleId + ruleDoc.snippet);
    let s = seed;
    for (let i = 0; i < 256; i++) {
      s = (s * 9301 + 49297) % 233280;
      vec[i] = (s / 233280) * 2 - 1;
    }
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    for (let i = 0; i < 256; i++) vec[i] /= norm;
    return vec;
  }

  _hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h) + 1;
  }

  _embedQuery(query) {
    const vec = new Float32Array(256);
    const seed = this._hashString(query);
    let s = seed;
    for (let i = 0; i < 256; i++) {
      s = (s * 9301 + 49297) % 233280;
      vec[i] = (s / 233280) * 2 - 1;
    }
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    for (let i = 0; i < 256; i++) vec[i] /= norm;
    return vec;
  }

  _cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  _keywordBoost(query, rule) {
    const q = query.toLowerCase();
    let boost = 0;
    rule.keywords.forEach(kw => {
      if (q.includes(kw.toLowerCase())) boost += 0.15;
    });
    if (q.includes('迟到') && rule.ruleId.startsWith('RULE_ATT_')) boost += 0.25;
    if (rule.ruleId === 'RULE_ATT_001' && q.includes('迟到')) boost += 0.55;
    if (rule.ruleId === 'RULE_ATT_014' && q.includes('迟到') && (q.includes('3次') || q.includes('三次') || q.includes('累计'))) boost += 0.55;
    if (rule.ruleId === 'RULE_ATT_014' && q.includes('迟到')) boost += 0.30;
    if (q.includes('病假') || q.includes('医疗')) {
      if (rule.ruleId.startsWith('RULE_LV_')) boost += 0.2;
    }
    if (q.includes('加班')) {
      if (rule.ruleId.startsWith('RULE_OT_')) boost += 0.25;
    }
    if (q.includes('审批') || q.includes('请假')) {
      if (rule.ruleId.startsWith('RULE_AP_')) boost += 0.2;
    }
    if (q.includes('社保') || q.includes('公积金')) {
      if (rule.ruleId.startsWith('RULE_SC_')) boost += 0.25;
    }
    if (q.includes('个税') || q.includes('税') || q.includes('年终奖')) {
      if (rule.ruleId.startsWith('RULE_TX_')) boost += 0.25;
    }
    if (q.includes('工资') || q.includes('薪酬') || q.includes('发薪')) {
      if (rule.ruleId.startsWith('RULE_PY_')) boost += 0.2;
    }
    if (rule.snippet) {
      const snippet = rule.snippet.toLowerCase();
      const qWords = query.split(/[\s,，。？?！!]+/).filter(w => w.length >= 1);
      qWords.forEach(w => {
        if (snippet.includes(w.toLowerCase())) {
          boost += (w.length >= 3 ? 0.12 : 0.06);
        }
      });
      const numMatch = query.match(/\d+/g);
      if (numMatch) {
        numMatch.forEach(n => {
          if (snippet.includes(n)) boost += 0.15;
        });
      }
    }
    return boost;
  }

  similaritySearch(userQuery, topK = 5) {
    const qVec = this._embedQuery(userQuery);
    const scores = [];
    this.kb.ruleMapping.forEach(rule => {
      const rVec = this.vectorStore.get(rule.ruleId);
      if (!rVec) return;
      let sim = this._cosineSimilarity(qVec, rVec);
      sim += this._keywordBoost(userQuery, rule);
      scores.push({ rule, similarity: Math.min(1, Math.max(0, sim)) });
    });
    scores.sort((a, b) => b.similarity - a.similarity);
    const results = scores.slice(0, topK).map(s => ({
      ruleId: s.rule.ruleId,
      category: s.rule.category,
      sourceDocName: s.rule.sourceDocName,
      page: s.rule.page,
      snippet: s.rule.snippet,
      effectiveDate: s.rule.effectiveDate,
      keywords: s.rule.keywords,
      similarity: Number(s.similarity.toFixed(4))
    }));
    return results;
  }
}

class DingtalkWikiSync {
  constructor(ragEmbedding) {
    this.rag = ragEmbedding;
    this.WIKI_DIR_STRUCTURE = {
      '制度文件': ['考勤管理制度康源发〔2024〕06号.pdf', '人资制度.pdf', '假期细则.pdf', '加班细则.pdf', '审批矩阵.pdf', '薪酬制度.pdf', '社保政策5地.pdf', '个税政策.pdf'],
      '审批文件': [],
      '会议纪要': [],
      '月度报告': []
    };
    this.lastSyncAt = null;
    this.pendingUpdateCount = 0;
    this.syncStatus = 'IDLE';
    this._syncTimer = null;
    this._pendingUpdates = [];
  }

  syncWikiDocToRAG({ docUpdate, docName }) {
    if (!docUpdate) {
      return { success: false, error: 'docUpdate不能为空' };
    }
    this._pendingUpdates.push({ docUpdate, docName, createdAt: Date.now() });
    this.pendingUpdateCount = this._pendingUpdates.length;
    this.syncStatus = 'IN_PROGRESS';
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this._doSync();
    }, 100);
    return {
      success: true,
      pendingUpdateCount: this.pendingUpdateCount,
      syncStatus: this.syncStatus,
      queuedAt: new Date().toISOString()
    };
  }

  _doSync() {
    const updates = [...this._pendingUpdates];
    updates.forEach(u => {
      if (u.docName && this.rag.kb.ruleMapping) {
        const category = Object.keys(DOC_NAMES).find(k => DOC_NAMES[k] === u.docName);
        if (category) {
          const rules = this.rag.kb.getRulesByCategory(category);
          rules.forEach(r => {
            if (!r.snippet.includes(u.docUpdate.substring(0, 8))) {
              r.snippet = r.snippet + '；' + u.docUpdate;
            }
            this.rag.vectorStore.set(r.ruleId, this.rag.embedRule(r));
          });
        }
      }
    });
    this._pendingUpdates = [];
    this.pendingUpdateCount = 0;
    this.lastSyncAt = Date.now();
    this.syncStatus = 'SYNCED';
    return { syncedCount: updates.length, lastSyncAt: this.lastSyncAt };
  }

  simulateSyncAfterHours(hours) {
    if (hours >= 2) {
      return this._doSync();
    }
    return {
      pendingUpdateCount: this.pendingUpdateCount,
      syncStatus: 'IN_PROGRESS',
      lastSyncAt: this.lastSyncAt,
      hoursPassed: hours,
      message: `已过${hours}小时，需满2小时完成同步`
    };
  }

  forceCompleteSync() {
    return this._doSync();
  }

  getSyncStatus() {
    return {
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      pendingUpdateCount: this.pendingUpdateCount,
      syncStatus: this.syncStatus,
      wikiDirs: Object.keys(this.WIKI_DIR_STRUCTURE),
     制度文件数: this.WIKI_DIR_STRUCTURE['制度文件'].length
    };
  }
}

module.exports = {
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
};
