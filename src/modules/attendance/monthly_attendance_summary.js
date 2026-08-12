'use strict';

const { ATTENDANCE_ANOMALY, ANOMALY_NAMES } = require('./attendance_anomaly_engine.js');

const LEAVE_TYPES = Object.freeze([
  { key: 'annual', anomalyType: ATTENDANCE_ANOMALY.LEAVE_ANNUAL, name: '年假' },
  { key: 'sick', anomalyType: ATTENDANCE_ANOMALY.LEAVE_SICK, name: '病假' },
  { key: 'personal', anomalyType: ATTENDANCE_ANOMALY.LEAVE_PERSONAL, name: '事假' },
  { key: 'marriage', anomalyType: ATTENDANCE_ANOMALY.LEAVE_MARRIAGE, name: '婚假' },
  { key: 'maternity', anomalyType: ATTENDANCE_ANOMALY.LEAVE_MATERNITY, name: '产假' },
  { key: 'paternity', anomalyType: ATTENDANCE_ANOMALY.LEAVE_PATERNITY, name: '陪产假' },
  { key: 'funeral', anomalyType: ATTENDANCE_ANOMALY.LEAVE_FUNERAL, name: '丧假' },
  { key: 'comptime', anomalyType: ATTENDANCE_ANOMALY.LEAVE_COMPTIME, name: '调休' }
]);

const OT_TYPES = Object.freeze([
  ATTENDANCE_ANOMALY.OT_WORKDAY,
  ATTENDANCE_ANOMALY.OT_WEEKEND,
  ATTENDANCE_ANOMALY.OT_HOLIDAY
]);

function _getDaysInMonth(year, month) {
  const m = month - 1;
  const last = new Date(year, m + 1, 0);
  const totalDays = last.getDate();
  let workdays = 0;
  for (let d = 1; d <= totalDays; d++) {
    const dayOfWeek = new Date(year, m, d).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) workdays++;
  }
  return { totalDays, workdays };
}

function _initLeaveDays() {
  const obj = {};
  for (const lt of LEAVE_TYPES) obj[lt.key] = 0;
  return obj;
}

