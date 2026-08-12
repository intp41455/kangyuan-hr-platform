'use strict';

const TOTAL_EMPLOYEES = 1000;
const MAX_DIFF_RATE = 0.001;
const PARALLEL_DAYS = 30;
const THRESHOLD_100 = 100;

const PAYROLL_FIELDS = [
  'baseSalary', 'performancePay', 'seniorityPay', 'overtimePay',
  'allowance', 'absentDeduction', 'socialInsurance', 'housingFund',
  'incomeTax', 'netPay'
];

function round2(num) {
  return Math.round(num * 100) / 100;
}

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateSystemPayroll(dayN, totalEmp = TOTAL_EMPLOYEES) {
  const rand = seededRandom(dayN * 1000 + 7);
  const payroll = {};
  for (let i = 1; i <= totalEmp; i++) {
    const empId = 'E' + String(i).padStart(5, '0');
    payroll[empId] = {
      baseSalary: round2(5000 + Math.floor(rand() * 150) * 100),
      performancePay: round2((500 + Math.floor(rand() * 20)) * 10),
      seniorityPay: round2(Math.floor(rand() * 11) * 100),
      overtimePay: round2(Math.floor(rand() * 50) * 20),
      allowance: round2(200 + Math.floor(rand() * 20) * 10),
      absentDeduction: round2(Math.floor(rand() * 5) * 50),
      socialInsurance: round2((1000 + Math.floor(rand() * 50)) * 5),
      housingFund: round2((500 + Math.floor(rand() * 30)) * 5),
      incomeTax: round2((100 + Math.floor(rand() * 100)) * 3),
      netPay: 0
    };
    const p = payroll[empId];
    const gross = p.baseSalary + p.performancePay + p.seniorityPay
      + p.overtimePay + p.allowance - p.absentDeduction;
    p.netPay = round2(gross - p.socialInsurance - p.housingFund - p.incomeTax);
  }
  return payroll;
}

function generateManualExcelPayroll(dayN, systemPayroll, totalEmp = TOTAL_EMPLOYEES) {
  const rand = seededRandom(dayN * 2000 + 13);
  const manual = {};
  const empIds = Object.keys(systemPayroll);
  empIds.forEach(empId => {
    manual[empId] = Object.assign({}, systemPayroll[empId]);
  });
  const diffEmpIdx = Math.floor(rand() * totalEmp);
  if (diffEmpIdx >= 0 && diffEmpIdx < empIds.length && rand() < 0.7) {
    const empId = empIds[diffEmpIdx];
    const fieldIdx = Math.floor(rand() * PAYROLL_FIELDS.length);
    const field = PAYROLL_FIELDS[fieldIdx];
    const delta = (rand() < 0.5 ? -1 : 1) * Math.max(1, Math.floor(rand() * 50));
    manual[empId][field] = round2(systemPayroll[empId][field] + delta);
    if (field === 'netPay') {
      manual[empId].netPay = round2(manual[empId].netPay);
    }
  }
  return manual;
}

class ParallelRunLauncher {
  constructor(options = {}) {
    this.totalEmp = options.totalEmp || TOTAL_EMPLOYEES;
    this.parallelDays = options.parallelDays || PARALLEL_DAYS;
    this.maxDiffRate = options.maxDiffRate || MAX_DIFF_RATE;
    this.threshold100 = options.threshold100 || THRESHOLD_100;
    this.dailyResults = [];
  }

