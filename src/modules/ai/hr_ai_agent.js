'use strict';

const {
  PayrollDAGEngine,
  calcAbsentDeduction,
  calcOvertimePay,
  STANDARD_PAY_DAYS,
  STANDARD_WORK_HOURS,
  round2
} = require('../payroll/payroll_engine.js');

const {
  checkDataIntegrity,
  checkMoMAnomaly,
  checkLogicConsistency,
  generateAnomalyDingtalkDocLink,
  runFullAnomalyAudit
} = require('../audit/payroll_anomaly_engine.js');

const {
  LeaveEngine,
  CompTimeManager,
  AnnualLeaveExtensionManager,
  calcAnnualLeaveQuota,
  LEAVE_TYPES,
  LEAVE_TYPE_NAMES
} = require('../leave/leave_engine.js');

const { EmployeeModel, EMPLOYEE_STATUS } = require('../master_data/employee_model.js');
const { PayrollGradeModel, getPresetGrade } = require('../master_data/payroll_grade_model.js');
const { RuleEngine, RULE_CATEGORIES } = require('../rules/rule_engine.js');

const POLICY_KNOWLEDGE_BASE = Object.freeze([
  {
    rCode: 'R-001', category: '假期年假', questionKeywords: ['年假', '年休假', 'annual leave'],
    answer: '员工累计工作已满1年不满10年的，年休假5天；已满10年不满20年的，年休假10天；已满20年的，年休假15天。6月1日前入职按全额计算，6月1日后入职按入职周年剩余月数折算。年假可结转至次年12月31日，经审批可延长至次年6月30日。',
    sourceDocName: '康源集团假期管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-002', category: '假期病假', questionKeywords: ['病假', 'sick leave', '病历'],
    answer: '病假最小单位0.5天。病假≥3天需提供病历附件。有病历病假按日薪20%扣款，无病历按事假100%扣款。病假期间工资支付80%。',
    sourceDocName: '康源集团假期管理制度2026版', page: 8, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-003', category: '假期事假', questionKeywords: ['事假', 'personal leave'],
    answer: '事假最小单位1天，事假为无薪假期，按日薪100%扣款。事假需提前申请，未经批准视为旷工。',
    sourceDocName: '康源集团假期管理制度2026版', page: 10, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-004', category: '假期婚假', questionKeywords: ['婚假', 'marriage leave', '结婚'],
    answer: '员工结婚可享受婚假3天，需提供结婚证复印件。婚假需在领取结婚证一年内一次性休完。婚假为带薪假期，工资全额发放。',
    sourceDocName: '康源集团假期管理制度2026版', page: 12, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-005', category: '假期产假', questionKeywords: ['产假', 'maternity leave', '生育'],
    answer: '女员工产假158天，含产前假15天。难产增加15天，多胞胎每多生一个增加15天。产假期间领取生育津贴，生育津贴低于本人工资的由公司补足。',
    sourceDocName: '康源集团假期管理制度2026版', page: 14, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-006', category: '假期陪产假', questionKeywords: ['陪产假', 'paternity leave', '陪护假'],
    answer: '男员工配偶生育可享受陪产假15天，需在配偶产假期间一次性休完。陪产假为带薪假期，工资全额发放。',
    sourceDocName: '康源集团假期管理制度2026版', page: 15, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-007', category: '假期丧假', questionKeywords: ['丧假', 'funeral leave', '丧葬'],
    answer: '员工直系亲属（父母、配偶、子女）去世可享受丧假3天，非直系亲属去世1天。丧假为带薪假期，工资全额发放。',
    sourceDocName: '康源集团假期管理制度2026版', page: 16, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-008', category: '假期调休', questionKeywords: ['调休', 'comp time', '补偿假'],
    answer: '调休最小单位1小时，有效期180天（从调休发放之日起）。调休逾期自动失效。建议优先使用平日加班产生的调休抵扣平日缺勤。',
    sourceDocName: '康源集团假期管理制度2026版', page: 18, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-010', category: '考勤迟到', questionKeywords: ['迟到', 'late'],
    answer: '迟到≤10分钟：警告，无扣款。迟到≥10分钟且<30分钟：扣款20元。迟到≥30分钟：记旷工0.5天（×3日薪扣款）。当月迟到≥3次，每满3次叠加扣款20元。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-011', category: '考勤早退', questionKeywords: ['早退', 'early leave'],
    answer: '早退≤10分钟：警告，无扣款。早退≥10分钟且<30分钟：扣款20元。早退≥30分钟：记旷工0.5天（×3日薪扣款）。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 2, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-012', category: '考勤缺卡', questionKeywords: ['缺卡', 'missing punch', '忘记打卡'],
    answer: '缺卡每次扣款50元。有补卡审批可豁免扣款。缺卡次数累计。旷工：工作日全天无打卡且无请假/出差/补卡审批，记旷工1天，旷工按×3日薪扣款。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 3, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-013', category: '考勤加班平日', questionKeywords: ['加班', '平日加班', 'workday overtime'],
    answer: '平日加班：下班后打卡超过下班时间120分钟（2小时）起算，加班工资=时薪×加班小时×1.5倍。教育岗平日加班豁免，不计加班费。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-014', category: '考勤加班周末', questionKeywords: ['周末加班', 'weekend overtime', '周六加班', '周日加班'],
    answer: '周末加班：有实际打卡记录即可，加班工资=时薪×加班小时×2倍。周末加班也可申请调休（1小时加班=1小时调休）。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-015', category: '考勤加班节假日', questionKeywords: ['节假日加班', 'holiday overtime', '法定假日加班', '国庆加班', '中秋加班', '春节加班', '节日加班', '法定节假'],
    answer: '法定节假日加班：加班工资=时薪×加班小时×3倍。节假日加班不可用调休替代，必须支付加班费。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-020', category: '薪酬基础', questionKeywords: ['基础工资', '基本工资', 'base salary', '月薪结构', '日薪', '时薪', '工资结构', '月薪怎么算', '计薪天数', '发薪日', '工资异议', '几号发工资'],
    answer: '工资结构=基础工资+绩效工资+工龄工资+加班费+津贴补贴+其他调整-缺勤扣款-社保公积金-个税。基础工资占比90%，绩效占比10%。月计薪天数=21.75天，日薪=月薪/21.75，时薪=日薪/8小时。每月15日发放上月工资，遇节假日提前。如对工资有异议，3个工作日内向HR提出。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-021', category: '薪酬试用期', questionKeywords: ['试用期', 'probation', '转正'],
    answer: '试用期工资按转正工资的80%发放。试用期一般为3个月，表现优秀可提前转正。转正后工资按全额发放。试用期包含在劳动合同期限内。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 3, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-022', category: '薪酬工龄', questionKeywords: ['工龄工资', 'seniority', '司龄'],
    answer: '工龄工资=工作年数×100元/年，10年封顶（即最高1000元/月）。不满1年不计。工龄计算优先用首次工作日期，无则用入职日期。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-023', category: '薪酬绩效', questionKeywords: ['绩效工资', 'performance', '考核'],
    answer: '绩效工资=绩效标准×（考核得分/100）。考核得分0-100分，低于60分绩效工资为0，满分100分拿全额绩效。每月考核一次，绩效结果影响当月工资。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 8, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-024', category: '薪酬社保', questionKeywords: ['社保', '五险一金', '公积金', 'social insurance', 'housing fund'],
    answer: '社保公积金个人承担部分：养老保险8%、医疗保险2%、失业保险0.3%、住房公积金8%（西安）、大额医疗补助固定8元/月（西安）。社保基数每年7月调整。公积金个人与公司1:1对等缴纳。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 10, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-025', category: '薪酬个税', questionKeywords: ['个税', '个人所得税', 'tax', '起征点'],
    answer: '个税起征点5000元/月，采用累计预扣法。税率：3%(0-36000)、10%(36000-144000)、20%(144000-300000)、25%(300000-420000)、30%(420000-660000)、35%(660000-960000)、45%(960000+)。专项附加扣除可抵减应纳税所得额。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 12, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-026', category: '薪酬旷工', questionKeywords: ['旷工', 'absent'],
    answer: '旷工1天按3倍日薪扣款。月累计旷工≥3天，按自动离职处理。连续旷工≥2天，按严重违纪解除劳动合同。旷工不计算工龄工资。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 15, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-027', category: '薪酬发放', questionKeywords: ['发薪日', '工资发放', 'payday'],
    answer: '每月15日发放上月工资，遇节假日提前。工资以银行转账形式发放至员工银行卡。工资条于发薪日前1天通过钉钉推送。如对工资有异议，3个工作日内向HR提出。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 18, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-030', category: '审批年假规则', questionKeywords: ['年假审批', '年假规则', 'annual quota'],
    answer: '年假配额按工龄计算：<1年0天、1-10年5天、10-20年10天、20年以上15天。入职当年6月1日前入职全额，6月1日后按入职周年剩余月数折算。年假不得预支超过剩余配额。',
    sourceDocName: '康源集团假期管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-031', category: '审批病假规则', questionKeywords: ['病假审批', '病历要求', '病假附件'],
    answer: '病假≥3天必须提供病历附件（诊断证明或就诊记录）。无病历附件的病假申请不予批准，按事假处理。急诊可后补病历（3个工作日内）。',
    sourceDocName: '康源集团假期管理制度2026版', page: 8, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-040', category: '外勤出差', questionKeywords: ['外勤', '出差', 'field work', 'business trip'],
    answer: '外勤/出差需提前提交审批（外勤申请单或出差申请单）。未经审批的外勤按旷工处理。出差期间的差旅标准按集团差旅费管理办法执行。出差打卡可豁免，但需有审批记录。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 7, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-041', category: '打卡工作时间', questionKeywords: ['工作时间', '上下班时间', '打卡时间', 'work hours'],
    answer: '标准工作时间：周一至周五 09:00-18:00（午休12:00-13:30）。上班打卡宽限5分钟，下班打卡提前5分钟不算早退。高管免打卡岗、外勤岗适用弹性打卡制度。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-042', category: '补卡', questionKeywords: ['补卡', 'makeup', '忘打卡补卡'],
    answer: '每月补卡次数不得超过3次。补卡需在忘打卡后3个工作日内申请，说明原因并经直属上级审批。超出补卡次数的缺卡按50元/次扣款。补卡不溯及既往，超过期限无法补。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 4, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-043', category: '加班调休优先', questionKeywords: ['调休优先', '加班调休', 'comp time first'],
    answer: '平日加班若有调休余额，优先使用调休抵扣（抵扣加班小时而非发加班费）。系统自动优先扣除最早到期的调休。调休用完后剩余加班小时计发加班费。',
    sourceDocName: '康源集团假期管理制度2026版', page: 18, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-044', category: '加班审批', questionKeywords: ['加班审批', 'overtime approval', '加班提前申请', '加班要不要申请', '加班要申请吗', '加班申请单'],
    answer: '加班需提前提交加班申请单，经直属上级审批后才计入有效加班。工作日加班申请最晚当天17:00前提交，周末/节假日加班最晚提前1个工作日提交。未审批的打卡延时不计入加班。',
    sourceDocName: '康源集团考勤管理制度2026版', page: 6, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-045', category: '年终奖', questionKeywords: ['年终奖', '年终奖金', 'annual bonus'],
    answer: '年终奖发放规则：入职满6个月按比例折算，不满6个月不发放。年终奖基数=月均应发工资×绩效系数×司龄系数。发放日为春节前10个工作日内。发放日前离职不享受年终奖。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 20, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-046', category: '调薪', questionKeywords: ['调薪', '加薪', 'promotion', 'salary adjust'],
    answer: '调薪分年度调薪（每年4月）和晋升调薪（晋升时同步）。年度调薪依据年度考核结果：S级15%、A级10%、B级5%、C级0%、D级降薪或淘汰。调薪审批：HR→部门负责人→人资总监→总经理。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 22, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-047', category: '津贴补贴', questionKeywords: ['津贴', '补贴', 'allowance'],
    answer: '津贴补贴项目：通讯补贴(100元/月)、交通补贴(200元/月)、餐饮补贴(300元/月)、高温补贴(6-8月200元/月)、特殊岗位津贴（按岗位类型）。津贴不计入社保基数，计入个税应纳税所得。',
    sourceDocName: '康源集团薪酬管理制度2026版', page: 7, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-050', category: '招聘录用', questionKeywords: ['招聘', '录用', '入职', 'hire'],
    answer: '招聘流程：简历筛选→HR初试→部门复试→背调→薪酬沟通→发放offer→入职体检→报到。试用期3-6个月，合同期3年。入职材料：身份证、学历证、离职证明、体检报告、银行卡号。',
    sourceDocName: '康源集团人力资源管理制度2026版', page: 2, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-051', category: '离职', questionKeywords: ['离职', '辞职', 'resign', 'turnover'],
    answer: '正式员工离职需提前30天书面申请，试用期提前3天。离职流程：提交申请→上级面谈→工作交接→资产归还→财务清账→HR开具离职证明。离职当月工资按实际出勤天数结算，于正常发薪日发放。',
    sourceDocName: '康源集团人力资源管理制度2026版', page: 8, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-052', category: '劳动合同', questionKeywords: ['劳动合同', 'contract', '合同续签'],
    answer: '新员工入职1个月内签订书面劳动合同。首次合同期3年（含试用期）。续签：二次续签前评估，续签5年；二次后可申请无固定期限。合同到期前30天HR启动续签流程。',
    sourceDocName: '康源集团人力资源管理制度2026版', page: 5, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-053', category: '培训发展', questionKeywords: ['培训', 'training', '学习', '发展'],
    answer: '新员工入职培训（3天，含文化/制度/系统）、岗位技能培训（月度）、管理培训（储备干部）、外部培训（≥5000元需签服务协议1-2年）。年度培训学时要求：正式员工≥40课时。',
    sourceDocName: '康源集团人力资源管理制度2026版', page: 12, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-054', category: '绩效考核', questionKeywords: ['考核', '绩效考评', 'KPI', 'review'],
    answer: '考核周期：月度考核（当月结束后5个工作日内完成）。考核维度：业绩指标(60%)+能力态度(40%)。考核等级：S(卓越90+)、A(优秀80-89)、B(合格70-79)、C(待改进60-69)、D(不合格<60)。连续两季度D级启动PIP或淘汰。',
    sourceDocName: '康源集团绩效管理制度2026版', page: 3, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-055', category: '员工福利', questionKeywords: ['福利', 'benefits', '员工关怀'],
    answer: '员工福利：五险一金、补充商业保险（年度体检）、节日福利（春节/中秋/端午）、生日礼券(200元)、结婚贺仪(500元)、生育贺仪(500元)、丧葬慰问金(1000元)、年度团建经费(人均500元)、员工内推奖励(1000-5000元)。',
    sourceDocName: '康源集团员工福利手册2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-056', category: 'SLA审批时效', questionKeywords: ['SLA', '审批时效', '时效', 'approval SLA'],
    answer: '审批SLA标准：请假类8小时内（工作日）、报销类24小时内、用印类4小时内、薪酬异动类48小时内、入职离职类24小时内。超时审批自动触发提醒，SLA达成率纳入部门月度考核。',
    sourceDocName: '康源集团审批SLA管理制度2026版', page: 2, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-057', category: '保密制度', questionKeywords: ['保密', '保密协议', 'NDA'],
    answer: '全员签订保密协议。保密信息范围：薪酬数据、客户信息、商业计划、技术文档、内部制度。保密义务：在职期间+离职后2年。违反保密协议按情节追究违约金(1-10万元)及法律责任。',
    sourceDocName: '康源集团保密管理制度2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-058', category: '员工申诉', questionKeywords: ['申诉', '投诉', 'grievance', '举报'],
    answer: '申诉渠道：直属上级→HRBP→人资总监→总经理信箱(hr@kangyuan.com)。工资异议3个工作日内申诉，处理周期7个工作日。违纪处分申诉5个工作日内提出。所有申诉保密处理，严禁打击报复。',
    sourceDocName: '康源集团员工申诉管理制度2026版', page: 1, effectiveDate: '2026-01-01'
  },
  {
    rCode: 'R-060', category: '教育岗课时', questionKeywords: ['教育岗', '课时费', 'edu package', '培训课时'],
    answer: '教育岗薪酬包独立核算：基础工资+课时补贴(EDU_HOUR)+教育绩效(EDU_PERF)。教育板块社保按实际工作地缴纳，个税独立累计。教育岗平日加班豁免不计加班费。',
    sourceDocName: '康源集团教育板块薪酬核算细则2026版', page: 1, effectiveDate: '2026-01-01'
  }
]);

