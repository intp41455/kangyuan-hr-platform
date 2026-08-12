const EmployeeRegistry = require('../models/EmployeeRegistry');
const AlertQueue = require('../services/AlertQueue');

class MissingApprovalError extends Error {
  constructor(message = '缺少审批单号，无法推送变更到钉钉') {
    super(message);
    this.name = 'MissingApprovalError';
  }
}

class SyncLog {
  constructor() {
    this.logs = [];
  }

  record({ direction, pullOrPush, affectedCount = 0, errors = [], approvalNo = null, retryCount = 0, success = true }) {
    const entry = {
      ts: new Date().toISOString(),
      direction,
      pullOrPush,
      affectedCount,
      errors,
      approvalNo,
      retryCount,
      success
    };
    this.logs.push(entry);
    return entry;
  }

  getAll() {
    return [...this.logs];
  }

  size() {
    return this.logs.length;
  }

  clear() {
    this.logs = [];
  }
}

class DingTalkClient {
  constructor({ mode = 'mock', dwsSkill = null } = {}) {
    this.mode = mode;
    this.dwsSkill = dwsSkill;
    this._mockUsers = [];
    this._mockDepts = [];
    this._networkFailureCount = 0;
    this._networkFailureThreshold = 0;
    if (mode === 'mock') {
      this._initMockData();
    }
  }

  _initMockData() {
    const deptNames = ['总经办', '技术部', '产品部', '市场部', '人事部', '财务部', '运营部', '销售部', '客服部', '法务部'];
    for (let i = 1; i <= 10; i++) {
      this._mockDepts.push({
        deptId: 100 + i,
        name: deptNames[i - 1],
        parentId: i === 1 ? 1 : 101,
        order: i
      });
    }
    const firstNames = ['丁', '董', '杜', '段', '范', '方', '冯', '付', '高', '葛', '龚', '顾', '关', '韩', '何'];
    const lastNames = ['建华', '晓明', '志明', '国华', '志强', '晓东', '晓红', '海燕', '丽娟', '春梅', '云龙', '文博', '思远', '雨萱', '梓涵'];
    const titles = ['架构师', '产品经理', 'UI设计师', '前端专家', '后端专家', '运营总监', '销售经理', 'HRBP', '会计', '法务顾问'];
    for (let i = 1; i <= 50; i++) {
      const firstName = firstNames[(i - 1) % firstNames.length];
      const lastName = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
      const dept = this._mockDepts[(i - 1) % this._mockDepts.length];
      this._mockUsers.push({
        dingtalkUserId: `MOCK_DD${String(20000 + i)}`,
        name: firstName + lastName,
        email: `dd_mock${i}@company.com`,
        mobile: `139${String(20000000 + i).slice(-8)}`,
        department: dept.deptId,
        title: titles[(i - 1) % titles.length],
        directLeaderDingId: i > 5 ? `MOCK_DD${String(20000 + ((i - 2) % 5) + 1)}` : null,
        status: 'active',
        avatar: `https://mock-avatar.com/dd/${i}.png`,
        jobNumber: `DD${String(3000 + i)}`
      });
    }
  }

  setNetworkFailurePattern(threshold) {
    this._networkFailureThreshold = threshold;
    this._networkFailureCount = 0;
  }

  _checkNetwork() {
    if (this._networkFailureThreshold > 0 && this._networkFailureCount < this._networkFailureThreshold) {
      this._networkFailureCount++;
      throw new Error('NETWORK_TIMEOUT: 钉钉API连接超时（Mock模拟）');
    }
  }

  async fetchAllDepts() {
    if (this.mode === 'mock') {
      this._checkNetwork();
      return JSON.parse(JSON.stringify(this._mockDepts));
    }
    if (this.dwsSkill) {
      return this.dwsSkill.fetchAllDepts();
    }
    throw new Error('未配置dwsSkill真实模式接口');
  }

  async fetchUsersByDept(deptId) {
    if (this.mode === 'mock') {
      this._checkNetwork();
      const users = deptId
        ? this._mockUsers.filter(u => u.department === deptId)
        : this._mockUsers;
      return JSON.parse(JSON.stringify(users));
    }
    if (this.dwsSkill) {
      return this.dwsSkill.fetchUsersByDept(deptId);
    }
    throw new Error('未配置dwsSkill真实模式接口');
  }

