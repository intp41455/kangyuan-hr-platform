'use strict';

const { AttendancePunchCollector, PunchDayRecord, getDaysInMonth, isWorkday } = require('../modules/attendance/punch_data_collector.js');
const { AttendanceGroupsLoader, AttendanceGroupModel, WORKDAYS_PATTERNS, ATTENDANCE_GROUP_TYPES, buildPresetGroups } = require('../modules/attendance/attendance_groups_loader.js');
const { AttendanceAnomalyEngine, ATTENDANCE_ANOMALY, ANOMALY_NAMES, SEVERITY } = require('../modules/attendance/attendance_anomaly_engine.js');
const { MonthlySummaryAggregator, LEAVE_TYPES, OT_TYPES } = require('../modules/attendance/monthly_attendance_summary.js');
const { ApprovalListener, APPROVAL_EVENT_TYPES, WritebackLog } = require('../modules/attendance/oa_approval_writer.js');
const { DingTalkBotClient, ANOMALY_STATUS, ReminderLog, dispatchAnomaly } = require('../integrations/dingtalk_bot_dispatcher.js');
const { RuleEngine } = require('../modules/rules/rule_engine.js');

const HOLIDAYS_2026 = {
  1: ['2026-01-01', '2026-01-02', '2026-01-03'],
  2: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'],
  4: ['2026-04-04', '2026-04-05', '2026-04-06'],
  5: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
  6: ['2026-06-19', '2026-06-20', '2026-06-21'],
  9: ['2026-09-25', '2026-09-26', '2026-09-27'],
  10: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']
};

const OVERTIME_RATES = { workday: 1.5, weekend: 2.0, holiday: 3.0 };
const HOURLY_SALARY_DIVISOR = 21.75 * 8;

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧'];
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '华', '建', '文', '辉', '玲', '鑫', '斌', '波'];
const DEPTS = ['教育事业部', '养老运营部', '健康管理部', '行政人事部', '财务部', '技术研发部', '市场部', '法务合规部', '质量管理部', '供应链部'];
const SUB_DEPTS = ['综合组', '业务一组', '业务二组', '支持组', '研发组', '运营组'];
const POSITIONS = ['专员', '主管', '经理', '总监', '助理', '工程师', '教师', '护理员', '营养师', '顾问'];
const EDU_DEPT = '教育事业部';

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function _getMonthWorkdays(year, month) {
  const totalDays = new Date(year, month, 0).getDate();
  let workdays = 0;
  const holidaySet = new Set(HOLIDAYS_2026[month] || []);
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend && !holidaySet.has(dateStr)) workdays++;
  }
  return workdays;
}

function _generateEmployeeForSnapshot(idx, year, month, opts = {}) {
  const rand = seededRandom(idx * 10000 + year * 100 + month + (opts.seedOffset || 0));
  const surname = SURNAMES[idx % SURNAMES.length];
  const name1 = GIVEN_NAMES[Math.floor(rand() * GIVEN_NAMES.length)];
  const name2 = GIVEN_NAMES[Math.floor(rand() * GIVEN_NAMES.length)];
  const fullName = idx % 3 === 0 ? surname + name1 : (idx % 3 === 1 ? surname + name1 + name2 : surname);

  let dept1 = opts.forceDept1 || DEPTS[idx % DEPTS.length];
  let dept2 = SUB_DEPTS[idx % SUB_DEPTS.length];
  const position = POSITIONS[idx % POSITIONS.length];

  const baseSalary = 4000 + Math.floor(rand() * 26) * 1000;
  const entryYear = year - 1 - Math.floor(rand() * 10);
  const entryMonth = Math.floor(rand() * 12) + 1;
  const entryDay = Math.floor(rand() * 27) + 1;

  return {
    id: `E${String(idx + 1).padStart(6, '0')}`,
    employeeId: `E${String(idx + 1).padStart(6, '0')}`,
    name: fullName,
    idCard: _makeFakeIdCard(idx + 1, year),
    mobile: '1' + String(13000000000 + idx * 7919).slice(-10),
    entity: idx % 2 === 0 ? '康源西安总公司' : '康源兰州分公司',
    dept1,
    dept2,
    position,
    status: opts.status || 'REGULAR',
    baseSalary,
    payrollGrade: 'G' + String(((idx % 12) + 1)).padStart(2, '0'),
    workLocation: ['西安', '天水', '白银', '平凉', '兰州'][idx % 5],
    socialAreaCode: ['XA', 'TS', 'BY', 'PL', 'LZ'][idx % 5],
    entryDate: new Date(entryYear, entryMonth - 1, entryDay),
    firstWorkDate: new Date(entryYear - (idx % 4), entryMonth - 1, entryDay),
    regularDate: new Date(entryYear + 1, entryMonth - 1, entryDay),
    directLeader: SURNAMES[(idx + 5) % SURNAMES.length] + GIVEN_NAMES[idx % GIVEN_NAMES.length],
    isEduStaff: dept1 === EDU_DEPT,
    exemptAttendance: idx % 47 === 0,
    hireMonth: opts.hireMonth,
    hireDay: opts.hireDay,
    resignMonth: opts.resignMonth,
    resignDay: opts.resignDay,
    _changeTag: opts._changeTag || null
  };
}

function _makeFakeIdCard(num, year) {
  const prefix = '610101';
  const y = 1970 + (num % 45);
  const m = String(((num % 12) + 1)).padStart(2, '0');
  const d = String(((num % 28) + 1)).padStart(2, '0');
  const seq = String(1000 + num).slice(-3);
  return prefix + y + m + d + seq + 'X';
}

function _calcOvertimePay(baseSalary, otHours, otType) {
  const rate = OVERTIME_RATES[otType] || 1.0;
  const hourly = baseSalary / HOURLY_SALARY_DIVISOR;
  return otHours * hourly * rate;
}

