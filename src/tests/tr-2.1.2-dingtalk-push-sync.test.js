'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { EmployeeModel, EMPLOYEE_STATUS } = require('../modules/master_data/employee_model.js');
const { DingtalkClient, DingtalkContactSync, CONFLICT_STRATEGY, MissingApprovalError } = require('../integrations/dingtalk_contact_sync.js');

function makeValidIdCard(baseNum) {
  const prefix = '610101';
  const year = 1985 + (baseNum % 30);
  const month = String(((baseNum % 12) + 1)).padStart(2, '0');
  const day = String(((baseNum % 27) + 1)).padStart(2, '0');
  const seq = String(100 + baseNum % 900).padStart(3, '0');
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const first17 = prefix + year + month + day + seq;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(first17.charAt(i), 10) * weights[i];
  return first17 + codes[sum % 11];
}

function makeValidMobile(baseNum) {
  const tail = String(13800000000 + baseNum).padStart(10, '0');
  return '1' + tail.substring(tail.length - 10);
}

function setupInitialData(registry, client) {
  const leaderEmp = new EmployeeModel({
    id: 'E000099',
    name: '孙总监',
    idCard: makeValidIdCard(99),
    mobile: makeValidMobile(99),
    entity: '陕西康源福祉教育科技',
    dept1: '总部',
    dept2: '综合管理部',
    position: 'HR总监',
    directLeader: null,
    entryDate: new Date('2018-01-01'),
    payrollGrade: 'G08',
    status: EMPLOYEE_STATUS.REGULAR,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  registry._employees.set('E000099', leaderEmp);
  registry._mobileIndex.set(leaderEmp.mobile, 'E000099');
  registry._idCardIndex.set(leaderEmp.idCard, 'E000099');
  registry._employeeCounter = 100;

  client._mockUsers.set('DT000099', {
    dingtalkUserId: 'DT000099',
    name: '孙总监',
    mobile: makeValidMobile(99),
    idCard: makeValidIdCard(99),
    deptId: 'D0101',
    position: 'HR总监',
    directLeaderDingtalkId: null,
    entryDate: '2018-01-01',
    payrollGrade: 'G08',
    entity: '陕西康源福祉教育科技'
  });

  const emp1 = new EmployeeModel({
    id: 'E000001',
    name: '张伟',
    idCard: makeValidIdCard(1),
    mobile: '13800000001',
    entity: '陕西康源福祉教育科技',
    dept1: '综合管理部',
    dept2: '人事组',
    position: 'HR专员',
    directLeader: null,
    entryDate: new Date('2022-01-15'),
    payrollGrade: 'G03',
    status: EMPLOYEE_STATUS.REGULAR,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  registry._employees.set('E000001', emp1);
  registry._mobileIndex.set('13800000001', 'E000001');
  registry._idCardIndex.set(makeValidIdCard(1), 'E000001');

  registry.bindDingtalkUser('E000001', { dingtalkUserId: 'DT000001', deptId: 'D010101' });
  registry.bindDingtalkUser('E000099', { dingtalkUserId: 'DT000099', deptId: 'D0101' });

  return { emp1, leaderEmp };
}

test('TR-2.1.2: 系统修改E000001+approvalNo→pushToDingtalk成功；无审批号抛MissingApprovalError', async (t) => {
  await t.test('场景A：pushToDingtalk不带approvalNo → 立即抛MissingApprovalError', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });
    setupInitialData(registry, client);

    let threw = false;
    try {
      await sync.pushToDingtalk('E000001', {
        approvedChangeFields: { directLeader: 'E000099' }
      });
    } catch (err) {
      threw = true;
      console.log(`  [场景A] 预期异常: ${err.name} message=${err.message}`);
      assert.equal(err.name, 'MissingApprovalError', `异常名应为MissingApprovalError，实际=${err.name}`);
    }

    assert.equal(threw, true, '应抛出MissingApprovalError');
    console.log(`  ✓ 场景A通过：无approvalNo → MissingApprovalError`);
    sync.stop();
  });

  await t.test('场景B：E000001原directLeader=null，修改为E000099+approvalNo=APPROVAL-DIR-001 → push成功，mock钉钉同步更新', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });

    sync.configureRetry({ retryAccelerationFactor: 1000 });

    const { emp1 } = setupInitialData(registry, client);

    const dtUserBefore = client.getMockUser('DT000001');
    console.log(`  [场景B-改前] E000001.directLeader=${emp1.directLeader}`);
    console.log(`  [场景B-改前] 钉钉DT000001.directLeaderDingtalkId=${dtUserBefore ? '查看内部存储' : 'N/A'}`);
    console.log(`  [场景B-改前] 钉钉内部DT000001.directLeaderDingtalkId=${client._mockUsers.get('DT000001').directLeaderDingtalkId}`);

    const pushResult = await sync.pushToDingtalk('E000001', {
      approvedChangeFields: { directLeader: 'E000099' },
      approvalNo: 'APPROVAL-DIR-001'
    });

    console.log(`  [场景B-回写结果] success=${pushResult.success}, updated=${pushResult.updated}`);
    assert.equal(pushResult.success, true, 'push应返回success=true');
    assert.ok(pushResult.updated >= 1, `updated应≥1，实际=${pushResult.updated}`);

    const dtUserAfter = client._mockUsers.get('DT000001');
    const systemEmpAfter = registry.findById('E000001');

    console.log(`  [场景B-改后] 系统E000001.directLeader=${systemEmpAfter.directLeader}`);
    console.log(`  [场景B-改后] 钉钉DT000001.directLeaderDingtalkId=${dtUserAfter.directLeaderDingtalkId}`);
    console.log(`  [场景B-改后] 系统approvalNo=${systemEmpAfter.approvalNo}`);

    assert.equal(systemEmpAfter.directLeader, 'E000099', `系统directLeader应=E000099，实际=${systemEmpAfter.directLeader}`);
    assert.equal(dtUserAfter.directLeaderDingtalkId, 'DT000099', `钉钉directLeaderDingtalkId应=DT000099，实际=${dtUserAfter.directLeaderDingtalkId}`);
    assert.equal(systemEmpAfter.approvalNo, 'APPROVAL-DIR-001', `approvalNo应=APPROVAL-DIR-001，实际=${systemEmpAfter.approvalNo}`);

    const auditEntries = sync.auditLog.all.filter(a => a.action === 'push_update' && a.employeeId === 'E000001');
    console.log(`  [场景B-AuditLog] push_update条目数=${auditEntries.length}`);
    if (auditEntries.length > 0) {
      const entry = auditEntries[0];
      console.log(`    approvalNo=${entry.approvalNo}, updatedFields=${JSON.stringify(entry.updatedFields)}`);
      assert.equal(entry.approvalNo, 'APPROVAL-DIR-001', `AuditLog approvalNo应一致`);
    }

    console.log(`  ✓ 场景B通过：directLeader同步回写钉钉成功`);
    sync.stop();
  });

  await t.test('场景C：5字段全部修改+approvalNo → 全部同步到mock钉钉', async () => {
    const registry = new EmployeeRegistry();
    const client = new DingtalkClient({ mode: 'mock' });
    const sync = new DingtalkContactSync({
      client,
      registry,
      mode: 'mock',
      conflictStrategy: CONFLICT_STRATEGY.DINGTALK_PRIMARY
    });
    sync.configureRetry({ retryAccelerationFactor: 1000 });

    setupInitialData(registry, client);

    const pushResult = await sync.pushToDingtalk('E000001', {
      approvedChangeFields: {
        directLeader: 'E000099',
        dept1: '教育事业部',
        dept2: '教研中心',
        mobile: makeValidMobile(1),
        name: '张伟伟'
      },
      approvalNo: 'APPROVAL-ALL-002'
    });

    console.log(`  [场景C-回写结果] success=${pushResult.success}, updated=${pushResult.updated}`);
    assert.equal(pushResult.success, true, 'push应成功');

    const dtUserAfter = client._mockUsers.get('DT000001');
    const systemEmpAfter = registry.findById('E000001');

    console.log(`  [场景C-验证] name系统=${systemEmpAfter.name} 钉钉=${dtUserAfter.name}`);
    console.log(`  [场景C-验证] mobile系统=${systemEmpAfter.mobile} 钉钉=${dtUserAfter.mobile}`);
    console.log(`  [场景C-验证] deptId钉钉=${dtUserAfter.deptId}`);
    console.log(`  [场景C-验证] directLeader钉钉=${dtUserAfter.directLeaderDingtalkId}`);

    assert.equal(systemEmpAfter.name, '张伟伟', '系统name应更新');
    assert.equal(dtUserAfter.name, '张伟伟', '钉钉name应更新');
    assert.equal(systemEmpAfter.mobile, makeValidMobile(1), '系统mobile应更新');
    assert.equal(dtUserAfter.mobile, makeValidMobile(1), '钉钉mobile应更新');
    assert.equal(dtUserAfter.deptId, 'D010201', '钉钉deptId应映射到教研中心D010201');
    assert.equal(dtUserAfter.directLeaderDingtalkId, 'DT000099', '钉钉directLeader应更新');

    console.log(`  ✓ 场景C通过：5字段全部同步回写成功`);
    sync.stop();
  });

  console.log('\n  ===== TR-2.1.2 测试完成 pushToDingtalk成功 =====\n');
});
