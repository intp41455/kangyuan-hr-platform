'use strict';

const { RuleEngine, RULE_CATEGORIES } = require('../rules/rule_engine.js');
const { DingTalkBotClient } = require('../../integrations/dingtalk_bot_dispatcher.js');

const APPROVAL_TYPES = Object.freeze({
  LEAVE: 'LEAVE',
  OT: 'OT',
  MAKEUP: 'MAKEUP',
  PAYROLL_ANOMALY: 'PAYROLL_ANOMALY',
  PREPAY_ANNUAL: 'PREPAY_ANNUAL',
  EXEMPTION: 'EXEMPTION',
  COMPTIME_EXTENSION: 'COMPTIME_EXTENSION'
});

const APPROVAL_TYPE_NAMES = Object.freeze({
  [APPROVAL_TYPES.LEAVE]: '请假',
  [APPROVAL_TYPES.OT]: '加班',
  [APPROVAL_TYPES.MAKEUP]: '补卡',
  [APPROVAL_TYPES.PAYROLL_ANOMALY]: '薪酬异常',
  [APPROVAL_TYPES.PREPAY_ANNUAL]: '年假预付',
  [APPROVAL_TYPES.EXEMPTION]: '豁免',
  [APPROVAL_TYPES.COMPTIME_EXTENSION]: '调休延期'
});

const APPROVAL_LEVELS = Object.freeze({
  LEVEL_1: 'LEVEL_1',
  LEVEL_2: 'LEVEL_2',
  LEVEL_3: 'LEVEL_3',
  LEVEL_4: 'LEVEL_4'
});

const APPROVER_ROLES = Object.freeze({
  DIRECT_LEADER: 'DIRECT_LEADER',
  DEPT_HEAD: 'DEPT_HEAD',
  VICE_PRESIDENT: 'VICE_PRESIDENT',
  HR_DIRECTOR: 'HR_DIRECTOR',
  FINANCE: 'FINANCE',
  EDU_DIRECTOR: 'EDU_DIRECTOR'
});

const APPROVER_ROLE_NAMES = Object.freeze({
  [APPROVER_ROLES.DIRECT_LEADER]: '直属领导',
  [APPROVER_ROLES.DEPT_HEAD]: '部门负责人',
  [APPROVER_ROLES.VICE_PRESIDENT]: '分管副总',
  [APPROVER_ROLES.HR_DIRECTOR]: 'HR总监',
  [APPROVER_ROLES.FINANCE]: '财务',
  [APPROVER_ROLES.EDU_DIRECTOR]: '教务总监'
});

const FORCE_THREE_LEVEL_TYPES = Object.freeze([
  APPROVAL_TYPES.PAYROLL_ANOMALY,
  APPROVAL_TYPES.EXEMPTION
]);

const DEFAULT_THRESHOLD = 2000;

const SLA_NODES = Object.freeze({
  D3_1800: { nodeId: 'D3_1800', name: 'D-3 18:00', description: '考勤异常闭环率目标≥95%', metric: 'attendance_closure_rate', defaultTarget: 95 },
  D2_1400: { nodeId: 'D2_1400', name: 'D-2 14:00', description: '薪酬初算', metric: 'payroll_initial_calc', defaultTarget: 100 },
  D2_1800: { nodeId: 'D2_1800', name: 'D-2 18:00', description: '薪酬确认', metric: 'payroll_confirmation', defaultTarget: 100 },
  D1_1200: { nodeId: 'D1_1200', name: 'D-1 12:00', description: '员工确认率≥95%', metric: 'employee_confirm_rate', defaultTarget: 95 },
  D0_0900: { nodeId: 'D0_0900', name: 'D日 09:00', description: '工资推送财务', metric: 'payroll_push_finance', defaultTarget: 100 }
});

const SLA_STATUS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED'
});

class AlertQueue {
  constructor() {
    this._alerts = [];
  }

  warning(message, context = {}) {
    const alert = {
      level: 'warning',
      message,
      context,
      timestamp: new Date()
    };
    this._alerts.push(alert);
    return alert;
  }