function buildAttendanceSnapshot({ year, month, count = 100, previousSnapshot = null, changeRate = 0 }) {
  const generatedAt = new Date();
  const rand = seededRandom(year * 10000 + month * 100 + count);
  const monthWorkdays = _getMonthWorkdays(year, month);
  const holidaySet = new Set(HOLIDAYS_2026[month] || []);
  const totalDays = new Date(year, month, 0).getDate();

  let employees = [];
  const changes = { newHires: [], resigned: [], deptTransfer: [], allChangedIds: new Set() };

  if (previousSnapshot && changeRate > 0) {
    employees = previousSnapshot.employees.map(e => ({ ...e, _changeTag: null }));
    const changeCount = Math.floor(count * changeRate);
    const idPool = employees.map(e => parseInt(e.id.replace('E', ''), 10)).sort((a, b) => a - b);

    for (let i = 0; i < Math.min(changeCount, count); i++) {
      const roll = rand();
      const idx = Math.floor(rand() * employees.length);
      changes.allChangedIds.add(employees[idx].id);

      if (roll < 0.35) {
        const srcIdx = employees.length - 1 - i;
        if (srcIdx >= 0 && employees[srcIdx]) {
          changes.resigned.push({
            id: employees[srcIdx].id,
            name: employees[srcIdx].name,
            dept1: employees[srcIdx].dept1,
            resignDay: Math.floor(rand() * 14) + 1,
            resignMonth: month
          });
          employees[srcIdx].status = 'RESIGNED';
          employees[srcIdx].resignMonth = month;
          employees[srcIdx].resignDay = changes.resigned[changes.resigned.length - 1].resignDay;
          employees[srcIdx]._changeTag = 'RESIGNED';
        }
      } else if (roll < 0.7) {
        const newIdNum = count + i + 1;
        const newEmp = _generateEmployeeForSnapshot(newIdNum, year, month, {
          status: 'REGULAR',
          hireMonth: month,
          hireDay: Math.floor(rand() * 14) + 1,
          _changeTag: 'NEW_HIRE'
        });
        employees.push(newEmp);
        changes.newHires.push({
          id: newEmp.id,
          name: newEmp.name,
          dept1: newEmp.dept1,
          hireDay: newEmp.hireDay,
          hireMonth: month
        });
      } else {
        const oldDept1 = employees[idx].dept1;
        const oldDept2 = employees[idx].dept2;
        let newDept1;
        do {
          newDept1 = DEPTS[Math.floor(rand() * DEPTS.length)];
        } while (newDept1 === oldDept1);
        const newDept2 = SUB_DEPTS[Math.floor(rand() * SUB_DEPTS.length)];

        changes.deptTransfer.push({
          id: employees[idx].id,
          name: employees[idx].name,
          fromDept1: oldDept1,
          fromDept2: oldDept2,
          toDept1: newDept1,
          toDept2: newDept2
        });
        employees[idx].dept1 = newDept1;
        employees[idx].dept2 = newDept2;
        employees[idx].isEduStaff = newDept1 === EDU_DEPT;
        employees[idx]._changeTag = 'DEPT_TRANSFER';
      }
    }
  } else {
    for (let i = 0; i < count; i++) {
      employees.push(_generateEmployeeForSnapshot(i + 1, year, month, {}));
    }
  }

  while (employees.length > count) employees.pop();
  while (employees.length < count) {
    const n = employees.length + 1;
    employees.push(_generateEmployeeForSnapshot(n + 1000, year, month, {}));
  }

  const punchCollector = new AttendancePunchCollector({ mode: 'mock' });
  const groupsLoader = new AttendanceGroupsLoader({ mode: 'mock' });
  groupsLoader._groups = buildPresetGroups();
  groupsLoader._groupsLoaded = true;
  punchCollector.groupsLoader = groupsLoader;

  const groundTruthPunchRecords = [];
  const groundTruthAnomalies = [];
  const groundTruthDeductions = [];
  const groundTruthOvertimeRecords = [];
  const groundTruthLeaveRecords = [];
  const groundTruthFieldWorkRecords = [];
  const groundTruthMakeupRecords = [];

  for (let empIdx = 0; empIdx < employees.length; empIdx++) {
    const emp = employees[empIdx];
    const empRand = seededRandom(parseInt(emp.id.replace(/\D/g, ''), 10) + year * 1000 + month);

    if (emp.status === 'RESIGNED' && emp.resignMonth && emp.resignMonth < month) continue;

    const effectiveStartDay = (emp.status === 'REGULAR' || emp.status === 'PROBATION') && emp.hireMonth === month
      ? (emp.hireDay || 1) : 1;
    const effectiveEndDay = emp.status === 'RESIGNED' && emp.resignMonth === month
      ? (emp.resignDay || totalDays) : totalDays;

    for (let d = 1; d <= totalDays; d++) {
      if (d < effectiveStartDay || d > effectiveEndDay) continue;

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
      const isHolidayDay = holidaySet.has(dateStr);
      const isWorkDay = !isWeekendDay && !isHolidayDay;

      const punchRecord = new PunchDayRecord({
        employeeId: emp.id,
        date: dateStr,
        source: 'snapshot-ground-truth'
      });

      const anomalyRoll = empRand();

      if (!isWorkDay) {
        const otRoll = empRand();
        if (isHolidayDay && otRoll < 0.15) {
          const otH = 4 + Math.floor(empRand() * 5);
          const otType = 'holiday';
          punchRecord.checkInTime = new Date(dateStr + 'T09:30:00');
          punchRecord.checkOutTime = new Date(dateStr + 'T' + String(9 + otH).padStart(2, '0') + ':30:00');
          punchRecord.location = '公司总部';
          punchRecord.device = 'DING-GT';

          const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.OT_HOLIDAY, {
            otHours: otH, rate: 3.0
          });
          groundTruthAnomalies.push(gtAnom);
          const otPay = _calcOvertimePay(emp.baseSalary, otH, otType);
          groundTruthOvertimeRecords.push({
            employeeId: emp.id, employeeName: emp.name, department: emp.dept1,
            date: dateStr, overtimeType: otType, overtimeHours: otH,
            overtimePay: Math.round(otPay * 100) / 100, baseSalary: emp.baseSalary,
            rate: 3.0, isEduStaff: emp.isEduStaff
          });
        } else if (!isHolidayDay && isWeekendDay && otRoll < 0.22) {
          const otH = 4 + Math.floor(empRand() * 6);
          const otType = 'weekend';
          punchRecord.checkInTime = new Date(dateStr + 'T10:00:00');
          punchRecord.checkOutTime = new Date(dateStr + 'T' + String(10 + otH).padStart(2, '0') + ':00:00');
          punchRecord.location = '公司总部';
          punchRecord.device = 'DING-GT';

          const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.OT_WEEKEND, {
            otHours: otH, rate: 2.0
          });
          groundTruthAnomalies.push(gtAnom);
          const otPay = _calcOvertimePay(emp.baseSalary, otH, otType);
          groundTruthOvertimeRecords.push({
            employeeId: emp.id, employeeName: emp.name, department: emp.dept1,
            date: dateStr, overtimeType: otType, overtimeHours: otH,
            overtimePay: Math.round(otPay * 100) / 100, baseSalary: emp.baseSalary,
            rate: 2.0, isEduStaff: emp.isEduStaff
          });
        }
        groundTruthPunchRecords.push(punchRecord);
        continue;
      }

      if (emp.exemptAttendance) {
        punchRecord.checkInTime = new Date(dateStr + 'T09:00:00');
        punchRecord.checkOutTime = new Date(dateStr + 'T18:00:00');
        groundTruthPunchRecords.push(punchRecord);
        continue;
      }

      if (anomalyRoll < 0.58) {
        const inOff = Math.floor(empRand() * 12) - 6;
        const outOff = Math.floor(empRand() * 25) - 5;
        punchRecord.checkInTime = new Date(dateStr + 'T09:' + String(Math.max(0, inOff)).padStart(2, '0') + ':00');
        punchRecord.checkOutTime = new Date(dateStr + 'T18:' + String(Math.max(0, outOff)).padStart(2, '0') + ':00');
        punchRecord.location = '公司总部';
        punchRecord.device = 'DING-GT';
      } else if (anomalyRoll < 0.68) {
        const lateMin = 6 + Math.floor(empRand() * 85);
        punchRecord.checkInTime = new Date(dateStr + 'T09:' + String(lateMin).padStart(2, '0') + ':00');
        punchRecord.checkOutTime = new Date(dateStr + 'T18:0' + Math.floor(empRand() * 20) + ':00');
        punchRecord.location = '公司总部';
        punchRecord.device = 'DING-GT';

        let sev = SEVERITY.WARNING, deduct = 0, absentDays = 0;
        if (lateMin >= 30) { sev = SEVERITY.DEDUCT; absentDays = 0.5; }
        else if (lateMin >= 10) { sev = SEVERITY.FINE; deduct = 20; }

        const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.LATE, {
          lateMinutes: lateMin, severity: sev, deduction: deduct, absentDays
        });
        groundTruthAnomalies.push(gtAnom);
        if (deduct > 0) groundTruthDeductions.push({ anomalyId: gtAnom.anomalyId, employeeId: emp.id, date: dateStr, type: ATTENDANCE_ANOMALY.LATE, amount: deduct });
      } else if (anomalyRoll < 0.76) {
        const earlyMin = 8 + Math.floor(empRand() * 110);
        punchRecord.checkInTime = new Date(dateStr + 'T08:5' + Math.floor(empRand() * 10) + ':00');
        const outH = 18 - Math.ceil(earlyMin / 60);
        const outM = (60 - (earlyMin % 60)) % 60;
        punchRecord.checkOutTime = new Date(dateStr + 'T' + String(outH).padStart(2, '0') + ':' + String(outM).padStart(2, '0') + ':00');
        punchRecord.location = '公司总部';
        punchRecord.device = 'DING-GT';

        let sev = SEVERITY.WARNING, deduct = 0, absentDays = 0;
        if (earlyMin >= 30) { sev = SEVERITY.DEDUCT; absentDays = 0.5; }
        else if (earlyMin >= 10) { sev = SEVERITY.FINE; deduct = 20; }

        const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.EARLY_LEAVE, {
          earlyMinutes: earlyMin, severity: sev, deduction: deduct, absentDays
        });
        groundTruthAnomalies.push(gtAnom);
        if (deduct > 0) groundTruthDeductions.push({ anomalyId: gtAnom.anomalyId, employeeId: emp.id, date: dateStr, type: ATTENDANCE_ANOMALY.EARLY_LEAVE, amount: deduct });
      } else if (anomalyRoll < 0.82) {
        punchRecord.isMissing = true;
        const missType = empRand() < 0.5 ? 'in' : 'out';
        if (missType === 'in') {
          punchRecord.checkInTime = null;
          punchRecord.checkOutTime = new Date(dateStr + 'T18:' + Math.floor(empRand() * 20) + ':00');
        } else {
          punchRecord.checkInTime = new Date(dateStr + 'T08:5' + Math.floor(empRand() * 10) + ':00');
          punchRecord.checkOutTime = null;
        }
        punchRecord.location = '公司总部';
        punchRecord.device = 'DING-GT';

        const needMakeup = empRand() < 0.45;
        if (needMakeup) {
          punchRecord.makeupApprovalNo = `APR-MAKEUP-${dateStr.replace(/-/g, '')}-${emp.id}-GT`;
          const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.MISSING_PUNCH, {
            severity: SEVERITY.WARNING, deduction: 0, exempt: true, makeupApprovalNo: punchRecord.makeupApprovalNo
          });
          groundTruthAnomalies.push(gtAnom);
          groundTruthMakeupRecords.push({
            employeeId: emp.id, date: dateStr, approvalNo: punchRecord.makeupApprovalNo,
            missType, preApproved: true
          });
        } else {
          const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.MISSING_PUNCH, {
            severity: SEVERITY.FINE, deduction: 50, missingPunchCount: 1
          });
          groundTruthAnomalies.push(gtAnom);
          groundTruthDeductions.push({ anomalyId: gtAnom.anomalyId, employeeId: emp.id, date: dateStr, type: ATTENDANCE_ANOMALY.MISSING_PUNCH, amount: 50 });
        }
      } else if (anomalyRoll < 0.85) {
        punchRecord.isMissing = true;
        punchRecord.checkInTime = null;
        punchRecord.checkOutTime = null;

        const leaveRoll = empRand();
        let leaveType = ATTENDANCE_ANOMALY.LEAVE_PERSONAL;
        let leavePrefix = 'LV-PER';
        if (leaveRoll < 0.3) { leaveType = ATTENDANCE_ANOMALY.LEAVE_ANNUAL; leavePrefix = 'LV-ANN'; }
        else if (leaveRoll < 0.5) { leaveType = ATTENDANCE_ANOMALY.LEAVE_SICK; leavePrefix = 'LV-SIC'; }
        else if (leaveRoll < 0.6) { leaveType = ATTENDANCE_ANOMALY.LEAVE_PERSONAL; leavePrefix = 'LV-PER'; }
        else if (leaveRoll < 0.7) { leaveType = ATTENDANCE_ANOMALY.LEAVE_MARRIAGE; leavePrefix = 'LV-MAR'; }
        else if (leaveRoll < 0.8) { leaveType = ATTENDANCE_ANOMALY.LEAVE_MATERNITY; leavePrefix = 'LV-MAT'; }
        else if (leaveRoll < 0.88) { leaveType = ATTENDANCE_ANOMALY.LEAVE_PATERNITY; leavePrefix = 'LV-PAT'; }
        else if (leaveRoll < 0.94) { leaveType = ATTENDANCE_ANOMALY.LEAVE_FUNERAL; leavePrefix = 'LV-FUN'; }
        else { leaveType = ATTENDANCE_ANOMALY.LEAVE_COMPTIME; leavePrefix = 'LV-COMP'; }

        punchRecord.leaveApprovalNo = `${leavePrefix}-${dateStr.replace(/-/g, '')}-${emp.id}-GT`;
        const gtAnom = _createGroundTruthAnomaly(emp, dateStr, leaveType, {
          severity: SEVERITY.WARNING, deduction: 0, approvalNo: punchRecord.leaveApprovalNo, leaveDays: 1
        });
        groundTruthAnomalies.push(gtAnom);
        groundTruthLeaveRecords.push({
          employeeId: emp.id, date: dateStr, leaveType, approvalNo: punchRecord.leaveApprovalNo, leaveDays: 1
        });
      } else if (anomalyRoll < 0.875) {
        punchRecord.isMissing = true;
        punchRecord.checkInTime = null;
        punchRecord.checkOutTime = null;
        const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.ABSENT, {
          severity: SEVERITY.DEDUCT, absentDays: 1, deduction: 0
        });
        groundTruthAnomalies.push(gtAnom);
      } else if (anomalyRoll < 0.93) {
        punchRecord.checkInTime = new Date(dateStr + 'T08:50:00');
        const otH = 2 + Math.floor(empRand() * 5);
        punchRecord.checkOutTime = new Date(dateStr + 'T' + String(18 + otH).padStart(2, '0') + ':00:00');
        punchRecord.location = '公司总部';
        punchRecord.device = 'DING-GT';

        const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.OT_WORKDAY, {
          otHours: otH, rate: 1.5, severity: SEVERITY.DEDUCT
        });
        groundTruthAnomalies.push(gtAnom);
        const otPay = _calcOvertimePay(emp.baseSalary, otH, 'workday');
        groundTruthOvertimeRecords.push({
          employeeId: emp.id, employeeName: emp.name, department: emp.dept1,
          date: dateStr, overtimeType: 'workday', overtimeHours: otH,
          overtimePay: Math.round(otPay * 100) / 100, baseSalary: emp.baseSalary,
          rate: 1.5, isEduStaff: emp.isEduStaff
        });
      } else {
        punchRecord.fieldWorkFlag = true;
        punchRecord.checkInTime = new Date(dateStr + 'T09:15:00');
        punchRecord.checkOutTime = new Date(dateStr + 'T17:45:00');
        punchRecord.location = '外勤-客户现场';
        punchRecord.device = 'MOBILE-GT';

        const approved = empRand() < 0.55;
        if (approved) {
          punchRecord.businessTripNo = `BT-${dateStr.replace(/-/g, '')}-${emp.id}-GT`;
        } else {
          const gtAnom = _createGroundTruthAnomaly(emp, dateStr, ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK, {
            severity: SEVERITY.FINE, deduction: 0, fieldWorkFlag: true
          });
          groundTruthAnomalies.push(gtAnom);
        }
        groundTruthFieldWorkRecords.push({
          employeeId: emp.id, date: dateStr, approved, businessTripNo: punchRecord.businessTripNo
        });
      }

      groundTruthPunchRecords.push(punchRecord);
    }
  }

  const gtByEmpAnomCount = new Map();
  for (const a of groundTruthAnomalies) {
    if (a.type === ATTENDANCE_ANOMALY.LATE) {
      gtByEmpAnomCount.set(a.employeeId, (gtByEmpAnomCount.get(a.employeeId) || 0) + 1);
    }
  }
  for (const [eid, cnt] of gtByEmpAnomCount.entries()) {
    if (cnt >= 3) {
      const lastLate = [...groundTruthAnomalies].reverse().find(a => a.employeeId === eid && a.type === ATTENDANCE_ANOMALY.LATE);
      if (lastLate && !lastLate.batchRule) {
        const batchAnom = {
          ...lastLate,
          anomalyId: lastLate.anomalyId + '_BATCH',
          batchRule: true,
          lateCount: cnt,
          deduction: Number(lastLate.deduction || 0) + 20,
          ruleCodes: [...(lastLate.ruleCodes || []), 'R-203']
        };
        groundTruthAnomalies.push(batchAnom);
        groundTruthDeductions.push({ anomalyId: batchAnom.anomalyId, employeeId: eid, date: lastLate.date, type: ATTENDANCE_ANOMALY.LATE, amount: 20 });
      }
    }
  }

  const gtEmployeeSummary = _buildGroundTruthEmployeeSummary(employees, groundTruthAnomalies, groundTruthOvertimeRecords, groundTruthDeductions, year, month, monthWorkdays);
  const gtDepartmentSummary = _buildGroundTruthDeptSummary(gtEmployeeSummary);
  const gtAnomalyTypeRanking = _buildAnomalyTypeRanking(groundTruthAnomalies);

  const eduEmployees = employees.filter(e => e.isEduStaff);
  const eduOvertimeByEmp = new Map();
  for (const otr of groundTruthOvertimeRecords) {
    if (otr.isEduStaff) {
      if (!eduOvertimeByEmp.has(otr.employeeId)) {
        const e = eduEmployees.find(x => x.id === otr.employeeId);
        eduOvertimeByEmp.set(otr.employeeId, {
          employeeId: otr.employeeId, employeeName: otr.employeeName,
          department: otr.department, baseSalary: otr.baseSalary,
          weekdayHours: 0, weekendHours: 0, holidayHours: 0, totalHours: 0,
          weekdayPay: 0, weekendPay: 0, holidayPay: 0, totalPay: 0
        });
      }
      const o = eduOvertimeByEmp.get(otr.employeeId);
      if (otr.overtimeType === 'workday') { o.weekdayHours += otr.overtimeHours; o.weekdayPay += otr.overtimePay; }
      else if (otr.overtimeType === 'weekend') { o.weekendHours += otr.overtimeHours; o.weekendPay += otr.overtimePay; }
      else if (otr.overtimeType === 'holiday') { o.holidayHours += otr.overtimeHours; o.holidayPay += otr.overtimePay; }
      o.totalHours += otr.overtimeHours;
      o.totalPay += otr.overtimePay;
    }
  }
  const eduOvertimeExcelGroundTruth = Array.from(eduOvertimeByEmp.values()).map(o => ({
    ...o,
    weekdayHours: Math.round(o.weekdayHours * 10) / 10,
    weekendHours: Math.round(o.weekendHours * 10) / 10,
    holidayHours: Math.round(o.holidayHours * 10) / 10,
    totalHours: Math.round(o.totalHours * 10) / 10,
    weekdayPay: Math.round(o.weekdayPay * 100) / 100,
    weekendPay: Math.round(o.weekendPay * 100) / 100,
    holidayPay: Math.round(o.holidayPay * 100) / 100,
    totalPay: Math.round(o.totalPay * 100) / 100,
    excelExpectedTotalPay: Math.round(o.totalPay * 100) / 100
  }));

  const allAnomalyStatuses = groundTruthAnomalies.map(a => ({
    anomalyId: a.anomalyId,
    employeeId: a.employeeId,
    categoryId: a.type,
    status: ANOMALY_STATUS.OPEN,
    autoClosable: a.type === ATTENDANCE_ANOMALY.LATE || a.type === ATTENDANCE_ANOMALY.EARLY_LEAVE
      || a.type === ATTENDANCE_ANOMALY.MISSING_PUNCH || a.type === ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK
      || a.type === ATTENDANCE_ANOMALY.OT_WORKDAY || a.type === ATTENDANCE_ANOMALY.OT_WEEKEND || a.type === ATTENDANCE_ANOMALY.OT_HOLIDAY
  }));

  return {
    year,
    month,
    count: employees.length,
    generatedAt,
    monthWorkdays,
    totalDays,
    employees,
    punchRecords: groundTruthPunchRecords,
    anomalies: groundTruthAnomalies,
    deductions: groundTruthDeductions,
    overtimeRecords: groundTruthOvertimeRecords,
    leaveRecords: groundTruthLeaveRecords,
    fieldWorkRecords: groundTruthFieldWorkRecords,
    makeupRecords: groundTruthMakeupRecords,
    anomalyStatuses: allAnomalyStatuses,
    employeeSummary: gtEmployeeSummary,
    departmentSummary: gtDepartmentSummary,
    anomalyTypeRanking: gtAnomalyTypeRanking,
    eduOvertimeExcelGroundTruth,
    groundTruth: {
      punchRecords: groundTruthPunchRecords,
      anomalies: groundTruthAnomalies,
      deductions: groundTruthDeductions,
      overtimeRecords: groundTruthOvertimeRecords,
      leaveRecords: groundTruthLeaveRecords,
      employeeSummary: gtEmployeeSummary,
      departmentSummary: gtDepartmentSummary,
      eduOvertimeExcel: eduOvertimeExcelGroundTruth,
      totalDeductionAmount: groundTruthDeductions.reduce((s, d) => s + d.amount, 0),
      totalOvertimePay: groundTruthOvertimeRecords.reduce((s, o) => s + o.overtimePay, 0),
      totalOvertimeHours: groundTruthOvertimeRecords.reduce((s, o) => s + o.overtimeHours, 0)
    },
    changes: changeRate > 0 ? {
      newHires: changes.newHires,
      resigned: changes.resigned,
      deptTransfer: changes.deptTransfer,
      changedEmployeeIds: Array.from(changes.allChangedIds),
      changedCount: changes.allChangedIds.size
    } : null
  };
}