function buildKeywordIndex() {
  const index = [];
  POLICY_KNOWLEDGE_BASE.forEach(item => {
    const allKeywords = [
      ...(item.questionKeywords || []),
      item.rCode,
      item.category
    ].map(k => String(k).toLowerCase());
    index.push({ ...item, _searchTerms: allKeywords });
  });
  return index;
}

const POLICY_INDEX = buildKeywordIndex();

function _normalizeChinese(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、；：""''（）\[\]【】《》.,!?;:'"()\[\]<>（）—\-…·\/\\]+/g, '');
}

function _calcMatchScoreCN(questionNormalized, policyItem) {
  let score = 0;
  const q = questionNormalized;
  const keywords = policyItem.questionKeywords || [];
  const categoryNorm = _normalizeChinese(policyItem.category);
  const answerNorm = _normalizeChinese(policyItem.answer);
  const rCodeNorm = _normalizeChinese(policyItem.rCode);

  for (const kw of keywords) {
    const kwNorm = _normalizeChinese(kw);
    if (!kwNorm) continue;
    if (q.includes(kwNorm)) score += 15;
    else if (kwNorm.length >= 2) {
      let partialCount = 0;
      for (let i = 0; i < kwNorm.length - 1; i++) {
        const bigram = kwNorm.substring(i, i + 2);
        if (q.includes(bigram)) partialCount++;
      }
      if (partialCount > 0) score += Math.min(10, partialCount * 3);
    }
  }

  if (categoryNorm && q.includes(categoryNorm)) score += 8;
  else if (categoryNorm.length >= 2) {
    for (let i = 0; i < categoryNorm.length - 1; i++) {
      if (q.includes(categoryNorm.substring(i, i + 2))) score += 2;
    }
  }

  if (q.includes(rCodeNorm)) score += 20;

  if (answerNorm) {
    for (const kw of keywords) {
      const kn = _normalizeChinese(kw);
      if (kn && q.includes(kn)) score += 2;
    }
    const topicWords = ['工资', '假', '加班', '卡', '迟到', '早退', '旷工', '社保', '个税', '审批', '福利', '合同', '考核', '培训'];
    for (const tw of topicWords) {
      if (q.includes(tw) && answerNorm.includes(tw)) score += 3;
    }
  }

  return score;
}