class MonthlySummaryAggregator {
  calcMonthlySummary({ year, month, employees, punchRecords, anomalies }) {
    const { workdays: monthWorkdays } = _getDaysInMonth(year, month);
    const empMap = new Map();
    for (const e of employees || []) {
      empMap.set(String(e.id || e.employeeId), e);
    }

    const anomaliesByEmp = new Map();
    for (const a of anomalies || []) {
      const eid = String(a.employeeId);
      if (!anomaliesByEmp.has(eid)) anomaliesByEmp.set(eid, []);
      anomaliesByEmp.get(eid).push(a);
    }

    const punchByEmp = new Map();
    for (const r of punchRecords || []) {
      const eid = String(r.employeeId);
      if (!punchByEmp.has(eid)) punchByEmp.set(eid, []);
      punchByEmp.get(eid).push(r);
    }

    const employeeSummaries = [];
    for (const e of employees || []) {
      const eid = String(e.id || e.employeeId);
      const empAnomalies = anomaliesByEmp.get(eid) || [];
      const empPunches = punchByEmp.get(eid) || [];

      let lateCount = 0, earlyLeaveCount = 0, missingCount = 0;
      let absentDays = 0, totalFine = 0, otHours = 0;
      const eachLeaveTypeDays = _initLeaveDays();
      const typeCounter = {};

      for (const a of empAnomalies) {
        const t = a.type;
        typeCounter[t] = (typeCounter[t] || 0) + 1;

        if (t === ATTENDANCE_ANOMALY.LATE) lateCount++;
        else if (t === ATTENDANCE_ANOMALY.EARLY_LEAVE) earlyLeaveCount++;
        else if (t === ATTENDANCE_ANOMALY.MISSING_PUNCH) missingCount++;
        else if (t === ATTENDANCE_ANOMALY.ABSENT) absentDays += Number(a.absentDays || a.extra && a.extra.absentDays || 1);

        if (OT_TYPES.includes(t)) {
          otHours += Number(a.otHours || a.extra && a.extra.otHours || 0);
        }

        for (const lt of LEAVE_TYPES) {
          if (t === lt.anomalyType) {
            eachLeaveTypeDays[lt.key] += 1;
          }
        }

        totalFine += Number(a.deduction || 0);
      }

      const uniqueWorkDates = new Set(
        (empPunches || []).map(r => String(r.date)).filter(Boolean)
      );
      const actualAttendanceDays = Math.max(0, monthWorkdays - absentDays -
        Object.values(eachLeaveTypeDays).reduce((s, v) => s + v, 0));

      employeeSummaries.push({
        employeeId: eid,
        name: e.name || '',
        dept1: e.dept1 || e.department || '',
        dept2: e.dept2 || '',
        workdays: monthWorkdays,
        actualAttendanceDays,
        lateCount,
        earlyLeaveCount,
        missingCount,
        absentDays,
        totalFine,
        otHours: Number(otHours.toFixed(1)),
        eachLeaveTypeDays,
        _typeCounter: typeCounter
      });
    }

    const deptMap = new Map();
    for (const es of employeeSummaries) {
      const d1 = es.dept1 || '未分配部门';
      const d2 = es.dept2 || '';
      const key = `${d1}||${d2}`;
      if (!deptMap.has(key)) {
        deptMap.set(key, {
          dept1: d1,
          dept2: d2,
          totalEmployees: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          missingCount: 0,
          absentDays: 0,
          otTotalHours: 0,
          leaveDays: _initLeaveDays(),
          totalFineAll: 0
        });
      }
      const d = deptMap.get(key);
      d.totalEmployees++;
      d.lateCount += es.lateCount;
      d.earlyLeaveCount += es.earlyLeaveCount;
      d.missingCount += es.missingCount;
      d.absentDays += es.absentDays;
      d.otTotalHours += es.otHours;
      d.totalFineAll += es.totalFine;
      for (const lt of LEAVE_TYPES) {
        d.leaveDays[lt.key] += es.eachLeaveTypeDays[lt.key];
      }
    }
    const departmentSummaries = Array.from(deptMap.values());
    departmentSummaries.forEach(d => {
      d.otTotalHours = Number(d.otTotalHours.toFixed(1));
    });

    const allTypeCount = {};
    for (const t of Object.values(ATTENDANCE_ANOMALY)) {
      allTypeCount[t] = 0;
    }
    for (const a of anomalies || []) {
      allTypeCount[a.type] = (allTypeCount[a.type] || 0) + 1;
    }
    const anomalyTypeRanking = Object.entries(allTypeCount)
      .map(([type, count]) => ({
        type: Number(type),
        typeName: ANOMALY_NAMES[type] || `未知(${type})`,
        count
      }))
      .sort((a, b) => b.count - a.count);

    const empOtMap = new Map();
    const empAnomalyCountMap = new Map();
    for (const a of anomalies || []) {
      const eid = String(a.employeeId);
      if (OT_TYPES.includes(a.type)) {
        const hrs = Number(a.otHours || a.extra && a.extra.otHours || 0);
        empOtMap.set(eid, (empOtMap.get(eid) || 0) + hrs);
      }
      if (!OT_TYPES.includes(a.type) && a.type !== ATTENDANCE_ANOMALY.LEAVE_ANNUAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_SICK && a.type !== ATTENDANCE_ANOMALY.LEAVE_PERSONAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_MARRIAGE && a.type !== ATTENDANCE_ANOMALY.LEAVE_MATERNITY &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_PATERNITY && a.type !== ATTENDANCE_ANOMALY.LEAVE_FUNERAL &&
          a.type !== ATTENDANCE_ANOMALY.LEAVE_COMPTIME) {
        empAnomalyCountMap.set(eid, (empAnomalyCountMap.get(eid) || 0) + 1);
      }
    }

    const otTop10 = Array.from(empOtMap.entries())
      .map(([eid, hrs]) => {
        const e = empMap.get(eid) || {};
        return {
          rank: 0,
          employeeId: eid,
          name: e.name || '',
          dept1: e.dept1 || e.department || '',
          otHours: Number(hrs.toFixed(1))
        };
      })
      .sort((a, b) => b.otHours - a.otHours)
      .slice(0, 10)
      .map((x, i) => ({ ...x, rank: i + 1 }));

    const anomalyTop10 = Array.from(empAnomalyCountMap.entries())
      .map(([eid, count]) => {
        const e = empMap.get(eid) || {};
        return {
          rank: 0,
          employeeId: eid,
          name: e.name || '',
          dept1: e.dept1 || e.department || '',
          count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((x, i) => ({ ...x, rank: i + 1 }));

    const leaveConsumptionDistribution = {};
    for (const lt of LEAVE_TYPES) {
      let consumed = 0;
      for (const es of employeeSummaries) {
        consumed += es.eachLeaveTypeDays[lt.key];
      }
      leaveConsumptionDistribution[lt.key] = {
        name: lt.name,
        consumed,
        remainingQuota: (employees || []).length * 5 - consumed,
        totalEmployees: (employees || []).length
      };
    }

    return {
      year,
      month,
      monthWorkdays,
      totalEmployees: (employees || []).length,
      departmentDimension: departmentSummaries,
      employeeDimension: employeeSummaries,
      anomalyTypeDimension: {
        anomalyTypeRanking,
        otTop10,
        anomalyTop10,
        leaveConsumptionDistribution
      }
    };
  }
}

class AxlsExporter {
  buildAxlsStructure(summary) {
    const sheets = [];
    const dept1Groups = new Map();
    for (const ds of summary.departmentDimension || []) {
      const d1 = ds.dept1 || '未分配部门';
      if (!dept1Groups.has(d1)) dept1Groups.set(d1, []);
      dept1Groups.get(d1).push(ds);
    }

    for (const [dept1Name, deptSubList] of dept1Groups.entries()) {
      const empsInDept1 = (summary.employeeDimension || []).filter(e =>
        (e.dept1 || '未分配部门') === dept1Name
      );

      const headerRow = [
        '员工工号', '员工姓名', '二级部门',
        '应出勤天数', '实际出勤天数',
        '迟到次数', '早退次数', '缺卡次数', '旷工天数',
        '加班总小时', '扣款合计(元)',
        '年假(天)', '病假(天)', '事假(天)', '婚假(天)', '产假(天)', '陪产假(天)', '丧假(天)', '调休(天)'
      ];

      const dataRows = empsInDept1.map(emp => [
        emp.employeeId,
        emp.name,
        emp.dept2 || '-',
        emp.workdays,
        emp.actualAttendanceDays,
        emp.lateCount,
        emp.earlyLeaveCount,
        emp.missingCount,
        emp.absentDays,
        emp.otHours,
        emp.totalFine,
        emp.eachLeaveTypeDays.annual,
        emp.eachLeaveTypeDays.sick,
        emp.eachLeaveTypeDays.personal,
        emp.eachLeaveTypeDays.marriage,
        emp.eachLeaveTypeDays.maternity,
        emp.eachLeaveTypeDays.paternity,
        emp.eachLeaveTypeDays.funeral,
        emp.eachLeaveTypeDays.comptime
      ]);

      const firstDataRowIdx = 2;
      const lastDataRowIdx = firstDataRowIdx + Math.max(0, dataRows.length - 1);
      const colLetter = (idx) => String.fromCharCode(65 + idx);

      const totalRow = [
        '合计', '', '',
        `=SUM(${colLetter(3)}${firstDataRowIdx}:${colLetter(3)}${lastDataRowIdx})`,
        `=SUM(${colLetter(4)}${firstDataRowIdx}:${colLetter(4)}${lastDataRowIdx})`,
        `=SUM(${colLetter(5)}${firstDataRowIdx}:${colLetter(5)}${lastDataRowIdx})`,
        `=SUM(${colLetter(6)}${firstDataRowIdx}:${colLetter(6)}${lastDataRowIdx})`,
        `=SUM(${colLetter(7)}${firstDataRowIdx}:${colLetter(7)}${lastDataRowIdx})`,
        `=SUM(${colLetter(8)}${firstDataRowIdx}:${colLetter(8)}${lastDataRowIdx})`,
        `=SUM(${colLetter(9)}${firstDataRowIdx}:${colLetter(9)}${lastDataRowIdx})`,
        `=SUM(${colLetter(10)}${firstDataRowIdx}:${colLetter(10)}${lastDataRowIdx})`,
        '', '', '', '', '', '', '', ''
      ];

      sheets.push({
        sheetName: dept1Name,
        dept1: dept1Name,
        deptSubList,
        headerRow,
        dataRows,
        totalRow,
        allRows: [headerRow, ...dataRows, totalRow],
        sumFormulas: {
          actualAttendanceSum: totalRow[4],
          lateCountSum: totalRow[5],
          earlyLeaveCountSum: totalRow[6],
          missingCountSum: totalRow[7],
          absentDaysSum: totalRow[8],
          otHoursSum: totalRow[9],
          totalFineSum: totalRow[10]
        }
      });
    }

    return {
      workbookTitle: `${summary.year}年${summary.month}月月度考勤汇总表`,
      generatedAt: new Date(),
      totalSheets: sheets.length,
      sheets,
      summaryMetadata: {
        year: summary.year,
        month: summary.month,
        totalEmployees: summary.totalEmployees,
        monthWorkdays: summary.monthWorkdays
      }
    };
  }
}

class DingtalkDocReport {
  buildDocReport(summary) {
    const year = summary.year;
    const month = summary.month;
    const totalEmp = summary.totalEmployees;
    const deptCount = (summary.departmentDimension || []).length;

    const allLate = summary.departmentDimension.reduce((s, d) => s + d.lateCount, 0);
    const allEarly = summary.departmentDimension.reduce((s, d) => s + d.earlyLeaveCount, 0);
    const allMissing = summary.departmentDimension.reduce((s, d) => s + d.missingCount, 0);
    const allAbsent = summary.departmentDimension.reduce((s, d) => s + d.absentDays, 0);
    const allOt = summary.departmentDimension.reduce((s, d) => s + d.otTotalHours, 0);

    const title = {
      type: 'heading',
      level: 1,
      content: `${year}年${month}月 月度考勤汇总与确认报告`
    };

    const summarySection = {
      type: 'section',
      title: '一、月度考勤摘要',
      level: 2,
      paragraphs: [
        `报告周期：${year}年${month}月，共 ${summary.monthWorkdays} 个工作日。`,
        `覆盖员工：${totalEmp} 人，涉及 ${deptCount} 个二级部门汇总块。`,
        `异常概览：迟到 ${allLate} 次 / 早退 ${allEarly} 次 / 缺卡 ${allMissing} 次 / 旷工 ${allAbsent.toFixed(1)} 天。`,
        `加班总时长：${Number(allOt).toFixed(1)} 小时。`
      ],
      summaryTable: {
        headers: ['指标', '数值', '单位'],
        rows: [
          ['覆盖员工人数', totalEmp, '人'],
          ['月度工作日', summary.monthWorkdays, '天'],
          ['迟到总次数', allLate, '次'],
          ['早退总次数', allEarly, '次'],
          ['缺卡总次数', allMissing, '次'],
          ['旷工总天数', allAbsent.toFixed(1), '天'],
          ['加班总时长', Number(allOt).toFixed(1), '小时']
        ]
      }
    };

    const anomalyTop10 = summary.anomalyTypeDimension.anomalyTop10 || [];
    const anomalyTop10Section = {
      type: 'section',
      title: '二、异常TOP10排名（非假期类异常次数）',
      level: 2,
      rankingTable: {
        headers: ['排名', '员工工号', '员工姓名', '异常次数', '所属部门'],
        rows: anomalyTop10.map(a => [a.rank, a.employeeId, a.name, a.count, a.dept1 || '-'])
      }
    };

    const otTop10 = summary.anomalyTypeDimension.otTop10 || [];
    const otTop10Section = {
      type: 'section',
      title: '三、加班时长TOP10排名',
      level: 2,
      rankingTable: {
        headers: ['排名', '员工工号', '员工姓名', '加班时长(小时)', '所属部门'],
        rows: otTop10.map(o => [o.rank, o.employeeId, o.name, o.otHours, o.dept1 || '-'])
      }
    };

    const leaveDist = summary.anomalyTypeDimension.leaveConsumptionDistribution || {};
    const leaveRows = [];
    for (const lt of LEAVE_TYPES) {
      const item = leaveDist[lt.key] || { consumed: 0, remainingQuota: 0 };
      leaveRows.push([lt.name, item.consumed, Math.max(0, item.remainingQuota || 0)]);
    }
    const leaveSection = {
      type: 'section',
      title: '四、假期消耗与剩余分布（年假/病假/事假重点）',
      level: 2,
      consumptionTable: {
        headers: ['假期类型', '已消耗(天)', '剩余估算(天)'],
        rows: leaveRows
      },
      focusParagraph: `核心假期消耗：年假已用 ${(leaveDist.annual || {}).consumed || 0} 天，病假已用 ${(leaveDist.sick || {}).consumed || 0} 天，事假已用 ${(leaveDist.personal || {}).consumed || 0} 天。`
    };

    const anomalyRanking = summary.anomalyTypeDimension.anomalyTypeRanking || [];
    const anomalyTypeSection = {
      type: 'section',
      title: '五、16类异常类型Count排名',
      level: 2,
      rankingTable: {
        headers: ['排名', '异常类型', '异常代码', '发生次数'],
        rows: anomalyRanking.map((a, i) => [i + 1, a.typeName, a.type, a.count])
      }
    };

    return {
      docTitle: `${year}年${month}月 月度考勤汇总与确认报告`,
      generatedAt: new Date(),
      sections: [
        title,
        summarySection,
        anomalyTop10Section,
        otTop10Section,
        leaveSection,
        anomalyTypeSection
      ],
      hasAnomalyTop10: anomalyTop10Section && anomalyTop10Section.rankingTable && anomalyTop10Section.rankingTable.rows.length > 0,
      hasOtTop10: otTop10Section && otTop10Section.rankingTable && otTop10Section.rankingTable.rows.length > 0,
      hasLeaveConsumption: leaveSection && leaveSection.consumptionTable && leaveSection.consumptionTable.rows.length > 0,
      richTextOutline: [
        title.content,
        summarySection.title,
        anomalyTop10Section.title,
        otTop10Section.title,
        leaveSection.title,
        anomalyTypeSection.title
      ]
    };
  }
}

function autoGenerateDMinus2Trigger(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const dMinus2Day = new Date(nextMonthYear, nextMonth - 1, 0).getDate() - 1;
  const triggerDate = new Date(nextMonthYear, nextMonth - 1, dMinus2Day, 10, 0, 0, 0);

  const nextMonthLastDay = new Date(nextMonthYear, nextMonth, 0).getDate();
  const reportYear = nextMonth === 1 ? nextMonthYear - 1 : nextMonthYear;
  const reportMonth = nextMonth === 1 ? 12 : nextMonth - 1;

  return {
    triggerType: 'D_MINUS_2_AUTO',
    cronExpression: `0 10 ${dMinus2Day} ${nextMonth} *`,
    triggerTime: triggerDate,
    triggerLabel: `次月D-2日10:00（${nextMonthYear}年${nextMonth}月${dMinus2Day}日 10:00:00）`,
    targetReport: {
      year: reportYear,
      month: reportMonth,
      label: `${reportYear}年${reportMonth}月月度考勤汇总`
    },
    reportPeriod: {
      lastDay: nextMonthLastDay,
      dMinus2: dMinus2Day
    },
    millisecondsUntilTrigger: Math.max(0, triggerDate.getTime() - now.getTime()),
    note: '调度器：生成月度考勤汇总表→钉钉在线表格→钉钉文档报告→推送给HRBP/部门主管'
  };
}

module.exports = {
  LEAVE_TYPES,
  OT_TYPES,
  MonthlySummaryAggregator,
  AxlsExporter,
  DingtalkDocReport,
  autoGenerateDMinus2Trigger
};
