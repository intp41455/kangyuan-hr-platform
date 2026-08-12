'use strict';

const RULE_CATEGORIES = Object.freeze({
  HOLIDAY: '§4假期',
  ATTENDANCE: '§5考勤',
  PAYROLL: '§12薪酬',
  APPROVAL: '审批',
  SOCIAL: '社保'
});

const RULE_TIMEOUT_MS = 5000;

class CircularDependencyError extends Error {
  constructor(cyclePath) {
    super(`检测到循环依赖：${cyclePath.join(' → ')}`);
    this.name = 'CircularDependencyError';
    this.cyclePath = cyclePath;
  }
}

class RuleTimeoutError extends Error {
  constructor(rCode, timeoutMs) {
    super(`规则「${rCode}」执行超时，超过${timeoutMs}ms`);
    this.name = 'RuleTimeoutError';
    this.rCode = rCode;
    this.timeoutMs = timeoutMs;
  }
}

class RuleNotFoundError extends Error {
  constructor(rCode) {
    super(`规则不存在：${rCode}`);
    this.name = 'RuleNotFoundError';
    this.rCode = rCode;
  }
}

class InvalidRuleError extends Error {
  constructor(rCode, reason) {
    super(`规则「${rCode}」无效：${reason}`);
    this.name = 'InvalidRuleError';
    this.rCode = rCode;
    this.reason = reason;
  }
}

class RuleEngine {
  constructor() {
    this._rules = new Map();
    this._ruleVersions = new Map();
  }

  _validateRuleSchema(rule) {
    if (!rule || typeof rule !== 'object') {
      throw new InvalidRuleError('UNKNOWN', '规则必须是对象');
    }
    const { id, rCode, name, category, formula, effectiveDate, expireDate, source } = rule;
    if (!rCode || typeof rCode !== 'string' || !/^R-\d{3}$/.test(rCode)) {
      throw new InvalidRuleError(rCode || 'UNKNOWN', 'rCode格式错误，应为R-001~R-999');
    }
    if (!name || typeof name !== 'string') {
      throw new InvalidRuleError(rCode, 'name为必填字符串');
    }
    const validCategories = Object.values(RULE_CATEGORIES);
    if (!category || !validCategories.includes(category)) {
      throw new InvalidRuleError(rCode, `category无效，有效值：${validCategories.join('、')}`);
    }
    if (formula !== undefined && typeof formula !== 'string' && typeof formula !== 'function') {
      throw new InvalidRuleError(rCode, 'formula必须是字符串或函数');
    }
    if (source) {
      if (typeof source !== 'object' || !source.documentName) {
        throw new InvalidRuleError(rCode, 'source.documentName为必填');
      }
    }
    return true;
  }

  _createInitialVersion(rule) {
    const now = new Date();
    const snapshot = JSON.parse(JSON.stringify({
      id: rule.id,
      rCode: rule.rCode,
      name: rule.name,
      category: rule.category,
      formula: typeof rule.formula === 'string' ? rule.formula : undefined,
      effectiveDate: rule.effectiveDate,
      expireDate: rule.expireDate,
      source: rule.source
    }));
    return {
      version: '1.0',
      major: 1,
      minor: 0,
      snapshot,
      changedBy: 'system',
      approvalNo: 'INIT',
      reason: '初始注册',
      time: now
    };
  }

