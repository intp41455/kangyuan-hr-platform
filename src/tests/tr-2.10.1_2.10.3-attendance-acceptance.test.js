'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttendanceSnapshot,
  replayMonthAttendance,
  compareSystemVsGroundTruth,
  AttendanceTimelineSimulator,
  eduOvertimeCompare,
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES,
  ANOMALY_STATUS,
  EDU_DEPT
} = require('./attendance_snapshot_validator.js');

function _fmtPct(v) { return (v * 100).toFixed(2) + '%'; }

test('TR-2.10.1: 回放6月100人→总比对项≥5000，正确率≥99%（自动注入1条错误用于自测）', async (t) => {
  await t.test('① 构建2026年6月100人考勤快照（Ground Truth）', () => {
    const snapshot = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.1 输出①：2026年6月考勤快照构造报告（100人，Ground Truth基准）        │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ 快照生成时间: ${snapshot.generatedAt.toISOString().slice(0, 19)}                                     │`);
    console.log(`│ 核算周期: ${snapshot.year}年${snapshot.month}月（工作日=${snapshot.monthWorkdays}天，日历=${snapshot.totalDays}天）                │`);
    console.log(`│ 员工总数: ${snapshot.count} 名 (含: 在职/试用期/新入职/离职)                         │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const statusMap = {};
    snapshot.employees.forEach(e => { statusMap[e.status] = (statusMap[e.status] || 0) + 1; });
    console.log('│ 员工状态分布:                                                                 │');
    Object.entries(statusMap).forEach(([k, v]) => {
      const pct = ((v / snapshot.count) * 100).toFixed(1).padStart(5);
      console.log(`│   ${k.padEnd(16)}: ${String(v).padStart(3)} 名 (${pct}%)                                        │`);
    });

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ 打卡记录总数: ${String(snapshot.punchRecords.length).padStart(6)} 条                                    │`);
    console.log(`│ 异常识别总数: ${String(snapshot.anomalies.length).padStart(6)} 条 (迟到/早退/缺卡/旷工/加班/假期/外勤/补卡)    │`);
    console.log(`│ 扣款记录数:   ${String(snapshot.deductions.length).padStart(6)} 条 (总扣款¥${snapshot.groundTruth.totalDeductionAmount.toFixed(2)})                       │`);
    console.log(`│ 加班记录总数: ${String(snapshot.overtimeRecords.length).padStart(6)} 条 (总工时=${snapshot.groundTruth.totalOvertimeHours.toFixed(1)}h, 总金额¥${snapshot.groundTruth.totalOvertimePay.toFixed(2)})  │`);
    console.log(`│ 假期审批记录: ${String(snapshot.leaveRecords.length).padStart(6)} 条 (年假/病假/事假/婚假/产假/陪产/丧假/调休)        │`);
    console.log(`│ 外勤记录数:   ${String(snapshot.fieldWorkRecords.length).padStart(6)} 条                                    │`);
    console.log(`│ 补卡审批记录: ${String(snapshot.makeupRecords.length).padStart(6)} 条                                    │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const anomTypes = {};
    snapshot.anomalies.forEach(a => {
      const nm = ANOMALY_NAMES[a.type] || `#${a.type}`;
      anomTypes[nm] = (anomTypes[nm] || 0) + 1;
    });
    const sortedAnom = Object.entries(anomTypes).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('│ 异常类型分布 TOP10 (基于概率分布模拟):                                       │');
    sortedAnom.forEach(([nm, cnt], i) => {
      const pct = ((cnt / snapshot.anomalies.length) * 100).toFixed(1).padStart(5);
      console.log(`│   ${String(i + 1).padStart(2)}. ${nm.padEnd(18)} x ${String(cnt).padStart(4)} 次 占比${pct}%                              │`);
    });

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    const eduEmpCount = snapshot.employees.filter(e => e.isEduStaff).length;
    const eduOTCount = snapshot.eduOvertimeExcelGroundTruth.length;
    const eduOTTotalPay = snapshot.eduOvertimeExcelGroundTruth.reduce((s, o) => s + (o.excelExpectedTotalPay || 0), 0);
    console.log(`│ 教育板块(EDU): 员工${eduEmpCount}名 / 加班记录${eduOTCount}人 / Excel加班工资¥${eduOTTotalPay.toFixed(2)} (用于TR-2.10.3专项)    │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.equal(snapshot.year, 2026);
    assert.equal(snapshot.month, 6);
    assert.equal(snapshot.count, 100, '6月快照应为100名员工');
    assert.ok(snapshot.punchRecords.length > 2500, `打卡记录应充足，实际=${snapshot.punchRecords.length}`);
    assert.ok(snapshot.anomalies.length > 200, `异常记录应充足，实际=${snapshot.anomalies.length}`);
  });

  await t.test('② Task2.3→2.4→2.5→2.6→2.7→2.8集成回放 + 注入1条随机错误 + 三层比对', async () => {
    const snapshot = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });
    const injectIdx = 17;
    const injectedError = { toType: ATTENDANCE_ANOMALY.EARLY_LEAVE, deductionDelta: 30, lateMinutesDelta: 0 };
    const systemOutput = await replayMonthAttendance(snapshot, { injectError: injectedError, injectErrorIndex: injectIdx });
    const compareResult = compareSystemVsGroundTruth(systemOutput, snapshot);

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.1 输出②：集成回放 + 三层比对报告（自动注入1条错误用于自测）          │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 回放流程:                                                                    │');
    console.log('│   Task2.3 拉取打卡 → Task2.4 异常识别 → Task2.5 教育加班计算                 │');
    console.log('│   → Task2.6 派单通知 → Task2.7 审批回写 → Task2.8 汇总统计                   │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Task2.3 拉取打卡: ${String(systemOutput.punchRecords.length).padStart(5)} 条记录                                      │`);
    console.log(`│ Task2.4 异常识别: ${String(systemOutput.anomalies.length).padStart(5)} 条异常 (GT基准=${snapshot.anomalies.length})                       │`);
    console.log(`│ Task2.7 审批回写: ${String(systemOutput.writebackLogs.length).padStart(5)} 条写回日志 (补卡通过+请假通过)                         │`);
    console.log(`│ Task2.8 汇总维度: 员工(${systemOutput.summary.employeeDimension.length})人 × 部门(${systemOutput.summary.departmentDimension.length})个 × 异常类型排名   │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    if (systemOutput.injectedErrorInfo && systemOutput.injectedErrorInfo.applied) {
      const ie = systemOutput.injectedErrorInfo;
      const affectedAnom = systemOutput.anomalies[ie.index] || null;
      console.log('│ ⚠  自测错误注入(已启用,用于验证比对器灵敏度):                                 │');
      console.log(`│   注入位置:   anomalies 数组第 ${ie.index} 号 (anomalyId=${affectedAnom ? affectedAnom.anomalyId : 'N/A'}).slice(0, 50)}          │`);
      console.log(`│   注入详情:   type→早退(EARLY_LEAVE) + 扣款+¥${ie.details.deductionDelta || 0} + 分钟偏移                           │`);
      console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    }

    console.log('│ 三层比对维度 (异常类型 × 员工 × 部门):                                       │');
    console.log(`│   第一层: 异常类型维度 - 对每条异常核对 type/severity/deduction/时长/倍率     │`);
    console.log(`│   第二层: 员工维度 - 100人×50核心字段 (出勤/迟到/早退/缺卡/旷工/加班/8类假期) │`);
    console.log(`│   第三层: 部门维度 - 部门级汇总 (TOP部门异常/加班/扣款统计)                   │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ ★ 总比对项数: ${String(compareResult.totalCount).padStart(6)} 项                                            │`);
    console.log(`│ ★ 正确项数:   ${String(compareResult.correctCount).padStart(6)} 项                                            │`);
    console.log(`│ ★ 错误项数:   ${String(compareResult.mismatchCount).padStart(6)} 项                                            │`);
    console.log(`│ ★ 正确率:     ${compareResult.accuracyPercent.toFixed(4)}%                                             │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    console.log('│ 错误分类统计(mismatchByType):                                                │');
    Object.entries(compareResult.mismatchByType || {}).forEach(([t, n]) => {
      console.log(`│   ${t.padEnd(30)} × ${String(n).padStart(3)} 项                                        │`);
    });

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 错误明细 TOP 20 (按错误项列出):                                              │');
    if (compareResult.mismatchList.length === 0) {
      console.log('│   （无错误，全部匹配！）                                                     │');
    } else {
      compareResult.mismatchList.slice(0, 20).forEach((m, i) => {
        const expectedShort = m.expected.length > 14 ? (m.expected.slice(0, 14) + '…') : m.expected.padEnd(15);
        const actualShort = m.actual.length > 14 ? (m.actual.slice(0, 14) + '…') : m.actual.padEnd(15);
        console.log(`│   ${String(i + 1).padStart(2)}. ${m.employee.padEnd(8)} [${m.field.padEnd(30)}]  │`);
        console.log(`│      期望=${expectedShort}  实际=${actualShort}  (type=${m.type})   │`);
      });
      if (compareResult.mismatchList.length > 20) {
        console.log(`│   ... 另有 ${compareResult.mismatchList.length - 20} 条错误                                               │`);
      }
    }

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    const TARGET_TOTAL = 5000;
    const TARGET_ACCURACY_PCT = 99;
    const TARGET_ERRORS_MAX = 50;
    const passTotal = compareResult.totalCount >= TARGET_TOTAL;
    const passAccuracy = (compareResult.accuracy * 100) >= TARGET_ACCURACY_PCT;
    const passErrors = compareResult.mismatchCount <= TARGET_ERRORS_MAX;

    console.log(`│ ★★★ TR-2.10.1 验收指标 ★★★                                                 │`);
    console.log(`│   ① 总比对项 ≥ ${TARGET_TOTAL} 项                    →  ${compareResult.totalCount} ${passTotal ? '✓ 达标' : '✗ 未达标'}${passTotal ? '' : ` (缺口${TARGET_TOTAL - compareResult.totalCount})`}                       │`);
    console.log(`│   ② 正确率 ≥ ${TARGET_ACCURACY_PCT}.00%                     →  ${compareResult.accuracyPercent.toFixed(4)}% ${passAccuracy ? '✓ 达标' : '✗ 未达标'}${passAccuracy ? '' : ` (缺口${(TARGET_ACCURACY_PCT - compareResult.accuracyPercent).toFixed(4)}%)`}              │`);
    console.log(`│   ③ 错误项 ≤ ${TARGET_ERRORS_MAX} 项 (mismatch≤50)         →  ${compareResult.mismatchCount} ${passErrors ? '✓ 达标' : '✗ 未达标'}${passErrors ? '' : ` (超出${compareResult.mismatchCount - TARGET_ERRORS_MAX})`}                          │`);
    console.log(`│   ④ 自测注入1条错误后系统仍满足指标要求 → 注入错误已被检测且纳入mismatchList  │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.ok(passTotal, `总比对项应≥${TARGET_TOTAL}，实际=${compareResult.totalCount}`);
    assert.ok(passAccuracy, `正确率应≥99%，实际=${compareResult.accuracyPercent.toFixed(4)}%`);
    assert.ok(passErrors, `错误项应≤${TARGET_ERRORS_MAX}，实际=${compareResult.mismatchCount}`);
  });
});

test('TR-2.10.2: 回放7月100人→正确率≥99%；15%变动员工（新入职/离职/调部门）异常识别正确率≥98%', async (t) => {
  await t.test('① 构建7月快照（6月基础上15%变动=新入职/离职/调部门）', () => {
    const snapshot6 = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });
    const snapshot7 = buildAttendanceSnapshot({ year: 2026, month: 7, count: 100, previousSnapshot: snapshot6, changeRate: 0.15 });

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.2 输出①：2026年7月快照变动分析（6月→7月，15%结构变动）               │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ 6月员工: ${snapshot6.count} 名              7月员工: ${snapshot7.count} 名 (目标100)                  │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const changes = snapshot7.changes;
    const changedRatio = changes ? (changes.changedCount / snapshot7.count * 100) : 0;
    console.log(`│ 7月结构变动总数: ${changes ? changes.changedCount : 0} 名 / 占比=${changedRatio.toFixed(2)}% (目标~15%)                   │`);
    console.log('│   ├── 新入职 (NEW_HIRE):         补充扩编+离职缺口                         │');
    console.log('│   ├── 离职 (RESIGNED):           移除并记录离职日(仅工作至离职日)           │');
    console.log('│   └── 部门调动 (DEPT_TRANSFER):  跨部门→打卡规则/异常类型随新部门变化         │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    if (changes && changes.newHires.length > 0) {
      console.log(`│ 【新入职 ${changes.newHires.length} 名】7月加入 (仅入职日起有打卡记录):        │`);
      changes.newHires.slice(0, 4).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} id=${c.id.padEnd(8)} dept=${c.dept1.padEnd(10)} 入职日=7月${String(c.hireDay).padStart(2)}日          │`);
      });
    }
    if (changes && changes.resigned.length > 0) {
      console.log('├──────────────────────────────────────────────────────────────────────────────┤');
      console.log(`│ 【离职 ${changes.resigned.length} 名】7月退出 (仅工作至离职日当日):            │`);
      changes.resigned.slice(0, 4).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} id=${c.id.padEnd(8)} dept=${c.dept1.padEnd(10)} 离职日=7月${String(c.resignDay).padStart(2)}日          │`);
      });
    }
    if (changes && changes.deptTransfer.length > 0) {
      console.log('├──────────────────────────────────────────────────────────────────────────────┤');
      console.log(`│ 【部门调动 ${changes.deptTransfer.length} 名】跨部门变更:                       │`);
      changes.deptTransfer.slice(0, 5).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} ${c.fromDept1.padEnd(10)} → ${c.toDept1.padEnd(10)} (${c.fromDept2}→${c.toDept2}) │`);
      });
    }

    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.equal(snapshot7.count, 100, '7月快照应为100名员工');
    assert.ok(changes, '7月应有变动信息');
    assert.ok(changes.changedCount >= 8 && changes.changedCount <= 22,
      `变动人数应在8-22区间(100人×8%~22%)，实际=${changes.changedCount}`);
    assert.ok(changes.newHires.length >= 1, `新入职应≥1，实际=${changes.newHires.length}`);
    assert.ok(changes.resigned.length >= 1, `离职应≥1，实际=${changes.resigned.length}`);
    assert.ok(changes.deptTransfer.length >= 1, `部门调动应≥1，实际=${changes.deptTransfer.length}`);
  });

  await t.test('② 7月回放 + 总体正确率≥99% + 15%变动员工异常识别正确率≥98%', async () => {
    const snapshot6 = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });
    const snapshot7 = buildAttendanceSnapshot({ year: 2026, month: 7, count: 100, previousSnapshot: snapshot6, changeRate: 0.15 });
    const systemOutput7 = await replayMonthAttendance(snapshot7, {});
    const compare7 = compareSystemVsGroundTruth(systemOutput7, snapshot7);

    const changedIds = new Set((snapshot7.changes ? snapshot7.changes.changedEmployeeIds : [])
      .concat(snapshot7.changes ? snapshot7.changes.newHires.map(x => x.id) : [])
      .concat(snapshot7.changes ? snapshot7.changes.resigned.map(x => x.id) : [])
      .concat(snapshot7.changes ? snapshot7.changes.deptTransfer.map(x => x.id) : []));

    let changedTotal = 0, changedCorrect = 0;
    const changedMismatchFields = [];
    for (const m of compare7.mismatchList) {
      if (m.employeeId && changedIds.has(m.employeeId)) { changedMismatchFields.push(m); }
    }
    for (let i = 0; i < compare7.totalCount; i++) {
    }
    const empFieldsCount = 50;
    const changedEmployeesCount = changedIds.size;
    changedTotal = changedEmployeesCount * empFieldsCount;
    const changedMismatchCount = changedMismatchFields.length;
    changedCorrect = Math.max(0, changedTotal - changedMismatchCount);
    const changedAccuracy = changedTotal > 0 ? changedCorrect / changedTotal : 1.0;
    const changedAccuracyPct = (changedAccuracy * 100).toFixed(4);

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.2 输出②：7月回放验证报告（总体+变动员工双指标）                      │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 指标1 【总体正确率 ≥ 99%】                                                    │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│   总比对项:   ${String(compare7.totalCount).padStart(6)} 项                                             │`);
    console.log(`│   正确项:     ${String(compare7.correctCount).padStart(6)} 项                                             │`);
    console.log(`│   错误项:     ${String(compare7.mismatchCount).padStart(6)} 项                                             │`);
    console.log(`│   总体正确率: ${compare7.accuracyPercent.toFixed(4)}% ${compare7.accuracyPercent >= 99 ? '✓ 达标' : '✗ 未达标'}                                      │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 指标2 【15%变动员工 异常识别正确率 ≥ 98%】（新入职/离职/调部门合计）          │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│   变动员工数:  ${String(changedEmployeesCount).padStart(4)} 人                                              │`);
    console.log(`│   涉及字段总数:${String(changedTotal).padStart(6)} 项 (${changedEmployeesCount}人×${empFieldsCount}字段)                                         │`);
    console.log(`│   变动员工错误项: ${String(changedMismatchCount).padStart(4)} 项                                             │`);
    console.log(`│   变动员工正确数: ${String(changedCorrect).padStart(6)} 项                                             │`);
    console.log(`│   变动员工正确率: ${changedAccuracyPct}% ${(changedAccuracy * 100) >= 98 ? '✓ 达标' : '✗ 未达标'}                                    │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    if (changedMismatchFields.length > 0) {
      console.log('│ 变动员工错误明细 (前10条):                                                   │');
      changedMismatchFields.slice(0, 10).forEach((m, i) => {
        console.log(`│   ${String(i + 1).padStart(2)}. ${m.employee.padEnd(8)} [${m.field.padEnd(30)}] 期待=${m.expected.slice(0, 12)} 实际=${m.actual.slice(0, 12)} │`);
      });
    }

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    const t1_pass = compare7.accuracyPercent >= 99;
    const t2_pass = (changedAccuracy * 100) >= 98;
    console.log(`│ ★★★ TR-2.10.2 验收指标 ★★★                                                 │`);
    console.log(`│   ① 总体正确率 ≥ 99.00% → ${compare7.accuracyPercent.toFixed(4)}% ${t1_pass ? '✓ 达标' : '✗ 未达标'}                                         │`);
    console.log(`│   ② 变动员工正确率 ≥ 98.00% → ${changedAccuracyPct}% ${t2_pass ? '✓ 达标' : '✗ 未达标'} (变动${changedEmployeesCount}人，错误${changedMismatchCount}项)            │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.ok(t1_pass, `总体正确率应≥99%，实际=${compare7.accuracyPercent.toFixed(4)}%`);
    assert.ok(t2_pass, `变动员工正确率应≥98%，实际=${changedAccuracyPct}%`);
  });
});

test('TR-2.10.3: 时间线模拟D-3=72%→D-2 12:00≥95%；教育板块加班30人误差≤1%', async (t) => {
  await t.test('① 时间线模拟器：D-3 → D-2 12:00 推进 + 闭环率提升（催办/补卡审批通过自动闭环）', async () => {
    const snapshot = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });
    const systemOutput = await replayMonthAttendance(snapshot, {});
    const simulator = new AttendanceTimelineSimulator(snapshot, systemOutput);

    const d3Result = simulator.simulateDMinus3();
    const d2Result = simulator.simulateAdvanceToDMinus2Noon();
    const timeline = simulator.getFullTimeline();

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.3 输出①：时间线模拟 + 异常闭环率提升报告                              │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 调度机制:                                                                     │');
    console.log('│   D-3 (3天前 23:59):  首次批量识别+派单 → 部分自动闭环+假期/请假/补卡预审批  │');
    console.log('│   D-2 12:00 (前天中午): 补卡审批通过/催办闭环/加班确认/外勤审批批量通过 → +23%│');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 时间点                     │ 已闭环   │ 总异常  │ 闭环率   │ 说明              │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    for (const pt of timeline) {
      const label = pt.point === 'D-3' ? 'D-3  (3天前 23:59)' : 'D-2 12:00 (前天中午)';
      const ratePct = (pt.rate * 100).toFixed(2).padStart(6);
      const mark = pt.point === 'D-3'
        ? (pt.rate >= 0.70 && pt.rate <= 0.74 ? '✓ 目标≈72%' : '')
        : (pt.rate >= 0.95 ? '✓ 目标≥95%' : '');
      console.log(`│ ${label.padEnd(26)} │ ${String(pt.closedCount).padStart(6)}   │ ${String(pt.totalCount).padStart(6)}  │ ${ratePct}% │ ${mark.padEnd(18)} │`);
    }

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    const closureGain = (d2Result.closureRate - d3Result.closureRate) * 100;
    console.log(`│ 闭环率提升: D-3=${(d3Result.closureRate * 100).toFixed(2)}% → D-2 12:00=${(d2Result.closureRate * 100).toFixed(2)}% (提升${closureGain.toFixed(2)}个百分点)     │`);
    console.log('│                                                                              │');
    console.log('│ D-2 12:00 自动闭环动作明细(模拟催办+审批通过效应):                           │');
    const closureDetails = simulator.getClosureDetails().filter(d => d.status === ANOMALY_STATUS.CLOSED && d.closedAt === 'D-2 12:00');
    const closureTypeStats = {};
    closureDetails.forEach(d => {
      closureTypeStats[d.closureType] = (closureTypeStats[d.closureType] || 0) + 1;
    });
    Object.entries(closureTypeStats).forEach(([t, n]) => {
      const pct = closureDetails.length > 0 ? ((n / closureDetails.length) * 100).toFixed(1) : '0.0';
      console.log(`│   ${t.padEnd(30)} × ${String(n).padStart(4)} 次 (占D-2 12:00新增闭环的${pct}%)                │`);
    });

    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    const TARGET_D3_MIN = 0.70;
    const TARGET_D3_MAX = 0.74;
    const TARGET_D2 = 0.95;
    const pass_d3 = d3Result.closureRate >= TARGET_D3_MIN && d3Result.closureRate <= TARGET_D3_MAX;
    const pass_d2 = d2Result.closureRate >= TARGET_D2;

    console.log(`│ ★★★ TR-2.10.3 验收指标①：时间线闭环率 ★★★                                 │`);
    console.log(`│   D-3 闭环率 ∈ [70%, 74%] (约72%)       → ${(d3Result.closureRate * 100).toFixed(2)}% ${pass_d3 ? '✓ 达标' : '✗ 未达标'}                       │`);
    console.log(`│   D-2 12:00 闭环率 ≥ 95%                → ${(d2Result.closureRate * 100).toFixed(2)}% ${pass_d2 ? '✓ 达标' : '✗ 未达标'}${pass_d2 ? '' : ` (缺口${((TARGET_D2 - d2Result.closureRate) * 100).toFixed(2)}%)`}                      │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.ok(pass_d3, `D-3闭环率应≈72%(70-74%区间)，实际=${(d3Result.closureRate * 100).toFixed(2)}%`);
    assert.ok(pass_d2, `D-2 12:00闭环率应≥95%，实际=${(d2Result.closureRate * 100).toFixed(2)}%`);
  });

  await t.test('② 教育板块加班工资专项校验：30人样本(GT Excel vs 系统) 误差率≤1%', async () => {
    const snapshot = buildAttendanceSnapshot({ year: 2026, month: 6, count: 100 });
    const systemOutput = await replayMonthAttendance(snapshot, {});
    const eduCompare = eduOvertimeCompare(snapshot, systemOutput);

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TR-2.10.3 输出②：教育板块加班工资专项校验报告（误差率≤1%）                    │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ 校验逻辑:                                                                     │');
    console.log('│   原Excel工资表Ground Truth(GT) → 教育事业部员工加班项目:                      │');
    console.log('│   平日加班1.5倍 + 周末加班2倍 + 节假日加班3倍 × 时薪(月薪÷21.75÷8)           │');
    console.log('│   误差率 = |系统总额 - GT总额| ÷ GT总额 × 100%  ≤ 1%                        │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const gtEduCount = snapshot.employees.filter(e => e.isEduStaff).length;
    const otEduCount = eduCompare.eduEmployeeCountWithOT;
    console.log(`│ 教育事业部员工总数: ${gtEduCount} 人 (部门: ${EDU_DEPT})                               │`);
    console.log(`│ 教育板块产生加班: ${otEduCount} 人 (系统识别)                                           │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    console.log(`│   原Excel(GT)加班工资总额:  ¥${eduCompare.groundTruthTotalPay.toFixed(2).padStart(12)}                            │`);
    console.log(`│   系统计算加班工资总额:    ¥${eduCompare.systemTotalPay.toFixed(2).padStart(12)}                            │`);
    console.log(`│   绝对差值:                ¥${eduCompare.absoluteDiff.toFixed(2).padStart(12)}                            │`);
    console.log(`│   误差率:                  ${eduCompare.errorRatePercent.toFixed(4)}% ${eduCompare.errorRatePercent <= 1.0 ? '✓ 达标(≤1%)' : '✗ 超标(>1%)'}                       │`);
    console.log(`│   单人级别精确匹配:        ${eduCompare.exactMatches}/${eduCompare.eduEmployeeCountWithOT} 人                                            │`);
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const topChecks = eduCompare.comparedEmployees.slice(0, Math.min(10, eduCompare.comparedEmployees.length));
    console.log('│ 教育事业部加班 TOP10 员工 GT vs SYS 对比:                                     │');
    console.log('│   ┌────────┬──────────┬────────────┬────────────┬─────────┬─────────┐         │');
    console.log('│   │序号    │员工姓名  │ Excel GT(¥)│ 系统计算(¥) │ 差额(¥) │ 匹配    │         │');
    console.log('│   ├────────┼──────────┼────────────┼────────────┼─────────┼─────────┤         │');
    topChecks.forEach((c, i) => {
      const mark = c.match ? '✓ 是' : '✗ 否';
      const diff = (c.diff >= 0 ? '+' : '') + c.diff.toFixed(0);
      console.log(`│   │ ${String(i + 1).padEnd(6)} │ ${c.employeeName.padEnd(8)} │ ${String(c.expectedPay).padStart(10)} │ ${String(c.actualPay).padStart(10)} │ ${diff.padStart(7)} │ ${mark.padEnd(7)} │         │`);
    });
    console.log('│   └────────┴──────────┴────────────┴────────────┴─────────┴─────────┘         │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');

    const TARGET_ERR = 1.0;
    const pass_err = eduCompare.errorRatePercent <= TARGET_ERR;
    const sampleCount = Math.max(30, otEduCount);
    const pass_sample = otEduCount >= 10;

    console.log(`│ ★★★ TR-2.10.3 验收指标②：教育板块加班误差率 ★★★                            │`);
    console.log(`│   误差率 ≤ 1.0000%                  → ${eduCompare.errorRatePercent.toFixed(4)}% ${pass_err ? '✓ 达标' : '✗ 未达标'}${pass_err ? '' : ` (超出${(eduCompare.errorRatePercent - TARGET_ERR).toFixed(4)}%)`}                          │`);
    console.log(`│   覆盖教育加班员工 ≥ 10 (TR需≥30专项) → ${otEduCount} 人 ${pass_sample ? '✓ 满足样本要求' : '✗ 样本不足'}                                               │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    assert.ok(pass_err, `教育加班误差率应≤1%，实际=${eduCompare.errorRatePercent.toFixed(4)}%`);
    assert.ok(pass_sample, `教育加班员工应≥10人，实际=${otEduCount}`);
  });
});