  error(message, context = {}) {
    const alert = {
      level: 'error',
      message,
      context,
      timestamp: new Date()
    };
    this._alerts.push(alert);
    return alert;
  }

  info(message, context = {}) {
    const alert = {
      level: 'info',
      message,
      context,
      timestamp: new Date()
    };
    this._alerts.push(alert);
    return alert;
  }

  getAll() {
    return [...this._alerts];
  }

  getByLevel(level) {
    return this._alerts.filter(a => a.level === level);
  }

  size() {
    return this._alerts.length;
  }

  clear() {
    this._alerts = [];
  }
}

class SmsAlertQueue {
  constructor() {
    this._queue = [];
  }

  enqueue({ level, to, message = '', context = {} }) {
    const item = {
      id: `SMS_${Date.now()}_${String(Math.floor(Math.random() * 9000) + 1000)}`,
      level,
      to,
      message,
      context,
      timestamp: new Date(),
      status: 'QUEUED'
    };
    this._queue.push(item);
    return item;
  }

  getAll() {
    return [...this._queue];
  }

  getByTo(to) {
    return this._queue.filter(q => q.to === to);
  }

  size() {
    return this._queue.length;
  }

  clear() {
    this._queue = [];
  }
}

class ApprovalMatrixConfig {
  constructor({ ruleEngine = null, alertQueue = null } = {}) {
    this.ruleEngine = ruleEngine || new RuleEngine();
    this.alertQueue = alertQueue || new AlertQueue();
    this._configs = new Map();
    this._threshold = DEFAULT_THRESHOLD;
    this._thresholdTier2 = null;
    this._initializeDefaults();
    this._registerApprovalRules();
  }

  _initializeDefaults() {
    const defaultLevels = [
      APPROVAL_LEVELS.LEVEL_1,
      APPROVAL_LEVELS.LEVEL_2,
      APPROVAL_LEVELS.LEVEL_3,
      APPROVAL_LEVELS.LEVEL_4
    ];

    const defaultRoleMap = {
      [APPROVAL_LEVELS.LEVEL_1]: APPROVER_ROLES.DIRECT_LEADER,
      [APPROVAL_LEVELS.LEVEL_2]: APPROVER_ROLES.DEPT_HEAD,
      [APPROVAL_LEVELS.LEVEL_3]: APPROVER_ROLES.VICE_PRESIDENT,
      [APPROVAL_LEVELS.LEVEL_4]: APPROVER_ROLES.HR_DIRECTOR
    };

    for (const type of Object.values(APPROVAL_TYPES)) {
      this._configs.set(type, {
        type,
        levels: [...defaultLevels],
        roleMap: { ...defaultRoleMap }
      });
    }
  }