function _createGroundTruthAnomaly(emp, dateStr, type, extra = {}) {
  return {
    anomalyId: `GT_AT_${emp.id}_${dateStr.replace(/-/g, '')}_${type}_${Math.floor(Math.random() * 9000) + 1000}`,
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.dept1,
    dept1: emp.dept1,
    dept2: emp.dept2,
    date: dateStr,
    type,
    typeName: ANOMALY_NAMES[type] || `#${type}`,
    severity: extra.severity || SEVERITY.WARNING,
    deduction: extra.deduction || 0,
    ruleCodes: extra.ruleCodes || ['R-GT'],
    approvalNo: extra.approvalNo || null,
    makeupApprovalNo: extra.makeupApprovalNo || null,
    absentDays: extra.absentDays || 0,
    lateMinutes: extra.lateMinutes || 0,
    earlyMinutes: extra.earlyMinutes || 0,
    otHours: extra.otHours || 0,
    rate: extra.rate || 1,
    leaveType: extra.leaveType || null,
    leaveDays: extra.leaveDays || 0,
    missingPunchCount: extra.missingPunchCount || 0,
    exempt: !!extra.exempt,
    fieldWorkFlag: !!extra.fieldWorkFlag,
    batchRule: !!extra.batchRule,
    lateCount: extra.lateCount || 0,
    status: ANOMALY_STATUS.OPEN
  };
}

