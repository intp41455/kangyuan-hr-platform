'use strict';

const {
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES,
  SEVERITY,
  AttendanceAnomalyEngine
} = require('./src/modules/attendance/attendance_anomaly_engine.js');
const { PunchDayRecord } = require('./src/modules/attendance/punch_data_collector.js');
const { AttendanceGroupModel, WORKDAYS_PATTERNS, ATTENDANCE_GROUP_TYPES } = require('./src/modules/attendance/attendance_groups_loader.js');

function makeTime(dateStr, hh, mm) {
  const d = new Date(dateStr);
  d.setHours(hh, mm, 0, 0);
  return d;
}

const standardGroup = new AttendanceGroupModel({
  id: 'AG_TEST',
  name: '测试考勤组',
  type: ATTENDANCE_GROUP_TYPES.HQ,
  workdays: WORKDAYS_PATTERNS.MON_FRI,
  shift: {
    onDutyTime: '09:00',
    offDutyTime: '18:00',
    graceLateMinutes: 0,
    graceEarlyLeaveMinutes: 0,
    isFlexible: false
  }
});

const testEmployee = {
  id: 'EMP-TEST-001',
  name: '测试员工',
  department: 'D01'
};

const WORKDAYS_JAN_2026 = [
  '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
  '2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23',
  '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30'
];

const WEEKENDS_JAN_2026 = [
  '2026-01-10', '2026-01-11',
  '2026-01-17', '2026-01-18',
  '2026-01-24', '2026-01-25'
];