  _registerApprovalRules() {
    const rules = [
      {
        id: 'hr-approval-route-threshold',
        rCode: 'R-401',
        name: '审批路由金额阈值规则',
        category: RULE_CATEGORIES.APPROVAL,
        formula: (ctx) => {
          const amount = Number(ctx.amount) || 0;
          const threshold = Number(ctx.threshold) || DEFAULT_THRESHOLD;
          if (amount <= threshold) return 2;
          return 3;
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团审批管理制度2026版',
          page: 12,
          approvalNo: 'HR-2026-APR-401'
        }
      },
      {
        id: 'hr-approval-force-three-level',
        rCode: 'R-402',
        name: '强制三级审批类型规则',
        category: RULE_CATEGORIES.APPROVAL,
        formula: (ctx) => {
          const type = ctx.type;
          return FORCE_THREE_LEVEL_TYPES.includes(type);
        },
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团审批管理制度2026版',
          page: 15,
          approvalNo: 'HR-2026-APR-402'
        }
      }
    ];
    this.ruleEngine.batchRegisterRules(rules);
  }

  setThreshold(amount, tier2Amount = null) {
    this._threshold = Number(amount) || DEFAULT_THRESHOLD;
    if (tier2Amount !== null) {
      this._thresholdTier2 = Number(tier2Amount);
    }
    return { threshold: this._threshold, thresholdTier2: this._thresholdTier2 };
  }

  getThreshold() {
    return {
      threshold: this._threshold,
      thresholdTier2: this._thresholdTier2
    };
  }

  configureType({ type, levels, roleMap }) {
    if (!APPROVAL_TYPES[type]) {
      throw new Error(`无效的审批类型：${type}`);
    }
    const validLevels = Object.values(APPROVAL_LEVELS);
    for (const lvl of levels || []) {
      if (!validLevels.includes(lvl)) {
        throw new Error(`无效的审批级别：${lvl}`);
      }
    }
    const validRoles = Object.values(APPROVER_ROLES);
    if (roleMap) {
      for (const [lvl, role] of Object.entries(roleMap)) {
        if (role !== null && role !== undefined && !validRoles.includes(role)) {
          throw new Error(`无效的审批人角色：${role}`);
        }
      }
    }
    const existing = this._configs.get(type);
    this._configs.set(type, {
      type,
      levels: levels || existing.levels,
      roleMap: { ...existing.roleMap, ...(roleMap || {}) }
    });
    return this._configs.get(type);
  }

  getConfig(type) {
    return this._configs.get(type) || null;
  }

  listAllConfigs() {
    return Array.from(this._configs.values());
  }

  async getApprovalRoute({ type, amount = 0, employee = null, positionTag = null }) {
    if (!APPROVAL_TYPES[type]) {
      throw new Error(`无效的审批类型：${type}`);
    }

    const config = this._configs.get(type);
    if (!config) {
      throw new Error(`审批类型${type}未配置`);
    }

    const ruleResult = await this.ruleEngine.executeRules(['R-401', 'R-402'], {
      type,
      amount,
      threshold: this._threshold
    });

    const forceThree = ruleResult.results['R-402'] === true;
    let levelCount = ruleResult.results['R-401'];

    if (forceThree) {
      levelCount = 3;
    }

    const requiredLevels = config.levels.slice(0, levelCount);
    const route = [];
    const missingLevels = [];

    for (const lvl of requiredLevels) {
      const role = config.roleMap[lvl];
      if (role) {
        route.push(role);
      } else {
        missingLevels.push(lvl);
      }
    }

    if (missingLevels.length > 0) {
      this.alertQueue.warning(
        `审批类型${APPROVAL_TYPE_NAMES[type]}(${type})缺少${missingLevels.length}个审批节点配置：${missingLevels.join('、')}`,
        { type, missingLevels, positionTag }
      );
    }

    return {
      type,
      typeName: APPROVAL_TYPE_NAMES[type],
      amount,
      threshold: this._threshold,
      levelCount,
      forceThree,
      route,
      requiredLevels,
      missingLevels
    };
  }
}

class SlaMonitor {
  constructor({ botClient = null, smsAlertQueue = null, hrGroupId = 'HR_ALL_GROUP' } = {}) {
    this.botClient = botClient || new DingTalkBotClient({ mode: 'mock' });
    this.smsAlertQueue = smsAlertQueue || new SmsAlertQueue();
    this.hrGroupId = hrGroupId;
    this._nodeHistory = new Map();
    this._initializeHistory();
  }

  _initializeHistory() {
    for (const node of Object.values(SLA_NODES)) {
      this._nodeHistory.set(node.nodeId, []);
    }
  }

