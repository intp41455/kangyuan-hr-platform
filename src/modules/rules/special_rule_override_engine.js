'use strict';

/**
 * 特殊人员/特殊情况规则覆盖引擎
 *
 * 【设计目的】
 * 康源集团明确要求：「罚款只是针对大部分人和大部分情况，会有特殊情况和特殊人员
 * 有特殊规则，所以需要有高自主性，也就是自行定制」
 *
 * 【覆盖维度】（5维匹配，按优先级从高到低）
 * 1. empId      精确员工（最高优先级，如：董事长、总裁、核心技术专家）
 * 2. positionTag 岗位标签（如：EXECUTIVE高管 / EDU_DIRECTOR教育总监 / FIELD_OUTREACH外勤）
 * 3. deptPath   部门路径（如：教育板块/西安事业部 vs 总部）
 * 4. workLocation 工作地（如：西安 / 天水 / 白银 / 平凉 / 兰州）
 * 5. 全局默认    （最低优先级，即企业默认规则）
 *
 * 【支持的覆盖规则类型】
 * - 加班政策覆盖（OVERTIME_POLICY）：工作日/周末/法定节假日 计算方式
 * - 旷工扣款覆盖（ABSENT_POLICY）：倍率（1倍事假 / 1.5倍 / 2倍 / 特殊金额）
 * - 迟到扣款覆盖（LATE_POLICY）：单次金额 / 是否取消全勤
 * - 病假扣款覆盖（SICK_LEAVE_POLICY）：扣款比例
 * - 工龄工资覆盖（SENIORITY_RATE）：元/年
 * - 绩效比例覆盖（PERFORMANCE_RATIO）：固定:浮动比
 * - 试用期待遇覆盖（PROBATION_POLICY）：试用期比例
 * - 津贴项目覆盖（ALLOWANCE_OVERRIDE）：增减特定津贴
 * - 个税专项附加扣除覆盖（TAX_DEDUCTION_OVERRIDE）：子女/赡养/房贷等
 * - 自定义公式覆盖（CUSTOM_FORMULA）：完全自定义JS公式
 *
 * 【使用示例】
 * const engine = new SpecialRuleOverrideEngine();
 *
 * // 场景1：董事长法定节假日加班发3倍（其他员工只转调休）
 * engine.addOverride({
 *   matchKey: 'EMP:EMP001',
 *   ruleType: 'OVERTIME_POLICY',
 *   override: { holidayMode: 'PAY_300' },
 *   approvalNo: 'HR-2026-SPECIAL-001',
 *   reason: '董事长法定节假日加班按法定3倍发放',
 *   changeUser: '王宁'
 * });
 *
 * // 场景2：教育板块全部员工工作日加班也转调休（其他部门不作数）
 * engine.addOverride({
 *   matchKey: 'DEPT:教育板块',
 *   ruleType: 'OVERTIME_POLICY',
 *   override: { workdayMode: 'COMPTIME' },
 *   approvalNo: 'HR-2026-SPECIAL-002',
 *   reason: '教育板块工作日加班转调休（教师备课特殊性）',
 *   changeUser: '王宁'
 * });
 *
 * // 场景3：外勤岗位迟到一次扣20元（其他10元）
 * engine.addOverride({
 *   matchKey: 'POSITION:FIELD_OUTREACH',
 *   ruleType: 'LATE_POLICY',
 *   override: { perTimePenalty: 20, cancelFullAttendance: true },
 *   approvalNo: 'HR-2026-SPECIAL-003',
 *   reason: '外勤岗位迟到影响客户拜访，加重扣款',
 *   changeUser: '王宁'
 * });
 *
 * // 使用：计算某员工加班费时，引擎自动应用其适用的最高优先级覆盖
 * const policy = engine.resolveOvertimePolicy({
 *   empId: 'EMP001',
 *   positionTag: 'EXECUTIVE',
 *   deptPath: '总部',
 *   workLocation: '西安'
 * });
 * // → policy.holidayMode = 'PAY_300'（因EMP001精确匹配优先于全局COMPTIME_ONLY）
 */