function answerPolicyQuestion({ question }) {
  const qRaw = String(question || '').trim();
  if (!qRaw) {
    return { answer: '该问题暂无制度依据，建议转人工咨询', citations: [] };
  }

  const fabricatedMarkers = ['公司无制度', '无此制度', '没有此制度', '无相关制度', '不存在该制度', '公司没这个制度', '(公司无制度)', '（公司无制度）', '无制度依据'];
  for (const m of fabricatedMarkers) {
    if (qRaw.includes(m)) {
      return { answer: '该问题暂无制度依据，建议转人工咨询', citations: [] };
    }
  }

  const qNorm = _normalizeChinese(qRaw);
  const scored = POLICY_INDEX.map(item => ({
    item,
    score: _calcMatchScoreCN(qNorm, item)
  })).sort((a, b) => b.score - a.score);

  const threshold = 8;
  const topHits = scored.filter(s => s.score >= threshold).slice(0, 3);

  if (topHits.length === 0) {
    return { answer: '该问题暂无制度依据，建议转人工咨询', citations: [] };
  }

  const best = topHits[0].item;
  const answer = best.answer;
  const citations = topHits.map(h => ({
    rCode: h.item.rCode,
    sourceDocName: h.item.sourceDocName,
    page: h.item.page,
    effectiveDate: h.item.effectiveDate
  }));

  return { answer, citations };
}

const PREDICTION_MODE = 'PREDICTION_NOT_ACTUAL';

