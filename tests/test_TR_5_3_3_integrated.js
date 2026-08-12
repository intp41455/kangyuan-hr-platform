'use strict';

const {
  generateAnomalyReport,
  autoGenerateMonthlyReport,
  forecastLaborCost,
  annualLeaveClearanceAlert,
  comptimeExpireAlert,
  handleGroupChatAutoReply,
  _getEmployeeRegistry
} = require('../src/modules/ai/hr_ai_agent.js');

function runTR_5_3_3() {
  console.log('='.repeat(80));
  console.log('TR-5.3.3 综合测试 (异常报告+月度汇报+预测预警+群回复) 开始执行');
  console.log('='.repeat(80));

  const employees = _getEmployeeRegistry();
  const anomalyEmpIds = [employees[0].id, employees[1].id, employees[2].id];
  console.log(`花名册员工数: ${employees.length}人`);
  console.log(`异常报告员工ID: ${anomalyEmpIds.join(', ')}`);
  console.log('');

  let subPass = { a: false, b: false, c: false, d: false };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('a) generateAnomalyReport 3个异常员工');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const anomalyReport = generateAnomalyReport({ empIds: anomalyEmpIds });
  console.log(`1. anomalySummaryTable:`);
  const table = anomalyReport.anomalySummaryTable || [];
  const colCount = table.length > 0 ? Object.keys(table[0]).length : 0;
  console.log(`   行数: ${table.length} (≥3) 列数: ${colCount} (≥5列: emp/name/本月/上月/change/reason)`);
  if (table.length > 0) {
    console.log(`   列名: ${Object.keys(table[0]).join(' | ')}`);
  }
  table.forEach((row, i) => {
    console.log(`   [${i + 1}] ${Object.entries(row).map(([k, v]) => `${k}:${String(v).substring(0, 18)}`).join(' | ')}`);
  });
  const tableOk = table.length >= 3 && colCount >= 5;
  console.log(`   表格合格: ${tableOk ? '✅' : '❌'} (3行×5列)`);

  console.log('');
  console.log(`2. narrativeWordReport (wordReport≥500字)`);
  const wordLen = (anomalyReport.narrativeWordReport || '').length;
  console.log(`   字数统计: ${wordLen}字  (要求≥500字)`);
  console.log(`   段落抽样:`);
  const sampleLines = (anomalyReport.narrativeWordReport || '').split('\n').filter(l => l.trim()).slice(0, 6);
  sampleLines.forEach((l, i) => {
    console.log(`   ${i + 1}. ${l.substring(0, 80)}${l.length > 80 ? '...' : ''}`);
  });
  const wordOk = wordLen >= 500;
  console.log(`   结构化报告合格: ${wordOk ? '✅' : '❌'} (≥500字)`);
  subPass.a = tableOk && wordOk;
  console.log(`   a) 综合结果: ${subPass.a ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('b) autoGenerateMonthlyReport 5章节完整, D+3, dingtalkDocFormat=true');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const testPeriod = { year: 2026, month: 7 };
  const monthlyReport = autoGenerateMonthlyReport(testPeriod);
  console.log(`1. 元数据:`);
  console.log(`   period: ${monthlyReport.period}`);
  console.log(`   generateTiming: ${monthlyReport.generateTiming} (要求D+3)`);
  console.log(`   dingtalkDocFormat: ${monthlyReport.dingtalkDocFormat} (要求true)`);
  console.log(`   dingtalkDocUrl: ${monthlyReport.dingtalkDocUrl}`);
  console.log(`   docTitle: ${monthlyReport.docTitle}`);
  const metaOk = monthlyReport.generateTiming === 'D+3' && monthlyReport.dingtalkDocFormat === true;
  console.log(`   元数据合格: ${metaOk ? '✅' : '❌'}`);

  console.log('');
  console.log(`2. 5大章节 (attendanceAnomalyRate/payrollFluctuation/leaveConsumption/overtimeStats/slaProgress):`);
  const chapterKeys = ['attendanceAnomalyRate', 'payrollFluctuation', 'leaveConsumption', 'overtimeStats', 'slaProgress'];
  let chapterMissing = [];
  chapterKeys.forEach(ck => {
    const exist = monthlyReport.chapters && monthlyReport.chapters[ck] !== undefined;
    console.log(`   · ${ck}: ${exist ? '✅存在' : '❌缺失'}`);
    if (!exist) chapterMissing.push(ck);
  });
  const chaptersOk = chapterMissing.length === 0;

  console.log('');
  console.log(`3. 5章节内容抽样:`);
  if (monthlyReport.docSections) {
    monthlyReport.docSections.forEach((sec, i) => {
      console.log(`   章节${i + 1}: ${sec.chapter}`);
      console.log(`      内容摘要: ${(sec.content || '').substring(0, 70)}...`);
    });
  }
  const sectionOk = monthlyReport.docSections && monthlyReport.docSections.length >= 5;
  console.log(`   章节完整: ${chaptersOk && sectionOk ? '✅' : '❌'} (章节对象+详细段落均≥5)`);

  console.log('');
  console.log(`4. SLA章节验证数据完整性:`);
  const sla = monthlyReport.chapters ? monthlyReport.chapters.slaProgress : null;
  if (sla) {
    console.log(`   总审批单: ${sla.totalApprovalsThisMonth}  SLA达成: ${sla.slaAchievementRate}%  目标: ${sla.target}%`);
    console.log(`   分类型SLA明细: ${(sla.slaBreakdownByType || []).length}类`);
    (sla.slaBreakdownByType || []).forEach(s => console.log(`     · ${s.type}: SLA ${s.rate}% (${s.slaMet}/${s.total})`));
  }
  subPass.b = metaOk && chaptersOk && sectionOk && monthlyReport.docTitle && monthlyReport.dingtalkDocToken;
  console.log(`   b) 综合结果: ${subPass.b ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('c) 预测与预警: forecastLaborCost/年假清零/调休过期');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const forecast = forecastLaborCost({ nextNMonths: 3 });
  console.log(`1. forecastLaborCost(nextNMonths=3):`);
  console.log(`   预测月数: ${forecast.nextNMonths} (要求=3)`);
  console.log(`   月度明细条目数: ${(forecast.monthlyForecast || []).length}`);
  (forecast.monthlyForecast || []).forEach((m, i) => {
    console.log(`     · ${m.month}: 总成本${m.totalLaborCost}元/人均${m.perCapitaCost}元`);
    if (m.laborBreakdown) {
      const b = m.laborBreakdown;
      console.log(`       成本拆分: 基础${b.baseSalary}/绩效${b.performanceBonus}/社保${b.socialHousingFund}/加班${b.overtimePay}/津贴${b.allowances}/福利${b.benefits}`);
    }
  });
  console.log(`   3个月累计预测总成本: ${forecast.totalForecastCost}元`);
  console.log(`   月均成本: ${forecast.avgMonthlyCost}元`);
  console.log(`   假设条件: ${(forecast.assumptions || []).join('；')}`);
  const forecastOk = forecast.nextNMonths === 3 && (forecast.monthlyForecast || []).length === 3 && forecast.totalForecastCost > 0;
  console.log(`   人工成本预测合格: ${forecastOk ? '✅' : '❌'}`);

  console.log('');
  console.log(`2. annualLeaveClearanceAlert(year='2026'): 年假清零≥10名员工`);
  const annualAlert = annualLeaveClearanceAlert({ year: '2026' });
  console.log(`   年度: ${annualAlert.year}  清零截止: ${annualAlert.clearanceDeadline}`);
  console.log(`   受影响员工数: ${annualAlert.totalAffectedEmployees} (要求≥10)`);
  console.log(`   剩余年假总天数: ${annualAlert.totalRemainingDays}天`);
  console.log(`   按紧迫度: HIGH=${annualAlert.byUrgency ? annualAlert.byUrgency.HIGH : 0}  MEDIUM=${annualAlert.byUrgency ? annualAlert.byUrgency.MEDIUM : 0}  LOW=${annualAlert.byUrgency ? annualAlert.byUrgency.LOW : 0}`);
  (annualAlert.employeeList || []).slice(0, 5).forEach((e, i) => {
    console.log(`     · TOP${i + 1} ${e.empId}(${e.name}): 剩${e.remainingDays}天/配额${e.quota}天  剩${e.daysUntilDeadline}天  紧迫度:${e.urgency}`);
  });
  const annualOk = annualAlert.totalAffectedEmployees >= 10 && (annualAlert.employeeList || []).length >= 10;
  console.log(`   年假清零预警合格: ${annualOk ? '✅' : '❌'} (≥10名)`);

  console.log('');
  console.log(`3. comptimeExpireAlert(): 调休过期180天List≥5名`);
  const comptimeAlert = comptimeExpireAlert();
  console.log(`   调休过期规则: ${comptimeAlert.expireRuleDays}天`);
  console.log(`   受影响调休发放批次: ${comptimeAlert.totalAffectedGrants} (要求≥5)`);
  console.log(`   将过期总小时数: ${comptimeAlert.totalExpiringHours}h`);
  console.log(`   按紧迫度: CRITICAL(≤7天)=${comptimeAlert.byUrgency ? comptimeAlert.byUrgency.CRITICAL : 0}  HIGH(≤21)=${comptimeAlert.byUrgency ? comptimeAlert.byUrgency.HIGH : 0}  MEDIUM=${comptimeAlert.byUrgency ? comptimeAlert.byUrgency.MEDIUM : 0}`);
  (comptimeAlert.grantList || []).slice(0, 5).forEach((g, i) => {
    console.log(`     · TOP${i + 1} ${g.grantId} ${g.empId}(${g.name}): 剩${g.remainingHours}h  ${g.daysUntilExpire}天后过期(${g.expireAt}) 紧迫:${g.urgency}`);
  });
  const comptimeOk = comptimeAlert.totalAffectedGrants >= 5 && (comptimeAlert.grantList || []).length >= 5;
  console.log(`   调休过期预警合格: ${comptimeOk ? '✅' : '❌'} (≥5条)`);

  subPass.c = forecastOk && annualOk && comptimeOk;
  console.log(`   c) 综合结果: ${subPass.c ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('d) handleGroupChatAutoReply 标准问题+非标准问题');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const stdQ = '加班怎么算？';
  const stdSender = '员工张三';
  console.log(`1. 标准问题: '${stdQ}' (发送人:${stdSender})`);
  const stdReply = handleGroupChatAutoReply({ userMessage: stdQ, senderName: stdSender });
  console.log(`   replyType: ${stdReply.replyType}`);
  console.log(`   自动回复内容:`);
  (stdReply.autoReply || '').split('\n').slice(0, 6).forEach((l, i) => {
    console.log(`     ${i === 0 ? '→' : ' '}  ${l.substring(0, 80)}`);
  });
  console.log(`   引用citations: ${(stdReply.citations || []).length}条 (≥1)`);
  (stdReply.citations || []).forEach(c => {
    console.log(`     · ${c.rCode} | ${c.sourceDocName} | 第${c.page}页 | ${c.effectiveDate}`);
  });
  const stdOk = stdReply.replyType === 'STANDARD_AUTO' &&
    stdReply.autoReply &&
    (stdReply.citations || []).length >= 1 &&
    !stdReply.autoEscalateTicket;
  console.log(`   标准问题自动回复合格: ${stdOk ? '✅' : '❌'}`);

  console.log('');
  const nonStdQ = '社保政策什么时候改？';
  const nonStdSender = '员工李四';
  console.log(`2. 非标准问题: '${nonStdQ}' (发送人:${nonStdSender})`);
  const nonStdReply = handleGroupChatAutoReply({ userMessage: nonStdQ, senderName: nonStdSender });
  console.log(`   replyType: ${nonStdReply.replyType}`);
  console.log(`   自动回复内容:`);
  (nonStdReply.autoReply || '').split('\n').slice(0, 6).forEach((l, i) => {
    console.log(`     ${i === 0 ? '→' : ' '}  ${l.substring(0, 80)}`);
  });
  console.log(`   replyPolicy声明: ${nonStdReply.replyPolicy}`);
  console.log(`   autoEscalateTicket工单:`);
  const tk = nonStdReply.autoEscalateTicket;
  let ticketFieldsOk = false;
  if (tk) {
    console.log(`     · 工单ID: ${tk.ticketId}`);
    console.log(`     · 类型: ${tk.type}  优先级: ${tk.priority}  来源: ${tk.source}`);
    console.log(`     · 提交人: ${tk.senderName}  原始消息: ${(tk.originalMessage || '').substring(0, 40)}`);
    console.log(`     · 状态: ${tk.status}  创建时间: ${tk.createdAt}`);
    console.log(`     · 处理人: ${tk.assignee}  SLA时效: ${tk.slaHours}h`);
    ticketFieldsOk = tk.ticketId && tk.type && tk.priority && tk.source && tk.senderName && tk.status && tk.assignee;
  } else {
    console.log(`     · 工单未创建 ❌`);
  }
  const replyHasTag = (nonStdReply.autoReply || '').includes('暂无最新政策') && (nonStdReply.autoReply || '').includes('建议咨询HR');
  const policyNotPromise = (nonStdReply.replyPolicy || '').includes('不承诺') || (nonStdReply.autoReply || '').includes('不承诺');
  const noErrorPromise = !(nonStdReply.autoReply || '').includes('一定会') && !(nonStdReply.autoReply || '').includes('政策确定');

  const nonStdOk = nonStdReply.replyType === 'ESCALATED_TO_HUMAN' &&
    !!tk && ticketFieldsOk &&
    replyHasTag && policyNotPromise && noErrorPromise;
  console.log(`   非标准问题处理合格: ${nonStdOk ? '✅' : '❌'} (工单+暂无最新政策+建议咨询HR+不承诺标签)`);
  subPass.d = stdOk && nonStdOk;
  console.log(`   d) 综合结果: ${subPass.d ? '✅ PASS' : '❌ FAIL'}`);

  console.log('');
  console.log('='.repeat(80));
  console.log('TR-5.3.3 子项汇总:');
  console.log(`  a) 异常报告    (3异常员工, wordReport≥500字, 表格5列): ${subPass.a ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  b) 月度自动汇报(D+3, dingtalkDocFormat=true, 5章节全): ${subPass.b ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  c) 预测预警    (3月成本/年假≥10/调休≥5)            : ${subPass.c ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  d) 群聊回复    (标准自动+引用/非标准转工单+不承诺)  : ${subPass.d ? '✅ PASS' : '❌ FAIL'}`);
  const finalPass = subPass.a && subPass.b && subPass.c && subPass.d;
  console.log('');
  console.log(`TR-5.3.3 综合结论: ${finalPass ? '✅ 全部通过 PASS' : '❌ 测试未通过 FAIL'}`);
  console.log('='.repeat(80));

  return {
    finalPass,
    subPass,
    anomalyReport: {
      tableRows: (anomalyReport.anomalySummaryTable || []).length,
      tableCols: (anomalyReport.anomalySummaryTable || []).length > 0 ? Object.keys(anomalyReport.anomalySummaryTable[0]).length : 0,
      wordReportLen: (anomalyReport.narrativeWordReport || '').length
    },
    monthlyReport: {
      period: monthlyReport.period,
      generateTiming: monthlyReport.generateTiming,
      dingtalkDocFormat: monthlyReport.dingtalkDocFormat,
      chapterCount: (monthlyReport.docSections || []).length
    },
    forecast: {
      nextNMonths: forecast.nextNMonths,
      totalForecastCost: forecast.totalForecastCost
    },
    annualAlertCount: annualAlert.totalAffectedEmployees,
    comptimeAlertCount: comptimeAlert.totalAffectedGrants
  };
}

if (require.main === module) {
  runTR_5_3_3();
}

module.exports = { runTR_5_3_3 };