const PRIORITY_EMP = 100;       // 员工级精确匹配，最高优先级
const PRIORITY_POSITION = 80;  // 岗位标签匹配
const PRIORITY_DEPT = 60;       // 部门路径匹配
const PRIORITY_LOCATION = 40;   // 工作地匹配
const PRIORITY_GLOBAL = 10;     // 全局默认最低

const MATCH_TYPES = Object.freeze({
  EMP: 'EMP',           // 精确员工匹配
  POSITION: 'POSITION', // 岗位标签匹配
  DEPT: 'DEPT',         // 部门路径匹配
  LOCATION: 'LOCATION', // 工作地匹配
  GLOBAL: 'GLOBAL'      // 全局默认
});

const RULE_TYPES = Object.freeze({
  OVERTIME_POLICY: 'OVERTIME_POLICY',         // 加班政策
  ABSENT_POLICY: 'ABSENT_POLICY',             // 旷工扣款
  LATE_POLICY: 'LATE_POLICY',                 // 迟到/缺卡
  SICK_LEAVE_POLICY: 'SICK_LEAVE_POLICY',     // 病假扣款
  SENIORITY_RATE: 'SENIORITY_RATE',           // 工龄工资
  PERFORMANCE_RATIO: 'PERFORMANCE_RATIO',      // 绩效比例
  PROBATION_POLICY: 'PROBATION_POLICY',       // 试用期待遇
  ALLOWANCE_OVERRIDE: 'ALLOWANCE_OVERRIDE',   // 津贴项目
  TAX_DEDUCTION_OVERRIDE: 'TAX_DEDUCTION_OVERRIDE', // 个税专项附加
  CUSTOM_FORMULA: 'CUSTOM_FORMULA'            // 自定义公式
});

// 企业默认规则（当前用户确认版）
const DEFAULT_POLICIES = Object.freeze({
  OVERTIME_POLICY: {
    workdayMode: 'NO_CALC',        // 工作日加班不作数
    weekendMode: 'COMPTIME_ONLY', // 周末加班只转调休
    holidayMode: 'COMPTIME_ONLY'  // 法定节假日只转调休（高风险但企业确认）
  },
  ABSENT_POLICY: {
    rate: 1,                       // 旷工按事假1倍
    legalNote: '原×3倍属罚款，企业无罚款权，按1倍无薪合规'
  },
  LATE_POLICY: {
    perTimePenalty: 10,            // 单次10元
    cancelFullAttendance: true,    // 取消全勤奖
    thresholdBeforeCancel: 1       // 第1次即取消（0=不取消，1=1次起取消）
  },
  SICK_LEAVE_POLICY: {
    withMedicalRecord: 0.2,        // 有病历扣20%（发80%）
    withoutMedicalRecord: 1.0,     // 无病历按事假100%
    seniorityTiers: {               // 按工龄阶梯（可选覆盖）
      under2: 0.4,                 // <2年工龄扣40%（发60%）
      '2to4': 0.3,                 // 2~4年扣30%（发70%）
      '4to6': 0.2,                 // 4~6年扣20%（发80%）
      '6to8': 0.1,                 // 6~8年扣10%（发90%）
      over8: 0                     // ≥8年不扣（发100%）
    }
  },
  SENIORITY_RATE: {
    rate: 100,                     // 元/年
    cap: 1000                      // 上限1000元/月
  },
  PERFORMANCE_RATIO: {
    fixedRatio: 0.9,               // 9:1固定:浮动
    floatRatio: 0.1,
    multiplierRange: { min: 0.6, max: 1.2 }
  },
  PROBATION_POLICY: {
    ratio: 0.8,                    // 试用期80%
    legalMin: 0.8                  // 法定最低80%
  }
});

class SpecialRuleOverrideEngine {
  constructor() {
    this._overrides = [];          // 覆盖规则数组
    this._changeLog = [];          // 变更日志
    this._defaultPolicies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
  }