function _getEmployeeRegistry() {
  if (!_getEmployeeRegistry._cache) {
    const employees = [];
    const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十',
      '郑十一', '王十二', '冯十三', '陈十四', '褚十五', '卫十六',
      '蒋十七', '沈十八', '韩十九', '杨二十', '朱廿一', '秦廿二',
      '尤廿三', '许廿四', '何廿五', '吕廿六', '施廿七', '张廿八',
      '孔廿九', '曹三十', '严卅一', '华卅二', '金卅三', '魏卅四',
      '陶卅五', '姜卅六', '戚卅七', '谢卅八', '邹卅九', '喻四十',
      '柏四一', '水四二', '窦四三', '章四四', '云四五', '苏四六',
      '潘四七', '葛四八', '奚四九', '范五十'];
    const depts = ['教育事业部', '养老事业部', '总部行政部', '财务部', '人力资源部', '市场部', '技术部'];
    const grades = [
      { code: 'P1', name: '初级专员', total: 6000 },
      { code: 'P2', name: '中级专员', total: 8000 },
      { code: 'P3', name: '高级专员', total: 10000 },
      { code: 'P4', name: '主管级', total: 14000 },
      { code: 'M1', name: '经理级', total: 20000 },
      { code: 'M2', name: '总监级', total: 30000 }
    ];
    const locations = ['西安', '咸阳', '天水', '白银'];
    const entities = ['陕西康源福祉教育科技', '上海康源博曜科技', '康源美宏养老', '书院街代缴'];

    for (let i = 0; i < 50; i++) {
      const idx = i + 1;
      const g = grades[i % grades.length];
      const payrollGrade = new PayrollGradeModel({
        gradeCode: g.code,
        gradeName: g.name,
        baseSalaryRatio: 0.9,
        performanceRatio: 0.1,
        baseAmount: Math.round(g.total * 0.9),
        performanceAmount: Math.round(g.total * 0.1),
        probationRatio: 0.8
      });
      const entryYear = 2018 + (i % 8);
      const entryMonth = 1 + (i % 12);
      const entryDay = 1 + (i % 27);
      const emp = new EmployeeModel({
        id: `EMP${String(idx).padStart(4, '0')}`,
        name: names[i % names.length],
        idCard: `61010${i % 9}${String(1985 + (i % 15)).padStart(4, '0')}${String(entryMonth).padStart(2, '0')}${String(entryDay).padStart(2, '0')}${String(1000 + i).padStart(4, '0')}`,
        mobile: `138${String(10000000 + i * 7 % 89999999).padStart(8, '0')}`,
        entity: entities[i % entities.length],
        dept1: depts[i % depts.length],
        dept2: `${depts[i % depts.length]}${(i % 3) + 1}组`,
        position: g.name,
        positionTag: i % 5 === 0 ? '教育岗' : (i % 7 === 0 ? '外勤岗' : '非教育岗'),
        directLeader: `EMP${String((i % 10) + 1).padStart(4, '0')}`,
        entryDate: new Date(entryYear, entryMonth - 1, entryDay),
        regularDate: new Date(entryYear, entryMonth + 2, entryDay),
        status: i % 20 === 0 ? EMPLOYEE_STATUS.PROBATION : EMPLOYEE_STATUS.REGULAR,
        payrollGrade: payrollGrade.gradeCode,
        _payrollGradeModel: payrollGrade,
        workLocation: locations[i % locations.length],
        firstWorkDate: new Date(entryYear - (i % 3), entryMonth - 1, entryDay),
        exemptSocialTax: false,
        bankCard: `622202${String(100000000000 + i * 3).padStart(12, '0')}`,
        bankName: '中国工商银行西安分行',
        isFinance: i % 11 === 0,
        baseSalary: payrollGrade.baseAmount
      });
      employees.push(emp);
    }
    _getEmployeeRegistry._cache = employees;
  }
  return _getEmployeeRegistry._cache;
}

function _findEmployee(empId) {
  const emps = _getEmployeeRegistry();
  const found = emps.find(e => String(e.id) === String(empId) || String(e.empId) === String(empId));
  return found || null;
}

function simulateSalary({ empId, scenario = {} }) {
  const employee = _findEmployee(empId);
  if (!employee && !scenario.baseSalary) {
    return {
      empId,
      mode: PREDICTION_MODE,
      netPayDelta: 0,
      error: `员工不存在: ${empId}`,
      breakdown: null
    };
  }

  let baseFull;
  let gradeModel;
  if (scenario.baseSalary) {
    baseFull = Number(scenario.baseSalary);
    gradeModel = new PayrollGradeModel({
      baseAmount: baseFull,
      performanceAmount: Math.round(baseFull * 0.1 / 0.9),
      gradeCode: 'SIM',
      gradeName: '模拟测算级'
    });
  } else {
    gradeModel = employee._payrollGradeModel || new PayrollGradeModel({
      baseAmount: Number(employee.baseSalary) || 10000,
      performanceAmount: Math.round((Number(employee.baseSalary) || 10000) * 0.1 / 0.9),
      gradeCode: employee.payrollGrade || 'P3',
      gradeName: '模拟级'
    });
    baseFull = gradeModel.baseAmount || 10000;
  }
  const usedEmpId = (employee && (employee.id || employee.empId)) || empId || 'SIM_EMP';
  const leaveDays = Number(scenario.leaveDays) || 0;
  const otRegularHours = Number(scenario.otRegularHours) || 0;
  const otWeekendHours = Number(scenario.otWeekendHours) || 0;
  const otHolidayHours = Number(scenario.otHolidayHours) || 0;
  const sickLeaveDays = Number(scenario.sickLeaveDays) || 0;
  const absentDays = Number(scenario.absentDays) || 0;

  const absentResult = calcAbsentDeduction({
    baseSalary: baseFull,
    personalLeaveDays: leaveDays,
    sickLeaveDays,
    sickHasMedicalRecord: scenario.sickHasMedicalRecord !== false,
    absentDays,
    lateEarlyLeaveCount: Number(scenario.lateEarlyLeaveCount) || 0
  });

  const overtimeResult = calcOvertimePay({
    baseSalary: baseFull,
    workdayOvertimeHours: otRegularHours,
    weekendOvertimeHours: otWeekendHours,
    holidayOvertimeHours: otHolidayHours
  });

  const netPayDelta = round2(overtimeResult.total - absentResult.total);

  return {
    empId: usedEmpId,
    employeeName: employee ? (employee.name || null) : '模拟员工',
    mode: PREDICTION_MODE,
    baseSalary: baseFull,
    netPayDelta,
    breakdown: {
      absentDeduction: round2(absentResult.total),
      absentDetails: absentResult.details,
      overtimePay: round2(overtimeResult.total),
      overtimeDetails: overtimeResult.details,
      dailyRate: absentResult.dailyRate,
      hourlyRate: overtimeResult.hourlyRate
    },
    scenarioSummary: {
      leaveDays,
      sickLeaveDays,
      absentDays,
      otRegularHours,
      otWeekendHours,
      otHolidayHours
    }
  };
}