  async runSlaCheckpoint({ nodeId, metric, target, actual }) {
    const nodeDef = SLA_NODES[nodeId];
    if (!nodeDef) {
      throw new Error(`无效的SLA节点ID：${nodeId}`);
    }

    const targetVal = Number(target) !== undefined && Number(target) !== null && !isNaN(Number(target))
      ? Number(target)
      : nodeDef.defaultTarget;
    const actualVal = Number(actual) || 0;

    let status;
    const fivePercentOfTarget = targetVal * 0.05;
    const tenPercentOfTarget = targetVal * 0.10;

    if (actualVal >= targetVal) {
      status = SLA_STATUS.GREEN;
    } else if (actualVal >= targetVal - fivePercentOfTarget) {
      status = SLA_STATUS.YELLOW;
    } else {
      status = SLA_STATUS.RED;
    }

    const record = {
      nodeId,
      nodeName: nodeDef.name,
      description: nodeDef.description,
      metric: metric || nodeDef.metric,
      target: targetVal,
      actual: actualVal,
      status,
      delta: actualVal - targetVal,
      deltaPercent: targetVal > 0 ? Number(((actualVal - targetVal) / targetVal * 100).toFixed(2)) : 0,
      timestamp: new Date()
    };

    this._nodeHistory.get(nodeId).push(record);

    if (status === SLA_STATUS.YELLOW) {
      await this._notifyHrYellow(record);
    } else if (status === SLA_STATUS.RED) {
      await this._notifyHrDirectorRed(record);
    }

    return record;
  }

  async _notifyHrYellow(record) {
    const message = {
      title: `【SLA黄灯预警】${record.nodeName}`,
      content: `${record.description} 目标${record.target}%，实际${record.actual}%，差值${record.deltaPercent >= 0 ? '+' : ''}${record.deltaPercent}%`,
      slaStatus: SLA_STATUS.YELLOW,
      metric: record.metric,
      target: record.target,
      actual: record.actual,
      suggestion: '请HR团队关注并加速处理'
    };
    await this.botClient.sendGroupDm(this.hrGroupId, message);
  }

  async _notifyHrDirectorRed(record) {
    const groupMessage = {
      title: `【SLA红灯告警】${record.nodeName}`,
      content: `${record.description} 目标${record.target}%，实际${record.actual}%，严重不达标！差值${record.deltaPercent >= 0 ? '+' : ''}${record.deltaPercent}%`,
      slaStatus: SLA_STATUS.RED,
      metric: record.metric,
      target: record.target,
      actual: record.actual,
      suggestion: '请立即采取补救措施'
    };
    await this.botClient.sendGroupDm(this.hrGroupId, groupMessage);

    this.smsAlertQueue.enqueue({
      level: 'critical',
      to: APPROVER_ROLES.HR_DIRECTOR,
      message: `【SLA红灯告警】${record.nodeName} ${record.description} 目标${record.target}%，实际${record.actual}%，请立即处理！`,
      context: { ...record }
    });
  }

  getNodeHistory(nodeId) {
    return this._nodeHistory.get(nodeId) || [];
  }