  /**
   * 解析匹配键，返回优先级和匹配类型
   * @param {string} matchKey - 格式：EMP:EMP001 / POSITION:EXECUTIVE / DEPT:教育板块 / LOCATION:西安 / GLOBAL
   */
  _parseMatchKey(matchKey) {
    if (!matchKey || typeof matchKey !== 'string') {
      return { type: 'GLOBAL', priority: PRIORITY_GLOBAL, value: '*' };
    }
    if (matchKey === 'GLOBAL' || matchKey === '*') {
      return { type: 'GLOBAL', priority: PRIORITY_GLOBAL, value: '*' };
    }
    const parts = matchKey.split(':');
    if (parts.length < 2 && matchKey !== 'GLOBAL') {
      return { type: 'GLOBAL', priority: PRIORITY_GLOBAL, value: '*' };
    }
    const [type, ...rest] = parts;
    const value = rest.join(':');
    switch (type.toUpperCase()) {
      case 'EMP': return { type: 'EMP', priority: PRIORITY_EMP, value };
      case 'POSITION': return { type: 'POSITION', priority: PRIORITY_POSITION, value };
      case 'DEPT': return { type: 'DEPT', priority: PRIORITY_DEPT, value };
      case 'LOCATION': return { type: 'LOCATION', priority: PRIORITY_LOCATION, value };
      default: return { type: 'GLOBAL', priority: PRIORITY_GLOBAL, value: '*' };
    }
  }