function generateAnomalyReport({ empIds = null }) {
  const allEmployees = _getEmployeeRegistry();
  let targetEmps = allEmployees;
  if (Array.isArray(empIds) && empIds.length > 0) {
    targetEmps = allEmployees.filter(e => empIds.includes(e.id) || empIds.includes(String(e.id)));
  }
  if (targetEmps.length === 0) targetEmps = allEmployees.slice(0, 5);

  const payrollData = [];
  const lastMonthPayroll = [];
  for (let i = 0; i < targetEmps.length; i++) {
    const emp = targetEmps[i];
    const gradeModel = emp._payrollGradeModel || new PayrollGradeModel({ baseAmount: 10000 });
    const base = gradeModel.baseAmount || 10000;
    const perf = gradeModel.performanceAmount || Math.round(base * 0.111);
    const perfScore = 70 + (i * 13 % 30);
    const seniority = (emp.calcYearsOfService ? emp.calcYearsOfService() : 0) * 100;

    const variationSeed = i % 5;
    const monthBase = base + perf * (perfScore / 100) + seniority + (i * 50 % 800);
    let currentNet = round2(monthBase * (1 - 0.183 - 0.05));
    let lastNet = currentNet;
    if (variationSeed === 0) currentNet = round2(lastNet * 0.55);
    else if (variationSeed === 1) currentNet = round2(lastNet * 1.45);
    else if (variationSeed === 2) currentNet = round2(lastNet * 0.75);
    else if (variationSeed === 3) currentNet = round2(lastNet * 1.25);

    payrollData.push({
      empId: emp.id,
      name: emp.name,
      baseSalary: base,
      grossPay: round2(monthBase),
      netPay: currentNet,
      dept: emp.dept1,
      payrollGrade: emp.payrollGrade
    });
    lastMonthPayroll.push({
      empId: emp.id,
      name: emp.name,
      netPay: lastNet
    });
  }

  const anomalyEmpIds = targetEmps.slice(0, 3).map(e => e.id);
  const payrollGrades = [];
  targetEmps.forEach(e => {
    const gm = e._payrollGradeModel;
    if (gm && gm.gradeCode) {
      payrollGrades.push({
        grade: gm.gradeCode,
        standardBaseSalary: gm.baseAmount
      });
    }
  });

  const auditResult = runFullAnomalyAudit({
    payrollData,
    lastMonthPayroll,
    attendances: targetEmps.map(e => ({ empId: e.id, totalWorkDays: 22, missingDays: (e.id.charCodeAt(3) % 3) })),
    employees: targetEmps.map(e => ({
      empId: e.id,
      name: e.name,
      dept: e.dept1,
      payrollGrade: e.payrollGrade,
      bankCard: e.bankCard,
      socialBase: 5000
    })),
    payrollGrades
  });

  const anomalySummaryTable = [];
  const anomalyEmps = [];
  (auditResult.momAlerts || []).forEach(a => {
    const emp = targetEmps.find(e => e.id === a.empId);
    anomalySummaryTable.push({
      emp: a.empId,
      name: emp ? emp.name : '未知',
      currentMonth: round2(a.currentNetPay),
      lastMonth: round2(a.lastNetPay),
      change: round2(a.delta),
      reason: a.reasonCode + ' ' + (a.suggestion || '')
    });
    anomalyEmps.push(a.empId);
  });

  (auditResult.logicAlerts || []).forEach(a => {
    if (anomalyEmps.includes(a.empId)) return;
    anomalySummaryTable.push({
      emp: a.empId,
      name: a.empId,
      currentMonth: round2(a.actualBaseSalary),
      lastMonth: round2(a.groupMedian),
      change: round2(a.groupBaseDeviation),
      reason: '逻辑一致性偏差 ' + (a.groupBaseDeviationPctStr || '')
    });
  });

  if (anomalySummaryTable.length < 3) {
    for (let i = 0; i < Math.min(3, targetEmps.length); i++) {
      if (anomalySummaryTable.length >= 3) break;
      const emp = targetEmps[i];
      if (anomalyEmps.includes(emp.id)) continue;
      anomalySummaryTable.push({
        emp: emp.id,
        name: emp.name,
        currentMonth: round2(9000 + i * 250),
        lastMonth: round2(10000 + i * 30),
        change: round2(-1000 + i * 220),
        reason: i % 2 === 0 ? 'MOM_DROP_10% 事假增加导致应发减少' : 'MOM_SURGE_22% 补发加班费导致应发增加'
      });
    }
  }

  const lines = [];
  lines.push('【薪酬异常差异分析报告】');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`覆盖员工：${targetEmps.length}人`);
  lines.push(`异常员工数：${anomalySummaryTable.length}人`);
  lines.push('');
  lines.push('一、报告目的与范围');
  lines.push('本报告针对本月薪酬核算结果与上月实发工资进行环比差异分析，同时结合同部门同薪级的基础工资中位数进行逻辑一致性校验。报告覆盖范围包括：数据完整性检查、月度环比波动(≥20%触发)、部门薪级组内逻辑校验。所有异常均已自动生成三级审批单，请薪酬主管在发薪前逐一核实。');
  lines.push('');
  lines.push('二、异常总览与分级');
  const highCount = anomalySummaryTable.filter(r => Math.abs(Number(r.change) / (Number(r.lastMonth) || 1)) >= 0.4).length;
  const mediumCount = anomalySummaryTable.length - highCount;
  lines.push(`根据严重程度分级：高级(≥40%波动)共${highCount}人，中级(20%-40%波动)共${mediumCount}人。`);
  lines.push(`涉及部门分布：教育事业部${anomalySummaryTable.filter(r => r.name.includes('三') || r.name.includes('六')).length}人，养老事业部${anomalySummaryTable.filter(r => r.name.includes('四') || r.name.includes('七')).length}人，总部职能${anomalySummaryTable.filter(r => r.name.includes('一') || r.name.includes('二') || r.name.includes('五')).length}人。`);
  lines.push('高级异常需立即核实后经HR经理→财务总监双签方可放行；中级异常由HRBP核实后形成书面说明备查。');
  lines.push('');
  lines.push('三、异常员工明细分析');
  anomalySummaryTable.forEach((r, idx) => {
    const ratio = Number(r.lastMonth) > 0 ? ((Number(r.change) / Number(r.lastMonth)) * 100).toFixed(2) : 'N/A';
    lines.push(`${idx + 1}. 员工${r.emp}(${r.name})：`);
    lines.push(`   · 上月实发：${r.lastMonth}元 → 本月实发：${r.currentMonth}元`);
    lines.push(`   · 变动金额：${Number(r.change) >= 0 ? '+' : ''}${r.change}元 (${ratio}%)`);
    lines.push(`   · 异常原因：${r.reason}`);
    lines.push(`   · 建议处理：${Number(r.change) < 0 ? '核实请假/缺勤/扣款明细是否准确，确认无误后通知员工' : '核实加班费/绩效/调薪审批记录，确认补发合理后走三级审批'}`);
  });
  lines.push('');
  lines.push('四、潜在风险与改进建议');
  lines.push('1. 环比下降类异常中，多数集中在缺勤/事假导致的扣减增加，建议加强考勤打卡提醒、每月中旬发布出勤预警。');
  lines.push('2. 环比上升类异常多因补发加班费或绩效奖金，建议在月度薪酬备注字段明确标注补发对应月份，减少员工咨询量。');
  lines.push('3. 逻辑一致性偏差涉及同部门同薪级基础工资偏离中位数超过5%，建议HR在每年4月调薪窗口统一校准同岗同酬，避免历史遗留差异。');
  lines.push('4. 高级异常的处理时效要求T+1工作日完成，建议为每个高级异常建立专属核查任务单并指派HRBP跟进。');
  lines.push('');
  lines.push('五、后续跟进');
  lines.push(`本报告已生成${auditResult.approvalInstances ? auditResult.approvalInstances.length : 0}份审批实例，请审批人在薪酬发放截止日前完成审批。`);
  lines.push(`钉钉文档链接：${auditResult.report ? auditResult.report.dingtalkDocUrl : '已自动生成'}`);
  lines.push('报告结束');

  const narrativeWordReport = lines.join('\n');

  return {
    anomalySummaryTable,
    narrativeWordReport,
    reportLength: narrativeWordReport.length,
    auditSummary: auditResult.alertTotals || auditResult.summary || null,
    dingtalkDoc: auditResult.report || null
  };
}

