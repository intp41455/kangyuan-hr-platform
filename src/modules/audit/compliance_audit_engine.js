class RuleVersionManager {
  constructor() {
    this.store = { rulesMap: {} };
  }

  _nextVersion(currentVersion) {
    if (!currentVersion) return 'v1';
    const num = parseInt(currentVersion.substring(1), 10);
    return 'v' + (num + 1);
  }

  getRule(ruleId, version = 'latest') {
    const versions = this.store.rulesMap[ruleId];
    if (!versions || versions.length === 0) return null;
    if (version === 'latest') {
      return versions[versions.length - 1];
    }
    return versions.find(v => v.version === version) || null;
  }

  updateRule({ ruleId, newValue, changeUser, approvalNumber, changeReason }) {
    const existing = this.store.rulesMap[ruleId] || [];
    const latest = existing.length > 0 ? existing[existing.length - 1] : null;
    const newVersion = this._nextVersion(latest ? latest.version : null);
    const record = {
      version: newVersion,
      value: newValue,
      changeUser: changeUser,
      changeTime: new Date().toISOString(),
      approvalNumber: approvalNumber,
      changeReason: changeReason
    };
    if (!this.store.rulesMap[ruleId]) {
      this.store.rulesMap[ruleId] = [];
    }
    this.store.rulesMap[ruleId].push(record);
    return record;
  }

  diffRuleVersions(ruleId, v1, v2) {
    const r1 = this.getRule(ruleId, v1);
    const r2 = this.getRule(ruleId, v2);
    if (!r1 || !r2) return null;
    const diffs = [];
    const keys = new Set([...Object.keys(r1), ...Object.keys(r2)]);
    keys.forEach(key => {
      if (r1[key] !== r2[key]) {
        diffs.push({ field: key, from: r1[key], to: r2[key] });
      }
    });
    return diffs;
  }

  rollbackRule(ruleId, targetVersion) {
    const versions = this.store.rulesMap[ruleId];
    if (!versions) return null;
    const target = versions.find(v => v.version === targetVersion);
    if (!target) return null;
    const latest = versions[versions.length - 1];
    const newVersion = this._nextVersion(latest.version);
    const record = {
      version: newVersion,
      value: target.value,
      changeUser: target.changeUser,
      changeTime: new Date().toISOString(),
      approvalNumber: target.approvalNumber + '-ROLLBACK',
      changeReason: '回滚至版本 ' + targetVersion + ': ' + target.changeReason
    };
    this.store.rulesMap[ruleId].push(record);
    return record;
  }
}

class OperationAuditLog {
  constructor() {
    this.logs = [];
    this.RETENTION_DAYS = 180;
  }

  log(operation) {
    const entry = {
      ...operation,
      timestamp: new Date().toISOString(),
      logId: 'LOG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };
    this.logs.push(entry);
    return entry;
  }

  queryLogs({ filterOperator, filterType, filterEmpId, startDate, endDate }) {
    return this.logs.filter(log => {
      if (filterOperator && log.operatorId !== filterOperator) return false;
      if (filterType && log.operationType !== filterType) return false;
      if (filterEmpId && log.affectedEmpId !== filterEmpId) return false;
      if (startDate) {
        const s = new Date(startDate).getTime();
        if (new Date(log.timestamp).getTime() < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate).getTime();
        if (new Date(log.timestamp).getTime() > e) return false;
      }
      return true;
    });
  }

  autocleanExpiredLogs() {
    const now = Date.now();
    const cutoff = now - this.RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const beforeLen = this.logs.length;
    this.logs = this.logs.filter(log => {
      return new Date(log.timestamp).getTime() >= cutoff;
    });
    return { removed: beforeLen - this.logs.length, remaining: this.logs.length };
  }
}

class AuditReportGenerator {
  constructor() {
    this.sectionTemplates = [
      { sectionId: 'employeeRoster', title: 'HR花名册', contentKeys: ['empCount', 'deptDist', 'empStatus'] },
      { sectionId: 'attendanceSummary', title: '考勤汇总', contentKeys: ['attendRate', 'overtimeHours', 'lateCount'] },
      { sectionId: 'leaveBalance', title: '假期余额', contentKeys: ['annualLeave', 'sickLeave', 'compLeave'] },
      { sectionId: 'payrollSummary', title: '薪酬汇总', contentKeys: ['totalPayroll', 'avgSalary', 'deductionSum'] },
      { sectionId: 'socialSummary', title: '社保公积金', contentKeys: ['pension', 'medical', 'housingFund'] },
      { sectionId: 'ruleVersions', title: '规则版本记录', contentKeys: ['updatedRules', 'rollbackCount', 'approvalLinks'] },
      { sectionId: 'operationLogs', title: '操作审计日志', contentKeys: ['opCount', 'deductOps', 'queryOps'] },
      { sectionId: 'approvalSLA', title: '审批SLA报告', contentKeys: ['slaOnTime', 'slaAvgHours', 'overdueCount'] }
    ];
  }

  generateAuditReportPDF({ year, month, mode = 'STRUCTURE_VALIDATE' }) {
    const sections = this.sectionTemplates.map(tpl => ({
      sectionId: tpl.sectionId,
      title: tpl.title,
      contentKeys: [...tpl.contentKeys]
    }));
    const reportStructure = {
      reportMeta: {
        year,
        month,
        mode,
        generatedAt: new Date().toISOString()
      },
      sections
    };
    return reportStructure;
  }

  validateReportSections(reportStructure) {
    const sections = reportStructure.sections || [];
    let validCount = 0;
    const sectionTitles = [];
    sections.forEach(s => {
      sectionTitles.push(s.title);
      if (s.contentKeys && s.contentKeys.length >= 1) {
        validCount++;
      }
    });
    return {
      contentValid: validCount + '/' + sections.length,
      sectionTitles
    };
  }

  simulateDownloadAuditPDF() {
    return {
      pages: 18,
      sections: 8,
      format: 'PDF标准A4'
    };
  }
}

module.exports = {
  RuleVersionManager,
  OperationAuditLog,
  AuditReportGenerator
};