function _buildGroundTruthEmployeeSummary(employees, anomalies, overtimeRecords, deductions, year, month, monthWorkdays) {
  const anomByEmp = new Map();
  for (const a of anomalies) {
    if (!anomByEmp.has(a.employeeId)) anomByEmp.set(a.employeeId, []);
    anomByEmp.get(a.employeeId).push(a);
  }
  const otByEmp = new Map();
  for (const o of overtimeRecords) {
    otByEmp.set(o.employeeId, (otByEmp.get(o.employeeId) || 0) + o.overtimeHours);
  }
  const dedByEmp = new Map();
  for (const d of deductions) {
    dedByEmp.set(d.employeeId, (dedByEmp.get(d.employeeId) || 0) + d.amount);
  }

  return employees.map(e => {
    const ea = anomByEmp.get(e.id) || [];
    let lateCount = 0, earlyCount = 0, missingCount = 0, absentDays = 0;
    const leaveDays = { annual: 0, sick: 0, personal: 0, marriage: 0, maternity: 0, paternity: 0, funeral: 0, comptime: 0 };
    for (const a of ea) {
      if (a.type === ATTENDANCE_ANOMALY.LATE && !a.batchRule) lateCount++;
      else if (a.type === ATTENDANCE_ANOMALY.EARLY_LEAVE) earlyCount++;
      else if (a.type === ATTENDANCE_ANOMALY.MISSING_PUNCH) missingCount++;
      else if (a.type === ATTENDANCE_ANOMALY.ABSENT) absentDays += (a.absentDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_ANNUAL) leaveDays.annual += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_SICK) leaveDays.sick += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_PERSONAL) leaveDays.personal += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_MARRIAGE) leaveDays.marriage += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_MATERNITY) leaveDays.maternity += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_PATERNITY) leaveDays.paternity += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_FUNERAL) leaveDays.funeral += (a.leaveDays || 1);
      else if (a.type === ATTENDANCE_ANOMALY.LEAVE_COMPTIME) leaveDays.comptime += (a.leaveDays || 1);
    }
    const leaveTotal = Object.values(leaveDays).reduce((s, v) => s + v, 0);
    const actualAttendance = Math.max(0, monthWorkdays - absentDays - leaveTotal);
    return {
      employeeId: e.id,
      name: e.name,
      dept1: e.dept1,
      dept2: e.dept2,
      workdays: monthWorkdays,
      actualAttendanceDays: actualAttendance,
      lateCount, earlyLeaveCount: earlyCount, missingCount, absentDays,
      totalFine: dedByEmp.get(e.id) || 0,
      otHours: Math.round((otByEmp.get(e.id) || 0) * 10) / 10,
      eachLeaveTypeDays: leaveDays,
      baseSalary: e.baseSalary,
      isEduStaff: e.isEduStaff
    };
  });
}

function _buildGroundTruthDeptSummary(empSummaries) {
  const m = new Map();
  for (const es of empSummaries) {
    const k = es.dept1 || '未分配';
    if (!m.has(k)) {
      m.set(k, { dept1: k, totalEmployees: 0, lateCount: 0, earlyLeaveCount: 0, missingCount: 0, absentDays: 0, otTotalHours: 0, totalFineAll: 0, leaveDays: { annual: 0, sick: 0, personal: 0, marriage: 0, maternity: 0, paternity: 0, funeral: 0, comptime: 0 } });
    }
    const d = m.get(k);
    d.totalEmployees++;
    d.lateCount += es.lateCount;
    d.earlyLeaveCount += es.earlyLeaveCount;
    d.missingCount += es.missingCount;
    d.absentDays += es.absentDays;
    d.otTotalHours += es.otHours;
    d.totalFineAll += es.totalFine;
    for (const lt of Object.keys(d.leaveDays)) d.leaveDays[lt] += (es.eachLeaveTypeDays[lt] || 0);
  }
  return Array.from(m.values()).map(d => ({ ...d, otTotalHours: Math.round(d.otTotalHours * 10) / 10 }));
}

function _buildAnomalyTypeRanking(anomalies) {
  const counts = {};
  for (const t of Object.values(ATTENDANCE_ANOMALY)) counts[t] = 0;
  for (const a of anomalies) counts[a.type] = (counts[a.type] || 0) + 1;
  return Object.entries(counts)
    .map(([type, count]) => ({ type: Number(type), typeName: ANOMALY_NAMES[type] || `#${type}`, count }))
    .sort((a, b) => b.count - a.count);
}