  async fetchAllUsers() {
    const depts = await this.fetchAllDepts();
    const allUsers = [];
    const seen = new Set();
    for (const dept of depts) {
      const users = await this.fetchUsersByDept(dept.deptId);
      for (const u of users) {
        if (!seen.has(u.dingtalkUserId)) {
          seen.add(u.dingtalkUserId);
          allUsers.push(u);
        }
      }
    }
    const rootUsers = await this.fetchUsersByDept(null);
    for (const u of rootUsers) {
      if (!seen.has(u.dingtalkUserId)) {
        seen.add(u.dingtalkUserId);
        allUsers.push(u);
      }
    }
    return allUsers;
  }

  async createUser(userData) {
    if (this.mode === 'mock') {
      this._checkNetwork();
      const newUser = {
        ...userData,
        dingtalkUserId: userData.dingtalkUserId || `MOCK_DD${String(Date.now()).slice(-6)}`
      };
      this._mockUsers.push(newUser);
      return JSON.parse(JSON.stringify(newUser));
    }
    if (this.dwsSkill) {
      return this.dwsSkill.createUser(userData);
    }
    throw new Error('未配置dwsSkill真实模式接口');
  }

  async updateUser(dingtalkUserId, updates) {
    if (this.mode === 'mock') {
      this._checkNetwork();
      const idx = this._mockUsers.findIndex(u => u.dingtalkUserId === dingtalkUserId);
      if (idx === -1) throw new Error(`用户不存在: ${dingtalkUserId}`);
      this._mockUsers[idx] = { ...this._mockUsers[idx], ...updates };
      return JSON.parse(JSON.stringify(this._mockUsers[idx]));
    }
    if (this.dwsSkill) {
      return this.dwsSkill.updateUser(dingtalkUserId, updates);
    }
    throw new Error('未配置dwsSkill真实模式接口');
  }

  _injectMockUsers(extraUsers) {
    for (const u of extraUsers) {
      if (!this._mockUsers.find(x => x.dingtalkUserId === u.dingtalkUserId)) {
        this._mockUsers.push(u);
      }
    }
  }

  getMockUser(dingtalkUserId) {
    return this._mockUsers.find(u => u.dingtalkUserId === dingtalkUserId) || null;
  }

  getMockUserCount() {
    return this._mockUsers.length;
  }
}

class ContactSyncResolver {
  constructor({ sourceOfTruth = 'dingtalk' } = {}) {
    this.sourceOfTruth = sourceOfTruth;
  }

  resolvePullConflict(dingtalkUser, localEmployee) {
    if (this.sourceOfTruth === 'dingtalk') {
      return {
        useDingtalk: true,
        resolvedData: {
          name: dingtalkUser.name,
          email: dingtalkUser.email,
          mobile: dingtalkUser.mobile,
          department: dingtalkUser.department,
          title: dingtalkUser.title,
          status: dingtalkUser.status
        },
        reason: '钉钉为主真源，冲突时以钉钉数据为准'
      };
    }
    return {
      useDingtalk: false,
      resolvedData: {},
      reason: '本地数据为主真源'
    };
  }

  validatePushBeforeWrite(pendingChange) {
    if (!pendingChange.approvalNo) {
      throw new MissingApprovalError();
    }
    if (!pendingChange.dingtalkUserId) {
      throw new Error('缺少钉钉用户ID，无法回写');
    }
    return true;
  }
}

class EventSubscriber {
  constructor({ contactSync, syncLog }) {
    this.contactSync = contactSync;
    this.syncLog = syncLog;
    this.handlers = {
      user_add: this._handleUserAdd.bind(this),
      user_modify: this._handleUserModify.bind(this),
      user_leave: this._handleUserLeave.bind(this),
      dept_transfer: this._handleDeptTransfer.bind(this),
      dept_modify: this._handleDeptModify.bind(this)
    };
  }

  async handleEvent(event) {
    const { eventType, payload } = event;
    const handler = this.handlers[eventType];
    if (!handler) {
      this.syncLog.record({
        direction: 'event',
        pullOrPush: 'event',
        affectedCount: 0,
        errors: [`未知事件类型: ${eventType}`],
        success: false
      });
      return { success: false, error: `未知事件类型: ${eventType}` };
    }
    try {
      const result = await handler(payload);
      this.syncLog.record({
        direction: 'event',
        pullOrPush: 'event',
        affectedCount: result.affectedCount || 1,
        errors: [],
        success: true
      });
      return { success: true, result };
    } catch (err) {
      this.syncLog.record({
        direction: 'event',
        pullOrPush: 'event',
        affectedCount: 0,
        errors: [err.message],
        success: false
      });
      return { success: false, error: err.message };
    }
  }

