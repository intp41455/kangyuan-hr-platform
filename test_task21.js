const EmployeeRegistry = require('./src/models/EmployeeRegistry');
const AlertQueue = require('./src/services/AlertQueue');
const {
  MissingApprovalError,
  SyncLog,
  DingTalkClient,
  ContactSyncResolver,
  EventSubscriber,
  SyncScheduler,
  ContactSync
} = require('./src/integrations/dingtalk_contact_sync');

function makeBasicEmpId(i) {
  return `EMP${String(i).padStart(5, '0')}`;
}

function makeBasicDdId(i) {
  return `LOCAL_DD${String(i).padStart(4, '0')}`;
}

function buildRegistryWithLocal100() {
  const r = new EmployeeRegistry();
  const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高'];
  const lastNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛'];
  const depts = [101, 102, 103, 104, 105];
  const titles = ['工程师', '经理', '主管', '专员', '总监', '助理'];
  for (let i = 1; i <= 100; i++) {
    const firstName = firstNames[(i - 1) % firstNames.length];
    const lastName = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
    r.add({
      id: makeBasicEmpId(i),
      name: firstName + lastName + 'L',
      email: `local_emp${i}@company.com`,
      mobile: `138${String(10000000 + i).slice(-8)}`,
      dingtalkUserId: makeBasicDdId(i),
      department: depts[i % depts.length],
      title: titles[i % titles.length],
      directLeader: i > 1 ? makeBasicEmpId(((i - 2) % 10) + 1) : null,
      status: 'active',
      entryDate: `202${i % 5}-${String((i % 12) + 1).padStart(2, '0')}-01`
    });
  }
  return r;
}

function buildDdUsersFromRegistry(registry, count = 100) {
  const result = [];
  for (let i = 1; i <= count; i++) {
    const emp = registry.getById(makeBasicEmpId(i));
    result.push({
      dingtalkUserId: emp.dingtalkUserId,
      name: emp.name,
      email: emp.email,
      mobile: emp.mobile,
      department: emp.department,
      title: emp.title,
      status: emp.status,
      directLeaderDingId: null
    });
  }
  return result;
}

async function test_TR211() {
  console.log('\n========== TR-2.1.1: pullFromDingtalk 幂等同步测试 ==========');
  const registry = buildRegistryWithLocal100();
  const sizeBefore = registry.size();
  console.log(`[TR-2.1.1] EmployeeRegistry 初始 size = ${sizeBefore}`);

  const dingTalkClient = new DingTalkClient({ mode: 'mock' });
  const baseUsers = buildDdUsersFromRegistry(registry, 100);
  dingTalkClient._mockUsers = [];
  dingTalkClient._injectMockUsers(baseUsers);

  const newTenUsers = [];
  for (let i = 1; i <= 10; i++) {
    newTenUsers.push({
      dingtalkUserId: `NEW_DD${String(i).padStart(3, '0')}`,
      name: `钉钉新员工${i}`,
      email: `newdd${i}@company.com`,
      mobile: `137${String(80000000 + i).slice(-8)}`,
      department: 100 + ((i % 10) + 1),
      title: '新入职员工',
      directLeaderDingId: i > 3 ? makeBasicDdId(((i - 2) % 5) + 1) : null,
      status: 'active'
    });
  }
  dingTalkClient._injectMockUsers(newTenUsers);
  console.log(`[TR-2.1.1] 钉钉Mock: 基础100用户（完全对应本地）+ 新增10用户 = 总Mock用户数=${dingTalkClient.getMockUserCount()}`);

  const syncLog = new SyncLog();
  const alertQueue = new AlertQueue();
  const resolver = new ContactSyncResolver({ sourceOfTruth: 'dingtalk' });
  const contactSync = new ContactSync({
    employeeRegistry: registry,
    dingTalkClient,
    resolver,
    syncLog,
    alertQueue
  });

  console.log('[TR-2.1.1] 第一次调用 pullFromDingtalk...');
  const r1 = await contactSync.pullFromDingtalk();
  const sizeAfterPull1 = registry.size();
  console.log(`[TR-2.1.1] 第一次pull结果: diff=${JSON.stringify(r1.diff)}, 当前Registry size=${sizeAfterPull1}`);

  console.log('[TR-2.1.1] 第二次调用 pullFromDingtalk（验证幂等）...');
  const r2 = await contactSync.pullFromDingtalk();
  const sizeAfterPull2 = registry.size();
  console.log(`[TR-2.1.1] 第二次pull结果: diff=${JSON.stringify(r2.diff)}, 当前Registry size=${sizeAfterPull2}`);

  console.log(`[TR-2.1.1] SyncLog 总条数=${syncLog.size()}`);
  syncLog.getAll().forEach((l, idx) => {
    console.log(`  Log#${idx + 1}: direction=${l.direction}, pullOrPush=${l.pullOrPush}, affectedCount=${l.affectedCount}, success=${l.success}`);
  });

  const ddPullLogs = syncLog.getAll().filter(l => l.direction === 'dingtalk->registry');
  const firstAffected = ddPullLogs.length > 0 ? ddPullLogs[0].affectedCount : -1;
  const secondAffected = ddPullLogs.length > 1 ? ddPullLogs[1].affectedCount : -1;

  const pass =
    sizeBefore === 100 &&
    sizeAfterPull1 === 110 &&
    sizeAfterPull2 === 110;

  const extraPass = firstAffected === 10 && secondAffected === 0;

  console.log(`[TR-2.1.1] 校验: 初始100=${sizeBefore}, 第一次后110=${sizeAfterPull1}, 第二次后110=${sizeAfterPull2}`);
  console.log(`[TR-2.1.1] 校验: 第一条pull affectedCount=${firstAffected}(期望10), 第二条pull affectedCount=${secondAffected}(期望0)`);
  console.log(`[TR-2.1.1] 结果: ${(pass && extraPass) ? '✅ PASS' : '❌ FAIL'}`);
  return pass && extraPass;
}