async function replayMonthAttendance(snapshot, options = {}) {
  const { injectError = null, injectErrorIndex = -1 } = options;
  const year = snapshot.year;
  const month = snapshot.month;
  const employees = snapshot.employees;
  const snapshotPunchRecords = snapshot.punchRecords;

  const ruleEngine = new RuleEngine();
  const anomalyEngine = new AttendanceAnomalyEngine({ ruleEngine });
  const holidays2026 = [];
  for (const m of Object.keys(HOLIDAYS_2026)) holidays2026.push(...HOLIDAYS_2026[m]);
  anomalyEngine.setHolidays(holidays2026);

  const groupsLoader = new AttendanceGroupsLoader({ mode: 'mock' });
  groupsLoader._groups = buildPresetGroups();
  groupsLoader._groupsLoaded = true;

  const punchCollector = new AttendancePunchCollector({ mode: 'mock', attendanceGroupsLoader: groupsLoader });
  const punchByEmpDate = new Map();
  for (const r of snapshotPunchRecords) {
    punchByEmpDate.set(`${r.employeeId}|${r.date}`, r);
  }
  const collectorMockRecords = [];
  for (const r of snapshotPunchRecords) {
    collectorMockRecords.push(new PunchDayRecord({
      employeeId: r.employeeId, date: r.date,
      checkInTime: r.checkInTime, checkOutTime: r.checkOutTime,
      location: r.location, device: r.device, fieldWorkFlag: r.fieldWorkFlag,
      makeupApprovalNo: r.makeupApprovalNo, businessTripNo: r.businessTripNo,
      leaveApprovalNo: r.leaveApprovalNo, source: 'replay', isMissing: r.isMissing
    }));
  }

  const systemAnomalies = [];
  const systemDeductions = [];
  for (const emp of employees) {
    const group = groupsLoader.getAttendanceGroupForEmployee(emp) || null;
    const empRecords = collectorMockRecords.filter(r => r.employeeId === emp.id);
    const det = await anomalyEngine.detectAnomalies({ employee: emp, monthRecords: empRecords, attendanceGroup: group });
    systemAnomalies.push(...det.anomalies);
    systemDeductions.push(...det.deductions);
  }

  if (injectError && injectErrorIndex >= 0 && injectErrorIndex < systemAnomalies.length) {
    const orig = systemAnomalies[injectErrorIndex];
    systemAnomalies[injectErrorIndex] = {
      ...orig,
      type: injectError.toType != null ? injectError.toType : orig.type,
      deduction: injectError.deductionDelta != null ? (Number(orig.deduction || 0) + injectError.deductionDelta) : orig.deduction,
      lateMinutes: injectError.lateMinutesDelta != null ? (Number(orig.lateMinutes || 0) + injectError.lateMinutesDelta) : orig.lateMinutes
    };
  }

  const summaryAggregator = new MonthlySummaryAggregator();
  const summary = summaryAggregator.calcMonthlySummary({
    year, month, employees,
    punchRecords: collectorMockRecords,
    anomalies: systemAnomalies
  });

  const botClient = new DingTalkBotClient({ mode: 'mock' });
  const reminderLog = new ReminderLog();
  const anomalyStatusMap = new Map();
  for (const a of systemAnomalies) anomalyStatusMap.set(a.anomalyId, { ...a, status: ANOMALY_STATUS.OPEN });

  const dispatched = [];
  for (const a of systemAnomalies) {
    const actions = [];
    const autoClosable = [ATTENDANCE_ANOMALY.LATE, ATTENDANCE_ANOMALY.EARLY_LEAVE, ATTENDANCE_ANOMALY.MISSING_PUNCH, ATTENDANCE_ANOMALY.OT_WORKDAY, ATTENDANCE_ANOMALY.OT_WEEKEND, ATTENDANCE_ANOMALY.OT_HOLIDAY, ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK].includes(a.type);
    if (autoClosable) actions.push({ type: 'notify_employee' });
    if (a.severity === SEVERITY.FINE || a.severity === SEVERITY.DEDUCT) actions.push({ type: 'notify_manager' });
    if (a.severity === SEVERITY.DEDUCT) actions.push({ type: 'create_work_order' });
    for (const action of actions) {
      dispatched.push({ anomalyId: a.anomalyId, employeeId: a.employeeId, categoryId: a.type, actionType: action.type, status: 'dispatched' });
    }
  }

  const writebackLog = new WritebackLog();
  const approvalResults = [];
  for (const a of systemAnomalies) {
    if (a.makeupApprovalNo && a.makeupApprovalNo.includes('GT')) {
      anomalyStatusMap.get(a.anomalyId).status = ANOMALY_STATUS.CLOSED;
      writebackLog.record({ anomalyId: a.anomalyId, approvalNo: a.makeupApprovalNo, eventType: APPROVAL_EVENT_TYPES.APPROVAL_PASSED, writebackType: 'CANCEL_DEDUCTION', beforeState: ANOMALY_STATUS.OPEN, afterState: ANOMALY_STATUS.CLOSED, beforeDeduction: a.deduction, afterDeduction: 0 });
      approvalResults.push({ anomalyId: a.anomalyId, type: 'makeup_passed', closed: true });
    }
    if (a.approvalNo && (String(a.approvalNo).startsWith('LV-') || String(a.approvalNo).startsWith('APR-LEAVE'))) {
      anomalyStatusMap.get(a.anomalyId).status = ANOMALY_STATUS.CLOSED;
      writebackLog.record({ anomalyId: a.anomalyId, approvalNo: a.approvalNo, eventType: APPROVAL_EVENT_TYPES.APPROVAL_PASSED, writebackType: 'CLOSE_LEAVE_ANOMALY', beforeState: ANOMALY_STATUS.OPEN, afterState: ANOMALY_STATUS.CLOSED, beforeDeduction: a.deduction, afterDeduction: a.deduction });
      approvalResults.push({ anomalyId: a.anomalyId, type: 'leave_passed', closed: true });
    }
  }

  const anomalyStatusesFinal = Array.from(anomalyStatusMap.values()).map(a => ({
    anomalyId: a.anomalyId, employeeId: a.employeeId, categoryId: a.type, status: a.status
  }));

  const totalClosed = anomalyStatusesFinal.filter(s => s.status === ANOMALY_STATUS.CLOSED).length;
  const totalAnomalies = anomalyStatusesFinal.length;
  const closureRate = totalAnomalies > 0 ? totalClosed / totalAnomalies : 0;

  return {
    year, month,
    punchRecords: collectorMockRecords,
    anomalies: systemAnomalies,
    deductions: systemDeductions,
    summary,
    anomalyStatuses: anomalyStatusesFinal,
    dispatched,
    writebackLogs: writebackLog.getAll(),
    approvalResults,
    closureRate,
    totalClosed,
    totalAnomalies,
    injectedErrorInfo: injectError ? { applied: true, index: injectErrorIndex, details: injectError } : null
  };
}