  async _handleUserAdd(payload) {
    await this.contactSync.pullFromDingtalk();
    return { affectedCount: 1, action: 'pulled' };
  }

  async _handleUserModify(payload) {
    await this.contactSync.pullFromDingtalk();
    return { affectedCount: 1, action: 'pulled' };
  }

  async _handleUserLeave(payload) {
    await this.contactSync.pullFromDingtalk();
    return { affectedCount: 1, action: 'pulled' };
  }

  async _handleDeptTransfer(payload) {
    await this.contactSync.pullFromDingtalk();
    return { affectedCount: 1, action: 'pulled' };
  }

  async _handleDeptModify(payload) {
    await this.contactSync.pullFromDingtalk();
    return { affectedCount: 1, action: 'pulled' };
  }
}

class SyncScheduler {
  constructor({
    contactSync,
    syncLog,
    alertQueue,
    intervalMs = 60 * 60 * 1000,
    maxRetries = 3,
    backoffDelays = [1000, 3000, 10000],
    failureThresholdForAlert = 3
  } = {}) {
    this.contactSync = contactSync;
    this.syncLog = syncLog;
    this.alertQueue = alertQueue;
    this.intervalMs = intervalMs;
    this.maxRetries = maxRetries;
    this.backoffDelays = backoffDelays;
    this.failureThresholdForAlert = failureThresholdForAlert;
    this._timer = null;
    this._consecutiveFailures = 0;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    this._running = true;
    this._timer = setInterval(() => {
      this._runOnce();
    }, this.intervalMs);
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _runOnce() {
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.backoffDelays[attempt - 1] || 1000;
          await this._sleep(delay);
        }
        const result = await this.contactSync.pullFromDingtalk();
        this.syncLog.record({
          direction: 'pull',
          pullOrPush: 'pull',
          affectedCount: result.diff ? (result.diff.added + result.diff.modified + result.diff.removed) : 0,
          errors: [],
          retryCount: attempt,
          success: true
        });
        this._consecutiveFailures = 0;
        return { success: true, attempt, result };
      } catch (err) {
        lastError = err;
        if (attempt === this.maxRetries) {
          break;
        }
      }
    }
    this._consecutiveFailures++;
    this.syncLog.record({
      direction: 'pull',
      pullOrPush: 'pull',
      affectedCount: 0,
      errors: [lastError ? lastError.message : '未知错误'],
      retryCount: this.maxRetries,
      success: false
    });
    if (this._consecutiveFailures >= this.failureThresholdForAlert) {
      this.alertQueue.enqueueAdminAlert({
        message: `钉钉通讯录同步连续失败${this._consecutiveFailures}次，最后错误: ${lastError ? lastError.message : '未知'}`,
        level: 'critical'
      });
    }
    return { success: false, error: lastError, retryCount: this.maxRetries };
  }

  async triggerNow() {
    return this._runOnce();
  }

  getConsecutiveFailures() {
    return this._consecutiveFailures;
  }

  resetFailures() {
    this._consecutiveFailures = 0;
  }
}

class ContactSync {
  constructor({
    employeeRegistry,
    dingTalkClient,
    resolver,
    syncLog,
    alertQueue
  }) {
    this.registry = employeeRegistry;
    this.client = dingTalkClient;
    this.resolver = resolver;
    this.syncLog = syncLog;
    this.alertQueue = alertQueue;
  }

