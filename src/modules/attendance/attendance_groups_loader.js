const ATTENDANCE_GROUP_TYPES = Object.freeze({
  HQ: 'HQ总部',
  EDU: 'EDU教育机构',
  BRANCH: 'BRANCH分点',
  OUTSOURCE: 'OUTSOURCE外勤',
  EXEC: 'EXEC高管免打卡'
});

const WORKDAYS_PATTERNS = Object.freeze({
  MON_FRI: '周一至周五',
  MON_SAT: '周一至周六',
  SCHEDULED: '排班'
});

class AttendanceGroupModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || null;
    this.type = data.type || ATTENDANCE_GROUP_TYPES.HQ;
    this.workdays = data.workdays || WORKDAYS_PATTERNS.MON_FRI;
    this.shift = data.shift ? { ...data.shift } : {
      onDutyTime: '09:00',
      offDutyTime: '18:00',
      graceLateMinutes: 5,
      graceEarlyLeaveMinutes: 5,
      isFlexible: false
    };
    this.memberCount = data.memberCount || 0;
    this.deptIds = data.deptIds ? [...data.deptIds] : [];
    this.exemptEmployeeIds = data.exemptEmployeeIds ? [...data.exemptEmployeeIds] : [];
    this.isExempt = data.isExempt || false;
    this.flexibleRule = data.flexibleRule ? { ...data.flexibleRule } : null;
    if (this.shift.isFlexible && !this.flexibleRule) {
      this.flexibleRule = {
        coreStartTime: '09:30',
        coreEndTime: '16:30',
        minWorkHours: 7
      };
    }
  }
}