  registerRule(rule) {
    this._validateRuleSchema(rule);
    if (this._rules.has(rule.rCode)) {
      throw new InvalidRuleError(rule.rCode, '规则已存在，如需修改请使用updateRule');
    }
    const storedRule = Object.assign({}, rule, {
      _formulaFn: typeof rule.formula === 'function' ? rule.formula : null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this._rules.set(rule.rCode, storedRule);
    this._ruleVersions.set(rule.rCode, [this._createInitialVersion(rule)]);
    return storedRule;
  }

  batchRegisterRules(rules) {
    if (!Array.isArray(rules)) {
      throw new TypeError('batchRegisterRules参数必须是数组');
    }
    const results = { success: [], failed: [] };
    for (const rule of rules) {
      try {
        results.success.push(this.registerRule(rule));
      } catch (err) {
        results.failed.push({ rule: rule, error: err });
      }
    }
    return results;
  }

  getRule(rCode) {
    const rule = this._rules.get(rCode);
    if (!rule) {
      throw new RuleNotFoundError(rCode);
    }
    return Object.assign({}, rule, {
      formula: rule._formulaFn || rule.formula
    });
  }

  listRulesByCategory(category) {
    if (category && !Object.values(RULE_CATEGORIES).includes(category)) {
      throw new InvalidRuleError('LIST', `无效的category：${category}`);
    }
    const rules = [];
    for (const rule of this._rules.values()) {
      if (!category || rule.category === category) {
        rules.push(Object.assign({}, rule, {
          formula: rule._formulaFn || rule.formula
        }));
      }
    }
    return rules.sort((a, b) => a.rCode.localeCompare(b.rCode));
  }

  getRuleVersions(rCode) {
    const versions = this._ruleVersions.get(rCode);
    if (!versions) {
      throw new RuleNotFoundError(rCode);
    }
    return versions.map(v => Object.assign({}, v));
  }

  updateRule(rCode, patch, meta = {}) {
    const rule = this._rules.get(rCode);
    if (!rule) {
      throw new RuleNotFoundError(rCode);
    }
    const versions = this._ruleVersions.get(rCode);
    const latestVersion = versions[versions.length - 1];
    const newMajor = latestVersion.major + 1;
    const newVersionStr = `${newMajor}.0`;
    Object.assign(rule, patch);
    if (patch.formula !== undefined) {
      rule._formulaFn = typeof patch.formula === 'function' ? patch.formula : null;
    }
    rule.updatedAt = new Date();
    this._validateRuleSchema(rule);
    const snapshot = JSON.parse(JSON.stringify({
      id: rule.id,
      rCode: rule.rCode,
      name: rule.name,
      category: rule.category,
      formula: typeof rule.formula === 'string' ? rule.formula : undefined,
      effectiveDate: rule.effectiveDate,
      expireDate: rule.expireDate,
      source: rule.source
    }));
    const newVersionRecord = {
      version: newVersionStr,
      major: newMajor,
      minor: 0,
      snapshot,
      changedBy: meta.changedBy || 'system',
      approvalNo: meta.approvalNo || 'UNKNOWN',
      reason: meta.reason || '未说明',
      time: new Date()
    };
    versions.push(newVersionRecord);
    return {
      rule: Object.assign({}, rule, { formula: rule._formulaFn || rule.formula }),
      version: newVersionRecord
    };
  }

  rollbackRule(rCode, targetVersion) {
    const versions = this._ruleVersions.get(rCode);
    if (!versions) {
      throw new RuleNotFoundError(rCode);
    }
    const versionRecord = versions.find(v => v.version === targetVersion);
    if (!versionRecord) {
      throw new InvalidRuleError(rCode, `目标版本${targetVersion}不存在`);
    }
    const rule = this._rules.get(rCode);
    const snapshot = JSON.parse(JSON.stringify(versionRecord.snapshot));
    Object.assign(rule, snapshot);
    rule.updatedAt = new Date();
    const latestVersion = versions[versions.length - 1];
    const rollbackVersionRecord = {
      version: `${latestVersion.major + 1}.0`,
      major: latestVersion.major + 1,
      minor: 0,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      changedBy: 'rollback',
      approvalNo: `ROLLBACK-${targetVersion}`,
      reason: `回滚到版本${targetVersion}`,
      time: new Date()
    };
    versions.push(rollbackVersionRecord);
    return {
      rule: Object.assign({}, rule, { formula: rule._formulaFn || rule.formula }),
      rollbackFrom: latestVersion.version,
      rollbackTo: targetVersion,
      newVersion: rollbackVersionRecord
    };
  }

  _parseReferences(formula) {
    const refs = [];
    if (typeof formula === 'string') {
      const regex = /\$R(\d{3})/g;
      let match;
      while ((match = regex.exec(formula)) !== null) {
        refs.push(`R-${match[1]}`);
      }
    }
    return [...new Set(refs)];
  }

  _buildDependencyGraph(rCodes) {
    const graph = new Map();
    const visitedGlobal = new Set();
    const visit = (rCode) => {
      if (visitedGlobal.has(rCode)) return;
      visitedGlobal.add(rCode);
      const rule = this._rules.get(rCode);
      if (!rule) {
        throw new RuleNotFoundError(rCode);
      }
      const formula = rule._formulaFn ? rule.formula.toString() : (rule.formula || '');
      const deps = this._parseReferences(formula);
      graph.set(rCode, deps);
      for (const dep of deps) {
        visit(dep);
      }
    };
    for (const rCode of rCodes) {
      visit(rCode);
    }
    return graph;
  }

  _topologicalSort(graph) {
    const inDegree = new Map();
    const adjacencyList = new Map();
    for (const node of graph.keys()) {
      inDegree.set(node, 0);
      adjacencyList.set(node, []);
    }
    for (const [node, deps] of graph.entries()) {
      for (const dep of deps) {
        if (!adjacencyList.has(dep)) {
          adjacencyList.set(dep, []);
          inDegree.set(dep, 0);
        }
        adjacencyList.get(dep).push(node);
        inDegree.set(node, (inDegree.get(node) || 0) + 1);
      }
    }
    const queue = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(node);
    }
    const result = [];
    while (queue.length > 0) {
      const node = queue.shift();
      result.push(node);
      const neighbors = adjacencyList.get(node) || [];
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }
    if (result.length !== graph.size) {
      const cyclePath = this._findCycle(graph);
      throw new CircularDependencyError(cyclePath);
    }
    return result;
  }

  _findCycle(graph) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    for (const node of graph.keys()) {
      color.set(node, WHITE);
    }
    let cycle = null;
    const dfs = (node) => {
      color.set(node, GRAY);
      const deps = graph.get(node) || [];
      for (const dep of deps) {
        if (!graph.has(dep)) continue;
        if (color.get(dep) === GRAY) {
          cycle = [dep];
          let curr = node;
          while (curr !== dep) {
            cycle.push(curr);
            curr = parent.get(curr);
          }
          cycle.push(dep);
          cycle.reverse();
          return true;
        }
        if (color.get(dep) === WHITE) {
          parent.set(dep, node);
          if (dfs(dep)) return true;
        }
      }
      color.set(node, BLACK);
      return false;
    };
    for (const node of graph.keys()) {
      if (color.get(node) === WHITE) {
        if (dfs(node)) break;
      }
    }
    return cycle || [...graph.keys()];
  }

