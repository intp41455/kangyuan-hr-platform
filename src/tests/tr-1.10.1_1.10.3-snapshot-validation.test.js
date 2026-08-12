'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMonthlySnapshot,
  compareSnapshotToSystemImport,
  build50Bindings,
  verifyBidirectionalBindings,
  spotCheck10Employees,
  _snapshotStore
} = require('./master_data_snapshot_validator.js');

test('TR-1.10.1: 导入2026年6月100名，14字段正确率≥99%（correctCount≥990 / totalCount=1400；errors≤14）', async (t) => {
  await t.test('① 构建2026年6月100名员工月度快照', () => {
    const snapshot = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.1 输出：2026年6月花名册快照 + 导入验证               │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 快照生成时间: ${snapshot.generatedAt.toISOString().slice(0, 19)}                      │`);
    console.log(`│ 核算月份: ${snapshot.year}年${snapshot.month}月（核算基准日：15日）                 │`);
    console.log(`│ 员工总数: ${snapshot.count} 名                                       │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    const statusCounts = {};
    snapshot.employees.forEach(e => {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    });
    console.log('│ 员工状态分布:                                                 │');
    for (const [status, count] of Object.entries(statusCounts)) {
      const pct = ((count / snapshot.count) * 100).toFixed(1);
      console.log(`│   ${status.padEnd(12)}: ${String(count).padStart(3)} 名 (${pct}%)                    │`);
    }

    const deptCounts = {};
    snapshot.employees.forEach(e => {
      deptCounts[e.dept1] = (deptCounts[e.dept1] || 0) + 1;
    });
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 一级部门分布（Top 6）:                                        │');
    const deptEntries = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    for (const [dept, count] of deptEntries) {
      const pct = ((count / snapshot.count) * 100).toFixed(1);
      console.log(`│   ${dept.padEnd(14)}: ${String(count).padStart(3)} 名 (${pct}%)                   │`);
    }

    const probationCount = snapshot.employees.filter(e => e.isProbationFlag).length;
    const avgYearsOfService = (snapshot.employees.reduce((s, e) => s + e.yearsOfService, 0) / snapshot.count).toFixed(2);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 试用期员工: ${probationCount} 名 (${((probationCount / snapshot.count) * 100).toFixed(1)}%)                      │`);
    console.log(`│ 平均工龄: ${avgYearsOfService} 年                                       │`);
    console.log(`│ 薪级覆盖: ${new Set(snapshot.employees.map(e => e.payrollGrade)).size} 档                                  │`);
    console.log(`│ 社保地区: ${new Set(snapshot.employees.map(e => e.socialAreaName)).size} 个 (${Array.from(new Set(snapshot.employees.map(e => e.socialAreaName))).join('/')})     │`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(snapshot.year, 2026);
    assert.equal(snapshot.month, 6);
    assert.equal(snapshot.count, 100, '6月快照应为100名员工');
    assert.equal(snapshot.employees.length, 100, '员工列表长度应为100');
  });

  await t.test('② 导入EmployeeRegistry并逐字段对比14个核心字段（注入1条随机错误）', () => {
    const snapshot = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const result = compareSnapshotToSystemImport(snapshot, true);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.1 输出：导入验证报告（自动注入1条随机错误）            │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 导入结果: success=${result.importResult.success}  failed=${result.importResult.failed.length}                            │`);
    console.log(`│ 字段总数: ${result.totalCount} (100人 × 14字段)                       │`);
    console.log(`│ 正确字段: ${result.correctCount}                                        │`);
    console.log(`│ 错误字段: ${result.errors.length}                                         │`);
    console.log(`│ 正确率:   ${(result.accuracy * 100).toFixed(4)}%                                    │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    if (result.errorInjection) {
      console.log('│ ⚠ 随机错误注入:                                              │');
      console.log(`│   行号:   第 ${result.errorInjection.row + 1} 行                                     │`);
      console.log(`│   字段:   ${result.errorInjection.field}                                        │`);
      console.log(`│   原值:   ${result.errorInjection.original}                                      │`);
      console.log(`│   注入值: ${result.errorInjection.injected}                                   │`);
      console.log('├─────────────────────────────────────────────────────────────┤');
    }

    console.log('│ 14个核心字段定义:                                            │');
    const fieldsList = [
      '01. name 姓名',
      '02. idCard 身份证号',
      '03. mobile 手机号',
      '04. entity 核算主体',
      '05. dept1 一级部门',
      '06. dept2 二级部门',
      '07. position 岗位名称',
      '08. status 员工状态',
      '09. payrollGradeBase 薪级基础工资',
      '10. payrollGradePerformanceRatio 绩效比例',
      '11. workLocation 常驻工作地',
      '12. isProbation 试用期判定(6/15)',
      '13. yearsOfService 工龄(6/15)',
      '14. socialAreaName 社保地区名称'
    ];
    for (const f of fieldsList) {
      console.log(`│   ${f}                              │`);
    }
    console.log('├─────────────────────────────────────────────────────────────┤');

    console.log('│ 错误详情（前10条）:                                           │');
    if (result.errors.length === 0) {
      console.log('│   （无错误）                                                  │');
    } else {
      result.errors.slice(0, 10).forEach((err, i) => {
        const expected = String(err.expected).length > 18 ? String(err.expected).slice(0, 18) + '…' : String(err.expected);
        const actual = String(err.actual).length > 18 ? String(err.actual).slice(0, 18) + '…' : String(err.actual);
        console.log(`│   ${String(i + 1).padStart(2)}. R${String(err.row).padStart(3)} [${err.field.padEnd(28)}]                          │`);
        console.log(`│      期望值: ${expected.padEnd(20)}  实际值: ${actual.padEnd(20)} │`);
      });
      if (result.errors.length > 10) {
        console.log(`│   ... 另有 ${result.errors.length - 10} 条错误                                   │`);
      }
    }
    console.log('├─────────────────────────────────────────────────────────────┤');

    const targetCorrect = 990;
    const targetErrors = 14;
    const passCorrect = result.correctCount >= targetCorrect;
    const passErrors = result.errors.length <= targetErrors;
    const targetAccuracy = 0.99;
    const passAccuracy = result.accuracy >= targetAccuracy;

    console.log(`│ ★ TR-1.10.1 验收指标:                                        │`);
    console.log(`│   ✓ correctCount ≥ ${targetCorrect}  →  ${result.correctCount} ${passCorrect ? '✓ 达标' : '✗ 未达标'}                         │`);
    console.log(`│   ✓ errors.length ≤ ${targetErrors}  →  ${result.errors.length} ${passErrors ? '✓ 达标' : '✗ 未达标'}                            │`);
    console.log(`│   ✓ 正确率 ≥ 99.0000%       →  ${(result.accuracy * 100).toFixed(4)}% ${passAccuracy ? '✓ 达标' : '✗ 未达标'}              │`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(result.totalCount, 1400, `totalCount应为100×14=1400，实际=${result.totalCount}`);
    assert.ok(passCorrect, `correctCount应≥${targetCorrect}，实际=${result.correctCount}`);
    assert.ok(passErrors, `errors数应≤${targetErrors}，实际=${result.errors.length}`);
    assert.ok(passAccuracy, `正确率应≥99%，实际=${(result.accuracy * 100).toFixed(4)}%`);
  });
});

test('TR-1.10.2: 导入2026年7月100名，14字段正确率≥99%；变动员工（80名保留+20名变动）识别正确：2名状态由试用期→正式、3名薪级比例变更、4名部门变更记录有历史流水', async (t) => {
  await t.test('① 构建2026年7月100名员工月度快照（80%保留+20%变动）', () => {
    const snapshot6 = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const snapshot7 = buildMonthlySnapshot({ year: 2026, month: 7, count: 100 });

    const changes = snapshot7.changes;

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.2 输出：2026年7月花名册快照（6月→7月 变动分析）        │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 6月人数: ${snapshot6.count} 名               7月人数: ${snapshot7.count} 名              │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 人员结构变动（总计 20 名 = 保留 80 名基础上发生变动）:         │`);
    console.log(`│   ├─ 80 名 员工保留（6月→7月在职，身份延续）                 │`);
    console.log(`│   ├─  2 名 试用期 → 正式（转正）                             │`);
    console.log(`│   ├─  3 名 薪级调整（绩效比例变更）                           │`);
    console.log(`│   ├─  4 名 部门调动（跨部门/二级部门变更）                   │`);
    console.log(`│   ├─  1 名 离职退出（从6月花名册移除）                        │`);
    console.log(`│   └─  4 名 新入职（7月新加入，补充缺口）                     │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    if (changes.probationToRegular.length > 0) {
      console.log('│ 【转正 2 名】试用期→正式:                                     │');
      changes.probationToRegular.slice(0, 2).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} idCard=${c.idCard.slice(0, 8)}…  ${c.from} → ${c.to}        │`);
      });
    }

    if (changes.gradeChange.length > 0) {
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log('│ 【薪级调整 3 名】绩效比例变更:                                 │');
      changes.gradeChange.slice(0, 3).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} ${c.fromGrade} → ${c.toGrade}                           │`);
      });
    }

    if (changes.deptChange.length > 0) {
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log('│ 【部门调动 4 名】:                                            │');
      changes.deptChange.slice(0, 4).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} ${c.fromDept1}/${c.fromDept2} → ${c.toDept1}/${c.toDept2} │`);
      });
    }

    if (changes.resigned.length > 0) {
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log('│ 【离职 1 名】:                                                │');
      changes.resigned.slice(0, 1).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} idCard=${c.idCard.slice(0, 8)}…                               │`);
      });
    }

    if (changes.newHires.length > 0) {
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│ 【新入职 4 名】（7月新增，补充离职 + 扩编）:                   │`);
      changes.newHires.slice(0, 4).forEach((c, i) => {
        console.log(`│   ${i + 1}. ${c.name.padEnd(8)} idCard=${c.idCard.slice(0, 8)}… status=${c.status.padEnd(8)} │`);
      });
    }

    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(snapshot7.count, 100, '7月快照应为100名员工');
    assert.equal(changes.probationToRegular.length, 2, `应正好2名转正，实际=${changes.probationToRegular.length}`);
    assert.equal(changes.gradeChange.length, 3, `应正好3名薪级调整，实际=${changes.gradeChange.length}`);
    assert.equal(changes.deptChange.length, 4, `应正好4名部门调动，实际=${changes.deptChange.length}`);
    assert.equal(changes.resigned.length, 1, `应正好1名离职，实际=${changes.resigned.length}`);
    assert.equal(changes.newHires.length, 4, `应正好4名新入职，实际=${changes.newHires.length}`);
  });

  await t.test('② 导入7月快照并验证14字段正确率≥99%', () => {
    const snapshot6 = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const snapshot7 = buildMonthlySnapshot({ year: 2026, month: 7, count: 100 });
    const result = compareSnapshotToSystemImport(snapshot7, true);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.2 输出：7月导入验证报告                               │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 导入结果: success=${result.importResult.success}  failed=${result.importResult.failed.length}                            │`);
    console.log(`│ 字段总数: ${result.totalCount} (100人 × 14字段)                       │`);
    console.log(`│ 正确字段: ${result.correctCount}                                        │`);
    console.log(`│ 错误字段: ${result.errors.length}                                         │`);
    console.log(`│ 正确率:   ${(result.accuracy * 100).toFixed(4)}%                                    │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    const targetCorrect = 990;
    const targetErrors = 14;
    const passCorrect = result.correctCount >= targetCorrect;
    const passErrors = result.errors.length <= targetErrors;
    const passAccuracy = result.accuracy >= 0.99;

    console.log(`│ ★ TR-1.10.2 指标1 - 14字段正确率≥99%:                        │`);
    console.log(`│   ✓ correctCount ≥ ${targetCorrect}  →  ${result.correctCount} ${passCorrect ? '✓ 达标' : '✗ 未达标'}                         │`);
    console.log(`│   ✓ errors.length ≤ ${targetErrors}  →  ${result.errors.length} ${passErrors ? '✓ 达标' : '✗ 未达标'}                            │`);
    console.log(`│   ✓ 正确率 ≥ 99.0000%       →  ${(result.accuracy * 100).toFixed(4)}% ${passAccuracy ? '✓ 达标' : '✗ 未达标'}              │`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(result.totalCount, 1400, `totalCount应为1400，实际=${result.totalCount}`);
    assert.ok(passCorrect, `correctCount应≥${targetCorrect}，实际=${result.correctCount}`);
    assert.ok(passErrors, `errors数应≤${targetErrors}，实际=${result.errors.length}`);
    assert.ok(passAccuracy, `正确率应≥99%，实际=${(result.accuracy * 100).toFixed(4)}%`);
  });

  await t.test('③ 变动员工识别验证：转正/调薪级/调部门 → history.adjustments有记录', () => {
    const snapshot6 = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const snapshot7 = buildMonthlySnapshot({ year: 2026, month: 7, count: 100 });
    const result = compareSnapshotToSystemImport(snapshot7, false);
    const changes = snapshot7.changes;
    const registry = result.registry;

    let probationToRegularVerified = 0;
    let gradeChangeVerified = 0;
    let deptChangeVerified = 0;

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.2 输出：变动员工历史流水核对                          │');
    console.log('├─────────────────────────────────────────────────────────────┤');

    console.log('│ 【2名转正员工】核对 status=正式 + adjustments含转正记录:     │');
    for (let i = 0; i < changes.probationToRegular.length; i++) {
      const c = changes.probationToRegular[i];
      const emp = registry.getAllEmployees().find(e => e.idCard === c.idCard);
      let statusOk = false;
      let historyOk = false;
      let historyNote = '未找到记录';
      if (emp) {
        statusOk = emp.status === c.to;
        const adjustmentRecord = emp.history.adjustments.find(a =>
          a.from === c.from && a.to === c.to
        );
        historyOk = !!adjustmentRecord;
        if (adjustmentRecord) {
          historyNote = `日期=${adjustmentRecord.date.toISOString().slice(0, 10)}`;
        }
      }
      if (statusOk && historyOk) probationToRegularVerified++;
      const mark = (statusOk && historyOk) ? '✓' : '✗';
      console.log(`│   ${mark} ${c.name.padEnd(8)} status=${statusOk ? 'OK正式' : '✗错误'}  adjustments=${historyOk ? ('OK ' + historyNote) : '✗缺失'}  │`);
    }

    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 【3名薪级调整】核对 adjustments含调薪记录:                    │');
    for (let i = 0; i < changes.gradeChange.length; i++) {
      const c = changes.gradeChange[i];
      const emp = registry.getAllEmployees().find(e => e.idCard === c.idCard);
      let gradeOk = false;
      let historyOk = false;
      let historyNote = '未找到记录';
      if (emp) {
        gradeOk = emp.payrollGrade === c.toGrade;
        const adjustmentRecord = emp.history.adjustments.find(a =>
          a.from === c.fromGrade && a.to === c.toGrade
        );
        historyOk = !!adjustmentRecord;
        if (adjustmentRecord) {
          historyNote = `日期=${adjustmentRecord.date.toISOString().slice(0, 10)}`;
        }
      }
      if (gradeOk && historyOk) gradeChangeVerified++;
      const mark = (gradeOk && historyOk) ? '✓' : '✗';
      console.log(`│   ${mark} ${c.name.padEnd(8)} grade=${gradeOk ? ('OK ' + c.toGrade) : '✗错误'}  adjustments=${historyOk ? ('OK ' + historyNote) : '✗缺失'}   │`);
    }

    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 【4名部门调动】核对 transfers+adjustments 含调动记录:        │');
    for (let i = 0; i < changes.deptChange.length; i++) {
      const c = changes.deptChange[i];
      const emp = registry.getAllEmployees().find(e => e.idCard === c.idCard);
      let deptOk = false;
      let transfersOk = false;
      let adjustmentsOk = false;
      let transfersNote = '';
      let adjustmentsNote = '';
      if (emp) {
        deptOk = (emp.dept1 === c.toDept1) && (emp.dept2 === c.toDept2);
        const transferRecord = emp.history.transfers.find(a =>
          a.from && a.to && a.to.includes(c.toDept1)
        );
        transfersOk = !!transferRecord;
        const adjustmentRecord = emp.history.adjustments.find(a =>
          a.from && a.to && a.meta && a.meta.type === 'dept'
        );
        adjustmentsOk = !!adjustmentRecord;
        transfersNote = transfersOk ? ` transfers(调)OK` : ' transfers✗缺失';
        adjustmentsNote = adjustmentsOk ? ` adjustments(流)OK` : ' adjustments✗缺失';
      }
      if (deptOk && transfersOk && adjustmentsOk) deptChangeVerified++;
      const mark = (deptOk && transfersOk && adjustmentsOk) ? '✓' : '✗';
      console.log(`│   ${mark} ${c.name.padEnd(8)} dept=${deptOk ? 'OK' : '✗'}${transfersNote}${adjustmentsNote}  │`);
    }

    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ ★ TR-1.10.2 指标2 - 变动员工流水核查:                        │`);
    console.log(`│   转正:  2/2  核对通过=${probationToRegularVerified}/${changes.probationToRegular.length} ${probationToRegularVerified === changes.probationToRegular.length ? '✓ 达标' : '✗ 未达标'}                                │`);
    console.log(`│   调薪级: 3/3  核对通过=${gradeChangeVerified}/${changes.gradeChange.length} ${gradeChangeVerified === changes.gradeChange.length ? '✓ 达标' : '✗ 未达标'}                                │`);
    console.log(`│   调部门: 4/4  核对通过=${deptChangeVerified}/${changes.deptChange.length} ${deptChangeVerified === changes.deptChange.length ? '✓ 达标' : '✗ 未达标'}                                │`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(probationToRegularVerified, changes.probationToRegular.length, '转正记录核对应全部通过');
    assert.equal(gradeChangeVerified, changes.gradeChange.length, '调薪级记录核对应全部通过');
    assert.equal(deptChangeVerified, changes.deptChange.length, '调部门记录核对应全部通过');
  });
});

test('TR-1.10.3: 50人钉钉映射表双向核对无空值无错配（覆盖率100%，错配率=0）；抽查10人4项（工龄/试用期/社保地/薪级比例）完全一致', async (t) => {
  await t.test('① 绑定50人钉钉映射表 build50Bindings()', () => {
    const snapshot = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const compareResult = compareSnapshotToSystemImport(snapshot, false);
    const registry = compareResult.registry;
    const allIds = registry.getAllEmployees().map(e => e.id).slice(0, 50);

    const bindings = build50Bindings(registry, allIds);
    const successCount = bindings.filter(b => b.success).length;

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.3 输出：50人钉钉映射表绑定                            │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 目标绑定: 50 人                                              │`);
    console.log(`│ 成功绑定: ${successCount} 人                                               │`);
    console.log(`│ 绑定失败: ${bindings.length - successCount} 人                                               │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 绑定映射样例（前 10 名）:                                     │');
    bindings.slice(0, 10).forEach(b => {
      const emp = registry.findById(b.employeeId);
      const name = emp ? emp.name.padEnd(8) : '未知'.padEnd(8);
      const statusMark = b.success ? '✓' : '✗';
      console.log(`│   ${statusMark} ${b.employeeId} ${name} ↔ ${b.dingtalkUserId.padEnd(12)} dept=${b.deptId}  │`);
    });
    if (bindings.length > 10) {
      console.log(`│   ... 另有 ${bindings.length - 10} 条绑定                                    │`);
    }
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(bindings.length, 50, `应绑定50人，实际=${bindings.length}`);
    assert.equal(successCount, 50, `应有50人成功绑定，实际=${successCount}`);
  });

  await t.test('② 双向核对 findByDingtalkUserId ↔ getDingtalkBind 覆盖率100%、错配率=0%', () => {
    const snapshot = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const compareResult = compareSnapshotToSystemImport(snapshot, false);
    const registry = compareResult.registry;
    const allIds = registry.getAllEmployees().map(e => e.id).slice(0, 50);

    const bindings = build50Bindings(registry, allIds);
    const verification = verifyBidirectionalBindings(registry, bindings);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.3 输出：钉钉映射双向核对报告                          │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 总绑定数: ${verification.total}                                                 │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 正向查询（员工ID → 钉钉UserId）通过 getDingtalkBind:        │');
    console.log(`│   ✓ 匹配: ${verification.forwardMatches}                                              │`);
    console.log(`│   - 空值: ${verification.forwardEmpty}                                                 │`);
    console.log(`│   - 错配: ${verification.forwardMismatch}                                                 │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 反向查询（钉钉UserId → 员工）通过 findByDingtalkUserId:     │');
    console.log(`│   ✓ 匹配: ${verification.reverseMatches}                                              │`);
    console.log(`│   - 空值: ${verification.reverseEmpty}                                                 │`);
    console.log(`│   - 错配: ${verification.reverseMismatch}                                                 │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 覆盖率: ${(verification.coverageRate * 100).toFixed(4)}%                                       │`);
    console.log(`│ 错配率: ${(verification.mismatchRate * 100).toFixed(4)}%                                       │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    const coverageTarget = 1.0;
    const mismatchTarget = 0.0;
    const coverageOk = verification.coverageRate >= coverageTarget;
    const mismatchOk = verification.mismatchRate <= mismatchTarget;

    console.log(`│ ★ TR-1.10.3 指标1 - 钉钉映射双向核对:                        │`);
    console.log(`│   ✓ 覆盖率 ≥ 100.0000%   →  ${(verification.coverageRate * 100).toFixed(4)}% ${coverageOk ? '✓ 达标' : '✗ 未达标'}              │`);
    console.log(`│   ✓ 错配率 = 0.0000%      →  ${(verification.mismatchRate * 100).toFixed(4)}% ${mismatchOk ? '✓ 达标' : '✗ 未达标'}              │`);

    if (verification.mismatches.length > 0) {
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log('│ 错配明细:                                                    │');
      verification.mismatches.slice(0, 5).forEach(m => {
        console.log(`│   ✗ [${m.type}] emp=${m.employeeId} dt=${m.dingtalkUserId || '-'}                    │`);
        console.log(`│       期望值=${m.expected}  实际值=${m.actual}                  │`);
      });
    }
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(verification.forwardEmpty, 0, `正向空值数应为0，实际=${verification.forwardEmpty}`);
    assert.equal(verification.forwardMismatch, 0, `正向错配数应为0，实际=${verification.forwardMismatch}`);
    assert.equal(verification.reverseEmpty, 0, `反向空值数应为0，实际=${verification.reverseEmpty}`);
    assert.equal(verification.reverseMismatch, 0, `反向错配数应为0，实际=${verification.reverseMismatch}`);
    assert.ok(coverageOk, `覆盖率应为100%，实际=${(verification.coverageRate * 100).toFixed(4)}%`);
    assert.ok(mismatchOk, `错配率应为0%，实际=${(verification.mismatchRate * 100).toFixed(4)}%`);
  });

  await t.test('③ 抽查10人4项（工龄/试用期/社保地/薪级比例）完全一致', () => {
    const snapshot = buildMonthlySnapshot({ year: 2026, month: 6, count: 100 });
    const compareResult = compareSnapshotToSystemImport(snapshot, false);

    const spotCheck = spotCheck10Employees(snapshot, compareResult);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ TR-1.10.3 输出：抽查10人详细对比报告                          │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 4项核对定义:                                                  │');
    console.log('│   📊 ① 工龄(calcYearsOfService值)  核算基准日=6月15日          │');
    console.log('│   📋 ② 试用期(isProbation返回值)  与快照 isProbationFlag 比较   │');
    console.log('│   📍 ③ 社保地区名称              findAreaVersion 查找          │');
    console.log('│   📈 ④ 薪级绩效比例             payrollGrade.performanceRatio │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 抽查明细:                                                     │');

    spotCheck.details.forEach((r, idx) => {
      const mark = r.success ? '✓' : '✗';
      console.log(`│ ${mark} #${String(idx + 1).padStart(2)} ${r.employeeId} ${r.name.padEnd(8)}                              │`);
      const c = r.checks;

      const yMark = c.yearsOfService.match ? '✓' : '✗';
      console.log(`│      ①工龄:     ${yMark} ${c.yearsOfService.expected}年 = ${c.yearsOfService.actual}年${c.yearsOfService.match ? '' : ` ✗不一致`}                             │`);

      const pMark = c.probation.match ? '✓' : '✗';
      const pExp = c.probation.expected ? '试用期' : '非试用';
      const pAct = c.probation.actual ? '试用期' : '非试用';
      console.log(`│      ②试用期:   ${pMark} ${pExp} = ${pAct}${c.probation.match ? '' : ` ✗不一致`}                             │`);

      const sMark = c.socialInsuranceArea.match ? '✓' : '✗';
      const sExpLen = String(c.socialInsuranceArea.expected).length;
      const sActLen = String(c.socialInsuranceArea.actual).length;
      const sPad = sExpLen + sActLen < 10 ? ' ' : '';
      console.log(`│      ③社保地:   ${sMark} ${c.socialInsuranceArea.expected} = ${c.socialInsuranceArea.actual}${sPad}${c.socialInsuranceArea.match ? '' : ` ✗不一致`}                         │`);

      const rMark = c.performanceRatio.match ? '✓' : '✗';
      console.log(`│      ④绩效比例: ${rMark} ${(c.performanceRatio.expected * 100).toFixed(0)}% = ${(c.performanceRatio.actual * 100).toFixed(0)}%${c.performanceRatio.match ? '' : ` ✗不一致`}                              │`);
    });

    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ 汇总: 总${spotCheck.total} / 通过${spotCheck.passed} / 失败${spotCheck.failed}                                   │`);

    const targetAllPass = 10;
    const allPassed = spotCheck.passed === targetAllPass;
    console.log(`│ ★ TR-1.10.3 指标2 - 10人4项完全一致:                         │`);
    console.log(`│   ✓ 10/10 全部一致  →  抽查${spotCheck.total}/通过${spotCheck.passed} ${allPassed ? '✓ 达标' : '✗ 未达标'}                       │`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    assert.equal(spotCheck.total, 10, `应抽查10人，实际=${spotCheck.total}`);
    assert.equal(spotCheck.passed, 10, `应10人全部通过，实际通过=${spotCheck.passed}`);
    assert.ok(spotCheck.allPassed, `抽查4项完全一致: 应有10人通过，实际通过=${spotCheck.passed}`);
  });
});