  /**
   * 添加一条特殊规则覆盖
   */
  addOverride({ matchKey, ruleType, override, approvalNo, reason, changeUser, effectiveDate, expireDate }) {
    if (!matchKey) throw new Error('matchKey必填');
    if (!Object.values(RULE_TYPES).includes(ruleType)) {
      throw new Error(`不支持的ruleType：${ruleType}，支持：${Object.values(RULE_TYPES).join('、')}`);
    }
    if (!override || typeof override !== 'object') {
      throw new Error('override必须为对象');
    }
    if (!approvalNo) {
      throw new Error('approvalNo（制度委员会审批单号）必填，缺失不允许添加');
    }
    const parsed = this._parseMatchKey(matchKey);
    const record = {
      id: `OVR-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      matchKey,
      matchType: parsed.type,
      priority: parsed.priority,
      matchValue: parsed.value,
      ruleType,
      override: JSON.parse(JSON.stringify(override)),
      approvalNo,
      reason: reason || '未说明',
      changeUser: changeUser || 'unknown',
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
      expireDate: expireDate || '2099-12-31',
      createdAt: new Date()
    };
    this._overrides.push(record);
    this._changeLog.push({
      action: 'ADD',
      recordId: record.id,
      matchKey,
      ruleType,
      approvalNo,
      changeUser,
      time: new Date()
    });
    return record;
  }

  /**
   * 删除一条特殊规则覆盖（需审批单号）
   */
  removeOverride(overrideId, approvalNo, changeUser) {
    if (!approvalNo) throw new Error('删除覆盖规则必须填写approvalNo');
    const idx = this._overrides.findIndex(o => o.id === overrideId);
    if (idx < 0) return null;
    const removed = this._overrides.splice(idx, 1)[0];
    this._changeLog.push({
      action: 'REMOVE',
      recordId: overrideId,
      matchKey: removed.matchKey,
      ruleType: removed.ruleType,
      approvalNo,
      changeUser,
      time: new Date()
    });
    return removed;
  }

  /**
   * 查询所有匹配员工上下文的覆盖规则，按优先级排序
   */
  _findMatchingOverrides({ empId, positionTag, deptPath, workLocation, ruleType }) {
    const candidates = [];
    const now = new Date();
    for (const ov of this._overrides) {
      if (ov.ruleType !== ruleType) continue;
      // 有效期校验
      if (new Date(ov.effectiveDate) > now) continue;
      if (new Date(ov.expireDate) < now) continue;
      // 匹配检查
      if (ov.matchType === 'EMP' && empId && ov.matchValue === empId) {
        candidates.push(ov);
      } else if (ov.matchType === 'POSITION' && positionTag && ov.matchValue === positionTag) {
        candidates.push(ov);
      } else if (ov.matchType === 'DEPT' && deptPath && deptPath.includes(ov.matchValue)) {
        candidates.push(ov);
      } else if (ov.matchType === 'LOCATION' && workLocation && ov.matchValue === workLocation) {
        candidates.push(ov);
      } else if (ov.matchType === 'GLOBAL') {
        candidates.push(ov);
      }
    }
    // 按优先级降序排序
    return candidates.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 合并默认规则与覆盖规则（深度合并，覆盖优先）
   */
  _mergeOverride(defaultPolicy, overrides) {
    let merged = JSON.parse(JSON.stringify(defaultPolicy));
    const appliedOverrides = [];
    for (const ov of overrides) {
      merged = Object.assign({}, merged, ov.override);
      // 深度合并子对象
      for (const [k, v] of Object.entries(ov.override)) {
        if (typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object') {
          merged[k] = Object.assign({}, merged[k], v);
        }
      }
      appliedOverrides.push({
        id: ov.id,
        matchKey: ov.matchKey,
        matchType: ov.matchType,
        priority: ov.priority,
        approvalNo: ov.approvalNo,
        reason: ov.reason,
        overrideValues: ov.override
      });
    }
    return { policy: merged, appliedOverrides };
  }

  /**
   * 解析加班政策（带特殊覆盖）
   */
  resolveOvertimePolicy(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'OVERTIME_POLICY' });
    const result = this._mergeOverride(this._defaultPolicies.OVERTIME_POLICY, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides,
      effectiveModes: result.policy
    };
  }

  /**
   * 解析旷工扣款政策（带特殊覆盖）
   */
  resolveAbsentPolicy(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'ABSENT_POLICY' });
    const result = this._mergeOverride(this._defaultPolicies.ABSENT_POLICY, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 解析迟到扣款政策（带特殊覆盖）
   */
  resolveLatePolicy(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'LATE_POLICY' });
    const result = this._mergeOverride(this._defaultPolicies.LATE_POLICY, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 解析工龄工资标准（带特殊覆盖）
   */
  resolveSeniorityRate(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'SENIORITY_RATE' });
    const result = this._mergeOverride(this._defaultPolicies.SENIORITY_RATE, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 解析病假扣款政策（带特殊覆盖）
   */
  resolveSickLeavePolicy(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'SICK_LEAVE_POLICY' });
    const result = this._mergeOverride(this._defaultPolicies.SICK_LEAVE_POLICY, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 解析绩效比例（带特殊覆盖）
   */
  resolvePerformanceRatio(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'PERFORMANCE_RATIO' });
    const result = this._mergeOverride(this._defaultPolicies.PERFORMANCE_RATIO, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 解析试用期待遇（带特殊覆盖）
   */
  resolveProbationPolicy(ctx) {
    const overrides = this._findMatchingOverrides({ ...ctx, ruleType: 'PROBATION_POLICY' });
    const result = this._mergeOverride(this._defaultPolicies.PROBATION_POLICY, overrides);
    return {
      policy: result.policy,
      appliedOverrides: result.appliedOverrides
    };
  }

  /**
   * 通用规则解析器：根据ruleType自动路由
   */
  resolve(ruleType, ctx) {
    switch (ruleType) {
      case 'OVERTIME_POLICY': return this.resolveOvertimePolicy(ctx);
      case 'ABSENT_POLICY': return this.resolveAbsentPolicy(ctx);
      case 'LATE_POLICY': return this.resolveLatePolicy(ctx);
      case 'SENIORITY_RATE': return this.resolveSeniorityRate(ctx);
      case 'SICK_LEAVE_POLICY': return this.resolveSickLeavePolicy(ctx);
      case 'PERFORMANCE_RATIO': return this.resolvePerformanceRatio(ctx);
      case 'PROBATION_POLICY': return this.resolveProbationPolicy(ctx);
      default:
        // 通用自定义规则
        const overrides = this._findMatchingOverrides({ ...ctx, ruleType });
        return {
          policy: overrides.length > 0 ? overrides[0].override : null,
          appliedOverrides: overrides.map(o => ({
            id: o.id, matchKey: o.matchKey, matchType: o.matchType,
            priority: o.priority, approvalNo: o.approvalNo, reason: o.reason,
            overrideValues: o.override
          }))
        };
    }
  }

  /**
   * 列出所有覆盖规则（管理用）
   */
  listAllOverrides(filterRuleType) {
    let list = this._overrides;
    if (filterRuleType) {
      list = list.filter(o => o.ruleType === filterRuleType);
    }
    return list.sort((a, b) => b.priority - a.priority).map(o => ({
      id: o.id,
      matchKey: o.matchKey,
      matchType: o.matchType,
      priority: o.priority,
      ruleType: o.ruleType,
      override: o.override,
      approvalNo: o.approvalNo,
      reason: o.reason,
      changeUser: o.changeUser,
      effectiveDate: o.effectiveDate,
      expireDate: o.expireDate
    }));
  }

  /**
   * 查询变更日志
   */
  getChangeLog() {
    return this._changeLog.map(l => Object.assign({}, l, { time: l.time.toISOString() }));
  }

  /**
   * 导出当前所有规则配置（备份用）
   */
  exportConfig() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      defaultPolicies: this._defaultPolicies,
      overrides: this._overrides,
      changeLog: this._changeLog
    };
  }

  /**
   * 获取HR配置页面结构（非技术HR可视化操作）
   */
  getConfigPageStructure() {
    return {
      title: '特殊人员规则覆盖配置中心',
      description: '为特殊员工/岗位/部门/工作地设置个性化规则，覆盖企业默认规则',
      sections: [
        {
          sectionId: 'MATCH_TARGET',
          title: '1. 匹配对象（选择适用人员范围）',
          fields: [
            { name: 'matchType', type: 'radio', label: '匹配方式', required: true,
              options: [
                { value: 'EMP', label: '指定员工（精确匹配，最高优先级）' },
                { value: 'POSITION', label: '岗位标签（如EXECUTIVE/EDU_DIRECTOR）' },
                { value: 'DEPT', label: '部门（如教育板块/总部）' },
                { value: 'LOCATION', label: '工作地（如西安/天水）' },
                { value: 'GLOBAL', label: '全局默认（最低优先级）' }
              ]
            },
            { name: 'matchValue', type: 'text', label: '匹配值（如EMP001 / EXECUTIVE / 教育板块）', required: true }
          ]
        },
        {
          sectionId: 'RULE_TYPE',
          title: '2. 规则类型（选择要覆盖的规则）',
          fields: [
            { name: 'ruleType', type: 'select', label: '规则类型', required: true,
              options: Object.values(RULE_TYPES).map(t => ({ value: t, label: t }))
            }
          ]
        },
        {
          sectionId: 'OVERRIDE_VALUES',
          title: '3. 覆盖内容（填写新规则值）',
          fields: [
            { name: 'override', type: 'json', label: '覆盖值（JSON格式）', required: true,
              placeholder: '如：{ "holidayMode": "PAY_300" }' }
          ]
        },
        {
          sectionId: 'APPROVAL',
          title: '4. 审批信息（必填，可追溯）',
          fields: [
            { name: 'approvalNo', type: 'text', label: '制度委员会审批单号', required: true,
              placeholder: '如 HR-2026-SPECIAL-001' },
            { name: 'reason', type: 'textarea', label: '变更原因', required: true },
            { name: 'changeUser', type: 'text', label: '操作人', required: true },
            { name: 'effectiveDate', type: 'date', label: '生效日期', required: true },
            { name: 'expireDate', type: 'date', label: '失效日期', required: false }
          ]
        }
      ],
      actions: [
        { name: 'save', label: '保存提交（触发CI 403规则回归）', type: 'primary' },
        { name: 'test', label: '模拟测试（不实际生效）', type: 'secondary' },
        { name: 'cancel', label: '取消', type: 'default' }
      ],
      helpText: '优先级说明：员工(100) > 岗位(80) > 部门(60) > 工作地(40) > 全局(10)。冲突时取高优先级。'
    };
  }
}

module.exports = {
  SpecialRuleOverrideEngine,
  RULE_TYPES,
  MATCH_TYPES,
  DEFAULT_POLICIES,
  PRIORITY_EMP,
  PRIORITY_POSITION,
  PRIORITY_DEPT,
  PRIORITY_LOCATION,
  PRIORITY_GLOBAL
};
