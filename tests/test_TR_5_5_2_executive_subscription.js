'use strict';

const {
  ROLES,
  ROLE_NAMES,
  SENSITIVE_DATA_ACCESS_ROLES,
  HRDashboard,
  ExecutiveCockpit,
  ExecutiveSubscriptionBot
} = require('../src/modules/dashboard/hr_executive_cockpit.js');

const { SLA_STATUS } = require('../src/modules/workflow/approval_sla_engine.js');
const { DingTalkBotClient } = require('../src/integrations/dingtalk_bot_dispatcher.js');

async function run_TR5_5_2_a() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.2-a: sendMonthlyDigestToExecutives → 推送内容验证');
  console.log('='.repeat(70));

  const botClient = new DingTalkBotClient({ mode: 'mock' });
  const cockpit = new ExecutiveCockpit();
  const dashboard = new HRDashboard();
  const bot = new ExecutiveSubscriptionBot({ botClient, executiveCockpit: cockpit, hrDashboard: dashboard });

  let passed = 0;
  let failed = 0;

  try {
    const period = '2026-08';
    const result = await bot.sendMonthlyDigestToExecutives(period);

    console.log(`\n  推送周期: ${period}`);
    console.log(`  推送时间: ${result.generatedAt.toISOString().slice(0, 19)}`);

    console.log('\n  --- 目标角色 ---');
    const expectedTargetRoles = [ROLES.VICE_PRESIDENT, ROLES.CEO];
    console.log(`  targetRole: ${result.targetRoles.join(', ')} (期望: VICE_PRESIDENT+CEO)`);
    const targetRolesOk = JSON.stringify(result.targetRoles.sort()) === JSON.stringify(expectedTargetRoles.sort());
    console.log(`  目标角色匹配: ${targetRolesOk ? '✅' : '❌'}`);

    console.log('\n  --- 推送条数 ---');
    console.log(`  totalPushCount: ${result.totalPushCount} (期望: ≥3)`);
    result.pushResults.forEach((p, idx) => {
      console.log(`  [${idx + 1}] ${p.targetRoleName} → ${p.targetUserName} (ID:${p.targetUserId}) | msgId:${p.dingtalkMsgId || '无'}`);
    });
    const countOk = result.totalPushCount >= 3;
    console.log(`  推送条数≥3: ${countOk} (实际:${result.totalPushCount}) → ${countOk ? '✅' : '❌'}`);

    const vpCount = result.pushResults.filter(p => p.targetRole === ROLES.VICE_PRESIDENT).length;
    const ceoCount = result.pushResults.filter(p => p.targetRole === ROLES.CEO).length;
    console.log(`  VICE_PRESIDENT: ${vpCount}名, CEO: ${ceoCount}名 (期望: VP≥1, CEO≥1)`);
    const roleDistributeOk = vpCount >= 1 && ceoCount >= 1;
    console.log(`  角色分布正确: ${roleDistributeOk ? '✅' : '❌'}`);

    console.log('\n  --- 消息格式 ---');
    const formatOk = result.pushResults.every(p => p.messageFormat === '图文');
    console.log(`  messageFormat=图文: ${formatOk ? '✅' : '❌'}`);
    result.pushResults.forEach((p, idx) => {
      console.log(`  [${idx + 1}] format=${p.messageFormat}, chartsCount=${p.chartsCount}, digestLength=${p.digestLength}字`);
    });

    console.log('\n  --- 图表数量 ---');
    console.log(`  chartsCount: ${result.chartsCount} (期望: ≥3张)`);
    const chartsOk = result.chartsCount >= 3;
    console.log(`  图表≥3张: ${chartsOk ? '✅' : '❌'}`);

    if (result.chartsCount >= 3) {
      const chartIds = result.pushResults[0].charts.map(c => c.chartId);
      console.log(`  图表ID列表: ${chartIds.join(', ')}`);
      const expectedChartTypes = ['CHART_LABOR_COST', 'CHART_EFFICIENCY', 'CHART_PAYROLL_VOLATILITY'];
      const allChartTypesExist = expectedChartTypes.every(t => chartIds.includes(t));
      console.log(`  3类图表(人工成本/人效对比/薪酬波动)齐全: ${allChartTypesExist ? '✅' : '❌'}`);
    }

    console.log('\n  --- 摘要字数 ---');
    console.log(`  CEO摘要字数: ${result.digestLengthCEO}字 (期望: ≥300字)`);
    console.log(`  VP摘要字数:  ${result.digestLengthVP}字 (期望: ≥300字)`);
    const ceoDigLenOk = result.digestLengthCEO >= 300;
    const vpDigLenOk = result.digestLengthVP >= 300;
    console.log(`  CEO摘要≥300字: ${ceoDigLenOk ? '✅' : '❌'}`);
    console.log(`  VP摘要≥300字:  ${vpDigLenOk ? '✅' : '❌'}`);

    if (ceoDigLenOk) {
      const sample = result.pushResults[result.pushResults.length - 1].digestText;
      console.log('\n  --- CEO摘要内容预览 (前200字) ---');
      console.log(`  ${sample.slice(0, 200)}...`);
    }

    console.log('\n  --- 钉钉推送记录 ---');
    const dmCount = botClient.getCallCount('sendDm');
    console.log(`  sendDm调用次数: ${dmCount} (期望: ${result.totalPushCount})`);
    const dmOk = dmCount === result.totalPushCount;
    console.log(`  钉钉推送记录匹配: ${dmOk ? '✅' : '❌'}`);

    if (
      targetRolesOk && countOk && roleDistributeOk &&
      formatOk && chartsOk &&
      ceoDigLenOk && vpDigLenOk && dmOk
    ) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function run_TR5_5_2_b() {
  console.log('\n' + '='.repeat(70));
  console.log('  TR-5.5.2-b: SLA进度条口径一致性 + 财务口径=人力口径');
  console.log('='.repeat(70));

  const dashboard = new HRDashboard();
  const cockpit = new ExecutiveCockpit();
  const botClient = new DingTalkBotClient({ mode: 'mock' });
  const bot = new ExecutiveSubscriptionBot({ botClient, executiveCockpit: cockpit, hrDashboard: dashboard });

  let passed = 0;
  let failed = 0;

  try {
    console.log('\n  --- [1] SLA进度条实际值 vs 理论进度 ---');
    const period = '2026-08';
    const slaProgress = dashboard.getRealtimeSlaProgress(period);

    const expectedTargets = [
      { nodeName: 'D-3 考勤异常闭环', theoreticalTarget: 95 },
      { nodeName: 'D-2 薪酬核算', theoreticalTarget: 100 },
      { nodeName: 'D-2 薪酬确认', theoreticalTarget: 100 },
      { nodeName: 'D-1 员工确认', theoreticalTarget: 95 },
      { nodeName: 'D日 工资发放', theoreticalTarget: 100 }
    ];

    let allCaliberOk = true;
    slaProgress.milestones.forEach((m, idx) => {
      const expected = expectedTargets[idx];
      const targetMatch = m.targetPercent === expected.theoreticalTarget;
      console.log(`  节点[${idx + 1}] ${m.nodeName}:`);
      console.log(`    实际进度: ${m.currentProgressPercent}% | 理论目标: ${expected.theoreticalTarget}%`);
      console.log(`    状态: ${m.status} | 目标值匹配: ${targetMatch ? '✅' : '❌'}`);
      if (!targetMatch) allCaliberOk = false;

      if (m.status === SLA_STATUS.GREEN) {
        const meetsGreen = m.currentProgressPercent >= m.targetPercent * 0.95;
        console.log(`    状态与进度一致(GREEN需≥目标95%): ${meetsGreen ? '✅' : '❌'}`);
        if (!meetsGreen) allCaliberOk = false;
      }
    });
    console.log(`  SLA口径一致性: ${allCaliberOk ? '✅' : '❌'}`);

    console.log('\n  --- [2] 财务口径 vs 人力口径 薪酬环比一致性 ---');
    const pushResult = await bot.sendMonthlyDigestToExecutives(period);
    const calReport = pushResult.calibreConsistencyReport;

    console.log(`  财务口径(financialCaliber):`);
    console.log(`    本月薪酬总额: ${calReport.financialCaliber.currentMonthTotal.toLocaleString()}元`);
    console.log(`    上月薪酬总额: ${calReport.financialCaliber.lastMonthTotal.toLocaleString()}元`);
    console.log(`    薪酬环比变动率: ${calReport.financialCaliber.momChangeRate}%`);
    console.log(`    一致性校验: ${calReport.financialCaliber.consistencyCheck}`);

    console.log(`\n  人力口径(hrCaliber):`);
    console.log(`    本月薪酬总额: ${calReport.hrCaliber.currentMonthTotal.toLocaleString()}元`);
    console.log(`    上月薪酬总额: ${calReport.hrCaliber.lastMonthTotal.toLocaleString()}元`);
    console.log(`    薪酬环比变动率: ${calReport.hrCaliber.momChangeRate}%`);
    console.log(`    一致性校验: ${calReport.hrCaliber.consistencyCheck}`);

    const totalMatch = calReport.financialCaliber.currentMonthTotal === calReport.hrCaliber.currentMonthTotal &&
                       calReport.financialCaliber.lastMonthTotal === calReport.hrCaliber.lastMonthTotal;
    const rateMatch = calReport.financialCaliber.momChangeRate === calReport.hrCaliber.momChangeRate;
    const bothPassed = calReport.financialCaliber.consistencyCheck === 'PASSED' &&
                       calReport.hrCaliber.consistencyCheck === 'PASSED';
    const isConsistent = calReport.isConsistent;

    console.log(`\n  薪酬总额一致: ${totalMatch ? '✅' : '❌'}`);
    console.log(`  环比变动率一致: ${rateMatch ? '✅' : '❌'}`);
    console.log(`  双口径校验PASSED: ${bothPassed ? '✅' : '❌'}`);
    console.log(`  综合一致性标记isConsistent: ${isConsistent ? '✅' : '❌'}`);

    const financialHrOk = totalMatch && rateMatch && bothPassed && isConsistent;
    console.log(`\n  财务口径=人力口径（薪酬环比一致）: ${financialHrOk ? '✅' : '❌'}`);

    if (allCaliberOk && financialHrOk) {
      console.log('\n  ✅ PASS');
      passed++;
    } else {
      console.log('\n  ❌ FAIL');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  return { passed, failed };
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║    智慧化人资平台 Task5.5 TR-5.5.2 高管订阅推送 自动化测试                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const r1 = await run_TR5_5_2_a();
  const r2 = await run_TR5_5_2_b();

  const totalPassed = r1.passed + r2.passed;
  const totalFailed = r1.failed + r2.failed;

  console.log('\n' + '='.repeat(70));
  console.log('  【TR-5.5.2 总体测试结果】');
  console.log('='.repeat(70));
  console.log(`  TR-5.5.2-a  高管月度推送:    通过${r1.passed}/${r1.passed + r1.failed}`);
  console.log(`  TR-5.5.2-b  口径一致性:      通过${r2.passed}/${r2.passed + r2.failed}`);
  console.log(`  总计: 通过${totalPassed}/${totalPassed + totalFailed}`);

  if (totalFailed === 0) {
    console.log('\n  🎉 TR-5.5.2 全部测试通过！');
  } else {
    console.log(`\n  ⚠️  TR-5.5.2 有${totalFailed}个测试失败，请检查代码。`);
  }

  console.log('\n  输出文件路径:');
  console.log('  - 模块文件: src/modules/dashboard/hr_executive_cockpit.js');
  console.log('  - 测试文件: tests/test_TR_5_5_2_executive_subscription.js');
  console.log('');

  return { totalPassed, totalFailed };
}

if (require.main === module) {
  main().catch(err => {
    console.error('测试运行出错:', err);
    process.exit(1);
  });
}

module.exports = {
  run_TR5_5_2_a,
  run_TR5_5_2_b,
  main
};
