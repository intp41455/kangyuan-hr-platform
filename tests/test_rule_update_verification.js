'use strict';

/**
 * 智慧化人资平台规则修改验证测试
 * 验证加班政策、旷工扣款、迟到扣款及特殊人员规则覆盖引擎的规则修改
 *
 * 运行：node tests/test_rule_update_verification.js
 */

const { calcOvertimePay, calcAbsentDeduction } = require('../src/modules/payroll/payroll_engine.js');
const { SpecialRuleOverrideEngine } = require('../src/modules/rules/special_rule_override_engine.js');

// ========== 简易测试框架 ==========
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓ PASS\x1b[0m  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \x1b[31m✗ FAIL\x1b[0m  ${name}`);
    console.log(`          \x1b[31m${e.message}\x1b[0m`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || '断言失败'} → 期望=${JSON.stringify(expected)}, 实际=${JSON.stringify(actual)}`);
  }
}

function assertIncludes(str, substring, message) {
  if (!str || typeof str !== 'string' || !str.includes(substring)) {
    throw new Error(`${message || '断言失败'} → 期望字符串包含"${substring}", 实际=${JSON.stringify(str)}`);
  }
}

function findDetail(details, type) {
  const d = (details || []).find(x => x.type === type);
  if (!d) throw new Error(`未找到type='${type}'的detail条目，现有types: ${(details || []).map(x => x.type).join(', ')}`);
  return d;
}

// ========== 测试开始 ==========

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  智慧化人资平台规则修改验证 - 10项测试                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ---------- TR-1 工作日加班不作数（用户企业规则） ----------
test('TR-1 工作日加班不作数：月薪8700，工作日加班4小时，total=0且标注法律风险', () => {
  const result = calcOvertimePay({ baseSalary: 8700, workdayOvertimeHours: 4 });

  assertEqual(result.total, 0, '工作日加班不应产生费用');
  assertEqual(result.details.length, 1, '应只有1条明细');
  assertEqual(result.details[0].mode, 'NO_CALC', 'mode应为NO_CALC');
  assertEqual(result.details[0].amount, 0, 'amount应为0');
  assertIncludes(result.details[0].legalRisk, '劳动法', 'legalRisk应包含"劳动法"提示风险');
  console.log('        → legalRisk: ' + result.details[0].legalRisk);
});

// ---------- TR-2 周末加班转调休不发钱（用户企业规则） ----------
test('TR-2 周末加班转调休：月薪8700，周末加班8小时，total=0且转8小时调休', () => {
  const result = calcOvertimePay({ baseSalary: 8700, weekendOvertimeHours: 8 });

  assertEqual(result.total, 0, '周末加班转调休不应发钱');
  assertEqual(result.details[0].mode, 'COMPTIME_ONLY', 'mode应为COMPTIME_ONLY');
  assertEqual(result.comptimeAccruedHours, 8, '应累计8小时调休');
  assertIncludes(result.details[0].legalNote, '合法', 'legalNote应包含"合法"');
  console.log('        → legalNote: ' + result.details[0].legalNote);
  console.log('        → comptimeAccruedHours: ' + result.comptimeAccruedHours + 'h');
});

// ---------- TR-3 法定节假日转调休（用户企业规则 - 法律高风险但企业确认） ----------
test('TR-3 法定节假日转调休：月薪8700，节假日加班8小时，标注高风险', () => {
  const result = calcOvertimePay({ baseSalary: 8700, holidayOvertimeHours: 8 });

  assertEqual(result.total, 0, '法定节假日转调休不发钱');
  assertEqual(result.details[0].mode, 'COMPTIME_ONLY', 'mode应为COMPTIME_ONLY');
  assertEqual(result.comptimeAccruedHours, 8, '应累计8小时调休');
  assertIncludes(result.details[0].legalRisk, '高风险', 'legalRisk应包含"高风险"');
  console.log('        → legalRisk: ' + result.details[0].legalRisk);
});

// ---------- TR-4 旷工按事假1倍（不再×3） ----------
test('TR-4 旷工按事假1倍：月薪8700，旷工1天，扣400元（8700÷21.75×1）', () => {
  const result = calcAbsentDeduction({ baseSalary: 8700, absentDays: 1 });

  const absentDetail = findDetail(result.details, 'ABSENT');
  assertEqual(absentDetail.rate, 1, '旷工倍率应为1（不再×3）');
  const expectedAmount = Math.round((8700 / 21.75) * 1 * 100) / 100; // 400
  assertEqual(absentDetail.amount, expectedAmount, `旷工扣款金额应为${expectedAmount}元`);
  assertIncludes(absentDetail.legalNote, '合规', 'legalNote应包含"合规"');
  console.log('        → rate=' + absentDetail.rate + ', amount=' + absentDetail.amount + '元');
  console.log('        → legalNote: ' + absentDetail.legalNote);
});

// ---------- TR-5 迟到一次扣10元+取消全勤（不再累计3次叠加20元） ----------
test('TR-5 迟到2次扣20元+取消全勤：单次10元，不再累计3次叠加', () => {
  const result = calcAbsentDeduction({ baseSalary: 8700, lateEarlyLeaveCount: 2 });

  const lateDetail = findDetail(result.details, 'LATE_EARLY_PER_TIME');
  assertEqual(lateDetail.count, 2, '迟到次数应为2');
  assertEqual(lateDetail.perTimePenalty, 10, '单次扣款应为10元');
  assertEqual(lateDetail.amount, 20, '总扣款应为20元(2×10)');
  assertEqual(lateDetail.fullAttendanceCancelled, true, '应取消全勤奖');
  console.log('        → count=' + lateDetail.count + ', perTimePenalty=' + lateDetail.perTimePenalty + '元, amount=' + lateDetail.amount + '元');
  console.log('        → fullAttendanceCancelled=' + lateDetail.fullAttendanceCancelled);
});

// ---------- TR-6 特殊人员规则覆盖引擎 - 董事长法定节假日发3倍 ----------
test('TR-6 董事长(EMP001)法定节假日发3倍：特殊覆盖holidayMode=PAY_300', () => {
  const engine = new SpecialRuleOverrideEngine();

  engine.addOverride({
    matchKey: 'EMP:EMP001',
    ruleType: 'OVERTIME_POLICY',
    override: { holidayMode: 'PAY_300' },
    approvalNo: 'HR-2026-SPECIAL-001',
    reason: '董事长法定节假日加班按法定3倍发放'
  });

  const result = engine.resolveOvertimePolicy({
    empId: 'EMP001',
    positionTag: 'EXECUTIVE',
    deptPath: '总部',
    workLocation: '西安'
  });

  assertEqual(result.policy.holidayMode, 'PAY_300', '董事长holidayMode应被覆盖为PAY_300');
  assertEqual(result.policy.workdayMode, 'NO_CALC', 'workdayMode应保持默认NO_CALC');
  assertEqual(result.policy.weekendMode, 'COMPTIME_ONLY', 'weekendMode应保持默认COMPTIME_ONLY');
  assertEqual(result.appliedOverrides.length, 1, '应有1条覆盖生效');
  assertEqual(result.appliedOverrides[0].approvalNo, 'HR-2026-SPECIAL-001', '审批单号应匹配');
  console.log('        → policy: ' + JSON.stringify(result.policy));
  console.log('        → appliedOverrides[0].approvalNo: ' + result.appliedOverrides[0].approvalNo);
});

// ---------- TR-7 教育板块全部员工工作日加班转调休 ----------
test('TR-7 教育板块员工(EMP888)工作日加班转调休：部门级覆盖workdayMode=COMPTIME', () => {
  const engine = new SpecialRuleOverrideEngine();

  engine.addOverride({
    matchKey: 'DEPT:教育板块',
    ruleType: 'OVERTIME_POLICY',
    override: { workdayMode: 'COMPTIME' },
    approvalNo: 'HR-2026-SPECIAL-002',
    reason: '教育板块工作日加班转调休（教师备课特殊性）'
  });

  const result = engine.resolveOvertimePolicy({
    empId: 'EMP888',
    deptPath: '教育板块/西安事业部',
    positionTag: 'TEACHER',
    workLocation: '西安'
  });

  assertEqual(result.policy.workdayMode, 'COMPTIME', '教育板块workdayMode应被部门级覆盖为COMPTIME');
  assertEqual(result.appliedOverrides.length, 1, '应有1条部门级覆盖生效');
  assertEqual(result.appliedOverrides[0].matchType, 'DEPT', '匹配类型应为DEPT');
  console.log('        → policy.workdayMode: ' + result.policy.workdayMode);
  console.log('        → matchType: ' + result.appliedOverrides[0].matchType + ', matchKey: ' + result.appliedOverrides[0].matchKey);
});

// ---------- TR-8 优先级测试：员工级>部门级 ----------
test('TR-8 优先级测试：员工级(100)>部门级(60)，EMP覆盖排序在DEPT之前', () => {
  const engine = new SpecialRuleOverrideEngine();

  // 部门级覆盖：总部员工工作日加班转调休
  engine.addOverride({
    matchKey: 'DEPT:总部',
    ruleType: 'OVERTIME_POLICY',
    override: { workdayMode: 'COMPTIME' },
    approvalNo: 'HR-2026-DEPT-001',
    reason: '总部工作日加班转调休'
  });

  // 员工级覆盖：EMP001法定节假日发3倍（优先级100 > 部门级60）
  engine.addOverride({
    matchKey: 'EMP:EMP001',
    ruleType: 'OVERTIME_POLICY',
    override: { holidayMode: 'PAY_300' },
    approvalNo: 'HR-2026-EMP-001',
    reason: 'EMP001法定节假日按3倍发放'
  });

  const result = engine.resolveOvertimePolicy({
    empId: 'EMP001',
    positionTag: 'EXECUTIVE',
    deptPath: '总部',
    workLocation: '西安'
  });

  // 两条覆盖都应生效（不同字段无冲突）
  assertEqual(result.appliedOverrides.length, 2, '应有2条覆盖生效');

  // 员工级(100)应排在部门级(60)之前
  assertEqual(result.appliedOverrides[0].matchType, 'EMP', '第1条应为EMP(优先级100)');
  assertEqual(result.appliedOverrides[0].priority, 100, 'EMP优先级应为100');
  assertEqual(result.appliedOverrides[1].matchType, 'DEPT', '第2条应为DEPT(优先级60)');
  assertEqual(result.appliedOverrides[1].priority, 60, 'DEPT优先级应为60');

  // 员工级覆盖值已生效（holidayMode被EMP覆盖为PAY_300）
  assertEqual(result.policy.holidayMode, 'PAY_300', '员工级覆盖holidayMode=PAY_300应生效');
  // 部门级覆盖值也已生效（workdayMode被DEPT覆盖为COMPTIME）
  assertEqual(result.policy.workdayMode, 'COMPTIME', '部门级覆盖workdayMode=COMPTIME应生效');
  console.log('        → appliedOverrides优先级排序: EMP(100) > DEPT(60)');
  console.log('        → policy: ' + JSON.stringify(result.policy));
});

// ---------- TR-9 HR配置页面结构 ----------
test('TR-9 HR配置页面结构：4个section + 3个action + helpText含优先级说明', () => {
  const engine = new SpecialRuleOverrideEngine();
  const config = engine.getConfigPageStructure();

  assertEqual(config.sections.length, 4, '应有4个配置区块');
  const sectionIds = config.sections.map(s => s.sectionId);
  assert(sectionIds.includes('MATCH_TARGET'), '应包含匹配对象区块');
  assert(sectionIds.includes('RULE_TYPE'), '应包含规则类型区块');
  assert(sectionIds.includes('OVERRIDE_VALUES'), '应包含覆盖内容区块');
  assert(sectionIds.includes('APPROVAL'), '应包含审批信息区块');

  assertEqual(config.actions.length, 3, '应有3个操作按钮');
  assertIncludes(config.helpText, '优先级', 'helpText应包含优先级说明');
  console.log('        → sections: ' + sectionIds.join(', '));
  console.log('        → actions: ' + config.actions.map(a => a.name).join(', '));
  console.log('        → helpText: ' + config.helpText);
});

// ---------- TR-10 删除覆盖规则（需审批单号） ----------
test('TR-10 删除覆盖规则：无approvalNo抛错，有approvalNo成功且日志有REMOVE记录', () => {
  const engine = new SpecialRuleOverrideEngine();

  const record = engine.addOverride({
    matchKey: 'EMP:EMP999',
    ruleType: 'OVERTIME_POLICY',
    override: { workdayMode: 'PAY_150' },
    approvalNo: 'HR-2026-ADD-001',
    reason: '测试删除流程-添加'
  });

  // 不填approvalNo应抛错
  let threwError = false;
  try {
    engine.removeOverride(record.id);
  } catch (e) {
    threwError = true;
    console.log('        → 无approvalNo抛错: ' + e.message);
  }
  assert(threwError, '不填approvalNo应抛错');

  // 填approvalNo成功删除
  const removed = engine.removeOverride(record.id, 'HR-2026-REMOVE-001', '王宁');
  assert(removed !== null, '删除应返回被删记录');

  // getChangeLog应有一条REMOVE记录
  const log = engine.getChangeLog();
  const removeLogs = log.filter(l => l.action === 'REMOVE');
  assertEqual(removeLogs.length, 1, '变更日志应有1条REMOVE记录');
  assertEqual(removeLogs[0].approvalNo, 'HR-2026-REMOVE-001', 'REMOVE记录的approvalNo应匹配');
  console.log('        → 删除成功，getChangeLog REMOVE记录数: ' + removeLogs.length);
  console.log('        → REMOVE记录approvalNo: ' + removeLogs[0].approvalNo);

  // 验证删除后该覆盖不再生效
  const remaining = engine.listAllOverrides();
  assertEqual(remaining.length, 0, '删除后应无剩余覆盖规则');
});

// ========== 测试总结 ==========
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  测试结果: \x1b[32m${passed} 通过\x1b[0m / \x1b[31m${failed} 失败\x1b[0m / 共 ${passed + failed} 项`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('\x1b[31m存在失败测试，请检查上述 FAIL 项。\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m全部 10 项测试通过！规则修改验证成功。\x1b[0m\n');
  process.exit(0);
}