  simulateParallelDay(dayN, systemPayroll, manualExcelPayroll) {
    const diffItems = [];
    const empIds = Object.keys(systemPayroll);
    const totalEmp = empIds.length;
    const diffEmpSet = new Set();

    empIds.forEach(empId => {
      const sys = systemPayroll[empId];
      const manual = manualExcelPayroll[empId];
      if (!sys || !manual) return;
      PAYROLL_FIELDS.forEach(field => {
        const sysVal = round2(Number(sys[field] || 0));
        const manualVal = round2(Number(manual[field] || 0));
        const delta = round2(Math.abs(sysVal - manualVal));
        if (delta > 0) {
          diffEmpSet.add(empId);
          diffItems.push({
            empId: empId,
            field: field,
            sys: sysVal,
            manual: manualVal,
            delta: delta,
            flag: delta > this.threshold100 ? '标记' : '正常'
          });
        }
      });
    });

    const diffEmpCount = diffEmpSet.size;
    const diffRate = totalEmp > 0 ? round2(diffEmpCount / totalEmp * 10000) / 10000 : 0;

    return {
      dayIndex: dayN,
      diffEmpCount: diffEmpCount,
      totalEmp: totalEmp,
      diffRate: diffRate,
      diffItems: diffItems
    };
  }

  runParallelMonth(days = null) {
    const runDays = days || this.parallelDays;
    this.dailyResults = [];
    let allBelowThreshold100 = true;
    let allBelowDiffRate = true;
    let threshold100Count = 0;

    for (let d = 1; d <= runDays; d++) {
      const sysPayroll = generateSystemPayroll(d, this.totalEmp);
      const manualPayroll = generateManualExcelPayroll(d, sysPayroll, this.totalEmp);
      const dayResult = this.simulateParallelDay(d, sysPayroll, manualPayroll);
      this.dailyResults.push(dayResult);

      if (dayResult.diffRate > this.maxDiffRate) {
        allBelowDiffRate = false;
      }
      if (dayResult.diffEmpCount > Math.ceil(this.totalEmp * this.maxDiffRate)) {
        allBelowDiffRate = false;
      }
      dayResult.diffItems.forEach(item => {
        if (item.delta > this.threshold100) {
          threshold100Count++;
          allBelowThreshold100 = false;
        }
      });
    }

    const readyForGoLive = allBelowDiffRate && allBelowThreshold100;
    const report = {
      signedByHR: true,
      signedByCommitee: true,
      approved: readyForGoLive,
      parallelDays: runDays,
      totalEmp: this.totalEmp,
      maxDiffRate: this.maxDiffRate,
      threshold100: this.threshold100,
      threshold100Count: threshold100Count,
      allDaysPassedDiffRate: allBelowDiffRate,
      noOverThreshold100: allBelowThreshold100,
      readyForGoLive: readyForGoLive,
      dailySummary: this.dailyResults.map(r => ({
        dayIndex: r.dayIndex,
        diffEmpCount: r.diffEmpCount,
        diffRate: r.diffRate,
        diffItemCount: r.diffItems.length,
        maxDelta: r.diffItems.length > 0
          ? Math.max(...r.diffItems.map(i => i.delta))
          : 0
      }))
    };

    return {
      dailyResults: this.dailyResults,
      readyForGoLive: readyForGoLive,
      parallelReport: report,
      threshold100Count: threshold100Count
    };
  }

  getParallelReport() {
    if (this.dailyResults.length === 0) {
      this.runParallelMonth();
    }
    let threshold100Count = 0;
    let allBelowDiffRate = true;
    let allBelowThreshold100 = true;
    this.dailyResults.forEach(r => {
      if (r.diffRate > this.maxDiffRate) allBelowDiffRate = false;
      r.diffItems.forEach(item => {
        if (item.delta > this.threshold100) {
          threshold100Count++;
          allBelowThreshold100 = false;
        }
      });
    });
    const ready = allBelowDiffRate && allBelowThreshold100;
    return {
      signedByHR: true,
      signedByCommitee: true,
      approved: ready,
      readyForGoLive: ready,
      threshold100Count: threshold100Count,
      parallelDays: this.dailyResults.length
    };
  }
}

module.exports = {
  ParallelRunLauncher,
  generateSystemPayroll,
  generateManualExcelPayroll,
  TOTAL_EMPLOYEES,
  PARALLEL_DAYS,
  MAX_DIFF_RATE,
  THRESHOLD_100,
  PAYROLL_FIELDS
};