async function test_TR212() {
  console.log('\n========== TR-2.1.2: pushApprovedChangesToDingtalk 审批后回写 ==========');
  const registry = buildRegistryWithLocal100();
  const sizeBefore = registry.size();
  console.log(`[TR-2.1.2] EmployeeRegistry size=${sizeBefore}`);

  const dingTalkClient = new DingTalkClient({ mode: 'mock' });
  const baseUsers = buildDdUsersFromRegistry(registry, 100);
  dingTalkClient._mockUsers = [];
  dingTalkClient._injectMockUsers(baseUsers);
  console.log(`[TR-2.1.2] 已注入100个钉钉Mock用户，对应本地100名员工`);

  const syncLog = new SyncLog();
  const alertQueue = new AlertQueue();
  const resolver = new ContactSyncResolver({ sourceOfTruth: 'dingtalk' });
  const contactSync = new ContactSync({
    employeeRegistry: registry,
    dingTalkClient,
    resolver,
    syncLog,
    alertQueue
  });

  const empA = registry.getById(makeBasicEmpId(5));
  const empB = registry.getById(makeBasicEmpId(18));
  const newLeader = registry.getById(makeBasicEmpId(99));
  console.log(`[TR-2.1.2] 修改前: EMP00005 directLeader=${empA.directLeader}, EMP00018 directLeader=${empB.directLeader}`);
  console.log(`[TR-2.1.2] 新的直属上级: ${newLeader.id} (dingtalkUserId=${newLeader.dingtalkUserId})`);

  registry.update(empA.id, { directLeader: newLeader.id });
  registry.update(empB.id, { directLeader: newLeader.id });
  console.log(`[TR-2.1.2] 本地已更新: EMP00005 directLeader=${registry.getById(empA.id).directLeader}, EMP00018 directLeader=${registry.getById(empB.id).directLeader}`);

  const pendingChanges = [
    {
      employeeId: empA.id,
      dingtalkUserId: empA.dingtalkUserId,
      updates: { directLeader: newLeader.id }
    },
    {
      employeeId: empB.id,
      dingtalkUserId: empB.dingtalkUserId,
      updates: { directLeader: newLeader.id }
    }
  ];

  const approvalNo = 'APP-2026-022';
  console.log(`[TR-2.1.2] 调用pushApprovedChangesToDingtalk，审批单号=${approvalNo}，变更人数=2`);
  const pushResult = await contactSync.pushApprovedChangesToDingtalk({ pendingChanges, approvalNo });
  console.log(`[TR-2.1.2] push成功: totalPushed=${pushResult.totalPushed}, errors=${JSON.stringify(pushResult.errors)}`);
  console.log('[TR-2.1.2] 钉钉侧返回的更新记录:');
  pushResult.updatedRecords.forEach((r, i) => {
    console.log(`  记录#${i + 1}: dingtalkUserId=${r.dingtalkUserId}, name=${r.name}, directLeaderDingId=${r.directLeaderDingId}`);
  });

  let missingApprovalErrorThrown = false;
  console.log('[TR-2.1.2] 尝试不填approvalNo推送（预期抛出MissingApprovalError）...');
  try {
    await contactSync.pushApprovedChangesToDingtalk({ pendingChanges, approvalNo: null });
    console.log('[TR-2.1.2] ❌ 未抛出异常！');
  } catch (err) {
    if (err instanceof MissingApprovalError || err.name === 'MissingApprovalError') {
      missingApprovalErrorThrown = true;
      console.log(`[TR-2.1.2] ✅ 正确抛出MissingApprovalError: ${err.message}`);
    } else {
      console.log(`[TR-2.1.2] ❌ 异常类型错误: ${err.name} - ${err.message}`);
    }
  }

  const pushLog = syncLog.getAll().find(l => l.approvalNo === approvalNo);
  const pass =
    pushResult.totalPushed === 2 &&
    pushResult.updatedRecords.length === 2 &&
    pushResult.updatedRecords[0].directLeaderDingId === newLeader.dingtalkUserId &&
    pushResult.updatedRecords[1].directLeaderDingId === newLeader.dingtalkUserId &&
    missingApprovalErrorThrown === true &&
    pushLog && pushLog.approvalNo === approvalNo && pushLog.affectedCount === 2;

  console.log(`[TR-2.1.2] 校验: pushed=2=${pushResult.totalPushed}, 钉钉侧2人directLeaderDingId更新=${newLeader.dingtalkUserId}`);
  console.log(`[TR-2.1.2] 校验: MissingApprovalError抛出=${missingApprovalErrorThrown}, SyncLog中approvalNo正确=${pushLog ? pushLog.approvalNo : 'N/A'}`);
  console.log(`[TR-2.1.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR213() {
  console.log('\n========== TR-2.1.3: SyncScheduler 网络故障-重试-管理员报警 ==========');
  const registry = buildRegistryWithLocal100();
  console.log(`[TR-2.1.3] EmployeeRegistry初始size=${registry.size()}`);

  const dingTalkClient = new DingTalkClient({ mode: 'mock' });
  const baseUsers = buildDdUsersFromRegistry(registry, 100);
  dingTalkClient._mockUsers = [];
  dingTalkClient._injectMockUsers(baseUsers);
  const newTenUsers = [];
  for (let i = 1; i <= 10; i++) {
    newTenUsers.push({
      dingtalkUserId: `NEW_DD_TR3${String(i).padStart(3, '0')}`,
      name: `故障测试新员工${i}`,
      email: `tr3_new${i}@company.com`,
      mobile: `136${String(80000000 + i).slice(-8)}`,
      department: 100 + ((i % 10) + 1),
      title: '故障测试员工',
      directLeaderDingId: null,
      status: 'active'
    });
  }
  dingTalkClient._injectMockUsers(newTenUsers);
  console.log(`[TR-2.1.3] Mock用户总数=${dingTalkClient.getMockUserCount()}（100本地对应+10新增）`);

  dingTalkClient.setNetworkFailurePattern(999);
  console.log('[TR-2.1.3] 设置网络故障：前999次fetch调用均失败（模拟3轮调度都无法成功）');

  const syncLog = new SyncLog();
  const alertQueue = new AlertQueue();
  const resolver = new ContactSyncResolver({ sourceOfTruth: 'dingtalk' });
  const contactSync = new ContactSync({
    employeeRegistry: registry,
    dingTalkClient,
    resolver,
    syncLog,
    alertQueue
  });
  const scheduler = new SyncScheduler({
    contactSync,
    syncLog,
    alertQueue,
    maxRetries: 3,
    backoffDelays: [5, 10, 15],
    failureThresholdForAlert: 3
  });

  const sizeBeforeFail = registry.size();
  console.log(`[TR-2.1.3] >>> 触发第1次同步（网络故障），连续失败计数将=1`);
  const r1 = await scheduler.triggerNow();
  console.log(`[TR-2.1.3] 第1次同步: success=${r1.success}, retryCount=${r1.retryCount}, consecutiveFailures=${scheduler.getConsecutiveFailures()}, Registry size=${registry.size()}`);

  console.log(`[TR-2.1.3] >>> 触发第2次同步（网络故障），连续失败计数将=2`);
  const r2 = await scheduler.triggerNow();
  console.log(`[TR-2.1.3] 第2次同步: success=${r2.success}, consecutiveFailures=${scheduler.getConsecutiveFailures()}`);

  console.log(`[TR-2.1.3] >>> 触发第3次同步（网络故障），连续失败计数达到阈值=3，应触发critical报警`);
  const r3 = await scheduler.triggerNow();
  console.log(`[TR-2.1.3] 第3次同步: success=${r3.success}, consecutiveFailures=${scheduler.getConsecutiveFailures()}`);

  const criticalAlerts = alertQueue.getByLevel('critical');
  console.log(`[TR-2.1.3] 管理员报警队列critical级别条数=${criticalAlerts.length}`);
  criticalAlerts.forEach((a, i) => console.log(`  报警#${i + 1}: level=${a.level}, message=${a.message}`));

  console.log(`[TR-2.1.3] >>> 修复网络（threshold=0），并重置scheduler连续失败计数，触发第4次同步（期望成功，新增10）`);
  dingTalkClient.setNetworkFailurePattern(0);
  scheduler.resetFailures();
  const sizeBeforeSuccess = registry.size();
  const r4 = await scheduler.triggerNow();
  console.log(`[TR-2.1.3] 第4次同步: success=${r4.success}, attempt=${r4.attempt}, diff=${r4.result ? JSON.stringify(r4.result.diff) : 'N/A'}`);
  console.log(`[TR-2.1.3] Registry size 前=${sizeBeforeSuccess}, 后=${registry.size()}`);

  console.log(`[TR-2.1.3] >>> SyncLog完整链路（共${syncLog.size()}条）:`);
  syncLog.getAll().forEach((l, idx) => {
    console.log(`  Log#${idx + 1}: ts=${l.ts.slice(11, 23)}, direction=${l.direction}, pullOrPush=${l.pullOrPush}, retryCount=${l.retryCount}, affectedCount=${l.affectedCount}, success=${l.success}, errors=${JSON.stringify(l.errors)}`);
  });

  const pass =
    criticalAlerts.length >= 1 &&
    criticalAlerts[0].level === 'critical' &&
    registry.size() === sizeBeforeFail + 10 &&
    syncLog.size() >= 4;

  console.log(`[TR-2.1.3] 校验: critical报警条数=${criticalAlerts.length}(期望>=1), 第1条level=${criticalAlerts.length > 0 ? criticalAlerts[0].level : 'N/A'}(期望critical)`);
  console.log(`[TR-2.1.3] 校验: 修复后Registry size=${registry.size()}(期望${sizeBeforeFail + 10})，SyncLog条数=${syncLog.size()}(期望>=4)`);
  console.log(`[TR-2.1.3] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('============================================================');
  console.log('智慧化人资平台 Task2.1 钉钉通讯录双向同步 测试套件');
  console.log('============================================================');

  const p1 = await test_TR211();
  const p2 = await test_TR212();
  const p3 = await test_TR213();

  console.log('\n============================================================');
  console.log('测试总结:');
  console.log(`  TR-2.1.1: ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.1.2: ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.1.3: ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('============================================================');
})();