  async pullFromDingtalk() {
    const dingtalkUsers = await this.client.fetchAllUsers();
    const localEmployees = this.registry.getAll();
    const localByDdId = new Map();
    for (const emp of localEmployees) {
      if (emp.dingtalkUserId) localByDdId.set(emp.dingtalkUserId, emp);
    }
    const ddByDdId = new Map();
    for (const u of dingtalkUsers) {
      ddByDdId.set(u.dingtalkUserId, u);
    }
    const diff = { added: 0, modified: 0, removed: 0, unchanged: 0 };
    const errors = [];
    for (const ddUser of dingtalkUsers) {
      const local = localByDdId.get(ddUser.dingtalkUserId);
      if (!local) {
        const ddLeaderEmp = ddUser.directLeaderDingId ? this.registry.getByDingTalkId(ddUser.directLeaderDingId) : null;
        const newEmp = {
          id: `EMP${String(this.registry.size() + 1).padStart(5, '0')}`,
          name: ddUser.name,
          email: ddUser.email,
          mobile: ddUser.mobile,
          dingtalkUserId: ddUser.dingtalkUserId,
          department: ddUser.department,
          title: ddUser.title,
          directLeader: ddLeaderEmp ? ddLeaderEmp.id : null,
          status: ddUser.status,
          entryDate: new Date().toISOString().slice(0, 10)
        };
        this.registry.add(newEmp);
        diff.added++;
      } else {
        const resolution = this.resolver.resolvePullConflict(ddUser, local);
        if (resolution.useDingtalk) {
          let hasChanges = false;
          for (const [k, v] of Object.entries(resolution.resolvedData)) {
            if (local[k] !== v) { hasChanges = true; break; }
          }
          if (ddUser.directLeaderDingId) {
            const ddLeaderEmp = this.registry.getByDingTalkId(ddUser.directLeaderDingId);
            const newLeaderId = ddLeaderEmp ? ddLeaderEmp.id : null;
            if (local.directLeader !== newLeaderId) hasChanges = true;
          }
          if (hasChanges) {
            const updates = { ...resolution.resolvedData };
            if (ddUser.directLeaderDingId) {
              const ddLeaderEmp = this.registry.getByDingTalkId(ddUser.directLeaderDingId);
              updates.directLeader = ddLeaderEmp ? ddLeaderEmp.id : null;
            }
            this.registry.update(local.id, updates);
            diff.modified++;
          } else {
            diff.unchanged++;
          }
        } else {
          diff.unchanged++;
        }
      }
    }
    for (const localEmp of localEmployees) {
      if (localEmp.dingtalkUserId && !ddByDdId.has(localEmp.dingtalkUserId)) {
        this.registry.update(localEmp.id, { status: 'inactive' });
        diff.removed++;
      }
    }
    this.syncLog.record({
      direction: 'dingtalk->registry',
      pullOrPush: 'pull',
      affectedCount: diff.added + diff.modified + diff.removed,
      errors,
      success: errors.length === 0
    });
    return { diff, errors };
  }

  async pushApprovedChangesToDingtalk({ pendingChanges, approvalNo }) {
    if (!approvalNo) {
      throw new MissingApprovalError();
    }
    const updatedRecords = [];
    const errors = [];
    for (const change of pendingChanges) {
      try {
        this.resolver.validatePushBeforeWrite({ ...change, approvalNo });
        const localEmp = this.registry.getById(change.employeeId);
        if (!localEmp) {
          errors.push(`员工不存在: ${change.employeeId}`);
          continue;
        }
        const ddUpdates = {};
        if (change.updates.name) ddUpdates.name = change.updates.name;
        if (change.updates.email) ddUpdates.email = change.updates.email;
        if (change.updates.mobile) ddUpdates.mobile = change.updates.mobile;
        if (change.updates.department) ddUpdates.department = change.updates.department;
        if (change.updates.title) ddUpdates.title = change.updates.title;
        if (change.updates.directLeader) {
          const leaderEmp = this.registry.getById(change.updates.directLeader);
          if (leaderEmp && leaderEmp.dingtalkUserId) {
            ddUpdates.directLeaderDingId = leaderEmp.dingtalkUserId;
          }
        }
        const ddResult = await this.client.updateUser(localEmp.dingtalkUserId, ddUpdates);
        updatedRecords.push(ddResult);
      } catch (err) {
        errors.push(`${change.employeeId}: ${err.message}`);
      }
    }
    this.syncLog.record({
      direction: 'registry->dingtalk',
      pullOrPush: 'push',
      affectedCount: updatedRecords.length,
      errors,
      approvalNo,
      success: errors.length === 0
    });
    return {
      approvalNo,
      updatedRecords,
      errors,
      totalPushed: updatedRecords.length
    };
  }
}

module.exports = {
  MissingApprovalError,
  SyncLog,
  DingTalkClient,
  ContactSyncResolver,
  EventSubscriber,
  SyncScheduler,
  ContactSync
};