  getLatestStatus(nodeId) {
    const history = this.getNodeHistory(nodeId);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  getSlaDashboard() {
    const nodeStatuses = {};
    for (const [nodeId, nodeDef] of Object.entries(SLA_NODES)) {
      const latest = this.getLatestStatus(nodeId);
      nodeStatuses[nodeId] = {
        nodeId,
        nodeName: nodeDef.name,
        description: nodeDef.description,
        metric: nodeDef.metric,
        defaultTarget: nodeDef.defaultTarget,
        latestStatus: latest ? latest.status : null,
        latestActual: latest ? latest.actual : null,
        latestTarget: latest ? latest.target : null,
        latestTimestamp: latest ? latest.timestamp : null
      };
    }

    const trendData = {};
    for (const [nodeId, history] of this._nodeHistory.entries()) {
      trendData[nodeId] = history.map(h => ({
        timestamp: h.timestamp,
        actual: h.actual,
        target: h.target,
        status: h.status
      }));
    }

    return {
      generatedAt: new Date(),
      nodeStatuses,
      trendData,
      summary: {
        greenCount: Object.values(nodeStatuses).filter(n => n.latestStatus === SLA_STATUS.GREEN).length,
        yellowCount: Object.values(nodeStatuses).filter(n => n.latestStatus === SLA_STATUS.YELLOW).length,
        redCount: Object.values(nodeStatuses).filter(n => n.latestStatus === SLA_STATUS.RED).length,
        unknownCount: Object.values(nodeStatuses).filter(n => n.latestStatus === null).length
      }
    };
  }
}

function getConfigPageStructure() {
  return {
    pageTitle: '审批矩阵配置中心',
    pageDescription: 'HR配置审批类型、审批层级和金额阈值',
    sections: [
      {
        sectionId: 'basic',
        sectionName: '基础配置',
        fields: [
          {
            fieldId: 'threshold',
            fieldName: '金额阈值(THRESHOLD)',
            fieldType: 'number',
            required: true,
            defaultValue: DEFAULT_THRESHOLD,
            minValue: 0,
            unit: '元',
            helpText: '≤阈值走二级审批，>阈值走三级审批',
            placeholder: '请输入金额阈值，如2000'
          },
          {
            fieldId: 'thresholdTier2',
            fieldName: '第二档阈值(可选)',
            fieldType: 'number',
            required: false,
            defaultValue: null,
            minValue: 0,
            unit: '元',
            helpText: '双档阈值支持，留空则仅使用单档',
            placeholder: '请输入第二档阈值，如5000'
          }
        ]
      },
      {
        sectionId: 'approval_matrix',
        sectionName: '审批矩阵配置',
        fields: [
          {
            fieldId: 'type',
            fieldName: '审批类型',
            fieldType: 'select',
            required: true,
            options: Object.entries(APPROVAL_TYPES).map(([key, value]) => ({
              value: value,
              label: APPROVAL_TYPE_NAMES[value]
            })),
            helpText: '选择需要配置的审批业务类型'
          },
          {
            fieldId: 'levels',
            fieldName: '审批级别(按顺序)',
            fieldType: 'multiselect',
            required: true,
            options: Object.entries(APPROVAL_LEVELS).map(([key, value]) => ({
              value: value,
              label: `第${value.split('_')[1]}级`
            })),
            helpText: '选择该审批类型支持的审批级别，按审批顺序排列'
          },
          {
            fieldId: 'roleMapping',
            fieldName: '审批人角色映射',
            fieldType: 'repeatingGroup',
            required: true,
            repeatFields: [
              {
                fieldId: 'level',
                fieldName: '审批级别',
                fieldType: 'select',
                options: Object.entries(APPROVAL_LEVELS).map(([key, value]) => ({
                  value: value,
                  label: `第${value.split('_')[1]}级`
                }))
              },
              {
                fieldId: 'role',
                fieldName: '对应角色',
                fieldType: 'select',
                options: Object.entries(APPROVER_ROLES).map(([key, value]) => ({
                  value: value,
                  label: APPROVER_ROLE_NAMES[value]
                }))
              }
            ],
            helpText: '配置每一级审批对应的审批人角色'
          }
        ]
      },
      {
        sectionId: 'actions',
        sectionName: '操作',
        fields: [
          {
            fieldId: 'saveBtn',
            fieldName: '保存配置',
            fieldType: 'button',
            buttonType: 'primary',
            action: 'saveConfig',
            helpText: '点击保存当前审批矩阵配置'
          },
          {
            fieldId: 'testBtn',
            fieldName: '测试路由',
            fieldType: 'button',
            buttonType: 'secondary',
            action: 'testRoute',
            helpText: '输入申请金额后测试审批路由'
          },
          {
            fieldId: 'resetBtn',
            fieldName: '恢复默认',
            fieldType: 'button',
            buttonType: 'default',
            action: 'resetConfig',
            helpText: '恢复为系统默认配置'
          }
        ]
      }
    ],
    fieldSummary: {
      typeSelectCount: Object.keys(APPROVAL_TYPES).length,
      approverRoleCount: Object.keys(APPROVER_ROLES).length,
      levelCount: Object.keys(APPROVAL_LEVELS).length,
      buttonCount: 3
    }
  };
}

module.exports = {
  APPROVAL_TYPES,
  APPROVAL_TYPE_NAMES,
  APPROVAL_LEVELS,
  APPROVER_ROLES,
  APPROVER_ROLE_NAMES,
  FORCE_THREE_LEVEL_TYPES,
  DEFAULT_THRESHOLD,
  SLA_NODES,
  SLA_STATUS,
  AlertQueue,
  SmsAlertQueue,
  ApprovalMatrixConfig,
  SlaMonitor,
  getConfigPageStructure
};