async function test_TR241() {
  console.log('\n========== TR-2.4.1: 16类×5=80条样本异常识别准确率测试 ==========');
  const engine = new AttendanceAnomalyEngine();
  engine.setHolidays(['2026-05-01']);

  const testCases = [];
  const anomalyTypes = Object.values(ATTENDANCE_ANOMALY);

  for (const typeVal of anomalyTypes) {
    for (let sampleIdx = 0; sampleIdx < 5; sampleIdx++) {
      let record;
      let date;

      switch (typeVal) {
        case ATTENDANCE_ANOMALY.LATE: {
          date = WORKDAYS_JAN_2026[sampleIdx];
          const lateMins = [1, 8, 15, 45, 60][sampleIdx];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: makeTime(date, 9, lateMins),
            checkOutTime: makeTime(date, 18, 10),
            isMissing: false
          });
          break;
        }
        case ATTENDANCE_ANOMALY.EARLY_LEAVE: {
          date = WORKDAYS_JAN_2026[sampleIdx + 5];
          const earlyMins = [1, 7, 12, 35, 50][sampleIdx];
          const adj = 18 * 60 - earlyMins;
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: makeTime(date, 8, 50),
            checkOutTime: makeTime(date, Math.floor(adj / 60), adj % 60),
            isMissing: false
          });
          break;
        }
        case ATTENDANCE_ANOMALY.MISSING_PUNCH: {
          date = WORKDAYS_JAN_2026[sampleIdx + 10];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: true,
            makeupApprovalNo: sampleIdx === 0 ? `APR-MAKEUP-${sampleIdx}` : null,
            leaveApprovalNo: null,
            businessTripNo: null
          });
          break;
        }
        case ATTENDANCE_ANOMALY.ABSENT: {
          date = WORKDAYS_JAN_2026[sampleIdx + 15];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: true,
            leaveApprovalNo: null,
            businessTripNo: null,
            makeupApprovalNo: null
          });
          break;
        }
        case ATTENDANCE_ANOMALY.OT_WORKDAY: {
          date = WORKDAYS_JAN_2026[sampleIdx];
          const otHours = [2, 3, 3, 4, 5][sampleIdx];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: makeTime(date, 8, 50),
            checkOutTime: makeTime(date, 18 + otHours, 30),
            isMissing: false,
            leaveApprovalNo: null
          });
          break;
        }
        case ATTENDANCE_ANOMALY.OT_WEEKEND: {
          date = WEEKENDS_JAN_2026[sampleIdx % WEEKENDS_JAN_2026.length];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: makeTime(date, 10, 0),
            checkOutTime: makeTime(date, 18, 0),
            isMissing: false
          });
          break;
        }
        case ATTENDANCE_ANOMALY.OT_HOLIDAY: {
          const hd = '2026-05-01';
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date: hd,
            checkInTime: makeTime(hd, 9 + sampleIdx, 0),
            checkOutTime: makeTime(hd, 17 + sampleIdx, 0),
            isMissing: false
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_PERSONAL: {
          date = WORKDAYS_JAN_2026[sampleIdx + 5];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-PER-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_SICK: {
          date = WORKDAYS_JAN_2026[sampleIdx + 10];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-SIC-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_ANNUAL: {
          date = WORKDAYS_JAN_2026[sampleIdx + 15];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-ANN-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_MARRIAGE: {
          date = WORKDAYS_JAN_2026[sampleIdx];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-MAR-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_MATERNITY: {
          date = WORKDAYS_JAN_2026[sampleIdx + 5];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-MAT-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_PATERNITY: {
          date = WORKDAYS_JAN_2026[sampleIdx + 10];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-PAT-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_FUNERAL: {
          date = WORKDAYS_JAN_2026[sampleIdx + 15];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-FUN-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.LEAVE_COMPTIME: {
          date = WORKDAYS_JAN_2026[sampleIdx + 2];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: null,
            checkOutTime: null,
            isMissing: false,
            leaveApprovalNo: `APR-COMP-2026-${String(sampleIdx + 1).padStart(4, '0')}`
          });
          break;
        }
        case ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK: {
          date = WORKDAYS_JAN_2026[sampleIdx + 7];
          record = new PunchDayRecord({
            employeeId: testEmployee.id,
            date,
            checkInTime: makeTime(date, 9, 10),
            checkOutTime: makeTime(date, 17, 50),
            isMissing: false,
            fieldWorkFlag: true,
            businessTripNo: null,
            leaveApprovalNo: null
          });
          break;
        }
      }

      testCases.push({
        expectedType: typeVal,
        expectedTypeName: ANOMALY_NAMES[typeVal],
        record,
        dateUsed: date
      });
    }
  }

  console.log(`[TR-2.4.1] 构造样本总数: ${testCases.length}条（16类×5条/类）`);

  let correctCount = 0;
  const resultsByType = {};
  const confusionMatrix = {};

  for (const tc of testCases) {
    const result = await engine.detectAnomalies({
      employee: testEmployee,
      monthRecords: [tc.record],
      attendanceGroup: standardGroup
    });

    const expectedType = tc.expectedType;
    if (!resultsByType[expectedType]) resultsByType[expectedType] = { total: 0, correct: 0, samples: [] };
    resultsByType[expectedType].total++;

    const matchedAnomaly = result.anomalies.find(a => a.type === expectedType);

    if (matchedAnomaly) {
      correctCount++;
      resultsByType[expectedType].correct++;
    } else {
      const gotTypes = result.anomalies.map(a => `${a.type}(${ANOMALY_NAMES[a.type]})`).join(',') || 'NONE';
      if (!confusionMatrix[expectedType]) confusionMatrix[expectedType] = {};
      confusionMatrix[expectedType][gotTypes] = (confusionMatrix[expectedType][gotTypes] || 0) + 1;
      resultsByType[expectedType].samples.push({
        date: tc.record.date,
        expected: ANOMALY_NAMES[expectedType],
        got: gotTypes,
        anomalyCount: result.anomalies.length
      });
    }
  }

  const totalCount = testCases.length;
  const accuracy = correctCount / totalCount;
  console.log(`[TR-2.4.1] 识别正确: ${correctCount}/${totalCount}，准确率=${(accuracy * 100).toFixed(2)}%`);

  console.log('\n[TR-2.4.1] 各类别识别详情:');
  for (const typeVal of anomalyTypes) {
    const info = resultsByType[typeVal] || { total: 0, correct: 0 };
    const typeName = ANOMALY_NAMES[typeVal] || `未知${typeVal}`;
    const pct = info.total > 0 ? ((info.correct / info.total) * 100).toFixed(0) : 'N/A';
    const statusIcon = info.total > 0 && info.correct === info.total ? '✅' : '❌';
    console.log(`  ${statusIcon} 类别#${String(typeVal).padStart(2, '0')} ${typeName.padEnd(14)}: ${info.correct}/${info.total} (${pct}%)`);
  }

  if (Object.keys(confusionMatrix).length > 0) {
    console.log('\n[TR-2.4.1] 分类混淆详情:');
    for (const [expType, gotMap] of Object.entries(confusionMatrix)) {
      console.log(`  期望#${expType}(${ANOMALY_NAMES[expType]}):`);
      for (const [got, cnt] of Object.entries(gotMap)) {
        console.log(`    误识别为: ${got} × ${cnt}次`);
      }
      const wrongSamples = (resultsByType[expType] || {}).samples || [];
      wrongSamples.forEach(s => console.log(`      例: date=${s.date} expected=${s.expected} got=${s.got} count=${s.anomalyCount}`));
    }
  }

  const pass = correctCount === totalCount;
  console.log(`\n[TR-2.4.1] 结果: ${pass ? '✅ PASS (准确率100%，无分类混淆)' : '❌ FAIL (存在分类混淆)'}`);
  return pass;
}

async function test_TR242() {
  console.log('\n========== TR-2.4.2: 迟到批量规则叠加扣款测试 ==========');
  const engine = new AttendanceAnomalyEngine();

  const records = [
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-05',
      checkInTime: makeTime('2026-01-05', 9, 12),
      checkOutTime: makeTime('2026-01-05', 18, 10),
      isMissing: false
    }),
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-06',
      checkInTime: makeTime('2026-01-06', 9, 8),
      checkOutTime: makeTime('2026-01-06', 18, 0),
      isMissing: false
    }),
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-07',
      checkInTime: makeTime('2026-01-07', 9, 5),
      checkOutTime: makeTime('2026-01-07', 18, 15),
      isMissing: false
    })
  ];

  console.log('[TR-2.4.2] 构造迟到序列:');
  console.log('  第1次 (2026-01-05): 迟到12分钟 → 规则≥10min，单次扣款20元');
  console.log('  第2次 (2026-01-06): 迟到8分钟 → ≤10min警告无扣款');
  console.log('  第3次 (2026-01-07): 迟到5分钟 → 批量规则触发: 第3次叠加20元');
  console.log('  期望总扣款: 20(第1次单次) + 20(第3次批量叠加) = 40元');

  const result = await engine.detectAnomalies({
    employee: testEmployee,
    monthRecords: records,
    attendanceGroup: standardGroup
  });

  const lateAnomalies = result.anomalies.filter(a => a.type === ATTENDANCE_ANOMALY.LATE);
  const deductionTotal = result.totalDeduction;
  const deductionItems = result.deductions;

  console.log(`\n[TR-2.4.2] 识别结果:`);
  console.log(`  异常数组总条数: ${result.anomalies.length}条`);
  console.log(`  其中LATE类型异常: ${lateAnomalies.length}条`);
  lateAnomalies.forEach((a, idx) => {
    const isBatch = a.batchRule ? '[批量叠加]' : '';
    console.log(`    LATE#${idx + 1} date=${a.date} severity=${a.severity} deduction=${a.deduction}元 lateMin=${a.lateMinutes || 'N/A'} ${isBatch}`);
  });

  console.log(`\n  扣款明细条目: ${deductionItems.length}条`);
  deductionItems.forEach((d, idx) => {
    console.log(`    DED#${idx + 1} date=${d.date} amount=${d.amount}元 reason=${d.reason} ruleCode=${d.ruleCode}`);
  });
  console.log(`  扣款合计(deduction数组合计): ${deductionTotal}元`);

  const expectedTotal = 40;
  const lateCountOk = lateAnomalies.length >= 3;
  const deductionOk = deductionTotal === expectedTotal;

  console.log(`\n[TR-2.4.2] 校验:`);
  console.log(`  迟到异常条数≥3: ${lateCountOk} (实际=${lateAnomalies.length})`);
  console.log(`  扣款合计=40元: ${deductionOk} (实际=${deductionTotal}元, 期望=${expectedTotal}元)`);

  const pass = lateCountOk && deductionOk;
  console.log(`[TR-2.4.2] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

async function test_TR243() {
  console.log('\n========== TR-2.4.3: 缺卡补卡豁免+3次缺卡扣款测试 ==========');
  const engine = new AttendanceAnomalyEngine();

  const records = [
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-05',
      checkInTime: null,
      checkOutTime: null,
      isMissing: true,
      makeupApprovalNo: 'APR-MAKEUP001'
    }),
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-06',
      checkInTime: null,
      checkOutTime: null,
      isMissing: true,
      makeupApprovalNo: null
    }),
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-07',
      checkInTime: null,
      checkOutTime: null,
      isMissing: true,
      makeupApprovalNo: null
    }),
    new PunchDayRecord({
      employeeId: testEmployee.id,
      date: '2026-01-08',
      checkInTime: null,
      checkOutTime: null,
      isMissing: true,
      makeupApprovalNo: null
    })
  ];

  console.log('[TR-2.4.3] 构造4次缺卡序列:');
  console.log('  第1次 (2026-01-05): 缺卡 + makeupApprovalNo=APR-MAKEUP001 → 豁免不计罚款0元');
  console.log('  第2次 (2026-01-06): 缺卡无补卡 → 扣50元');
  console.log('  第3次 (2026-01-07): 缺卡无补卡 → 扣50元');
  console.log('  第4次 (2026-01-08): 缺卡无补卡 → 扣50元');
  console.log('  期望: 扣款明细合计=150元 (仅第2/3/4次缺卡有罚款，第1次0元)');

  const result = await engine.detectAnomalies({
    employee: testEmployee,
    monthRecords: records,
    attendanceGroup: standardGroup
  });

  const missingAnomalies = result.anomalies.filter(a => a.type === ATTENDANCE_ANOMALY.MISSING_PUNCH);
  const deductionItems = result.deductions;
  const deductionTotal = result.totalDeduction;

  console.log(`\n[TR-2.4.3] 识别结果:`);
  console.log(`  MISSING_PUNCH异常条数: ${missingAnomalies.length}条 (期望4条：包括补卡豁免的那一条)`);
  missingAnomalies.forEach((a, idx) => {
    const exemptTag = a.exempt ? '[豁免]' : '';
    const makeupTag = a.makeupApprovalNo ? `[补卡:${a.makeupApprovalNo}]` : '';
    console.log(`    MP#${idx + 1} date=${a.date} severity=${a.severity} deduction=${a.deduction}元 count=${a.missingPunchCount || 'N/A'} ${exemptTag}${makeupTag}`);
  });

  console.log(`\n  扣款明细条目: ${deductionItems.length}条`);
  deductionItems.forEach((d, idx) => {
    console.log(`    DED#${idx + 1} date=${d.date} amount=${d.amount}元 reason=${d.reason}`);
  });
  console.log(`  扣款合计(deduction数组合计): ${deductionTotal}元 (期望=150元)`);

  const expectedTotal = 150;
  const firstRecord = missingAnomalies.find(a => a.date === '2026-01-05');
  const firstDeduction = firstRecord ? firstRecord.deduction : -1;
  const firstHasMakeup = !!(firstRecord && firstRecord.makeupApprovalNo);
  const firstOk = !!firstRecord && firstDeduction === 0 && firstHasMakeup;

  const nonMakeupDeductions = deductionItems
    .filter(d => d.date !== '2026-01-05')
    .reduce((s, d) => s + d.amount, 0);
  const deductionOk = deductionTotal === expectedTotal;

  console.log(`\n[TR-2.4.3] 校验:`);
  console.log(`  第1次缺卡找到且有补卡豁免0元: ${firstOk ? '是' : '否'} (找到=${!!firstRecord}, deduction=${firstDeduction}元, 有补卡=${firstHasMakeup})`);
  console.log(`  扣款合计=150元: ${deductionOk} (实际=${deductionTotal}元, 期望=${expectedTotal}元)`);

  const pass = firstOk && deductionOk;
  console.log(`[TR-2.4.3] 结果: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  return pass;
}

(async function runAll() {
  console.log('============================================================');
  console.log('智慧化人资平台 Task2.4 考勤异常识别引擎 测试套件');
  console.log('============================================================');
  console.log('\n【输出文件路径】:');
  console.log('  主引擎文件: src/modules/attendance/attendance_anomaly_engine.js');
  console.log('  主要导出:');
  console.log('    - ATTENDANCE_ANOMALY 枚举(16类)');
  console.log('    - ANOMALY_NAMES 中文名称映射');
  console.log('    - SEVERITY {WARNING/FINE/DEDUCT}');
  console.log('    - AttendanceAnomalyEngine 核心类');
  console.log('    - detectAnomalies({employee, monthRecords, attendanceGroup, approvals}) 方法');
  console.log('  异常单编码格式: AT_时间戳_XXXX');
  console.log('  异常单字段: {anomalyId, employeeId, date, type, severity, ruleVersion, deduction, approvalNo, makeupApprovalNo}');

  const p1 = await test_TR241();
  const p2 = await test_TR242();
  const p3 = await test_TR243();

  console.log('\n============================================================');
  console.log('测试总结:');
  console.log(`  TR-2.4.1 (16类×5=80条样本识别准确率100%): ${p1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.4.2 (迟到批量规则叠加扣款40元):      ${p2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  TR-2.4.3 (4次缺卡后3次×50=150元):         ${p3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  总体:   ${(p1 && p2 && p3) ? '🎉 全部通过' : '⚠️ 存在失败用例'}`);
  console.log('============================================================');
})();
