'use strict';

const {
  LeavePrepayExemptionController,
  ProbationBlockedError,
  MissingApprovalError,
  APPROVAL_NODES,
  EXEMPTION_TYPES,
  EXEMPTION_STATUS
} = require('./src/modules/leave/leave_prepay_exemption_controller.js');

const {
  EmployeeModel,
  EMPLOYEE_STATUS
} = require('./src/modules/master_data/employee_model.js');

const AlertQueue = require('./src/services/AlertQueue.js');
const dayjs = require('dayjs');

async function test_TR321() {
  console.log('\n========== TR-3.2.1: 员工B试用期预支拦截+转正4天二级审批+预支余额更新 ==========');

  const alertQueue = new AlertQueue();
  const controller = new LeavePrepayExemptionController({ alertQueue });

  console.log('[TR-3.2.1] 第1部分：试用期员工B申请预支年假3天 → 抛出ProbationBlockedError');
  const employeeB_probation = new EmployeeModel({
    id: 'EMP-B002',
    name: '员工B',
    entity: '陕西康源福祉教育科技',
    dept1: '教学管理中心',
    dept2: '幼教部',
    position: '配班老师',
    positionTag: '教育岗',
    entryDate: new Date('2026-03-15'),
    regularDate: new Date('2026-09-15'),
    status: EMPLOYEE_STATUS.PROBATION,
    payrollGrade: 'EDU-T2',
    firstWorkDate: new Date('2026-03-15'),
    directLeader: 'EMP-LEAD-001'
  });

  console.log(`  员工B信息: id=${employeeB_probation.id}, name=${employeeB_probation.name}`);
  console.log(`  status=${employeeB_probation.status} (PROBATION=试用期)`);
  console.log(`  申请: 预支年假 days=3`);

  let thrownError = null;
  try {
    await controller.requestPrepayAnnualLeave({
      employee: employeeB_probation,
      days: 3,
      reason: '家中有事，需要提前请假',
      approvalForm: { formType: 'PREPAY_ANNUAL', submitter: 'EMP-B002' }
    });
  } catch (err) {
    thrownError = err;
  }

  console.log(`\n  异常校验:`);
  const isProbationError = thrownError instanceof ProbationBlockedError;
  const hasCorrectMessage = thrownError && thrownError.message === '试用期员工不得预支年假，请转正后再申请';
  console.log(`    抛出异常: ${thrownError ? thrownError.name : '无'}`);
  console.log(`    instanceof ProbationBlockedError: ${isProbationError}`);
  console.log(`    message内容: "${thrownError ? thrownError.message : 'N/A'}"`);
  console.log(`    message等于预期: ${hasCorrectMessage}`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('[TR-3.2.1] 第2部分：员工B转正(status=REGULAR)，申请预支4天 → 二级审批链路+审批通过后预支额度+4');

  const employeeB_regular = new EmployeeModel({
    id: 'EMP-B002',
    name: '员工B',
    entity: '陕西康源福祉教育科技',
    dept1: '教学管理中心',
    dept2: '幼教部',
    position: '配班老师',
    positionTag: '教育岗',
    entryDate: new Date('2026-03-15'),
    regularDate: new Date('2026-09-15'),
    status: EMPLOYEE_STATUS.REGULAR,
    payrollGrade: 'EDU-T2',
    firstWorkDate: new Date('2024-03-15'),
    directLeader: 'EMP-LEAD-001',
    deptHead: 'EMP-DEPT-001'
  });

  console.log(`  员工B转正状态: status=${employeeB_regular.status}`);
  console.log(`  申请: 预支年假 days=4 (≤5，二级审批)`);

  const prepayResult = await controller.requestPrepayAnnualLeave({
    employee: employeeB_regular,
    days: 4,
    reason: '年假提前预支，8月下旬家庭旅行',
    approvalForm: { formType: 'PREPAY_ANNUAL', submitter: 'EMP-B002' }
  });

  console.log(`\n  审批链路解析结果:`);
  console.log(`    approvalNo: ${prepayResult.approvalNo}`);
  console.log(`    approvalChain节点数: ${prepayResult.approvalChain.length}`);

  for (let i = 0; i < prepayResult.approvalChain.length; i++) {
    const node = prepayResult.approvalChain[i];
    console.log(`      [${i + 1}] node=${node.node}, name=${node.name}, missing=${node.missing || false}`);
  }

  const expectedChain = [APPROVAL_NODES.DIRECT_LEADER, APPROVAL_NODES.DEPT_HEAD];
  const actualChain = prepayResult.approvalChain.map(n => n.node);
  const chainMatchTwoNodes = actualChain.length === 2 &&
    actualChain[0] === expectedChain[0] &&
    actualChain[1] === expectedChain[1];
  console.log(`\n  审批链路校验: 预期=2节点[DIRECT_LEADER,DEPT_HEAD], 实际=${JSON.stringify(actualChain)}`);
  console.log(`    链路匹配: ${chainMatchTwoNodes}`);

  const approversMap = {
    [APPROVAL_NODES.DIRECT_LEADER]: { id: 'EMP-LEAD-001', name: '李主任' },
    [APPROVAL_NODES.DEPT_HEAD]: { id: 'EMP-DEPT-001', name: '王部长' }
  };

  const simResult = controller.simulateApprovalChain({
    approvalChain: prepayResult.approvalChain,
    approversMap,
    simulateAllPass: true
  });

  console.log(`\n  三级审批模拟执行结果:`);
  console.log(`    completedNodes数: ${simResult.completedNodes.length}`);
  for (const cn of simResult.completedNodes) {
    console.log(`      ✓ node=${cn.node}, approver=${cn.approverName}, status=${cn.status}`);
  }
  console.log(`    missingNodes数: ${simResult.missingNodes.length}`);
  console.log(`    alertMessages数: ${simResult.alertMessages.length}`);
  console.log(`    allPassed: ${simResult.allPassed}`);

  const approvalPassed = simResult.allPassed === true && simResult.missingNodes.length === 0;

  const year = dayjs().year();
  controller.ensureLeaveBalance(employeeB_regular.id, year, 5);

  const balanceBefore = controller.getLeaveBalance(employeeB_regular.id, year);
  console.log(`\n  LeaveEngine余额更新(审批通过后):`);
  console.log(`    审批前 prepayGranted=${balanceBefore ? balanceBefore.prepayGranted : 0}天`);

  const updateResult = controller.approvePrepayAndUpdateBalance({
    approvalNo: prepayResult.approvalNo,
    employeeId: employeeB_regular.id,
    days: 4,
    year
  });

  const balanceAfter = controller.getLeaveBalance(employeeB_regular.id, year);
  console.log(`    调用approvePrepayAndUpdateBalance()...`);
  console.log(`    审批后 prepayGranted=${balanceAfter ? balanceAfter.prepayGranted : 0}天`);

  const prepayIncreased = balanceAfter && balanceAfter.prepayGranted === 4;
  const hasPrepayRecord = controller.listPrepayRecords(employeeB_regular.id).length >= 1;

  console.log(`\n  预支记录清单:`);
  const prepayRecs = controller.listPrepayRecords(employeeB_regular.id);
  for (const rec of prepayRecs) {
    console.log(`    prepayId=${rec.prepayId}, days=${rec.days}, approvalNo=${rec.approvalNo}, effectiveDate=${rec.effectiveDate}, status=${rec.status}`);
  }

  const errorThrownCorrect = isProbationError && hasCorrectMessage;
  const chainCorrect = chainMatchTwoNodes;
  const simPassed = approvalPassed;
  const balanceUpdated = prepayIncreased && hasPrepayRecord;

  console.log(`\n[TR-3.2.1] 校验清单:`);
  console.log(`  1. 试用期抛出ProbationBlockedError: ${errorThrownCorrect ? '✅' : '❌'}`);
  console.log(`     · instanceof=${isProbationError}, message="${thrownError ? thrownError.message : 'N/A'}"`);
  console.log(`  2. 转正4天=二级审批链路(DIRECT→DEPT): ${chainCorrect ? '✅' : '❌'}`);
  console.log(`     · 节点数=${actualChain.length}, 顺序=${JSON.stringify(actualChain)}`);
  console.log(`  3. 模拟审批全部通过: ${simPassed ? '✅' : '❌'}`);
  console.log(`     · completed=${simResult.completedNodes.length}, missing=${simResult.missingNodes.length}`);
  console.log(`  4. LeaveEngine预支余额+4天: ${balanceUpdated ? '✅' : '❌'}`);
  console.log(`     · prepayGranted=${balanceAfter ? balanceAfter.prepayGranted : 0}, 记录数=${prepayRecs.length}`);

  const pass = errorThrownCorrect && chainCorrect && simPassed && balanceUpdated;
  console.log(`\n[TR-3.2.1] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR322() {
  console.log('\n========== TR-3.2.2: 员工C预支7天(>5)三级审批+缺失分管副总报警+createExemption+每月1号导出 ==========');

  const alertQueue = new AlertQueue();
  const controller = new LeavePrepayExemptionController({ alertQueue });

  console.log('[TR-3.2.2] 第1部分：员工C转正，申请预支7天(>5阈值) → 三级审批链路[直属,部门,分管副总]完整');

  const employeeC = new EmployeeModel({
    id: 'EMP-C003',
    name: '员工C',
    entity: '上海康源博曜科技',
    dept1: '研发中心',
    dept2: '产品研发部',
    position: '高级产品经理',
    positionTag: '非教育岗',
    entryDate: new Date('2020-05-01'),
    regularDate: new Date('2020-08-01'),
    status: EMPLOYEE_STATUS.REGULAR,
    payrollGrade: 'TEC-P5',
    firstWorkDate: new Date('2018-07-01'),
    directLeader: 'EMP-LEAD-C01',
    vicePresident: 'EMP-VP-002'
  });

  console.log(`  员工C: id=${employeeC.id}, status=${employeeC.status}`);
  console.log(`  申请: 预支年假 days=7 (>5，三级审批)`);
  console.log(`  vicePresident字段已配置=${employeeC.vicePresident !== undefined}`);

  const prepayResult = await controller.requestPrepayAnnualLeave({
    employee: employeeC,
    days: 7,
    reason: '家庭出国游，需要较长假期',
    approvalForm: { formType: 'PREPAY_ANNUAL', submitter: 'EMP-C003' }
  });

  console.log(`\n  审批链路解析结果:`);
  console.log(`    approvalNo: ${prepayResult.approvalNo}`);
  console.log(`    approvalChain节点数: ${prepayResult.approvalChain.length}`);

  for (let i = 0; i < prepayResult.approvalChain.length; i++) {
    const node = prepayResult.approvalChain[i];
    console.log(`      [${i + 1}] node=${node.node}, name=${node.name}, missing=${node.missing || false}`);
  }

  const expectedChain3 = [APPROVAL_NODES.DIRECT_LEADER, APPROVAL_NODES.DEPT_HEAD, APPROVAL_NODES.VICE_PRESIDENT];
  const actualChain3 = prepayResult.approvalChain.map(n => n.node);
  const chainMatchThree = actualChain3.length === 3 &&
    actualChain3[0] === expectedChain3[0] &&
    actualChain3[1] === expectedChain3[1] &&
    actualChain3[2] === expectedChain3[2];
  console.log(`\n  三级审批链路校验: 预期=3节点[直属,部门,分管副总], 实际=${JSON.stringify(actualChain3)}`);
  console.log(`    链路完整匹配: ${chainMatchThree}`);

  const approversComplete = {
    [APPROVAL_NODES.DIRECT_LEADER]: { id: 'EMP-LEAD-C01', name: '产品组张主管' },
    [APPROVAL_NODES.DEPT_HEAD]: { id: 'EMP-DEPT-C01', name: '研发部刘总监' },
    [APPROVAL_NODES.VICE_PRESIDENT]: { id: 'EMP-VP-002', name: '分管副总陈总' }
  };

  alertQueue.clear();
  const simComplete = controller.simulateApprovalChain({
    approvalChain: prepayResult.approvalChain,
    approversMap: approversComplete,
    simulateAllPass: true
  });

  console.log(`\n  完整审批人场景模拟结果:`);
  console.log(`    completedNodes数: ${simComplete.completedNodes.length}`);
  console.log(`    missingNodes数: ${simComplete.missingNodes.length}`);
  console.log(`    alertMessages数: ${simComplete.alertMessages.length}`);
  console.log(`    alertQueue现存报警: ${alertQueue.size()} (0=无缺失)`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('[TR-3.2.2] 第2部分：构造场景：VICE_PRESIDENT审批节点不存在 → alertQueue有1条warning级报警');

  alertQueue.clear();

  const employeeC_noVp = new EmployeeModel({
    id: 'EMP-C003',
    name: '员工C',
    entity: '上海康源博曜科技',
    dept1: '研发中心',
    dept2: '产品研发部',
    position: '高级产品经理',
    positionTag: '非教育岗',
    entryDate: new Date('2020-05-01'),
    regularDate: new Date('2020-08-01'),
    status: EMPLOYEE_STATUS.REGULAR,
    payrollGrade: 'TEC-P5',
    firstWorkDate: new Date('2018-07-01'),
    directLeader: 'EMP-LEAD-C01'
  });

  console.log(`  员工C(无vicePresident配置)申请预支7天`);

  const prepayNoVp = await controller.requestPrepayAnnualLeave({
    employee: employeeC_noVp,
    days: 7,
    reason: '测试缺失分管副总报警',
    approvalForm: { formType: 'PREPAY_ANNUAL' }
  });

  const approversNoVp = {
    [APPROVAL_NODES.DIRECT_LEADER]: { id: 'EMP-LEAD-C01', name: '产品组张主管' },
    [APPROVAL_NODES.DEPT_HEAD]: { id: 'EMP-DEPT-C01', name: '研发部刘总监' }
  };

  const simNoVp = controller.simulateApprovalChain({
    approvalChain: prepayNoVp.approvalChain,
    approversMap: approversNoVp,
    simulateAllPass: true
  });

  console.log(`\n  缺失VICE_PRESIDENT场景模拟:`);
  console.log(`    completedNodes数: ${simNoVp.completedNodes.length}`);
  console.log(`    missingNodes数: ${simNoVp.missingNodes.length}`);
  for (const mn of simNoVp.missingNodes) {
    console.log(`      ✗ 缺失节点: node=${mn.node}, name=${mn.name}`);
  }
  console.log(`    alertMessages数: ${simNoVp.alertMessages.length}`);
  for (const am of simNoVp.alertMessages) {
    console.log(`      📢 message: "${am}"`);
  }
  console.log(`    alertQueue总条数: ${alertQueue.size()}`);

  const warnings = alertQueue.getByLevel('warning');
  console.log(`    alertQueue中warning级: ${warnings.length}条`);
  for (const w of warnings) {
    console.log(`      [${w.level}] ${w.message} | ts=${w.ts}`);
  }

  const hasWarningAlert = warnings.length >= 1;
  const alertMsgContains = warnings.length > 0 && warnings[0].message.includes('缺少分管副总节点');

  console.log(`\n  缺失分管副总报警校验:`);
  console.log(`    warning级报警≥1条: ${hasWarningAlert} (实际=${warnings.length})`);
  console.log(`    message包含"缺少分管副总节点": ${alertMsgContains} (实际="${warnings.length > 0 ? warnings[0].message : 'N/A'}")`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('[TR-3.2.2] 第3部分：createExemption 1名高管免打卡（approvalNo=APP-EX-2026-001，有效期2026-06-01至2027-05-31）→ 豁免记录成功存入');

  const executiveEmployee = {
    id: 'EMP-EXE-008',
    name: '高管H总',
    position: '集团副总裁',
    positionTag: '高管免打卡岗'
  };

  const exmParams = {
    employeeId: executiveEmployee.id,
    exemptionType: EXEMPTION_TYPES.EXEMPT_PUNCH,
    reason: '高管岗位，外出商务频繁，免打卡',
    approvalNo: 'APP-EX-2026-001',
    effectiveDate: '2026-06-01',
    expireDate: '2027-05-31'
  };

  console.log(`  构造createExemption参数:`);
  console.log(`    employeeId=${exmParams.employeeId} (${executiveEmployee.name} ${executiveEmployee.position})`);
  console.log(`    exemptionType=${exmParams.exemptionType} (免打卡)`);
  console.log(`    approvalNo=${exmParams.approvalNo}`);
  console.log(`    effectiveDate=${exmParams.effectiveDate} ~ expireDate=${exmParams.expireDate}`);

  const exemption = controller.createExemption(exmParams);

  console.log(`\n  createExemption返回结果:`);
  console.log(`    exemptionId=${exemption.exemptionId}`);
  console.log(`    employeeId=${exemption.employeeId}`);
  console.log(`    exemptionType=${exemption.exemptionType} (${exemption.exemptionTypeName})`);
  console.log(`    approvalNo=${exemption.approvalNo}`);
  console.log(`    effectiveDate=${exemption.effectiveDate}`);
  console.log(`    expireDate=${exemption.expireDate}`);
  console.log(`    status=${exemption.status}`);
  console.log(`    reason=${exemption.reason}`);

  const exmSaved = controller.listExemptions({ employeeId: executiveEmployee.id });
  const exmFound = exmSaved.length >= 1;
  const exmHasApprovalNo = exmSaved.length > 0 && exmSaved[0].approvalNo === 'APP-EX-2026-001';

  console.log(`\n  豁免存储校验:`);
  console.log(`    listExemptions返回${exmSaved.length}条`);
  console.log(`    approvalNo=${exmSaved.length > 0 ? exmSaved[0].approvalNo : 'N/A'}`);

  console.log(`\n  验证createExemption不填approvalNo → 抛出MissingApprovalError:`);
  let missingApprovalThrown = null;
  try {
    controller.createExemption({
      employeeId: 'EMP-TEST-NOAPP',
      exemptionType: EXEMPTION_TYPES.EXEMPT_LATE,
      reason: '无审批单测试',
      effectiveDate: '2026-06-01',
      expireDate: '2027-05-31'
    });
  } catch (err) {
    missingApprovalThrown = err;
  }
  const noApprovalError = missingApprovalThrown instanceof MissingApprovalError;
  console.log(`    不填approvalNo抛出MissingApprovalError: ${noApprovalError} (${missingApprovalThrown ? missingApprovalThrown.name : '无异常'})`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('[TR-3.2.2] 第4部分：每月1号10:00调度导出触发 → 导出结构含5项必要字段employeeId/exemptionType/effectiveDate/expireDate/approvalNo完整');

  const scheduleInfo = controller.scheduleMonthlyExemptionExport();
  console.log(`  调度配置信息:`);
  console.log(`    cronExpression="${scheduleInfo.cronExpression}" (含义: 每月1号10:00)`);
  console.log(`    description: ${scheduleInfo.description}`);
  console.log(`    输出字段fields: [${scheduleInfo.fields.join(', ')}]`);
  console.log(`    输出内容outputs: ${scheduleInfo.outputs.join(', ')}`);

  const mockExportDate = new Date('2026-08-01T10:00:00');
  console.log(`\n  模拟触发: 2026-08-01 10:00:00 (每月1号10点)`);
  const exportResult = await controller.exportMonthlyExemption({
    exportDate: mockExportDate
  });

  console.log(`\n  导出结果:`);
  console.log(`    exportId=${exportResult.exportId}`);
  console.log(`    exportMonth=${exportResult.month}`);
  console.log(`    recordCount=${exportResult.recordCount} (高管H总1条)`);
  console.log(`    导出字段fields: [${exportResult.fields.join(', ')}]`);
  console.log(`    JSON文件: ${exportResult.jsonFilePath}`);
  console.log(`    PDF结构描述: ${exportResult.pdfDescFilePath}`);

  const fs = require('fs');
  let jsonContent = null;
  let jsonRecords = [];
  try {
    jsonContent = JSON.parse(fs.readFileSync(exportResult.jsonFilePath, 'utf-8'));
    jsonRecords = jsonContent.records || [];
  } catch (e) {
    console.log(`    JSON文件读取失败: ${e.message}`);
  }

  console.log(`\n  导出JSON文件内容校验:`);
  console.log(`    JSON.records.length=${jsonRecords.length}`);
  if (jsonRecords.length > 0) {
    const rec = jsonRecords[0];
    console.log(`    第1条record字段:`);
    console.log(`      · employeeId: ${rec.employeeId || '(缺失!)'}`);
    console.log(`      · exemptionType: ${rec.exemptionType || '(缺失!)'}`);
    console.log(`      · effectiveDate: ${rec.effectiveDate || '(缺失!)'}`);
    console.log(`      · expireDate: ${rec.expireDate || '(缺失!)'}`);
    console.log(`      · approvalNo: ${rec.approvalNo || '(缺失!)'}`);
  }

  const fiveFields = ['employeeId', 'exemptionType', 'effectiveDate', 'expireDate', 'approvalNo'];
  let allFiveFieldsPresent = false;
  if (jsonRecords.length > 0) {
    const rec = jsonRecords[0];
    allFiveFieldsPresent = fiveFields.every(f => rec[f] !== undefined && rec[f] !== null && rec[f] !== '');
  }

  console.log(`\n  5项必要字段完整性校验:`);
  console.log(`    检查字段: [${fiveFields.join(', ')}]`);
  console.log(`    全部完整非空: ${allFiveFieldsPresent}`);

  let pdfDescContent = null;
  try {
    pdfDescContent = JSON.parse(fs.readFileSync(exportResult.pdfDescFilePath, 'utf-8'));
  } catch (e) {
    console.log(`    PDF描述文件读取失败: ${e.message}`);
  }
  console.log(`\n  PDF结构描述文件:`);
  if (pdfDescContent) {
    console.log(`    fileName=${pdfDescContent.fileName}`);
    console.log(`    structure.title="${pdfDescContent.structure ? pdfDescContent.structure.title : 'N/A'}"`);
    console.log(`    structure.headers=[${pdfDescContent.structure ? pdfDescContent.structure.headers.join(', ') : 'N/A'}]`);
    console.log(`    structure.recordCount=${pdfDescContent.structure ? pdfDescContent.structure.recordCount : 'N/A'}`);
  }

  const threeChainOk = chainMatchThree;
  const warningAlertOk = hasWarningAlert && alertMsgContains;
  const exemptionSavedOk = exmFound && exmHasApprovalNo && noApprovalError;
  const exportFieldsOk = allFiveFieldsPresent && fiveFields.every(f => exportResult.fields.includes(f));

  console.log(`\n[TR-3.2.2] 校验清单:`);
  console.log(`  1. 7天=三级审批链路(3节点完整): ${threeChainOk ? '✅' : '❌'}`);
  console.log(`     · 节点顺序=${JSON.stringify(actualChain3)}`);
  console.log(`  2. VICE_PRESIDENT缺失→alertQueue warning报警: ${warningAlertOk ? '✅' : '❌'}`);
  console.log(`     · warning条数=${warnings.length}, message含"缺少分管副总节点"=${alertMsgContains}`);
  console.log(`  3. createExemption高管免打卡记录存入: ${exemptionSavedOk ? '✅' : '❌'}`);
  console.log(`     · list返回数=${exmSaved.length}, approvalNo匹配=${exmHasApprovalNo}`);
  console.log(`     · approvalNo必填MissingApprovalError=${noApprovalError}`);
  console.log(`  4. 每月1号10:00导出5字段完整: ${exportFieldsOk ? '✅' : '❌'}`);
  console.log(`     · 5字段=[${fiveFields.join(',')}]`);
  console.log(`     · JSON记录存在且5字段全部非空=${allFiveFieldsPresent}`);
  console.log(`     · 导出文件路径JSON=${exportResult.jsonFilePath}`);
  console.log(`     · 导出文件路径PDF_DESC=${exportResult.pdfDescFilePath}`);

  const pass = threeChainOk && warningAlertOk && exemptionSavedOk && exportFieldsOk;
  console.log(`\n[TR-3.2.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('【输出文件路径】:');
  console.log(`  核心控制器文件: src/modules/leave/leave_prepay_exemption_controller.js`);
  console.log(`  主要导出模块:`);
  console.log(`    ① LeavePrepayExemptionController 主控制器`);
  console.log(`      · requestPrepayAnnualLeave() 预支年假审批路由`);
  console.log(`      · approvePrepayAndUpdateBalance() 审批通过→LeaveEngine预支余额生效`);
  console.log(`      · createExemption() 特殊考勤豁免创建(approvalNo必填)`);
  console.log(`      · retroactiveExemptions() 补录豁免→PENDING_REVIEW审批前`);
  console.log(`      · approveRetroactive() 补录豁免审批通过→写入ACTIVE`);
  console.log(`      · simulateApprovalChain() 三级审批模拟执行器`);
  console.log(`      · exportMonthlyExemption() 每月1号10:00豁免名单导出(JSON+PDF)`);
  console.log(`      · scheduleMonthlyExemptionExport() 定时调度cron="0 10 1 * *"`);
  console.log(`    ② 错误类:`);
  console.log(`      · ProbationBlockedError (试用期禁止预支)`);
  console.log(`      · MissingApprovalError (approvalNo必填缺失)`);
  console.log(`      · InvalidExemptionError (豁免参数无效)`);
  console.log(`    ③ 关键枚举:`);
  console.log(`      · APPROVAL_NODES: DIRECT_LEADER/DEPT_HEAD/VICE_PRESIDENT`);
  console.log(`      · EXEMPTION_TYPES: EXEMPT_PUNCH免打卡/EXEMPT_OT加班豁免/EXEMPT_LATE迟到豁免`);
  console.log(`  依赖模块:`);
  console.log(`    - Task3.1假期引擎: src/modules/leave/leave_engine.js (LeaveEngine+LEAVE_TYPES)`);
  console.log(`    - Task2.7审批回写: src/modules/attendance/oa_approval_writer.js (ApprovalListener模式)`);
  console.log(`    - AlertQueue服务: src/services/AlertQueue.js (alertQueue.enqueueAdminAlert)`);
  console.log(`    - EmployeeModel: src/modules/master_data/employee_model.js (EMPLOYEE_STATUS)`);
  console.log(`  豁免导出文件:`);
  console.log(`    · JSON数据文件: ${exportResult.jsonFilePath}`);
  console.log(`    · PDF结构描述: ${exportResult.pdfDescFilePath}`);
  console.log(`  测试文件: test_task32.js (本文件)`);

  return pass;
}

(async function runAll() {
  console.log('================================================================');
  console.log('智慧化人资平台 Task3.2 预支年假+特殊豁免+三级审批模拟 测试套件');
  console.log('================================================================');
  console.log('\n测试点说明:');
  console.log('  TR-3.2.1: 员工B 试用期→预支拦截ProbationBlockedError; 转正→4天二级审批+预支余额+4');
  console.log('  TR-3.2.2: 员工C 7天三级审批+分管副总缺失alertQueue.warning+高管免打卡豁免createExemption+每月1号10点调度导出5字段完整');
  console.log('================================================================');

  const p1 = await test_TR321();
  const p2 = await test_TR322();

  console.log('\n================================================================');
  console.log('测试总结:');
  console.log(`  TR-3.2.1 (试用期拦截+转正4天二级审批+余额预支): ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-3.2.2 (7天三级审批+缺失副总报警+免打卡豁免+1号导出): ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('================================================================');
})();