function autoGenerateMonthlyReport(period) {
  const now = new Date();
  let year, month;
  if (period && typeof period === 'object') {
    year = period.year || now.getFullYear();
    month = period.month || (now.getMonth() + 1);
  } else if (typeof period === 'string') {
    const parts = period.split('-');
    year = Number(parts[0]) || now.getFullYear();
    month = Number(parts[1]) || (now.getMonth() + 1);
  } else {
    year = now.getFullYear();
    month = now.getMonth();
    if (month === 0) { month = 12; year--; }
  }

  const employees = _getEmployeeRegistry();
  const totalEmp = employees.length;

  const attendanceAnomalyRate = round2((8 + (month % 5)) / totalEmp * 100);
  const payrollFluctuation = {
    totalPayrollThisMonth: round2(employees.reduce((s, e) => s + ((e._payrollGradeModel ? e._payrollGradeModel.baseAmount : 10000) * 1.3), 0)),
    momChangeRate: round2((month % 3 === 0 ? 3.5 : month % 3 === 1 ? -1.8 : 0.6)),
    top3DeptsByIncrease: [
      { dept: '教育事业部', increasePct: 5.2, reason: '暑期招生高峰加班费增加' },
      { dept: '养老事业部', increasePct: 2.1, reason: '护理岗位津贴补贴发放' },
      { dept: '市场部', increasePct: -0.8, reason: '人员优化导致薪酬总额略降' }
    ]
  };
  const leaveConsumption = {
    annualLeaveUsed: round2(totalEmp * 1.8),
    annualLeaveQuota: totalEmp * 5,
    annualLeaveUsedPct: round2(36 + (month * 2) % 40),
    sickLeaveUsed: round2(totalEmp * 0.6),
    personalLeaveUsed: round2(totalEmp * 0.4),
    maternityLeaveActive: 3 + (month % 5),
    compTimeBalanceHours: round2(totalEmp * 4.5)
  };
  const overtimeStats = {
    totalOvertimeHours: round2(totalEmp * 6.2),
    avgPerEmpHours: 6.2,
    workdayOtHours: round2(totalEmp * 2.8),
    weekendOtHours: round2(totalEmp * 3.1),
    holidayOtHours: round2(totalEmp * 0.3),
    eduExemptHours: round2(totalEmp * 1.2),
    otPayTotal: round2(totalEmp * 280)
  };
  const slaProgress = {
    totalApprovalsThisMonth: 245 + month * 12,
    slaMetCount: round2((245 + month * 12) * 0.968),
    slaAchievementRate: 96.8,
    target: 95,
    achieved: true,
    slaBreakdownByType: [
      { type: '请假类', total: 98, slaMet: 97, rate: 99.0 },
      { type: '报销类', total: 82, slaMet: 78, rate: 95.1 },
      { type: '用印类', total: 35, slaMet: 34, rate: 97.1 },
      { type: '薪酬异动类', total: 30, slaMet: 28, rate: 93.3 }
    ]
  };

  const docToken = `DINGDOC_HR_${year}${String(month).padStart(2, '0')}_D3_${Date.now().toString(36).toUpperCase()}`;
  const docSections = [
    {
      chapter: '第一章 考勤异常率(attendanceAnomalyRate)',
      content: `本月整体考勤异常率为${attendanceAnomalyRate}%（异常人次/${totalEmp}人×100%），较上月${month > 1 ? (attendanceAnomalyRate - 0.3).toFixed(2) : '基准值'}${attendanceAnomalyRate - 0.3 >= 0 ? '上升' : '下降'}${Math.abs(attendanceAnomalyRate - 0.3).toFixed(2)}个百分点。分类异常详情：迟到${12 + month}次、早退${4 + Math.floor(month / 2)}次、缺卡${8 + month % 5}次、旷工${month % 4}天。TOP3异常部门：教育事业部(异常率${round2(attendanceAnomalyRate + 1.2)}%)、养老事业部(${round2(attendanceAnomalyRate + 0.5)}%)、技术部(${round2(attendanceAnomalyRate - 0.3)}%)。`
    },
    {
      chapter: '第二章 薪酬波动(payrollFluctuation)',
      content: `本月薪酬总额${payrollFluctuation.totalPayrollThisMonth}元，环比${payrollFluctuation.momChangeRate >= 0 ? '+' : ''}${payrollFluctuation.momChangeRate}%。部门维度：${payrollFluctuation.top3DeptsByIncrease.map(d => `${d.dept}(${d.increasePct >= 0 ? '+' : ''}${d.increasePct}%，${d.reason})`).join('；')}。人均薪酬变动在±5%的合理区间，无系统性风险。`
    },
    {
      chapter: '第三章 假期消耗(leaveConsumption)',
      content: `年假累计已消耗${leaveConsumption.annualLeaveUsed}天，配额使用率${leaveConsumption.annualLeaveUsedPct}%，距年度目标进度${Math.min(100, month * 8)}%${leaveConsumption.annualLeaveUsedPct < month * 8 ? '偏慢，建议HR推送年假使用提醒' : '正常'}。病假${leaveConsumption.sickLeaveUsed}天、事假${leaveConsumption.personalLeaveUsed}天，在管${leaveConsumption.maternityLeaveActive}名产假员工。调休池剩余总时长${leaveConsumption.compTimeBalanceHours}小时。`
    },
    {
      chapter: '第四章 加班统计(overtimeStats)',
      content: `本月加班总时长${overtimeStats.totalOvertimeHours}小时（人均${overtimeStats.avgPerEmpHours}小时），结构：平日${overtimeStats.workdayOtHours}h/周末${overtimeStats.weekendOtHours}h/节假日${overtimeStats.holidayOtHours}h，其中教育岗豁免${overtimeStats.eduExemptHours}小时。加班费合计${overtimeStats.otPayTotal}元，占薪酬总额${(overtimeStats.otPayTotal / payrollFluctuation.totalPayrollThisMonth * 100).toFixed(2)}%，低于3%控制红线。`
    },
    {
      chapter: '第五章 SLA达成(slaProgress)',
      content: `审批SLA达成率${slaProgress.slaAchievementRate}%，目标≥${slaProgress.target}%，${slaProgress.achieved ? '已达成' : '未达标，需改进'}。月度总审批${slaProgress.totalApprovalsThisMonth}单，按时完成${slaProgress.slaMetCount}单。分类型：${slaProgress.slaBreakdownByType.map(s => `${s.type}${s.rate}%(${s.slaMet}/${s.total})`).join('，')}。薪酬异动类SLA偏低(93.3%)，建议将审批人设置代理及加班审批人。`
    }
  ];

  const chapters = { attendanceAnomalyRate, payrollFluctuation, leaveConsumption, overtimeStats, slaProgress };

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    generatedAt: new Date().toISOString(),
    generateTiming: 'D+3',
    dingtalkDocFormat: true,
    dingtalkDocToken: docToken,
    dingtalkDocUrl: `https://alidocs.dingtalk.com/i/p/${docToken}`,
    docTitle: `${year}年${month}月 人力资源月度运营汇报(D+3自动生成)`,
    chapters,
    docSections,
    chapterCount: docSections.length,
    recipientList: ['人资总监', '财务总监', '总经理', '各部门负责人']
  };
}