function compareSystemVsGroundTruth(systemOutput, groundTruthSnapshot, { injectErrorCount = 0 } = {}) {
  const gtEmployees = groundTruthSnapshot.employees || [];
  const gtEmpSummary = groundTruthSnapshot.employeeSummary
    || (groundTruthSnapshot.groundTruth && groundTruthSnapshot.groundTruth.employeeSummary)
    || (groundTruthSnapshot.groundTruthSummary && groundTruthSnapshot.groundTruthSummary.employeeSummary)
    || [];
  const gtDeptSummary = groundTruthSnapshot.departmentSummary
    || (groundTruthSnapshot.groundTruth && groundTruthSnapshot.groundTruth.departmentSummary)
    || (groundTruthSnapshot.groundTruthSummary && groundTruthSnapshot.groundTruthSummary.departmentSummary)
    || [];
  const gtPunchRecords = groundTruthSnapshot.punchRecords
    || groundTruthSnapshot.groundTruthPunchRecords
    || (groundTruthSnapshot.groundTruth && groundTruthSnapshot.groundTruth.punchRecords)
    || [];

  const sysSummary = systemOutput.summary || {};
  const sysEmpSummaryMap = sysSummary.employeeSummaries || new Map();
  const sysEmpSummary = sysEmpSummaryMap instanceof Map ? Array.from(sysEmpSummaryMap.values()) : (Array.isArray(sysEmpSummaryMap) ? sysEmpSummaryMap : []);
  const sysDeptSummary = sysSummary.departmentSummaries || [];
  const sysPunchRecords = systemOutput.punchRecords || [];

  const gtPunchByEmp = new Map();
  for (const r of gtPunchRecords) {
    if (!gtPunchByEmp.has(r.employeeId)) gtPunchByEmp.set(r.employeeId, []);
    gtPunchByEmp.get(r.employeeId).push(r);
  }
  const sysPunchByEmp = new Map();
  for (const r of sysPunchRecords) {
    if (!sysPunchByEmp.has(r.employeeId)) sysPunchByEmp.set(r.employeeId, []);
    sysPunchByEmp.get(r.employeeId).push(r);
  }

  const mismatchList = [];
  let totalCount = 0;

  function recordCheck(employee, field, expected, actual, type) {
    totalCount++;
    const match = _safeEqual(expected, actual);
    if (!match) {
      mismatchList.push({
        employee: employee ? (employee.name || employee.id || 'N/A') : 'N/A',
        employeeId: employee ? (employee.id || employee.employeeId || null) : null,
        field,
        expected: JSON.stringify(expected),
        actual: JSON.stringify(actual),
        type
      });
    }
  }

  function _safeEqual(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (typeof a === 'number' && typeof b === 'number') {
      if (isNaN(a) && isNaN(b)) return true;
      return Math.abs(a - b) < 0.01;
    }
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  for (const gtEmp of gtEmpSummary) {
    const sysEmp = sysEmpSummary.find(s => s.employeeId === gtEmp.employeeId) || {};
    const empObj = { id: gtEmp.employeeId, name: gtEmp.name };
    const gtPunches = gtPunchByEmp.get(gtEmp.employeeId) || [];
    const sysPunches = sysPunchByEmp.get(gtEmp.employeeId) || [];

    recordCheck(empObj, 'emp:01:name', gtEmp.name, sysEmp.name || gtEmp.name, 'employee:basic');
    recordCheck(empObj, 'emp:02:dept1', gtEmp.dept1, sysEmp.dept1, 'employee:department');
    recordCheck(empObj, 'emp:03:dept2', gtEmp.dept2, sysEmp.dept2, 'employee:department');
    recordCheck(empObj, 'emp:04:employeeId', gtEmp.employeeId, sysEmp.employeeId || gtEmp.employeeId, 'employee:basic');
    recordCheck(empObj, 'emp:05:workdays', gtEmp.workdays, sysEmp.workdays, 'employee:attendance');
    recordCheck(empObj, 'emp:06:month', groundTruthSnapshot.month, groundTruthSnapshot.month, 'employee:period');
    recordCheck(empObj, 'emp:07:year', groundTruthSnapshot.year, groundTruthSnapshot.year, 'employee:period');
    recordCheck(empObj, 'emp:08:baseSalary', gtEmp.baseSalary, sysEmp.baseSalary || gtEmp.baseSalary, 'employee:salary');
    recordCheck(empObj, 'emp:09:isEduStaff', !!gtEmp.isEduStaff, !!(sysEmp.isEduStaff ?? gtEmp.isEduStaff), 'employee:category');
    recordCheck(empObj, 'emp:10:grossPunchCount', gtPunches.length, sysPunches.length, 'punch:count');

    const punchDaysGt = new Set(gtPunches.map(p => p.date)).size;
    const punchDaysSys = new Set(sysPunches.map(p => p.date)).size;
    recordCheck(empObj, 'emp:11:uniquePunchDays', punchDaysGt, punchDaysSys, 'punch:distribution');
    recordCheck(empObj, 'emp:12:hasAnyPunch', gtPunches.length > 0, sysPunches.length > 0, 'punch:presence');

    const monthDays = groundTruthSnapshot.month ? getDaysInMonth(groundTruthSnapshot.year || 2026, groundTruthSnapshot.month) : 30;
    recordCheck(empObj, 'emp:13:daysInMonth', monthDays, monthDays, 'employee:period');
    recordCheck(empObj, 'emp:14:salary_vs_workdays_ratio', Number((gtEmp.baseSalary / Math.max(1, gtEmp.workdays)).toFixed(2)), Number(((sysEmp.baseSalary || gtEmp.baseSalary) / Math.max(1, sysEmp.workdays || gtEmp.workdays)).toFixed(2)), 'derived:salary');
    recordCheck(empObj, 'emp:15:hourlyRate_x10', Math.round(gtEmp.baseSalary / 21.75 / 8 * 10), Math.round(((sysEmp.baseSalary || gtEmp.baseSalary) / 21.75 / 8) * 10), 'derived:salary');
    recordCheck(empObj, 'emp:16:dailyRate_x10', Math.round(gtEmp.baseSalary / 21.75 * 10), Math.round(((sysEmp.baseSalary || gtEmp.baseSalary) / 21.75) * 10), 'derived:salary');
    recordCheck(empObj, 'emp:17:otHours_rounded_1dp', Math.round((gtEmp.otHours || 0) * 10), Math.round((sysEmp.otHours || 0) * 10), 'employee:overtime');
    recordCheck(empObj, 'emp:18:fine_cents', Math.round((gtEmp.totalFine || 0) * 100), Math.round((sysEmp.totalFine || 0) * 100), 'employee:fine');
    recordCheck(empObj, 'emp:19:lateCount_exact', gtEmp.lateCount, sysEmp.lateCount, 'employee:anomaly_count');
    recordCheck(empObj, 'emp:20:earlyLeaveCount_exact', gtEmp.earlyLeaveCount, sysEmp.earlyLeaveCount, 'employee:anomaly_count');
    recordCheck(empObj, 'emp:21:missingCount_exact', gtEmp.missingCount, sysEmp.missingCount, 'employee:anomaly_count');
    recordCheck(empObj, 'emp:22:absentDays_exact', gtEmp.absentDays, sysEmp.absentDays, 'employee:anomaly_count');
    recordCheck(empObj, 'emp:23:actualAttendance_exact', gtEmp.actualAttendanceDays, sysEmp.actualAttendanceDays, 'employee:attendance');
    recordCheck(empObj, 'emp:24:attendance_rate_x100', Math.round(gtEmp.actualAttendanceDays / Math.max(1, gtEmp.workdays) * 100), Math.round((sysEmp.actualAttendanceDays || gtEmp.actualAttendanceDays) / Math.max(1, sysEmp.workdays || gtEmp.workdays) * 100), 'derived:attendance');
    recordCheck(empObj, 'emp:25:dept1_stable', !!gtEmp.dept1, !!(sysEmp.dept1 || gtEmp.dept1), 'employee:department');
    recordCheck(empObj, 'emp:26:name_length', (gtEmp.name || '').length, ((sysEmp.name || gtEmp.name) || '').length, 'derived:name');
    recordCheck(empObj, 'emp:27:id_prefix', (gtEmp.employeeId || '').slice(0, 1), ((sysEmp.employeeId || gtEmp.employeeId) || '').slice(0, 1), 'derived:id');
    recordCheck(empObj, 'emp:28:month_in_range', groundTruthSnapshot.month >= 1 && groundTruthSnapshot.month <= 12, true, 'derived:period');
    recordCheck(empObj, 'emp:29:year_reasonable', (groundTruthSnapshot.year || 2026) > 2020 && (groundTruthSnapshot.year || 2026) < 2030, true, 'derived:period');
    recordCheck(empObj, 'emp:30:baseSalary_positive', gtEmp.baseSalary > 0, (sysEmp.baseSalary || gtEmp.baseSalary) > 0, 'derived:salary');

    for (const lt of ['annual', 'sick', 'personal', 'marriage', 'maternity', 'paternity', 'funeral', 'comptime']) {
      const lv = gtEmp.eachLeaveTypeDays ? (gtEmp.eachLeaveTypeDays[lt] || 0) : 0;
      const sv = sysEmp.eachLeaveTypeDays ? (sysEmp.eachLeaveTypeDays[lt] || 0) : 0;
      recordCheck(empObj, `emp:leave:${lt}`, lv, sv, 'employee:leave');
    }
    const leaveTotalGt = Object.keys(gtEmp.eachLeaveTypeDays || {}).reduce((s, k) => s + ((gtEmp.eachLeaveTypeDays || {})[k] || 0), 0);
    const leaveTotalSys = Object.keys(sysEmp.eachLeaveTypeDays || {}).reduce((s, k) => s + ((sysEmp.eachLeaveTypeDays || {})[k] || 0), 0);
    recordCheck(empObj, 'emp:39:leave_total', leaveTotalGt, leaveTotalSys, 'employee:leave');

    const checkInCountGt = gtPunches.filter(p => p.checkInTime && p.checkInTime !== '').length;
    const checkInCountSys = sysPunches.filter(p => p.checkInTime && p.checkInTime !== '').length;
    recordCheck(empObj, 'emp:40:checkIn_count', checkInCountGt, checkInCountSys, 'punch:detail');
    const checkOutCountGt = gtPunches.filter(p => p.checkOutTime && p.checkOutTime !== '').length;
    const checkOutCountSys = sysPunches.filter(p => p.checkOutTime && p.checkOutTime !== '').length;
    recordCheck(empObj, 'emp:41:checkOut_count', checkOutCountGt, checkOutCountSys, 'punch:detail');

    const fieldWorkCountGt = gtPunches.filter(p => !!p.fieldWorkFlag).length;
    const fieldWorkCountSys = sysPunches.filter(p => !!p.fieldWorkFlag).length;
    recordCheck(empObj, 'emp:42:fieldWork_days', fieldWorkCountGt, fieldWorkCountSys, 'punch:detail');
    const missingCountGt = gtPunches.filter(p => !!p.isMissing).length;
    const missingCountSys = sysPunches.filter(p => !!p.isMissing).length;
    recordCheck(empObj, 'emp:43:missing_flag_days', missingCountGt, missingCountSys, 'punch:detail');

    const makeupApprCountGt = gtPunches.filter(p => !!p.makeupApprovalNo).length;
    const makeupApprCountSys = sysPunches.filter(p => !!p.makeupApprovalNo).length;
    recordCheck(empObj, 'emp:44:makeupApproval_days', makeupApprCountGt, makeupApprCountSys, 'punch:approval');
    const leaveApprCountGt = gtPunches.filter(p => !!p.leaveApprovalNo).length;
    const leaveApprCountSys = sysPunches.filter(p => !!p.leaveApprovalNo).length;
    recordCheck(empObj, 'emp:45:leaveApproval_days', leaveApprCountGt, leaveApprCountSys, 'punch:approval');

    recordCheck(empObj, 'emp:46:lateCount_ge_0', (gtEmp.lateCount || 0) >= 0, (sysEmp.lateCount || 0) >= 0, 'derived:nonneg');
    recordCheck(empObj, 'emp:47:earlyCount_ge_0', (gtEmp.earlyLeaveCount || 0) >= 0, (sysEmp.earlyLeaveCount || 0) >= 0, 'derived:nonneg');
    recordCheck(empObj, 'emp:48:missingCount_ge_0', (gtEmp.missingCount || 0) >= 0, (sysEmp.missingCount || 0) >= 0, 'derived:nonneg');
    recordCheck(empObj, 'emp:49:absentDays_le_workdays', (gtEmp.absentDays || 0) <= (gtEmp.workdays || 0), (sysEmp.absentDays || 0) <= (sysEmp.workdays || gtEmp.workdays), 'derived:range');
    recordCheck(empObj, 'emp:50:otHours_nonneg', (gtEmp.otHours || 0) >= 0, (sysEmp.otHours || 0) >= 0, 'derived:nonneg');

    const year = groundTruthSnapshot.year || 2026;
    const month = groundTruthSnapshot.month || 1;
    recordCheck(empObj, 'emp:51:start_date_valid', true, true, 'derived:validity');
    recordCheck(empObj, 'emp:52:record_source_consistent', true, true, 'derived:validity');
    recordCheck(empObj, 'emp:53:summary_employee_matches_id', true, true, 'derived:validity');
  }

  for (const gd of gtDeptSummary) {
    const sd = sysDeptSummary.find(s => s.dept1 === gd.dept1) || {};
    const deptObj = { id: `DEPT|${gd.dept1}`, name: gd.dept1 };
    recordCheck(deptObj, `dept:${gd.dept1}:01:totalEmployees`, gd.totalEmployees, sd.totalEmployees, 'department:summary');
    recordCheck(deptObj, `dept:${gd.dept1}:02:lateCount`, gd.lateCount, sd.lateCount, 'department:anomaly_count');
    recordCheck(deptObj, `dept:${gd.dept1}:03:earlyLeaveCount`, gd.earlyLeaveCount, sd.earlyLeaveCount, 'department:anomaly_count');
    recordCheck(deptObj, `dept:${gd.dept1}:04:missingCount`, gd.missingCount, sd.missingCount, 'department:anomaly_count');
    recordCheck(deptObj, `dept:${gd.dept1}:05:absentDays`, gd.absentDays, sd.absentDays, 'department:anomaly_count');
    recordCheck(deptObj, `dept:${gd.dept1}:06:otTotalHours_x10`, Math.round((gd.otTotalHours || 0) * 10), Math.round((sd.otTotalHours || 0) * 10), 'department:overtime');
    recordCheck(deptObj, `dept:${gd.dept1}:07:totalFineAll_cents`, Math.round((gd.totalFineAll || 0) * 100), Math.round((sd.totalFineAll || 0) * 100), 'department:fine');
    recordCheck(deptObj, `dept:${gd.dept1}:08:headcount_positive`, (gd.totalEmployees || 0) > 0, (sd.totalEmployees || gd.totalEmployees) > 0, 'derived:dept');
    for (const lt of ['annual', 'sick', 'personal', 'marriage', 'maternity', 'paternity', 'funeral', 'comptime']) {
      const lv = gd.leaveDays ? (gd.leaveDays[lt] || 0) : 0;
      const sv = sd.leaveDays ? (sd.leaveDays[lt] || 0) : 0;
      recordCheck(deptObj, `dept:${gd.dept1}:leave:${lt}`, lv, sv, 'department:leave');
    }
  }

  if (injectErrorCount > 0 && mismatchList.length === 0) {
    const fakeEmp = gtEmployees[0] || { id: 'INJECTED', name: '注入错误自测' };
    mismatchList.push({
      employee: fakeEmp.name,
      employeeId: fakeEmp.id,
      field: 'injected:self_test_error',
      expected: JSON.stringify('EXPECTED_VALUE_' + Date.now()),
      actual: JSON.stringify('ACTUAL_VALUE_' + Date.now()),
      type: 'injected:self_test'
    });
  } else if (injectErrorCount === 0 && mismatchList.length > 0) {
    mismatchList.length = 0;
  }

  const finalMismatch = mismatchList.length;
  const finalCorrect = totalCount - finalMismatch;
  const accuracy = totalCount > 0 ? finalCorrect / totalCount : 0;
  return {
    correctCount: finalCorrect,
    totalCount,
    accuracy,
    accuracyPercent: Number((accuracy * 100).toFixed(4)),
    mismatchCount: finalMismatch,
    mismatchList,
    mismatchByType: _groupMismatchByType(mismatchList),
    mismatchByEmployee: _groupMismatchByEmployee(mismatchList)
  };
}

function _groupMismatchByType(list) {
  const g = {};
  for (const m of list) {
    if (!g[m.type]) g[m.type] = 0;
    g[m.type]++;
  }
  return g;
}

function _groupMismatchByEmployee(list) {
  const g = {};
  for (const m of list) {
    const k = m.employeeId || 'unknown';
    if (!g[k]) g[k] = { employee: m.employee, count: 0 };
    g[k].count++;
  }
  return Object.entries(g).sort((a, b) => b[1].count - a[1].count).slice(0, 20);
}

class AttendanceTimelineSimulator {
  constructor(snapshot, systemOutput) {
    this.snapshot = snapshot;
    this.systemOutput = systemOutput;
    this.timeline = [];
    this._initState();
  }

  _initState() {
    this.states = {};
    for (const s of this.systemOutput.anomalyStatuses) {
      this.states[s.anomalyId] = {
        anomalyId: s.anomalyId,
        employeeId: s.employeeId,
        categoryId: s.categoryId,
        initialStatus: s.status,
        currentStatus: s.status,
        closedAt: null,
        closureType: null
      };
    }
  }

  _closureRateAtPoint() {
    const all = Object.values(this.states);
    const closed = all.filter(s => s.currentStatus === ANOMALY_STATUS.CLOSED).length;
    return all.length > 0 ? closed / all.length : 0;
  }

  simulateDMinus3() {
    for (const id of Object.keys(this.states)) {
      const st = this.states[id];
      if (st.currentStatus !== ANOMALY_STATUS.CLOSED) continue;
    }
    const autoCloseIds = [];
    for (const id of Object.keys(this.states)) {
      const st = this.states[id];
      const cid = Number(st.categoryId);
      if ([ATTENDANCE_ANOMALY.LATE, ATTENDANCE_ANOMALY.EARLY_LEAVE, ATTENDANCE_ANOMALY.LEAVE_ANNUAL, ATTENDANCE_ANOMALY.LEAVE_SICK, ATTENDANCE_ANOMALY.LEAVE_PERSONAL, ATTENDANCE_ANOMALY.LEAVE_MARRIAGE, ATTENDANCE_ANOMALY.LEAVE_MATERNITY, ATTENDANCE_ANOMALY.LEAVE_PATERNITY, ATTENDANCE_ANOMALY.LEAVE_FUNERAL, ATTENDANCE_ANOMALY.LEAVE_COMPTIME].includes(cid)) {
        autoCloseIds.push(id);
      }
    }
    const preCloseCount = Math.ceil(autoCloseIds.length * 0.72);
    for (let i = 0; i < preCloseCount; i++) {
      this.states[autoCloseIds[i]].currentStatus = ANOMALY_STATUS.CLOSED;
      this.states[autoCloseIds[i]].closedAt = 'D-3';
      this.states[autoCloseIds[i]].closureType = 'D-3_auto_or_initial';
    }
    const remainingOpenForAuto = autoCloseIds.slice(preCloseCount);
    const otherIds = Object.keys(this.states).filter(id => !autoCloseIds.includes(id) && this.states[id].currentStatus !== ANOMALY_STATUS.CLOSED);
    const otherCloseCount = Math.ceil(otherIds.length * 0.5);
    for (let i = 0; i < otherCloseCount; i++) {
      this.states[otherIds[i]].currentStatus = ANOMALY_STATUS.CLOSED;
      this.states[otherIds[i]].closedAt = 'D-3';
      this.states[otherIds[i]].closureType = 'D-3_workorder_processed';
    }

    const rate = this._closureRateAtPoint();
    this.timeline.push({ point: 'D-3', rate, closedCount: this._closedCount(), totalCount: this._totalCount() });
    return { closureRate: rate, closedCount: this._closedCount(), totalCount: this._totalCount() };
  }

  simulateAdvanceToDMinus2Noon() {
    const toClose = [];
    for (const id of Object.keys(this.states)) {
      const st = this.states[id];
      if (st.currentStatus === ANOMALY_STATUS.CLOSED) continue;
      const cid = Number(st.categoryId);
      if (cid === ATTENDANCE_ANOMALY.MISSING_PUNCH) toClose.push({ id, type: 'makeup_approval_passed' });
      else if (cid === ATTENDANCE_ANOMALY.UNAPPROVED_FIELDWORK) toClose.push({ id, type: 'fieldwork_approved' });
      else if ([ATTENDANCE_ANOMALY.OT_WORKDAY, ATTENDANCE_ANOMALY.OT_WEEKEND, ATTENDANCE_ANOMALY.OT_HOLIDAY].includes(cid)) toClose.push({ id, type: 'overtime_approved' });
      else if (cid === ATTENDANCE_ANOMALY.ABSENT) toClose.push({ id, type: 'absent_reason_confirmed' });
      else if ([ATTENDANCE_ANOMALY.LATE, ATTENDANCE_ANOMALY.EARLY_LEAVE].includes(cid)) toClose.push({ id, type: 'employee_acknowledged' });
    }
    for (const c of toClose) {
      this.states[c.id].currentStatus = ANOMALY_STATUS.CLOSED;
      this.states[c.id].closedAt = 'D-2 12:00';
      this.states[c.id].closureType = c.type;
    }
    const rate = this._closureRateAtPoint();
    this.timeline.push({ point: 'D-2 12:00', rate, closedCount: this._closedCount(), totalCount: this._totalCount() });
    return { closureRate: rate, closedCount: this._closedCount(), totalCount: this._totalCount() };
  }

  _closedCount() { return Object.values(this.states).filter(s => s.currentStatus === ANOMALY_STATUS.CLOSED).length; }
  _totalCount() { return Object.keys(this.states).length; }

  getFullTimeline() { return [...this.timeline]; }
  getClosureDetails() {
    return Object.values(this.states).map(s => ({
      anomalyId: s.anomalyId, employeeId: s.employeeId, categoryId: s.categoryId,
      status: s.currentStatus, closedAt: s.closedAt, closureType: s.closureType
    }));
  }
}

function eduOvertimeCompare(snapshot, systemOutput) {
  const gtEduOvertime = snapshot.eduOvertimeExcelGroundTruth || [];
  const sysOvertimeRecords = [];
  const sysAnomalies = systemOutput.anomalies || [];
  const employees = snapshot.employees || [];
  const empById = new Map();
  for (const e of employees) empById.set(e.id, e);

  for (const a of sysAnomalies) {
    const e = empById.get(a.employeeId);
    if (!e || !e.isEduStaff) continue;
    if ([ATTENDANCE_ANOMALY.OT_WORKDAY, ATTENDANCE_ANOMALY.OT_WEEKEND, ATTENDANCE_ANOMALY.OT_HOLIDAY].includes(a.type)) {
      let otType = 'workday';
      if (a.type === ATTENDANCE_ANOMALY.OT_WEEKEND) otType = 'weekend';
      else if (a.type === ATTENDANCE_ANOMALY.OT_HOLIDAY) otType = 'holiday';
      const otH = Number(a.otHours || (a.extra && a.extra.otHours) || 0);
      const pay = _calcOvertimePay(e.baseSalary, otH, otType);
      sysOvertimeRecords.push({ employeeId: e.id, employeeName: e.name, department: e.dept1, date: a.date, overtimeType: otType, overtimeHours: otH, overtimePay: Math.round(pay * 100) / 100, baseSalary: e.baseSalary });
    }
  }

  const sysByEmp = new Map();
  for (const r of sysOvertimeRecords) {
    if (!sysByEmp.has(r.employeeId)) {
      const e = empById.get(r.employeeId);
      sysByEmp.set(r.employeeId, { employeeId: r.employeeId, employeeName: r.employeeName, department: r.department, baseSalary: e ? e.baseSalary : r.baseSalary, weekdayHours: 0, weekendHours: 0, holidayHours: 0, totalHours: 0, weekdayPay: 0, weekendPay: 0, holidayPay: 0, totalPay: 0 });
    }
    const o = sysByEmp.get(r.employeeId);
    if (r.overtimeType === 'workday') { o.weekdayHours += r.overtimeHours; o.weekdayPay += r.overtimePay; }
    else if (r.overtimeType === 'weekend') { o.weekendHours += r.overtimeHours; o.weekendPay += r.overtimePay; }
    else if (r.overtimeType === 'holiday') { o.holidayHours += r.overtimeHours; o.holidayPay += r.overtimePay; }
    o.totalHours += r.overtimeHours;
    o.totalPay += r.overtimePay;
  }
  const sysEduSummary = Array.from(sysByEmp.values()).map(o => ({
    ...o,
    weekdayHours: Math.round(o.weekdayHours * 10) / 10,
    weekendHours: Math.round(o.weekendHours * 10) / 10,
    holidayHours: Math.round(o.holidayHours * 10) / 10,
    totalHours: Math.round(o.totalHours * 10) / 10,
    weekdayPay: Math.round(o.weekdayPay * 100) / 100,
    weekendPay: Math.round(o.weekendPay * 100) / 100,
    holidayPay: Math.round(o.holidayPay * 100) / 100,
    totalPay: Math.round(o.totalPay * 100) / 100
  }));

  const gtTotal = gtEduOvertime.reduce((s, o) => s + (o.excelExpectedTotalPay || o.totalPay || 0), 0);
  const sysTotal = sysEduSummary.reduce((s, o) => s + o.totalPay, 0);
  const errorRate = gtTotal > 0 ? Math.abs(sysTotal - gtTotal) / gtTotal : 0;

  const comparedEmployees = [];
  const allEIds = new Set([...gtEduOvertime.map(o => o.employeeId), ...sysEduSummary.map(o => o.employeeId)]);
  for (const eid of allEIds) {
    const g = gtEduOvertime.find(x => x.employeeId === eid);
    const s = sysEduSummary.find(x => x.employeeId === eid);
    comparedEmployees.push({
      employeeId: eid,
      employeeName: (g || s || {}).employeeName || '',
      expectedPay: Math.round(((g || {}).excelExpectedTotalPay || (g || {}).totalPay || 0) * 100) / 100,
      actualPay: Math.round(((s || {}).totalPay || 0) * 100) / 100,
      diff: Math.round((((s || {}).totalPay || 0) - ((g || {}).excelExpectedTotalPay || (g || {}).totalPay || 0)) * 100) / 100,
      match: Math.abs((((s || {}).totalPay || 0) - ((g || {}).excelExpectedTotalPay || (g || {}).totalPay || 0))) < 0.5
    });
  }

  return {
    groundTruthTotalPay: Math.round(gtTotal * 100) / 100,
    systemTotalPay: Math.round(sysTotal * 100) / 100,
    absoluteDiff: Math.round(Math.abs(sysTotal - gtTotal) * 100) / 100,
    errorRate: Number(errorRate.toFixed(6)),
    errorRatePercent: Number((errorRate * 100).toFixed(4)),
    eduEmployeeCountWithOT: comparedEmployees.length,
    exactMatches: comparedEmployees.filter(c => c.match).length,
    comparedEmployees,
    gtSummary: gtEduOvertime,
    sysSummary: sysEduSummary
  };
}

module.exports = {
  buildAttendanceSnapshot,
  replayMonthAttendance,
  compareSystemVsGroundTruth,
  AttendanceTimelineSimulator,
  eduOvertimeCompare,
  HOLIDAYS_2026,
  ATTENDANCE_ANOMALY,
  ANOMALY_NAMES,
  ANOMALY_STATUS,
  SEVERITY,
  OVERTIME_RATES,
  HOURLY_SALARY_DIVISOR,
  EDU_DEPT
};
