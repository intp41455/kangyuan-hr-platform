const { DingTalkClient } = require('./src/integrations/dingtalk_contact_sync');
const {
  AttendanceGroupsLoader,
  ATTENDANCE_GROUP_TYPES,
  WORKDAYS_PATTERNS,
  AttendanceGroupModel
} = require('./src/modules/attendance/attendance_groups_loader');

async function test_TR221() {
  console.log('\n========== TR-2.2.1: 考勤组加载与员工匹配测试 ==========');

  const dingTalkClient = new DingTalkClient({ mode: 'mock' });
  const loader = new AttendanceGroupsLoader({
    dingTalkClient,
    mode: 'mock'
  });

  console.log('[TR-2.2.1] 调用 loadGroups() 加载考勤组...');
  const groups = await loader.loadGroups();
  console.log(`[TR-2.2.1] loadGroups() 返回考勤组数量: ${groups.length}`);
  groups.forEach((g, idx) => {
    console.log(`  组#${idx + 1}: id=${g.id}, name=${g.name}, type=${g.type}`);
  });

  const groupCountOk = groups.length >= 6;
  console.log(`\n[TR-2.2.1] 校验1: 考勤组数量>=6? groups.length=${groups.length} → ${groupCountOk ? '✅' : '❌'}`);

  const hqGroup = groups.find(g => g.id === 'AG_HQ_XA');
  const hqOnDutyOk = hqGroup && hqGroup.shift.onDutyTime === '08:30';
  const hqOffDutyOk = hqGroup && hqGroup.shift.offDutyTime === '18:00';
  const hqWorkdaysOk = hqGroup && hqGroup.workdays === WORKDAYS_PATTERNS.MON_FRI;
  const hqGraceLateOk = hqGroup && hqGroup.shift.graceLateMinutes === 5;
  const hqGraceEarlyOk = hqGroup && hqGroup.shift.graceEarlyLeaveMinutes === 5;
  const hqFlexibleOk = hqGroup && hqGroup.shift.isFlexible === false;

  console.log(`[TR-2.2.1] 校验2: HQ总部西安组配置:`);
  console.log(`  onDutyTime='${hqGroup ? hqGroup.shift.onDutyTime : 'N/A'}' (期望'08:30') → ${hqOnDutyOk ? '✅' : '❌'}`);
  console.log(`  offDutyTime='${hqGroup ? hqGroup.shift.offDutyTime : 'N/A'}' (期望'18:00') → ${hqOffDutyOk ? '✅' : '❌'}`);
  console.log(`  workdays='${hqGroup ? hqGroup.workdays : 'N/A'}' (期望'周一至周五') → ${hqWorkdaysOk ? '✅' : '❌'}`);
  console.log(`  graceLateMinutes=${hqGroup ? hqGroup.shift.graceLateMinutes : 'N/A'} (期望5) → ${hqGraceLateOk ? '✅' : '❌'}`);
  console.log(`  graceEarlyLeaveMinutes=${hqGroup ? hqGroup.shift.graceEarlyLeaveMinutes : 'N/A'} (期望5) → ${hqGraceEarlyOk ? '✅' : '❌'}`);
  console.log(`  isFlexible=${hqGroup ? hqGroup.shift.isFlexible : 'N/A'} (期望false) → ${hqFlexibleOk ? '✅' : '❌'}`);

  const employeeA = {
    id: 'EMP00001',
    name: '员工A-总部张工',
    dept1: 'D01',
    dept2: '技术部',
    position: '高级工程师',
    positionTag: '非教育岗',
    title: '工程师'
  };

  const employeeB = {
    id: 'EMP00002',
    name: '员工B-教育李老师',
    dept1: 'D02',
    dept2: '教学部',
    position: '讲师',
    positionTag: '教育岗',
    title: '教师'
  };

  const employeeC = {
    id: 'EMP00003',
    name: '员工C-高管王总监',
    dept1: 'D01',
    dept2: '总经办',
    position: '高管岗',
    positionTag: '高管免打卡岗',
    title: '总监'
  };

  console.log(`\n[TR-2.2.1] 员工考勤组匹配测试:`);
  const groupA = loader.getAttendanceGroupForEmployee(employeeA);
  const groupB = loader.getAttendanceGroupForEmployee(employeeB);
  const groupC = loader.getAttendanceGroupForEmployee(employeeC);

  console.log(`  员工A (dept1='D01'总部): 匹配组 id=${groupA ? groupA.id : 'null'}, name=${groupA ? groupA.name : 'null'}`);
  console.log(`  员工B (dept1='D02'教育): 匹配组 id=${groupB ? groupB.id : 'null'}, name=${groupB ? groupB.name : 'null'}`);
  console.log(`  员工C (positionTag='高管免打卡岗'): 匹配组 id=${groupC ? groupC.id : 'null'}, name=${groupC ? groupC.name : 'null'}, isExempt=${groupC ? groupC.isExempt : 'null'}`);

  const matchAOk = groupA && groupA.id === 'AG_HQ_XA' && groupA.type === ATTENDANCE_GROUP_TYPES.HQ;
  const matchBOk = groupB && groupB.id === 'AG_EDU' && groupB.type === ATTENDANCE_GROUP_TYPES.EDU;
  const matchCOk = groupC && groupC.id === 'AG_EXEC' && groupC.isExempt === true && groupC.type === ATTENDANCE_GROUP_TYPES.EXEC;

  console.log(`\n[TR-2.2.1] 校验3: 员工匹配正确性 (共4条校验, 员工C含isExempt校验):`);
  console.log(`  员工A→HQ组: ${matchAOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  员工B→EDU组: ${matchBOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  员工C→EXEC组: ${(groupC && groupC.id === 'AG_EXEC') ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  员工C组isExempt=true: ${(groupC && groupC.isExempt === true) ? '✅ PASS' : '❌ FAIL'}`);

  const pass =
    groupCountOk &&
    hqOnDutyOk &&
    hqOffDutyOk &&
    hqWorkdaysOk &&
    hqGraceLateOk &&
    hqGraceEarlyOk &&
    hqFlexibleOk &&
    matchAOk &&
    matchBOk &&
    matchCOk;

  console.log(`\n[TR-2.2.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR222() {
  console.log('\n========== TR-2.2.2: 免打卡名单交叉校验测试 ==========');

  const loader = new AttendanceGroupsLoader({ mode: 'mock' });
  await loader.loadGroups();

  const execEmployeeIds = [];
  for (let i = 1; i <= 10; i++) {
    execEmployeeIds.push(`EMP_EXEC${String(i).padStart(2, '0')}`);
  }

  const normalEmployeeIds = ['EMP_NORMAL01', 'EMP_NORMAL02'];

  console.log(`[TR-2.2.2] 构造场景: 10名高管 + 2名普通员工误设入免打卡名单`);
  console.log(`  高管员工: ${execEmployeeIds.join(', ')}`);
  console.log(`  普通员工(误设): ${normalEmployeeIds.join(', ')}`);

  loader.setExemptEmployeeIdsForGroup('AG_EXEC', [
    ...execEmployeeIds,
    ...normalEmployeeIds
  ]);

  const execApprovalMap = [];
  const futureExpireDate = new Date();
  futureExpireDate.setFullYear(futureExpireDate.getFullYear() + 1);
  const expireDateStr = futureExpireDate.toISOString().slice(0, 10);

  for (let i = 0; i < execEmployeeIds.length; i++) {
    execApprovalMap.push({
      employeeId: execEmployeeIds[i],
      approvals: [{
        approvalNo: `FR36-EXEC-${String(i + 1).padStart(3, '0')}`,
        expireDate: expireDateStr,
        approvedBy: '制度委员会',
        approveDate: '2026-01-15'
      }]
    });
  }

  console.log(`[TR-2.2.2] 已设置10名高管FR-3.6有效审批, expireDate=${expireDateStr}`);
  console.log(`[TR-2.2.2] 2名普通员工未设置任何审批`);

  loader.setExemptionApprovalMap(execApprovalMap);

  console.log(`\n[TR-2.2.2] 第1次调用 getUnauthorizedExemptions()...`);
  const unauthorized1 = loader.getUnauthorizedExemptions();
  console.log(`[TR-2.2.2] 返回异常列表 size=${unauthorized1.length}`);
  unauthorized1.forEach((item, idx) => {
    console.log(`  异常#${idx + 1}: employeeId=${item.employeeId}, reason=${item.reason}, checkedDate=${item.checkedDate}`);
  });

  const unauthorizedIds1 = unauthorized1.map(u => u.employeeId).sort();
  const expectedIds1 = [...normalEmployeeIds].sort();
  const firstCheckOk =
    unauthorized1.length === 2 &&
    unauthorizedIds1.join(',') === expectedIds1.join(',');

  console.log(`\n[TR-2.2.2] 校验1: 异常列表size=2且精确为2名普通员工?`);
  console.log(`  期望size=2, 实际size=${unauthorized1.length} → ${unauthorized1.length === 2 ? '✅' : '❌'}`);
  console.log(`  期望员工=${expectedIds1.join(',')}`);
  console.log(`  实际员工=${unauthorizedIds1.join(',')} → ${unauthorizedIds1.join(',') === expectedIds1.join(',') ? '✅' : '❌'}`);

  console.log(`\n[TR-2.2.2] 为2名普通员工添加FR-3.6审批单...`);
  for (const normalId of normalEmployeeIds) {
    loader.addExemptionApproval(normalId, {
      approvalNo: `FR36-NORMAL-${normalId}`,
      expireDate: expireDateStr,
      approvedBy: '制度委员会-补录',
      approveDate: '2026-08-10'
    });
  }
  console.log(`[TR-2.2.2] 已为 ${normalEmployeeIds.join(', ')} 添加有效审批单`);

  console.log(`\n[TR-2.2.2] 第2次调用 getUnauthorizedExemptions()...`);
  const unauthorized2 = loader.getUnauthorizedExemptions();
  console.log(`[TR-2.2.2] 返回异常列表 size=${unauthorized2.length}`);
  if (unauthorized2.length > 0) {
    unauthorized2.forEach((item, idx) => {
      console.log(`  异常#${idx + 1}: employeeId=${item.employeeId}, reason=${item.reason}`);
    });
  } else {
    console.log(`  (无异常, 列表为空)`);
  }

  const secondCheckOk = unauthorized2.length === 0;
  console.log(`\n[TR-2.2.2] 校验2: 第2次异常列表size=0? → ${secondCheckOk ? '✅' : '❌'}`);

  console.log(`\n[TR-2.2.2] 附加验证: 再次调用hasValidExemptionApproval确认审批生效:`);
  for (const empId of [...execEmployeeIds.slice(0, 3), ...normalEmployeeIds]) {
    const valid = loader.hasValidExemptionApproval(empId);
    console.log(`  ${empId}: hasValidApproval=${valid} ✅`);
  }

  const pass = firstCheckOk && secondCheckOk;
  console.log(`\n[TR-2.2.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('============================================================');
  console.log('智慧化人资平台 Task2.2 考勤组与规则自动读取 测试套件');
  console.log('============================================================');

  console.log('\n输出文件路径:');
  console.log('  模块文件: src/modules/attendance/attendance_groups_loader.js');
  console.log('  测试文件: test_task22.js (本文件)');

  const p1 = await test_TR221();
  const p2 = await test_TR222();

  console.log('\n============================================================');
  console.log('测试总结:');
  console.log(`  TR-2.2.1 (考勤组加载+员工匹配): ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.2.2 (免打卡名单交叉校验):   ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体: ${(p1 && p2) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('============================================================');
})();