  _createFormulaFn(formula) {
    if (typeof formula === 'function') {
      return formula;
    }
    if (typeof formula === 'string') {
      try {
        return new Function('context', 'results', `
          with (context || {}) {
            with (results || {}) {
              return (${formula});
            }
          }
        `);
      } catch (err) {
        throw new InvalidRuleError('FORMULA', `公式解析失败：${err.message}`);
      }
    }
    return () => null;
  }

  async _executeWithTimeout(fn, rCode, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new RuleTimeoutError(rCode, timeoutMs));
      }, timeoutMs);
      Promise.resolve()
        .then(async () => {
          if (settled) return undefined;
          return await fn();
        })
        .then((result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  async executeRules(rCodes, context = {}, options = {}) {
    if (!Array.isArray(rCodes)) {
      throw new TypeError('rCodes必须是数组');
    }
    const timeoutMs = options.timeoutMs || RULE_TIMEOUT_MS;
    const graph = this._buildDependencyGraph(rCodes);
    const executionOrder = this._topologicalSort(graph);
    const results = {};
    const executionLog = [];
    for (const rCode of executionOrder) {
      const rule = this._rules.get(rCode);
      if (!rule) continue;
      const formula = rule._formulaFn || rule.formula;
      const formulaRefs = this._parseReferences(typeof formula === 'string' ? formula : (formula ? formula.toString() : ''));
      for (const ref of formulaRefs) {
        if (results[ref] === undefined) {
          const refRule = this._rules.get(ref);
          if (refRule) {
            const refFormula = refRule._formulaFn || refRule.formula;
            const refFn = this._createFormulaFn(refFormula);
            const refResult = await this._executeWithTimeout(() => refFn(context, results), ref, timeoutMs);
            results[ref] = refResult;
          }
        }
      }
      const fn = this._createFormulaFn(formula);
      const startTime = Date.now();
      try {
        const value = await this._executeWithTimeout(() => fn(context, results), rCode, timeoutMs);
        const elapsed = Date.now() - startTime;
        results[rCode] = value;
        executionLog.push({
          rCode,
          status: 'success',
          value,
          elapsedMs: elapsed
        });
      } catch (err) {
        const elapsed = Date.now() - startTime;
        executionLog.push({
          rCode,
          status: 'error',
          error: err,
          elapsedMs: elapsed
        });
        if (err instanceof RuleTimeoutError) {
          throw err;
        }
        results[rCode] = { __error: err };
      }
    }
    return {
      results,
      executionOrder,
      executionLog,
      requested: rCodes
    };
  }
}

function generateSkeletonRules() {
  const rules = [];
  for (let i = 1; i <= 187; i++) {
    const rCode = `R-${String(i).padStart(3, '0')}`;
    if (i === 23) {
      rules.push({
        id: `hr-rule-${i}`,
        rCode,
        name: '工龄工资标准',
        category: RULE_CATEGORIES.HOLIDAY,
        formula: `context.seniorityYears * 100`,
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团薪酬管理制度2026版',
          page: i,
          approvalNo: 'HR-2026-SAL-023'
        }
      });
    } else {
      rules.push({
        id: `hr-rule-${i}`,
        rCode,
        name: `假期规则第${i}条`,
        category: RULE_CATEGORIES.HOLIDAY,
        formula: `null`,
        effectiveDate: '2026-01-01',
        expireDate: '2026-12-31',
        source: {
          documentName: '康源集团员工手册2026版',
          page: i,
          approvalNo: `HR-2026-HOL-${String(i).padStart(3, '0')}`
        }
      });
    }
  }
  for (let i = 188; i <= 318; i++) {
    const rCode = `R-${String(i).padStart(3, '0')}`;
    rules.push({
      id: `hr-rule-${i}`,
      rCode,
      name: `考勤规则第${i - 187}条`,
      category: RULE_CATEGORIES.ATTENDANCE,
      formula: `null`,
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: {
        documentName: '康源集团考勤管理制度2026版',
        page: i - 187,
        approvalNo: `HR-2026-ATT-${String(i - 187).padStart(3, '0')}`
      }
    });
  }
  for (let i = 319; i <= 403; i++) {
    const rCode = `R-${String(i).padStart(3, '0')}`;
    rules.push({
      id: `hr-rule-${i}`,
      rCode,
      name: `薪酬规则第${i - 318}条`,
      category: RULE_CATEGORIES.PAYROLL,
      formula: `null`,
      effectiveDate: '2026-01-01',
      expireDate: '2026-12-31',
      source: {
        documentName: '康源集团薪酬管理制度2026版',
        page: i - 318,
        approvalNo: `HR-2026-PAY-${String(i - 318).padStart(3, '0')}`
      }
    });
  }
  return rules;
}

module.exports = {
  RuleEngine,
  RULE_CATEGORIES,
  RULE_TIMEOUT_MS,
  CircularDependencyError,
  RuleTimeoutError,
  RuleNotFoundError,
  InvalidRuleError,
  generateSkeletonRules
};