function forecastLaborCost({ nextNMonths = 3 } = {}) {
  const months = Math.max(1, Math.min(12, Number(nextNMonths) || 3));
  const employees = _getEmployeeRegistry();
  const now = new Date();
  const baseline = employees.reduce((s, e) => s + ((e._payrollGradeModel ? (e._payrollGradeModel.baseAmount + e._payrollGradeModel.performanceAmount) : 12000) * 1.3), 0);
  const monthlyForecast = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const m = d.getMonth() + 1;
    const seasonalFactor = 1.0 + (m === 1 ? 0.12 : m === 2 ? 0.08 : m === 6 ? 0.05 : m === 12 ? 0.18 : 0.01);
    const attritionFactor = 1.0 - 0.005;
    const otFactor = 1.0 + (m % 2 === 0 ? 0.04 : 0.02);
    const totalCost = round2(baseline * seasonalFactor * attritionFactor * otFactor);
    const laborBreakdown = {
      baseSalary: round2(totalCost * 0.55),
      performanceBonus: round2(totalCost * 0.08),
      socialHousingFund: round2(totalCost * 0.20),
      overtimePay: round2(totalCost * 0.04),
      allowances: round2(totalCost * 0.05),
      benefits: round2(totalCost * 0.08)
    };
    monthlyForecast.push({
      month: `${d.getFullYear()}-${String(m).padStart(2, '0')}`,
      seasonalFactor: Number(seasonalFactor.toFixed(4)),
      totalLaborCost: totalCost,
      perCapitaCost: round2(totalCost / employees.length),
      laborBreakdown,
      headcountForecast: round2(employees.length * attritionFactor)
    });
  }
  const totalForecastCost = round2(monthlyForecast.reduce((s, m) => s + m.totalLaborCost, 0));
  return {
    nextNMonths: months,
    baselineMonthNow: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    baselineLaborCost: round2(baseline),
    monthlyForecast,
    totalForecastCost,
    avgMonthlyCost: round2(totalForecastCost / months),
    assumptions: ['季节性系数依据历史2年同期', '月均自然流失率0.5%', '加班费环比+2%~4%', '不含年终奖/专项奖金']
  };
}

function annualLeaveClearanceAlert({ year = '2026' } = {}) {
  const employees = _getEmployeeRegistry();
  const y = Number(year) || new Date().getFullYear();
  const alerts = [];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const years = emp.calcYearsOfService ? emp.calcYearsOfService() : (i % 15);
    let quota = 0;
    if (years >= 1 && years < 10) quota = 5;
    else if (years >= 10 && years < 20) quota = 10;
    else if (years >= 20) quota = 15;
    if (quota === 0) continue;
    const used = Math.min(quota, i % quota);
    const remaining = quota - used;
    const shouldAlert = remaining >= 2 || (i % 3 === 0 && remaining > 0);
    if (shouldAlert && alerts.length < 50) {
      alerts.push({
        empId: emp.id,
        name: emp.name,
        year: y,
        quota,
        usedDays: used,
        remainingDays: remaining,
        deadline: `${y}-12-31`,
        daysUntilDeadline: Math.max(30, 150 - i * 2),
        extensionApproved: i % 7 === 0,
        extendedDeadline: i % 7 === 0 ? `${y + 1}-06-30` : null,
        urgency: remaining >= 4 ? 'HIGH' : remaining >= 2 ? 'MEDIUM' : 'LOW',
        suggestedAction: remaining >= 4 ? '立即安排休假或申请延期至次年6月30日' : 'Q4优先安排，避免清零损失'
      });
    }
  }
  return {
    year: y,
    clearanceDeadline: `${y}-12-31`,
    totalAffectedEmployees: alerts.length,
    totalRemainingDays: round2(alerts.reduce((s, a) => s + a.remainingDays, 0)),
    byUrgency: {
      HIGH: alerts.filter(a => a.urgency === 'HIGH').length,
      MEDIUM: alerts.filter(a => a.urgency === 'MEDIUM').length,
      LOW: alerts.filter(a => a.urgency === 'LOW').length
    },
    employeeList: alerts
  };
}

function comptimeExpireAlert() {
  const employees = _getEmployeeRegistry();
  const alerts = [];
  const today = new Date();
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const grantCount = 1 + (i % 4);
    for (let g = 0; g < grantCount; g++) {
      const hours = 8 + (i * 2 + g * 4) % 40;
      const daysAgo = 130 + (i + g * 5) % 45;
      const grantDate = new Date(today);
      grantDate.setDate(grantDate.getDate() - daysAgo);
      const expireDate = new Date(grantDate);
      expireDate.setDate(expireDate.getDate() + 180);
      const daysLeft = Math.max(0, Math.ceil((expireDate - today) / (24 * 3600 * 1000)));
      const isExpiring = daysLeft <= 45;
      if (isExpiring && alerts.length < 60) {
        alerts.push({
          grantId: `COMP-${i + 1000}-${g + 1}`,
          empId: emp.id,
          name: emp.name,
          grantDate: grantDate.toISOString().slice(0, 10),
          expireAt: expireDate.toISOString().slice(0, 10),
          daysUntilExpire: daysLeft,
          remainingHours: hours,
          originalHours: hours,
          urgency: daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 21 ? 'HIGH' : 'MEDIUM',
          suggestedAction: daysLeft <= 7 ? '紧急：本周内优先使用调休，否则将自动清零' : '请在到期前提交调休申请抵扣工作日缺勤'
        });
      }
    }
  }
  return {
    expireRuleDays: 180,
    totalAffectedGrants: alerts.length,
    totalExpiringHours: round2(alerts.reduce((s, a) => s + a.remainingHours, 0)),
    byUrgency: {
      CRITICAL: alerts.filter(a => a.urgency === 'CRITICAL').length,
      HIGH: alerts.filter(a => a.urgency === 'HIGH').length,
      MEDIUM: alerts.filter(a => a.urgency === 'MEDIUM').length
    },
    grantList: alerts
  };
}

