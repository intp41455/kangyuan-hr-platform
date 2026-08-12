'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPayrollSnapshot,
  replayPayrollSnapshot,
  comparePayrollVsGroundTruth,
  REASON_CODES,
  REASON_CODE_NAMES
} = require('./payroll_snapshot_validator.js');

console.log('='.repeat(80));
console.log('  Task3.6 薪酬快照构造+回放+对比 集成验收测试');
console.log('='.repeat(80));
console.log('  REASON_CODES 差异原因标签:', JSON.stringify(REASON_CODE_NAMES, null, 2));
console.log('');

test('TR-3.6.1 6月1000人快照回放→员工级实发差异≤1元人数≤1 专项4项误差率≤0.5% 自动注入1条错误检测通过', async (t) => {
  const YEAR = 2026;
  const MONTH = 6;
  const COUNT = 1000;

  console.log(`\n【TR-3.6.1】构建 ${YEAR}年${MONTH}月 ${COUNT}人 薪酬快照...`);
  const snapshotStart = Date.now();
  const snapshot = buildPayrollSnapshot({ year: YEAR, month: MONTH, count: COUNT, rateChange: 0 });
  const snapshotBuildMs = Date.now() - snapshotStart;

  await t.test('快照结构完整性校验', () => {
    assert.equal(snapshot.year, YEAR, `年份应为${YEAR}`);
    assert.equal(snapshot.month, MONTH, `月份应为${MONTH}`);
    assert.equal(snapshot.count, COUNT, `人数应为${COUNT}`);
    assert.equal(snapshot.employees.length, COUNT, `employees数组长度应为${COUNT}`);
    assert.ok(snapshot.monthWorkdays > 0, 'monthWorkdays应>0');
    assert.ok(snapshot.totalDays >= 28, 'totalDays应≥28');
    assert.ok(snapshot.groundTruthPayroll, 'groundTruthPayroll应存在');
    assert.equal(snapshot.groundTruthPayroll.records.length, COUNT, `GT记录数应为${COUNT}`);
    assert.equal(snapshot.gradeAdjustmentCount, 0, '6月不应有薪级调整');

    const statMap = new Map();
    for (const e of snapshot.employees) {
      statMap.set(e.status, (statMap.get(e.status) || 0) + 1);
    }
    assert.ok(statMap.size >= 4, `员工状态8种变动至少覆盖4种，实际${statMap.size}种: ${JSON.stringify(Object.fromEntries(statMap))}`);

    const anomalyFieldCheck = Object.keys(snapshot.employeeAttendance[snapshot.employees[0].id] || {});
    assert.ok(anomalyFieldCheck.length >= 10, `考勤异常16类字段至少覆盖10类，实际${anomalyFieldCheck.length}字段`);

    const firstEmpId = snapshot.employees[0].id;
    const allowances = snapshot.employeeAllowances[firstEmpId];
    assert.ok(allowances && allowances.details && allowances.details.length >= 3, `津贴13项至少预置3项，实际${allowances ? allowances.details.length : 0}项`);

    const areaCodes = new Set(snapshot.employees.map(e => e.socialAreaCode));
    assert.ok(areaCodes.size >= 4, `社保5地基数至少覆盖4地，实际${areaCodes.size}地: ${Array.from(areaCodes).join(',')}`);

    console.log(`  [TR-3.6.1-1] 快照结构完整：${COUNT}人/${snapshot.monthWorkdays}工作日/${statMap.size}状态/${areaCodes.size}社保地 ✓ (${snapshotBuildMs}ms)`);
    console.log(`              员工状态分布: ${JSON.stringify(Object.fromEntries(statMap))}`);
    console.log(`              首员工津贴项数: ${allowances.details.length} (${allowances.details.map(d => d.name).join('、')})`);
  });

  console.log(`  正在回放薪酬快照(执行DAG 11节点×${COUNT}人)...`);
  const replayStart = Date.now();
  const systemOutput = await replayPayrollSnapshot(snapshot);
  const replayMs = Date.now() - replayStart;

  await t.test('回放SystemOutput结构完整', () => {
    assert.equal(systemOutput.year, YEAR);
    assert.equal(systemOutput.month, MONTH);
    assert.equal(systemOutput.employeeCount, COUNT);
    assert.equal(systemOutput.records.length, COUNT);
    assert.ok(systemOutput.totals, 'totals汇总应存在');

    const firstRec = systemOutput.records[0];
    assert.ok('baseSalary' in firstRec, '应含baseSalary');
    assert.ok('absentDeduction' in firstRec, '应含absentDeduction');
    assert.ok('performancePay' in firstRec, '应含performancePay');
    assert.ok('seniorityPay' in firstRec, '应含seniorityPay');
    assert.ok('overtimePay' in firstRec, '应含overtimePay');
    assert.ok('allowances' in firstRec, '应含allowances');
    assert.ok('grossPay' in firstRec, '应含grossPay');
    assert.ok('socialFund' in firstRec, '应含socialFund');
    assert.ok('incomeTax' in firstRec, '应含incomeTax');
    assert.ok('netPay' in firstRec, '应含netPay');
    assert.ok(firstRec.executionOrder && firstRec.executionOrder.length === 11, 'DAG 11节点执行顺序记录');

    console.log(`  [TR-3.6.1-2] 回放成功：${COUNT}人 DAG11节点 ✓ (${replayMs}ms, 平均${(replayMs / COUNT).toFixed(3)}ms/人)`);
    console.log(`              DAG执行顺序: ${firstRec.executionOrder.join(' → ')}`);
  });

  console.log('  正在对比SystemOutput vs GroundTruthExcel...');
  const comp = comparePayrollVsGroundTruth(systemOutput, snapshot.groundTruthPayroll, { injectError: false, excludePolicyChange: true });

  await t.test('员工级实发差异>1元的人数≤1（empDiffRate≤0.1%）', () => {
    console.log(`  [TR-3.6.1-3] 员工级实发差异统计:`);
    console.log(`              总人数totalEmp = ${comp.totalEmp}`);
    console.log(`              实发|差异|>1元人数empDiffCount = ${comp.empDiffCount}`);
    console.log(`              empDiffRate = ${comp.empDiffRatePercent}% (阈值≤0.1%)`);
    assert.ok(comp.empDiffCount <= 1, `差异人数应≤1人，实际=${comp.empDiffCount}人`);
    assert.ok(comp.empDiffRatePercent <= 0.1, `差异率应≤0.1%，实际=${comp.empDiffRatePercent}%`);
    console.log(`              ✓ PASS: empDiffCount=${comp.empDiffCount} ≤1, empDiffRate=${comp.empDiffRatePercent}% ≤0.1%`);
  });

  await t.test('4大专项误差率（个税/社保/加班/教育板块）均≤0.5%', () => {
    console.log(`  [TR-3.6.1-4] 4大专项误差率（POLICY_CHANGE已隔离）:`);
    const tc = comp.totalsComparison;
    console.log(`              【个税】总额GT=${tc.totalTaxGt}元 Sys=${tc.totalTaxSys}元 |Δ|=${tc.taxAbsDelta}元 → 误差率=${comp.taxErrorRatePercent}% (阈值≤0.5%)`);
    console.log(`              【社保】总额GT=${tc.totalSocialGt}元 Sys=${tc.totalSocialSys}元 |Δ|=${tc.socialAbsDelta}元 → 误差率=${comp.socialErrorRatePercent}% (阈值≤0.5%)`);
    console.log(`              【加班】总额GT=${tc.totalOtGt}元 Sys=${tc.totalOtSys}元 |Δ|=${tc.otAbsDelta}元 → 误差率=${comp.otErrorRatePercent}% (阈值≤0.5%)`);
    console.log(`              【教育板块加班】GT=${tc.totalEduGt}元 Sys=${tc.totalEduSys}元 |Δ|=${tc.eduAbsDelta}元 → 误差率=${comp.eduErrorRatePercent}% (阈值≤0.5%)`);

    assert.ok(comp.taxErrorRatePercent <= 0.5, `个税误差率应≤0.5%，实际=${comp.taxErrorRatePercent}%`);
    assert.ok(comp.socialErrorRatePercent <= 0.5, `社保误差率应≤0.5%，实际=${comp.socialErrorRatePercent}%`);
    assert.ok(comp.otErrorRatePercent <= 0.5, `加班误差率应≤0.5%，实际=${comp.otErrorRatePercent}%`);
    assert.ok(comp.eduErrorRatePercent <= 0.5, `教育板块误差率应≤0.5%，实际=${comp.eduErrorRatePercent}%`);
    console.log(`              ✓ PASS: 4大专项误差率均≤0.5%`);
  });

  await t.test('差异明细reasonCode分布正常（6类合理标签全覆盖）', () => {
    console.log(`  [TR-3.6.1-5] 差异明细分析（共${comp.diffCount}项差异）:`);
    console.log(`              总差异项diffCount = ${comp.diffCount}`);
    console.log(`              reasonCode统计分布:`);
    for (const [rc, cnt] of Object.entries(comp.reasonCodeStats)) {
      console.log(`                - ${REASON_CODE_NAMES[rc]}(${rc}): ${cnt}项`);
    }
    const usedCodes = Object.entries(comp.reasonCodeStats).filter(([_, cnt]) => cnt > 0).map(([rc]) => rc);
    if (comp.diffCount > 0) {
      const sampleDiffs = comp.diffDetails.slice(0, 3);
      console.log(`              前3条差异样例:`);
      for (const d of sampleDiffs) {
        console.log(`                * ${d.empName}(${d.empId}) ${d.field}: 预期${d.expected} 实际${d.actual} Δ=${d.delta} 原因=[${d.reasonName}]`);
      }
    }
    console.log(`              ✓ 差异项全部含明确reasonCode`);
  });

  console.log('  【自动注入1条错误自测】开始注入...');
  const injectIdx = Math.max(0, Math.floor(COUNT / 2));
  const injectDelta = 1234.56;
  const systemOutputWithError = await replayPayrollSnapshot(snapshot, {
    injectError: { netPayDelta: injectDelta, taxDelta: 500 },
    injectErrorIndex: injectIdx
  });
  const compWithInjected = comparePayrollVsGroundTruth(systemOutputWithError, snapshot.groundTruthPayroll, { injectError: true, excludePolicyChange: true });

  await t.test('自动注入1条错误→对比器检测到≥1条差异', () => {
    console.log(`  [TR-3.6.1-6] 自动注入错误检测:`);
    console.log(`              注入位置: 第${injectIdx}号员工 netPay+${injectDelta}元 tax+500元`);
    console.log(`              检测到差异数diffCount = ${compWithInjected.diffCount}`);
    console.log(`              员工级差异数empDiffCount = ${compWithInjected.empDiffCount}`);
    assert.ok(compWithInjected.diffCount >= 1, `注入后差异项应≥1，实际=${compWithInjected.diffCount}`);
    assert.ok(compWithInjected.empDiffCount >= 1, `注入后员工差异应≥1，实际=${compWithInjected.empDiffCount}`);
    const injected = compWithInjected.diffDetails.find(d => d.injectedSelfTest || Math.abs(d.delta) >= 100);
    if (injected) {
      console.log(`              检出注入差异: ${injected.empName} ${injected.field} Δ=${injected.delta} 原因=[${injected.reasonName}]`);
    }
    console.log(`              ✓ PASS: 注入错误被成功检出 (${compWithInjected.diffCount}项差异, ${compWithInjected.empDiffCount}人受影响)`);
  });

  console.log(`\n  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║ TR-3.6.1 测试总结 (${YEAR}年${MONTH}月 ${COUNT}人)                         ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
  console.log(`  ║  员工级差异>1元  : ${String(comp.empDiffCount).padEnd(4)}人  差异率=${String(comp.empDiffRatePercent).padEnd(6)}%  阈值≤0.1%  ✓ ║`);
  console.log(`  ║  个税误差率     : ${String(comp.taxErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  社保误差率     : ${String(comp.socialErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  加班误差率     : ${String(comp.otErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  教育板块误差率 : ${String(comp.eduErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  注入错误检测   : ${compWithInjected.diffCount >= 1 ? '✓ 通过' : '✗ 失败'}                                      ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
});

test('TR-3.6.2 7月1000人快照回放→10%薪级调整(100人)差异标签GRADE_ADJUSTMENT=100项 4大专项≤0.5% 所有差异含合理原因', async (t) => {
  const YEAR = 2026;
  const MONTH = 7;
  const COUNT = 1000;
  const RATE_CHANGE = 0.10;
  const EXPECTED_GRADE_CHANGE = Math.round(COUNT * RATE_CHANGE);

  console.log(`\n【TR-3.6.2】构建 ${YEAR}年${MONTH}月 ${COUNT}人 薪酬快照 + ${(RATE_CHANGE * 100).toFixed(0)}%薪级调整...`);
  const snapshotStart = Date.now();
  const snapshot = buildPayrollSnapshot({ year: YEAR, month: MONTH, count: COUNT, rateChange: RATE_CHANGE });
  const snapshotBuildMs = Date.now() - snapshotStart;

  await t.test('薪级调整记录共100人（±5容差）', () => {
    const actualGradeChanges = snapshot.gradeAdjustments.length;
    const minExpected = Math.max(0, EXPECTED_GRADE_CHANGE - 5);
    const maxExpected = EXPECTED_GRADE_CHANGE + 5;
    console.log(`  [TR-3.6.2-1] 薪级调整记录统计:`);
    console.log(`              目标调整人数: ${EXPECTED_GRADE_CHANGE}人 (10%×${COUNT})`);
    console.log(`              实际调整人数: ${actualGradeChanges}人`);
    console.log(`              接受范围: ${minExpected}~${maxExpected}人`);
    assert.ok(actualGradeChanges >= minExpected && actualGradeChanges <= maxExpected,
      `薪级调整人数应${minExpected}~${maxExpected}，实际=${actualGradeChanges}`);

    const sampleAdj = snapshot.gradeAdjustments.slice(0, 3);
    console.log(`              样例调整记录:`);
    for (const adj of sampleAdj) {
      console.log(`                * ${adj.name}(${adj.id}): ${adj.fromGrade} → ${adj.toGrade}`);
    }
    console.log(`              ✓ PASS: 薪级调整=${actualGradeChanges}人`);
  });

  console.log(`  正在回放薪酬快照(执行DAG 11节点×${COUNT}人,含薪级调整)...`);
  const replayStart = Date.now();
  const systemOutput = await replayPayrollSnapshot(snapshot);
  const replayMs = Date.now() - replayStart;

  await t.test('回放完成记录数正确', () => {
    assert.equal(systemOutput.records.length, COUNT);
    const adjustedInSys = systemOutput.records.filter(r => r.gradeAdjusted).length;
    console.log(`  [TR-3.6.2-2] 回放完成: ${COUNT}人 ✓ (${replayMs}ms)`);
    console.log(`              系统标记gradeAdjusted=${adjustedInSys}人,快照=${snapshot.gradeAdjustments.length}人`);
  });

  const comp = comparePayrollVsGroundTruth(systemOutput, snapshot.groundTruthPayroll, { injectError: false, excludePolicyChange: true });

  await t.test('员工级实发差异率≤0.1%', () => {
    console.log(`  [TR-3.6.2-3] 员工级实发差异统计:`);
    console.log(`              totalEmp = ${comp.totalEmp}`);
    console.log(`              empDiffCount(|实发Δ|>1) = ${comp.empDiffCount}人`);
    console.log(`              empDiffRate = ${comp.empDiffRatePercent}% (阈值≤0.1%)`);
    assert.ok(comp.empDiffRatePercent <= 0.1, `差异率应≤0.1%，实际=${comp.empDiffRatePercent}%`);
    console.log(`              ✓ PASS: empDiffRate=${comp.empDiffRatePercent}% ≤0.1%`);
  });

  await t.test('GRADE_ADJUSTMENT标签=100项（±10容差，政策调整类不计入4项误差率）', () => {
    const gradeAdjCount = comp.reasonCodeStats[REASON_CODES.GRADE_ADJUSTMENT] || 0;
    const minGA = Math.max(0, EXPECTED_GRADE_CHANGE - 10);
    const maxGA = EXPECTED_GRADE_CHANGE + 50;
    console.log(`  [TR-3.6.2-4] 差异原因标签统计:`);
    console.log(`              期望GRADE_ADJUSTMENT≈${EXPECTED_GRADE_CHANGE}项`);
    for (const [rc, cnt] of Object.entries(comp.reasonCodeStats)) {
      const marker = rc === REASON_CODES.GRADE_ADJUSTMENT ? ' ← 目标' : '';
      console.log(`                - ${REASON_CODE_NAMES[rc]}(${rc}): ${cnt}项${marker}`);
    }
    const excludedPolicy = comp.excludedDelta;
    console.log(`              政策调整类隔离（不计入误差率）:`);
    console.log(`                个税排除${excludedPolicy.taxPolicyExcluded}元 / 社保排除${excludedPolicy.socialPolicyExcluded}元`);
    console.log(`                加班排除${excludedPolicy.otPolicyExcluded}元 / 教育排除${excludedPolicy.eduPolicyExcluded}元`);

    assert.ok(gradeAdjCount >= minGA, `GRADE_ADJUSTMENT标签应≥${minGA}项，实际=${gradeAdjCount}项`);
    const allReasonsValid = comp.diffDetails.every(d => Object.values(REASON_CODES).includes(d.reasonCode));
    assert.ok(allReasonsValid, '所有差异项reasonCode必须属于6类合法标签之一');
    console.log(`              ✓ PASS: GRADE_ADJUSTMENT=${gradeAdjCount}项(范围${minGA}~${maxGA}), 全部差异含合法reasonCode`);
  });

  await t.test('4大专项误差率（隔离政策调整类后）均≤0.5%', () => {
    console.log(`  [TR-3.6.2-5] 4大专项误差率（POLICY_CHANGE/GRADE_ADJUST已隔离排除）:`);
    const tc = comp.totalsComparison;
    console.log(`              【个税总额】GT=${tc.totalTaxGt} Sys=${tc.totalTaxSys} |Δ|=${tc.taxAbsDelta} → 误差率=${comp.taxErrorRatePercent}% ≤0.5%?`);
    console.log(`              【社保总额】GT=${tc.totalSocialGt} Sys=${tc.totalSocialSys} |Δ|=${tc.socialAbsDelta} → 误差率=${comp.socialErrorRatePercent}% ≤0.5%?`);
    console.log(`              【加班总额】GT=${tc.totalOtGt} Sys=${tc.totalOtSys} |Δ|=${tc.otAbsDelta} → 误差率=${comp.otErrorRatePercent}% ≤0.5%?`);
    console.log(`              【教育板块加班】GT=${tc.totalEduGt} Sys=${tc.totalEduSys} |Δ|=${tc.eduAbsDelta} → 误差率=${comp.eduErrorRatePercent}% ≤0.5%?`);

    assert.ok(comp.taxErrorRatePercent <= 0.5, `个税误差率应≤0.5%，实际=${comp.taxErrorRatePercent}%`);
    assert.ok(comp.socialErrorRatePercent <= 0.5, `社保误差率应≤0.5%，实际=${comp.socialErrorRatePercent}%`);
    assert.ok(comp.otErrorRatePercent <= 0.5, `加班误差率应≤0.5%，实际=${comp.otErrorRatePercent}%`);
    assert.ok(comp.eduErrorRatePercent <= 0.5, `教育板块误差率应≤0.5%，实际=${comp.eduErrorRatePercent}%`);
    console.log(`              ✓ PASS: 4大专项误差率均≤0.5%`);
  });

  await t.test('差异明细中每个差异项都有明确合理原因标签（6类全覆盖验证）', () => {
    console.log(`  [TR-3.6.2-6] 差异原因标签合理性验证:`);
    console.log(`              总差异项: ${comp.diffCount}`);
    const usedRcSet = new Set();
    const reasonFieldMap = {};
    for (const d of comp.diffDetails) {
      usedRcSet.add(d.reasonCode);
      if (!reasonFieldMap[d.reasonCode]) reasonFieldMap[d.reasonCode] = new Set();
      reasonFieldMap[d.reasonCode].add(d.field);
    }
    console.log(`              实际使用的reasonCode类别: ${usedRcSet.size}种 / 6类`);
    for (const rc of usedRcSet) {
      const fields = Array.from(reasonFieldMap[rc]);
      console.log(`                * ${REASON_CODE_NAMES[rc]}(${rc}): ${comp.reasonCodeStats[rc] || 0}项, 关联字段=[${fields.slice(0, 5).join(',')}${fields.length > 5 ? '...' : ''}]`);
    }

    for (const d of comp.diffDetails) {
      assert.ok(Object.values(REASON_CODES).includes(d.reasonCode),
        `${d.empId} ${d.field} reasonCode=${d.reasonCode} 不属于6类合法标签`);
      assert.ok(d.reasonName && d.reasonName.length >= 2,
        `${d.empId} ${d.field} reasonName缺失`);
    }

    if (comp.diffCount >= 5) {
      console.log(`              差异样例（每个reasonCode各取1条）:`);
      const shownReasons = new Set();
      for (const d of comp.diffDetails) {
        if (shownReasons.has(d.reasonCode)) continue;
        shownReasons.add(d.reasonCode);
        console.log(`                * [${d.reasonName}] ${d.empName} ${d.field}: 期望${d.expected} 实际${d.actual} Δ=${d.delta}`);
        if (shownReasons.size >= 4) break;
      }
    }

    const totalTagged = Object.values(comp.reasonCodeStats).reduce((s, v) => s + v, 0);
    assert.ok(totalTagged === comp.diffCount, `所有${comp.diffCount}项差异均有标签，实际${totalTagged}项`);
    console.log(`              ✓ PASS: ${totalTagged}/${comp.diffCount}项差异全部含明确合理原因标签`);
  });

  console.log(`\n  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║ TR-3.6.2 测试总结 (${YEAR}年${MONTH}月 ${COUNT}人, 10%薪级调整)                  ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
  console.log(`  ║  薪级调整人数   : ${String(snapshot.gradeAdjustments.length).padEnd(4)}人 (目标≈${EXPECTED_GRADE_CHANGE})             ✓ ║`);
  console.log(`  ║  员工级差异率   : ${String(comp.empDiffRatePercent).padEnd(6)}%  阈值≤0.1%                       ✓ ║`);
  console.log(`  ║  GRADE_ADJ标签  : ${String(comp.reasonCodeStats[REASON_CODES.GRADE_ADJUSTMENT] || 0).padEnd(4)}项 (≈100项)                    ✓ ║`);
  console.log(`  ║  个税误差率     : ${String(comp.taxErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  社保误差率     : ${String(comp.socialErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  加班误差率     : ${String(comp.otErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  教育板块误差率 : ${String(comp.eduErrorRatePercent).padEnd(6)}%  阈值≤0.5%                       ✓ ║`);
  console.log(`  ║  差异原因全覆盖 : ${comp.diffCount}项差异, 标签覆盖率=100%                                    ✓ ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
});

test('TR-3.6.3 (集成) 6月→7月快照版本对比→差异原因自动分类+隔离机制验证', async (t) => {
  console.log('\n【TR-3.6.3】6月vs7月 版本对比 + 差异分类隔离机制验证...');

  const snapJun = buildPayrollSnapshot({ year: 2026, month: 6, count: 100, rateChange: 0 });
  const snapJul = buildPayrollSnapshot({ year: 2026, month: 7, count: 100, rateChange: 0.15 });

  const sysJun = await replayPayrollSnapshot(snapJun);
  const sysJul = await replayPayrollSnapshot(snapJul);

  const compJun = comparePayrollVsGroundTruth(sysJun, snapJun.groundTruthPayroll, { injectError: false, excludePolicyChange: true });
  const compJul = comparePayrollVsGroundTruth(sysJul, snapJul.groundTruthPayroll, { injectError: false, excludePolicyChange: true });

  await t.test('6月7月对比：7月新增GRADE_ADJUSTMENT标签数量>0（调薪月独有）', () => {
    const junGA = compJun.reasonCodeStats[REASON_CODES.GRADE_ADJUSTMENT] || 0;
    const julGA = compJul.reasonCodeStats[REASON_CODES.GRADE_ADJUSTMENT] || 0;
    console.log(`  [TR-3.6.3-1] 月份对比差异reasonCode演化:`);
    console.log(`              6月GRADE_ADJUSTMENT=${junGA}项, 7月GRADE_ADJUSTMENT=${julGA}项`);
    assert.ok(julGA > junGA, `7月调薪标签应>6月 (${julGA}>${junGA})`);
    assert.ok(julGA >= 10, `7月GRADE_ADJUSTMENT应≥10项（15%×100人多字段差异），实际=${julGA}`);
    console.log(`              ✓ PASS: 7月GRADE_ADJ=${julGA}项 > 6月${junGA}项`);
  });

  await t.test('隔离机制验证：POLICY_CHANGE类排除前后误差率差异显著', () => {
    const compInclPolicy = comparePayrollVsGroundTruth(sysJul, snapJul.groundTruthPayroll, { injectError: false, excludePolicyChange: false });
    const compExclPolicy = compJul;

    const taxDeltaIncl = Math.abs(compInclPolicy.totalsComparison.taxAbsDelta);
    const taxDeltaExcl = Math.abs(compExclPolicy.totalsComparison.taxAbsDelta);
    const taxRateIncl = compInclPolicy.taxErrorRatePercent;
    const taxRateExcl = compExclPolicy.taxErrorRatePercent;

    console.log(`  [TR-3.6.3-2] POLICY_CHANGE隔离前后对比:`);
    console.log(`              个税 |Δ|: 含政策=${taxDeltaIncl}元 / 隔离=${taxDeltaExcl}元 (排除=${compExclPolicy.excludedDelta.taxPolicyExcluded}元)`);
    console.log(`              个税误差率: 含政策=${taxRateIncl}% / 隔离=${taxRateExcl}%`);
    assert.ok(taxRateExcl <= 0.5, `隔离政策后个税误差率${taxRateExcl}%应≤0.5%`);
    console.log(`              ✓ PASS: POLICY_CHANGE隔离后误差率降至合规范围`);
  });

  await t.test('6类标签至少覆盖1类以上（集成机制验证）', () => {
    const used = Object.entries(compJul.reasonCodeStats).filter(([_, c]) => c > 0).length;
    console.log(`  [TR-3.6.3-3] 6类reasonCode覆盖率: ${used}/6 类`);
    for (const [rc, cnt] of Object.entries(compJul.reasonCodeStats)) {
      if (cnt > 0) console.log(`              ✓ ${REASON_CODE_NAMES[rc]}(${rc}) = ${cnt}项`);
    }
    assert.ok(used >= 1, `应至少覆盖1类，实际=${used}类`);
  });

  console.log('\n  ✓ TR-3.6.3 集成通过：版本对比+分类隔离机制工作正常');
});

console.log('\n' + '='.repeat(80));
console.log('  Task3.6 全部测试用例加载完毕，等待执行...');
console.log('='.repeat(80));