function buildPresetGroups() {
  return [
    new AttendanceGroupModel({
      id: 'AG_HQ_XA',
      name: 'HQ总部西安',
      type: ATTENDANCE_GROUP_TYPES.HQ,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: '08:30',
        offDutyTime: '18:00',
        graceLateMinutes: 5,
        graceEarlyLeaveMinutes: 5,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D01', 'D01-HQ', '总部'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_EDU',
      name: 'EDU教育机构',
      type: ATTENDANCE_GROUP_TYPES.EDU,
      workdays: WORKDAYS_PATTERNS.MON_SAT,
      shift: {
        onDutyTime: '08:00',
        offDutyTime: '17:30',
        graceLateMinutes: 3,
        graceEarlyLeaveMinutes: 3,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D02', 'D02-EDU', '教育机构'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_BRANCH_TS',
      name: 'BRANCH_TS天水分点',
      type: ATTENDANCE_GROUP_TYPES.BRANCH,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: '09:00',
        offDutyTime: '18:00',
        graceLateMinutes: 10,
        graceEarlyLeaveMinutes: 10,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D03-TS', '天水分点', 'TS'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_BRANCH_BY',
      name: 'BRANCH_BY白银分点',
      type: ATTENDANCE_GROUP_TYPES.BRANCH,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: '09:00',
        offDutyTime: '18:00',
        graceLateMinutes: 10,
        graceEarlyLeaveMinutes: 10,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D03-BY', '白银分点', 'BY'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_BRANCH_PL',
      name: 'BRANCH_PL平凉分点',
      type: ATTENDANCE_GROUP_TYPES.BRANCH,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: '09:00',
        offDutyTime: '18:00',
        graceLateMinutes: 10,
        graceEarlyLeaveMinutes: 10,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D03-PL', '平凉分点', 'PL'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_BRANCH_LZ',
      name: 'BRANCH_LZ兰州分点',
      type: ATTENDANCE_GROUP_TYPES.BRANCH,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: '09:00',
        offDutyTime: '18:00',
        graceLateMinutes: 10,
        graceEarlyLeaveMinutes: 10,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: ['D03-LZ', '兰州分点', 'LZ'],
      exemptEmployeeIds: []
    }),
    new AttendanceGroupModel({
      id: 'AG_EXEC',
      name: 'EXEC高管免打卡考勤组',
      type: ATTENDANCE_GROUP_TYPES.EXEC,
      workdays: WORKDAYS_PATTERNS.MON_FRI,
      shift: {
        onDutyTime: null,
        offDutyTime: null,
        graceLateMinutes: 0,
        graceEarlyLeaveMinutes: 0,
        isFlexible: false
      },
      memberCount: 0,
      deptIds: [],
      exemptEmployeeIds: [],
      isExempt: true
    })
  ];
}

class AttendanceGroupsLoader {
  constructor({ dingTalkClient = null, mode = 'mock' } = {}) {
    this.client = dingTalkClient;
    this.mode = mode;
    this._groups = [];
    this._groupsLoaded = false;
    this._exemptionApprovalMap = new Map();
    this._mockGroups = buildPresetGroups();
    if (this.client && this.mode === 'mock') {
      this._injectMockGroupsToClient();
    }
  }

  _injectMockGroupsToClient() {
    if (this.client && this.mode === 'mock') {
      this.client._mockAttendanceGroups = JSON.parse(JSON.stringify(this._mockGroups));
      if (!this.client.fetchAttendanceGroups) {
        this.client.fetchAttendanceGroups = async () => {
          if (this.client._networkFailureThreshold > 0 &&
              this.client._networkFailureCount < this.client._networkFailureThreshold) {
            this.client._networkFailureCount++;
            throw new Error('NETWORK_TIMEOUT: 钉钉考勤组API连接超时（Mock模拟）');
          }
          return JSON.parse(JSON.stringify(this.client._mockAttendanceGroups || []));
        };
      }
    }
  }

  async loadGroups() {
    if (this._groupsLoaded) {
      return this._groups.map(g => new AttendanceGroupModel(g));
    }
    let rawGroups = [];
    if (this.mode === 'mock') {
      rawGroups = this._mockGroups.map(g => ({ ...g }));
    } else {
      if (this.client && this.client.fetchAttendanceGroups) {
        rawGroups = await this.client.fetchAttendanceGroups();
      } else {
        rawGroups = this._mockGroups.map(g => ({ ...g }));
      }
    }
    this._groups = rawGroups.map(raw => new AttendanceGroupModel(raw));
    this._groupsLoaded = true;
    return this._groups.map(g => new AttendanceGroupModel(g));
  }

  getAllGroups() {
    return this._groups.map(g => new AttendanceGroupModel(g));
  }

  getGroupById(groupId) {
    const g = this._groups.find(x => x.id === groupId);
    return g ? new AttendanceGroupModel(g) : null;
  }

  getAttendanceGroupForEmployee(employee) {
    if (!this._groupsLoaded) {
      throw new Error('考勤组未加载，请先调用 loadGroups()');
    }
    if (!employee) return null;

    if (employee.positionTag === '高管免打卡岗' ||
        employee.positionTag === 'EXEC高管' ||
        (employee.position && employee.position.includes('高管')) ||
        (employee.title && (employee.title.includes('总监') ||
                            employee.title.includes('总经理') ||
                            employee.title.includes('董事长') ||
                            employee.title.includes('CEO')))) {
      const execGroup = this._groups.find(g => g.type === ATTENDANCE_GROUP_TYPES.EXEC || g.isExempt);
      if (execGroup) {
        return new AttendanceGroupModel(execGroup);
      }
    }

    const employeeDeptIds = [];
    if (employee.dept1) employeeDeptIds.push(employee.dept1);
    if (employee.dept2) employeeDeptIds.push(employee.dept2);
    if (employee.department) employeeDeptIds.push(String(employee.department));
    if (employee.deptIds && Array.isArray(employee.deptIds)) {
      employeeDeptIds.push(...employee.deptIds.map(String));
    }

    let matchedGroup = null;
    let bestMatchScore = -1;

    for (const group of this._groups) {
      if (group.isExempt) continue;
      if (!group.deptIds || group.deptIds.length === 0) continue;

      let matchScore = 0;
      for (const empDept of employeeDeptIds) {
        for (const grpDept of group.deptIds) {
          if (empDept === grpDept) {
            matchScore = Math.max(matchScore, 100);
          } else if (empDept.includes(grpDept) || grpDept.includes(empDept)) {
            matchScore = Math.max(matchScore, 50);
          }
        }
      }

      if (employee.id && group.exemptEmployeeIds.includes(employee.id)) {
        matchScore = Math.max(matchScore, 200);
      }

      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        matchedGroup = group;
      }
    }

    if (matchedGroup) {
      return new AttendanceGroupModel(matchedGroup);
    }

    const hqGroup = this._groups.find(g => g.type === ATTENDANCE_GROUP_TYPES.HQ);
    return hqGroup ? new AttendanceGroupModel(hqGroup) : null;
  }

  setExemptionApprovalMap(approvalMap) {
    this._exemptionApprovalMap.clear();
    if (approvalMap instanceof Map) {
      for (const [empId, approvals] of approvalMap.entries()) {
        this._exemptionApprovalMap.set(empId, Array.isArray(approvals) ? [...approvals] : []);
      }
    } else if (Array.isArray(approvalMap)) {
      for (const item of approvalMap) {
        if (item && item.employeeId) {
          this._exemptionApprovalMap.set(item.employeeId, item.approvals ? [...item.approvals] : []);
        }
      }
    } else if (typeof approvalMap === 'object') {
      for (const [empId, approvals] of Object.entries(approvalMap)) {
        this._exemptionApprovalMap.set(empId, Array.isArray(approvals) ? [...approvals] : []);
      }
    }
  }

  addExemptionApproval(employeeId, approval) {
    if (!this._exemptionApprovalMap.has(employeeId)) {
      this._exemptionApprovalMap.set(employeeId, []);
    }
    this._exemptionApprovalMap.get(employeeId).push({ ...approval });
  }

  _isApprovalValid(approval, asOfDate = new Date()) {
    if (!approval || !approval.approvalNo) return false;
    if (!approval.expireDate) return true;
    const expire = new Date(approval.expireDate);
    const check = new Date(asOfDate);
    return check <= expire;
  }

  hasValidExemptionApproval(employeeId, asOfDate = new Date()) {
    const approvals = this._exemptionApprovalMap.get(employeeId);
    if (!approvals || approvals.length === 0) return false;
    return approvals.some(a => this._isApprovalValid(a, asOfDate));
  }

  getAllExemptEmployeeIds() {
    const exemptSet = new Set();
    for (const group of this._groups) {
      if (group.exemptEmployeeIds && group.exemptEmployeeIds.length > 0) {
        for (const eid of group.exemptEmployeeIds) {
          exemptSet.add(eid);
        }
      }
      if (group.isExempt && group.deptIds && group.deptIds.length > 0) {
      }
    }
    return [...exemptSet];
  }

  setExemptEmployeeIdsForGroup(groupId, employeeIds) {
    const group = this._groups.find(g => g.id === groupId);
    if (group) {
      group.exemptEmployeeIds = [...employeeIds];
    }
  }

  addExemptEmployeeToGroup(groupId, employeeId) {
    const group = this._groups.find(g => g.id === groupId);
    if (group && !group.exemptEmployeeIds.includes(employeeId)) {
      group.exemptEmployeeIds.push(employeeId);
    }
  }

  getUnauthorizedExemptions(asOfDate = new Date()) {
    const unauthorized = [];
    const allExemptIds = this.getAllExemptEmployeeIds();
    for (const empId of allExemptIds) {
      if (!this.hasValidExemptionApproval(empId, asOfDate)) {
        const approvals = this._exemptionApprovalMap.get(empId) || [];
        unauthorized.push({
          employeeId: empId,
          reason: approvals.length === 0
            ? '未设置任何豁免审批单（FR-3.6）'
            : `所有${approvals.length}个豁免审批单均已过期`,
          approvalsCount: approvals.length,
          checkedDate: new Date(asOfDate).toISOString().slice(0, 10)
        });
      }
    }
    return unauthorized;
  }

  evaluateFlexibleAttendance({ checkInTime, checkOutTime, group = null, asOfDate = new Date() }) {
    const targetGroup = group || (this._groups.length > 0 ? this._groups[0] : null);
    if (!targetGroup || !targetGroup.shift.isFlexible) {
      return { isApplicable: false, reason: '当前考勤组未启用弹性工作制' };
    }
    const rule = targetGroup.flexibleRule || {
      coreStartTime: '09:30',
      coreEndTime: '16:30',
      minWorkHours: 7
    };
    if (!checkInTime || !checkOutTime) {
      return { isApplicable: true, isFullAttendance: false, reason: '缺少打卡时间' };
    }

    const checkDate = new Date(asOfDate).toISOString().slice(0, 10);
    const parseTime = (t) => {
      const parts = t.split(':');
      const d = new Date(checkDate);
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
      return d;
    };

    const inTime = parseTime(checkInTime);
    const outTime = parseTime(checkOutTime);
    const coreStart = parseTime(rule.coreStartTime);
    const coreEnd = parseTime(rule.coreEndTime);

    const totalWorkMs = outTime.getTime() - inTime.getTime();
    const totalWorkHours = totalWorkMs / (1000 * 60 * 60);
    const coreHoursOk = inTime.getTime() <= coreStart.getTime() && outTime.getTime() >= coreEnd.getTime();
    const minHoursOk = totalWorkHours >= rule.minWorkHours;

    return {
      isApplicable: true,
      isFullAttendance: coreHoursOk && minHoursOk,
      totalWorkHours: Number(totalWorkHours.toFixed(2)),
      minWorkHoursRequired: rule.minWorkHours,
      coreHoursRule: `${rule.coreStartTime}-${rule.coreEndTime}`,
      coreHoursSatisfied: coreHoursOk,
      minHoursSatisfied: minHoursOk,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      ruleDetails: rule
    };
  }

  clearCache() {
    this._groups = [];
    this._groupsLoaded = false;
  }
}

module.exports = {
  ATTENDANCE_GROUP_TYPES,
  WORKDAYS_PATTERNS,
  AttendanceGroupModel,
  AttendanceGroupsLoader,
  buildPresetGroups
};