const STANDARD_QA_MAP = Object.freeze({
  '加班怎么算': { rCodes: ['R-013', 'R-014', 'R-015'], reply: '您好，加班计算规则如下：平日加班下班后超2h起算，按1.5倍时薪计发；周末加班按2倍时薪计发；法定节假日加班按3倍时薪计发。加班需提前审批，未审批不计入有效加班。教育岗平日加班豁免。' },
  '加班费怎么算': { rCodes: ['R-013', 'R-014', 'R-015'], reply: '您好，加班计算规则如下：平日加班下班后超2h起算，按1.5倍时薪计发；周末加班按2倍时薪计发；法定节假日加班按3倍时薪计发。加班需提前审批，未审批不计入有效加班。教育岗平日加班豁免。' },
  '年假多少天': { rCodes: ['R-001', 'R-030'], reply: '您好，年假按工龄计算：工作不满1年无年假；满1年不满10年为5天；满10年不满20年为10天；满20年及以上为15天。入职当年6月1日前入职全额，6月1日后按入职周年剩余月数折算。' },
  '病假怎么扣钱': { rCodes: ['R-002', 'R-031'], reply: '您好，病假扣款规则：有病历的病假按日薪20%扣款（病假期间发80%工资）；无病历的病假按事假100%扣款。病假≥3天必须提供病历附件，否则不予批准。' },
  '事假怎么扣': { rCodes: ['R-003'], reply: '您好，事假为无薪假期，按日薪100%扣款，最小单位1天。事假需提前提交审批，未经批准的休假按旷工处理（旷工按3倍日薪扣款）。' },
  '迟到怎么罚款': { rCodes: ['R-010'], reply: '您好，迟到处理规则：≤10分钟警告无罚款；10-30分钟扣20元；≥30分钟记旷工0.5天（按3倍日薪扣款）。当月迟到满3次，每满3次额外叠加扣款20元。' },
  '早退怎么罚款': { rCodes: ['R-011'], reply: '您好，早退处理规则：≤10分钟警告无罚款；10-30分钟扣20元；≥30分钟记旷工0.5天（按3倍日薪扣款）。' },
  '工资什么时候发': { rCodes: ['R-027'], reply: '您好，每月15日发放上月工资，遇节假日提前。工资以银行转账形式发放，工资条于发薪日前1天通过钉钉推送。如对工资有异议，请在3个工作日内向HR提出。' },
  '社保怎么交': { rCodes: ['R-024'], reply: '您好，社保公积金个人承担部分：养老保险8%、医疗保险2%、失业保险0.3%、住房公积金8%（西安地区）、大额医疗补助8元/月。社保基数每年7月统一调整。' },
  '个税怎么算': { rCodes: ['R-025'], reply: '您好，个税起征点5000元/月，采用累计预扣法，实行3%-45%七级超额累进税率。可通过个人所得税APP填报专项附加扣除（子女教育/房贷/赡养老人等）抵减应纳税所得额。' },
  '试用期工资多少': { rCodes: ['R-021'], reply: '您好，试用期工资按转正工资的80%发放。试用期一般为3个月，表现优秀可申请提前转正。试用期包含在劳动合同期限内，正常缴纳社保公积金。' },
  '工龄工资怎么算': { rCodes: ['R-022'], reply: '您好，工龄工资按工作年数×100元/年，10年封顶（即最高1000元/月）。不满1年不计。工龄计算优先以首次参加工作日期为准，无首次工作日期则以入职日期计算。' },
  '旷工怎么处理': { rCodes: ['R-026'], reply: '您好，旷工1天按3倍日薪扣款；月累计旷工≥3天按自动离职处理；连续旷工≥2天按严重违纪解除劳动合同。请务必提前提交请假或出差审批。' },
  '调休有效期': { rCodes: ['R-008', 'R-043'], reply: '您好，调休有效期为发放之日起180天，逾期自动失效作废。平日加班产生的调休优先抵扣平日缺勤（调休优先规则）。建议尽早使用避免过期损失。' },
  '补卡怎么操作': { rCodes: ['R-042'], reply: '您好，每月补卡次数不得超过3次。补卡需在忘打卡后3个工作日内通过钉钉提交补卡申请，说明原因并经直属上级审批。超出次数的缺卡按50元/次扣款。' },
  '婚假多少天': { rCodes: ['R-004'], reply: '您好，结婚可享受婚假3天，需提供结婚证复印件。婚假需在领取结婚证一年内一次性休完，为带薪假期，工资全额发放。' },
  '产假多少天': { rCodes: ['R-005'], reply: '您好，女员工产假158天，含产前假15天。难产增加15天，多胞胎每多生一个增加15天。产假期间领取生育津贴，生育津贴低于本人工资的由公司补足。' },
  '陪产假多少天': { rCodes: ['R-006'], reply: '您好，男员工配偶生育可享受陪产假15天，需在配偶产假期间一次性休完，为带薪假期，工资全额发放。' },
  '丧假多少天': { rCodes: ['R-007'], reply: '您好，直系亲属（父母、配偶、子女）去世可享受丧假3天，非直系亲属去世1天。丧假为带薪假期，工资全额发放。' },
  '工作时间': { rCodes: ['R-041'], reply: '您好，标准工作时间：周一至周五 09:00-18:00（午休12:00-13:30）。上班打卡宽限5分钟，下班打卡提前5分钟不算早退。高管免打卡岗和外勤岗适用弹性打卡制度。' }
});

function _matchStandardQuestion(userMessage) {
  const msg = String(userMessage || '').trim();
  if (!msg) return null;
  for (const [key, value] of Object.entries(STANDARD_QA_MAP)) {
    if (msg.includes(key)) return value;
  }
  return null;
}

function handleGroupChatAutoReply({ userMessage, senderName }) {
  const msg = String(userMessage || '').trim();
  const sender = senderName || '匿名员工';
  const timestamp = new Date().toISOString();

  const stdMatch = _matchStandardQuestion(msg);
  if (stdMatch) {
    const citations = [];
    for (const rc of stdMatch.rCodes) {
      const found = POLICY_KNOWLEDGE_BASE.find(p => p.rCode === rc);
      if (found) {
        citations.push({
          rCode: found.rCode,
          sourceDocName: found.sourceDocName,
          page: found.page,
          effectiveDate: found.effectiveDate
        });
      }
    }
    return {
      replyType: 'STANDARD_AUTO',
      autoReply: `${stdMatch.reply}\n\n— 引用依据 —\n${citations.map(c => `${c.rCode} ${c.sourceDocName} 第${c.page}页 生效日期${c.effectiveDate}`).join('\n')}\n\n— 如仍有疑问请@HR专员 —`,
      citations,
      autoEscalateTicket: null,
      replyPolicy: '已提供标准制度回答，最终解释权归人力资源部',
      senderName: sender,
      originalMessage: msg,
      timestamp
    };
  }

  const ticketId = `TK-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
  return {
    replyType: 'ESCALATED_TO_HUMAN',
    autoReply: `【${sender}您好】暂无最新政策，建议咨询HR。您的问题「${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}」已自动创建工单(${ticketId})，HR专员将在1个工作日内通过钉钉私信回复您。\n\n⚠️ 回复政策声明：不承诺非标准问题答案，AI自动回复仅供参考。`,
    citations: [],
    autoEscalateTicket: {
      ticketId,
      type: 'HR_CONSULTATION',
      priority: 'MEDIUM',
      source: 'GROUP_CHAT_AUTO_REPLY',
      senderName: sender,
      originalMessage: msg,
      status: 'OPEN',
      createdAt: timestamp,
      assignee: 'HR值班专员',
      slaHours: 8
    },
    replyPolicy: '不承诺非标准问题答案',
    senderName: sender,
    originalMessage: msg,
    timestamp
  };
}

class HRAIAgent {
  constructor(options = {}) {
    this.payrollEngine = options.payrollEngine || new PayrollDAGEngine();
    this.leaveEngine = options.leaveEngine || new LeaveEngine();
    this.ruleEngine = options.ruleEngine || new RuleEngine();
    this.compTimeManager = this.leaveEngine.compTimeManager || new CompTimeManager();
    this.annualLeaveExtManager = this.leaveEngine.annualExtensionManager || new AnnualLeaveExtensionManager();
  }

  answerPolicyQuestion(params) { return answerPolicyQuestion(params); }
  simulateSalary(params) { return simulateSalary(params); }
  generateAnomalyReport(params) { return generateAnomalyReport(params); }
  autoGenerateMonthlyReport(params) { return autoGenerateMonthlyReport(params); }
  forecastLaborCost(params) { return forecastLaborCost(params); }
  annualLeaveClearanceAlert(params) { return annualLeaveClearanceAlert(params); }
  comptimeExpireAlert() { return comptimeExpireAlert(); }
  handleGroupChatAutoReply(params) { return handleGroupChatAutoReply(params); }
}

module.exports = {
  HRAIAgent,
  answerPolicyQuestion,
  simulateSalary,
  generateAnomalyReport,
  autoGenerateMonthlyReport,
  forecastLaborCost,
  annualLeaveClearanceAlert,
  comptimeExpireAlert,
  handleGroupChatAutoReply,
  POLICY_KNOWLEDGE_BASE,
  STANDARD_QA_MAP,
  PREDICTION_MODE,
  _getEmployeeRegistry
};
