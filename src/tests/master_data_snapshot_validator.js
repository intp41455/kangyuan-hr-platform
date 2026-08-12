'use strict';

const { EmployeeModel, EMPLOYEE_STATUS, ENTITY_MAP, POSITION_TAGS } = require('../modules/master_data/employee_model.js');
const { EmployeeRegistry } = require('../modules/master_data/employee_registry.js');
const { PayrollGradeModel, getPresetGrade, addCustomGrade, PRESET_GRADES } = require('../modules/master_data/payroll_grade_model.js');
const { findAreaVersion, PRESET_AREA_CODES, registerAreaVersion, SocialInsuranceAreaModel } = require('../modules/master_data/social_insurance_model.js');
const { AllowanceCenter, ALLOWANCE_TYPE } = require('../modules/master_data/allowance_center.js');
const { AREA_CODE_META } = require('../common/data_dictionary.js');

const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function calcIdCardCheckCode(first17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(first17.charAt(i), 10) * ID_CARD_WEIGHTS[i];
  }
  return ID_CARD_CHECK_CODES[sum % 11];
}

function makeValidIdCard(baseNum) {
  const prefix = '610101';
  const year = 1960 + (baseNum % 55);
  const month = String(((baseNum % 12) + 1)).padStart(2, '0');
  const day = String(((baseNum % 27) + 1)).padStart(2, '0');
  const seq = String(baseNum % 1000).padStart(3, '0');
  const first17 = prefix + year + month + day + seq;
  return first17 + calcIdCardCheckCode(first17);
}

function makeValidMobile(baseNum) {
  const tail = String(baseNum).padStart(10, '0');
  return '1' + tail.substring(tail.length - 10);
}

function ensureCustomPayrollGrades() {
  const existingCodes = new Set(PRESET_GRADES.map(g => g.gradeCode));
  const neededCodes = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12'];
  for (const code of neededCodes) {
    if (!existingCodes.has(code)) {
      const gradeIndex = parseInt(code.substring(1), 10);
      const totalAmount = 3000 + gradeIndex * 800;
      const ratios = [
        { base: 0.9, perf: 0.1 },
        { base: 0.85, perf: 0.15 },
        { base: 0.8, perf: 0.2 },
        { base: 0.75, perf: 0.25 }
      ];
      const ratio = ratios[(gradeIndex - 1) % ratios.length];
      addCustomGrade(PayrollGradeModel.createCustom({
        gradeCode: code,
        gradeName: `${gradeIndex}级薪档`,
        baseSalaryRatio: ratio.base,
        performanceRatio: ratio.perf,
        totalAmount: totalAmount,
        probationRatio: 0.8
      }));
    }
  }
}

ensureCustomPayrollGrades();

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧'];
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '华', '建', '文', '辉', '玲', '鑫', '斌', '波'];
const DEPTS = ['教育事业部', '养老运营部', '健康管理部', '行政人事部', '财务部', '技术研发部', '市场部', '法务合规部', '质量管理部', '供应链部'];
const SUB_DEPTS = ['综合组', '业务一组', '业务二组', '支持组', '研发组', '运营组'];
const POSITIONS = ['专员', '主管', '经理', '总监', '助理', '工程师', '顾问', '教师', '护理员', '营养师'];
const POSITION_TAGS_ARRAY = Object.values(POSITION_TAGS);
const ENTITIES = Object.values(ENTITY_MAP);
const WORK_LOCATIONS = ['西安', '天水', '白银', '平凉', '兰州'];
const AREA_CODE_MAP = { '西安': 'XA', '天水': 'TS', '白银': 'BY', '平凉': 'PL', '兰州': 'LZ' };
const GRADE_CODES = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12'];

function generateEmployeeData(idx, year, month, options = {}) {
  const surname = SURNAMES[idx % SURNAMES.length];
  const name1 = GIVEN_NAMES[(idx * 7) % GIVEN_NAMES.length];
  const name2 = GIVEN_NAMES[(idx * 11 + 3) % GIVEN_NAMES.length];
  const fullName = idx % 3 === 0 ? surname + name1 : (idx % 3 === 1 ? surname + name1 + name2 : surname);

  const entity = ENTITIES[idx % ENTITIES.length];
  const dept1 = DEPTS[idx % DEPTS.length];
  const dept2 = SUB_DEPTS[idx % SUB_DEPTS.length];
  const position = POSITIONS[idx % POSITIONS.length];
  const positionTag = POSITION_TAGS_ARRAY[idx % POSITION_TAGS_ARRAY.length];
  const workLocation = WORK_LOCATIONS[idx % WORK_LOCATIONS.length];
  const socialAreaCode = AREA_CODE_MAP[workLocation];
  const payrollGrade = GRADE_CODES[idx % GRADE_CODES.length];

  const entryYear = year - 1 - (idx % 12);
  const entryMonth = (idx % 12) + 1;
  const entryDay = (idx % 27) + 1;
  const entryDate = new Date(entryYear, entryMonth - 1, entryDay);

  let status;
  let regularDate = null;

  if (options.forceProbation) {
    status = EMPLOYEE_STATUS.PROBATION;
    const probEntryDate = new Date(year, month - 2, 1);
    entryDate.setTime(probEntryDate.getTime());
    regularDate = new Date(year, month + 1, 15);
  } else if (options.forceRegular) {
    status = EMPLOYEE_STATUS.REGULAR;
    regularDate = new Date(entryYear + 1, entryMonth - 1, entryDay);
  } else {
    const statusRoll = idx % 10;
    if (statusRoll < 7) {
      status = EMPLOYEE_STATUS.REGULAR;
      regularDate = new Date(entryYear + 1, entryMonth - 1, entryDay);
    } else if (statusRoll < 9) {
      status = EMPLOYEE_STATUS.PROBATION;
      regularDate = new Date(year, month, entryDay);
    } else {
      status = EMPLOYEE_STATUS.TRANSFERRING;
      regularDate = new Date(entryYear + 1, entryMonth - 1, entryDay);
    }
  }

  const firstWorkDate = new Date(entryYear - (idx % 5), entryMonth - 1, entryDay);

  return {
    name: fullName,
    idCard: makeValidIdCard(idx + 1),
    mobile: makeValidMobile(idx + 13000000000),
    entity: entity,
    dept1: dept1,
    dept2: dept2,
    position: position,
    positionTag: positionTag,
    status: status,
    payrollGrade: payrollGrade,
    workLocation: workLocation,
    socialAreaCode: socialAreaCode,
    entryDate: entryDate,
    regularDate: regularDate,
    firstWorkDate: firstWorkDate,
    directLeader: SURNAMES[(idx + 3) % SURNAMES.length] + GIVEN_NAMES[(idx * 5) % GIVEN_NAMES.length],
    exemptSocialTax: idx % 37 === 0,
    isFinance: idx % 29 === 0
  };
}

function computePayrollGradeDetails(payrollGradeCode) {
  const grade = getPresetGrade(payrollGradeCode);
  if (!grade) {
    return { baseAmount: 0, performanceRatio: 0, gradeName: payrollGradeCode };
  }
  return {
    baseAmount: grade.baseAmount,
    performanceRatio: grade.performanceRatio,
    gradeName: grade.gradeName
  };
}

function computeAllowanceTotal(empData, year, month) {
  const allowanceCenter = new AllowanceCenter();
  const tempEmp = new EmployeeModel({
    id: 'TEMP_' + Date.now(),
    ...empData
  });
  const workdays = 22;
  const result = allowanceCenter.calcMonthlyAllowances({
    employee: tempEmp,
    year: year,
    month: month,
    workdaysOfMonth: workdays
  });
  return result.total;
}

function getSocialInsuranceAreaName(areaCode, year, month) {
  const payrollMonthStr = `${year}-${String(month).padStart(2, '0')}-15`;
  const areaVersion = findAreaVersion(areaCode, payrollMonthStr);
  if (areaVersion) {
    return areaVersion.areaName;
  }
  const meta = AREA_CODE_META[areaCode];
  return meta ? meta.name : areaCode;
}

function enrichSnapshotEmployee(empData, year, month) {
  const asOfDate = new Date(year, month - 1, 15);
  const tempEmp = new EmployeeModel({
    ...empData,
    id: 'ENRICH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
  });

  const gradeDetails = computePayrollGradeDetails(empData.payrollGrade);
  const allowanceTotal = computeAllowanceTotal(empData, year, month);
  const socialAreaName = getSocialInsuranceAreaName(empData.socialAreaCode, year, month);
  const yearsOfService = tempEmp.calcYearsOfService(asOfDate);
  const isInProbation = tempEmp.isProbation(asOfDate);

  return {
    ...empData,
    payrollGradeBase: gradeDetails.baseAmount,
    payrollGradePerformanceRatio: gradeDetails.performanceRatio,
    payrollGradeName: gradeDetails.gradeName,
    allowanceTotal: allowanceTotal,
    socialAreaName: socialAreaName,
    yearsOfService: yearsOfService,
    isProbationFlag: isInProbation,
    snapshotYear: year,
    snapshotMonth: month
  };
}

const _snapshotStore = {};

function buildMonthlySnapshot({ year, month, count = 100 }) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const employees = [];

  const prevKey = `${year}-${String(month - 1).padStart(2, '0')}`;
  const hasPrevious = !!_snapshotStore[prevKey];

  if (hasPrevious) {
    const prevEmployees = _snapshotStore[prevKey];
    const TOTAL_COUNT = count;
    const NEW_HIRE_TARGET = 4;
    const RESIGNED_TARGET = 1;
    const PROBATION_TO_REGULAR_TARGET = 2;
    const GRADE_CHANGE_TARGET = 3;
    const DEPT_CHANGE_TARGET = 4;
    const RETAINED_COUNT = TOTAL_COUNT - NEW_HIRE_TARGET;

    const allIndices = prevEmployees.map((e, i) => i).sort(() => Math.random() - 0.5);

    const retainedIndices = new Set(allIndices.slice(0, RETAINED_COUNT));
    const nonRetainedIndices = allIndices.slice(RETAINED_COUNT);
    const resignedIndex = nonRetainedIndices.length > 0 ? nonRetainedIndices[0] : -1;

    const retainedSorted = [];
    for (const idx of allIndices) {
      if (retainedIndices.has(idx)) retainedSorted.push(idx);
    }

    const probationToRegular = new Set();
    const gradeChange = new Set();
    const deptChange = new Set();

    let ptr = 0;
    for (let i = 0; i < PROBATION_TO_REGULAR_TARGET && ptr < retainedSorted.length; i++, ptr++) {
      probationToRegular.add(retainedSorted[ptr]);
    }
    for (let i = 0; i < GRADE_CHANGE_TARGET && ptr < retainedSorted.length; i++, ptr++) {
      gradeChange.add(retainedSorted[ptr]);
    }
    for (let i = 0; i < DEPT_CHANGE_TARGET && ptr < retainedSorted.length; i++, ptr++) {
      deptChange.add(retainedSorted[ptr]);
    }

    const monthChanges = {
      probationToRegular: [],
      gradeChange: [],
      deptChange: [],
      resigned: [],
      newHires: []
    };

    let idxCounter = 0;
    for (let i = 0; i < prevEmployees.length; i++) {
      if (i === resignedIndex) {
        monthChanges.resigned.push({
          originalIndex: i,
          idCard: prevEmployees[i].idCard,
          name: prevEmployees[i].name
        });
        continue;
      }
      if (retainedIndices.has(i)) {
        const empCopy = JSON.parse(JSON.stringify(prevEmployees[i]));
        empCopy.entryDate = new Date(empCopy.entryDate);
        empCopy.regularDate = empCopy.regularDate ? new Date(empCopy.regularDate) : null;
        empCopy.firstWorkDate = empCopy.firstWorkDate ? new Date(empCopy.firstWorkDate) : null;

        if (probationToRegular.has(i)) {
          empCopy.status = EMPLOYEE_STATUS.REGULAR;
          empCopy.regularDate = new Date(year, month - 1, 1);
          monthChanges.probationToRegular.push({
            originalIndex: i,
            idCard: empCopy.idCard,
            name: empCopy.name,
            from: EMPLOYEE_STATUS.PROBATION,
            to: EMPLOYEE_STATUS.REGULAR
          });
          if (!empCopy.history) empCopy.history = { transfers: [], promotions: [], adjustments: [] };
          empCopy.history.adjustments.push({
            from: EMPLOYEE_STATUS.PROBATION,
            to: EMPLOYEE_STATUS.REGULAR,
            date: new Date(year, month - 1, 1),
            meta: { reason: '试用期转正' }
          });
        }

        if (gradeChange.has(i)) {
          const oldGrade = empCopy.payrollGrade;
          const currentGradeIdx = GRADE_CODES.indexOf(oldGrade);
          const newGradeIdx = Math.min(GRADE_CODES.length - 1, currentGradeIdx + 1 + (i % 2));
          empCopy.payrollGrade = GRADE_CODES[newGradeIdx];
          monthChanges.gradeChange.push({
            originalIndex: i,
            idCard: empCopy.idCard,
            name: empCopy.name,
            fromGrade: oldGrade,
            toGrade: empCopy.payrollGrade
          });
          if (!empCopy.history) empCopy.history = { transfers: [], promotions: [], adjustments: [] };
          empCopy.history.adjustments.push({
            from: oldGrade,
            to: empCopy.payrollGrade,
            date: new Date(year, month - 1, 1),
            meta: { reason: '薪级调整' }
          });
        }

        if (deptChange.has(i)) {
          const oldDept1 = empCopy.dept1;
          const oldDept2 = empCopy.dept2;
          const newDeptIdx = (DEPTS.indexOf(oldDept1) + 3) % DEPTS.length;
          empCopy.dept1 = DEPTS[newDeptIdx];
          empCopy.dept2 = SUB_DEPTS[(SUB_DEPTS.indexOf(oldDept2) + 2) % SUB_DEPTS.length];
          monthChanges.deptChange.push({
            originalIndex: i,
            idCard: empCopy.idCard,
            name: empCopy.name,
            fromDept1: oldDept1,
            fromDept2: oldDept2,
            toDept1: empCopy.dept1,
            toDept2: empCopy.dept2
          });
          if (!empCopy.history) empCopy.history = { transfers: [], promotions: [], adjustments: [] };
          empCopy.history.transfers.push({
            from: `${oldDept1}/${oldDept2}`,
            to: `${empCopy.dept1}/${empCopy.dept2}`,
            date: new Date(year, month - 1, 1),
            meta: { reason: '部门调动' }
          });
          empCopy.history.adjustments.push({
            from: `${oldDept1}/${oldDept2}`,
            to: `${empCopy.dept1}/${empCopy.dept2}`,
            date: new Date(year, month - 1, 1),
            meta: { reason: '部门调动', type: 'dept' }
          });
        }

        employees.push(empCopy);
      }
    }

    for (let i = 0; i < NEW_HIRE_TARGET; i++) {
      const newIdx = (prevEmployees.length * 100) + i + 10000 + idxCounter;
      idxCounter++;
      const isNewProbation = i < 3;
      const newEmp = generateEmployeeData(newIdx, year, month, {
        forceProbation: isNewProbation
      });
      employees.push(newEmp);
      monthChanges.newHires.push({
        idCard: newEmp.idCard,
        name: newEmp.name,
        status: newEmp.status
      });
    }

    const enriched = employees.map(e => enrichSnapshotEmployee(e, year, month));
    const snapshot = {
      year,
      month,
      count: enriched.length,
      employees: enriched,
      changes: monthChanges,
      generatedAt: new Date()
    };
    _snapshotStore[key] = employees;
    _snapshotStore[key + '_changes'] = monthChanges;
    return snapshot;
  }

  for (let i = 0; i < count; i++) {
    const emp = generateEmployeeData(i + 1, year, month, {});
    employees.push(emp);
  }

  const enriched = employees.map(e => enrichSnapshotEmployee(e, year, month));
  const snapshot = {
    year,
    month,
    count: enriched.length,
    employees: enriched,
    changes: {
      probationToRegular: [],
      gradeChange: [],
      deptChange: [],
      resigned: [],
      newHires: []
    },
    generatedAt: new Date()
  };
  _snapshotStore[key] = employees;
  _snapshotStore[key + '_changes'] = snapshot.changes;
  return snapshot;
}

function compareSnapshotToSystemImport(snapshot, injectError = true) {
  const { year, month, employees } = snapshot;
  const asOfDate = new Date(year, month - 1, 15);
  const registry = new EmployeeRegistry();
  const allowanceCenter = new AllowanceCenter();

  const importPayload = employees.map(e => ({
    name: e.name,
    idCard: e.idCard,
    mobile: e.mobile,
    entity: e.entity,
    dept1: e.dept1,
    dept2: e.dept2,
    position: e.position,
    positionTag: e.positionTag,
    payrollGrade: e.payrollGrade,
    workLocation: e.workLocation,
    entryDate: e.entryDate,
    regularDate: e.regularDate,
    firstWorkDate: e.firstWorkDate,
    directLeader: e.directLeader,
    status: e.status,
    exemptSocialTax: e.exemptSocialTax,
    isFinance: e.isFinance,
    history: e.history || { transfers: [], promotions: [], adjustments: [] }
  }));

  const importResult = registry.importFromArray(importPayload);

  const errorInjection = {};
  if (injectError && employees.length > 0) {
    const randomRow = Math.floor(Math.random() * employees.length);
    const fieldOptions = ['name', 'mobile', 'dept1', 'position'];
    const randomField = fieldOptions[Math.floor(Math.random() * fieldOptions.length)];
    errorInjection.row = randomRow;
    errorInjection.field = randomField;
    errorInjection.original = employees[randomRow][randomField];
    errorInjection.injected = randomField === 'name'
      ? (employees[randomRow][randomField] + '_错误')
      : (randomField === 'mobile' ? '19999999999' : '错误值');
  }

  const errors = [];
  let correctCount = 0;
  let totalCount = 0;

  const coreFields = [
    'name', 'idCard', 'mobile', 'entity', 'dept1', 'dept2',
    'position', 'status', 'payrollGradeBase', 'payrollGradePerformanceRatio',
    'workLocation', 'isProbation', 'yearsOfService', 'socialAreaName'
  ];

  for (let rowIdx = 0; rowIdx < employees.length; rowIdx++) {
    const expected = employees[rowIdx];
    const empId = 'E' + String(rowIdx + 1).padStart(6, '0');
    const actual = registry.findById(empId);

    if (!actual) {
      coreFields.forEach(f => {
        totalCount++;
        errors.push({
          row: rowIdx + 1,
          field: f,
          expected: expected[f] !== undefined ? expected[f] : null,
          actual: null,
          note: '员工未导入'
        });
      });
      continue;
    }

    const actualGrade = getPresetGrade(actual.payrollGrade);
    const actualYearsOfService = actual.calcYearsOfService(asOfDate);
    const actualIsProbation = actual.isProbation(asOfDate);
    const actualSocialAreaCode = AREA_CODE_MAP[actual.workLocation] || 'XA';
    const actualSocialAreaName = getSocialInsuranceAreaName(actualSocialAreaCode, year, month);

    const fieldValues = {
      name: expected.name,
      idCard: expected.idCard,
      mobile: expected.mobile,
      entity: expected.entity,
      dept1: expected.dept1,
      dept2: expected.dept2,
      position: expected.position,
      status: expected.status,
      payrollGradeBase: expected.payrollGradeBase,
      payrollGradePerformanceRatio: expected.payrollGradePerformanceRatio,
      workLocation: expected.workLocation,
      isProbation: expected.isProbationFlag,
      yearsOfService: expected.yearsOfService,
      socialAreaName: expected.socialAreaName
    };

    const actualValues = {
      name: actual.name,
      idCard: actual.idCard,
      mobile: actual.mobile,
      entity: actual.entity,
      dept1: actual.dept1,
      dept2: actual.dept2,
      position: actual.position,
      status: actual.status,
      payrollGradeBase: actualGrade ? actualGrade.baseAmount : 0,
      payrollGradePerformanceRatio: actualGrade ? actualGrade.performanceRatio : 0,
      workLocation: actual.workLocation,
      isProbation: actualIsProbation,
      yearsOfService: actualYearsOfService,
      socialAreaName: actualSocialAreaName
    };

    for (const field of coreFields) {
      totalCount++;
      let expVal = fieldValues[field];
      let actVal = actualValues[field];

      if (injectError && errorInjection.row === rowIdx && errorInjection.field === field) {
        expVal = errorInjection.injected;
      }

      let match = false;
      if (typeof expVal === 'number' && typeof actVal === 'number') {
        match = Math.abs(expVal - actVal) < 0.0001;
      } else {
        match = String(expVal) === String(actVal);
      }

      if (match) {
        correctCount++;
      } else {
        errors.push({
          row: rowIdx + 1,
          field: field,
          expected: expVal,
          actual: actVal
        });
      }
    }
  }

  const accuracy = totalCount > 0 ? (correctCount / totalCount) : 0;

  return {
    correctCount,
    totalCount,
    accuracy,
    errors,
    importResult,
    errorInjection: injectError ? errorInjection : null,
    registry,
    allowanceCenter,
    asOfDate
  };
}

function build50Bindings(registry, employeeIds) {
  const results = [];
  const deptIds = ['D0101', 'D0102', 'D0201', 'D0202', 'D0301', 'D0302', 'D0401', 'D0402', 'D0501', 'D0502'];

  for (let i = 0; i < 50 && i < employeeIds.length; i++) {
    const empId = employeeIds[i];
    const dingtalkUserId = 'DT_USER_' + String(i + 1).padStart(5, '0');
    const deptId = deptIds[i % deptIds.length];

    try {
      const bindResult = registry.bindDingtalkUser(empId, {
        dingtalkUserId: dingtalkUserId,
        deptId: deptId
      });
      results.push({
        index: i,
        employeeId: empId,
        dingtalkUserId: dingtalkUserId,
        deptId: deptId,
        success: true,
        bindResult: bindResult
      });
    } catch (err) {
      results.push({
        index: i,
        employeeId: empId,
        dingtalkUserId: dingtalkUserId,
        deptId: deptId,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}

function verifyBidirectionalBindings(registry, bindingResults) {
  const verification = {
    total: bindingResults.length,
    forwardMatches: 0,
    forwardEmpty: 0,
    forwardMismatch: 0,
    reverseMatches: 0,
    reverseEmpty: 0,
    reverseMismatch: 0,
    mismatches: []
  };

  for (const bind of bindingResults) {
    if (!bind.success) continue;

    const forwardBind = registry.getDingtalkBind(bind.employeeId);
    if (!forwardBind) {
      verification.forwardEmpty++;
      verification.mismatches.push({
        employeeId: bind.employeeId,
        type: 'forward_empty',
        expected: bind.dingtalkUserId,
        actual: null
      });
    } else if (forwardBind.dingtalkUserId !== bind.dingtalkUserId) {
      verification.forwardMismatch++;
      verification.mismatches.push({
        employeeId: bind.employeeId,
        type: 'forward_mismatch',
        expected: bind.dingtalkUserId,
        actual: forwardBind.dingtalkUserId
      });
    } else {
      verification.forwardMatches++;
    }

    const reverseEmp = registry.findByDingtalkUserId(bind.dingtalkUserId);
    if (!reverseEmp) {
      verification.reverseEmpty++;
      verification.mismatches.push({
        employeeId: bind.employeeId,
        dingtalkUserId: bind.dingtalkUserId,
        type: 'reverse_empty',
        expected: bind.employeeId,
        actual: null
      });
    } else if (reverseEmp.id !== bind.employeeId) {
      verification.reverseMismatch++;
      verification.mismatches.push({
        employeeId: bind.employeeId,
        dingtalkUserId: bind.dingtalkUserId,
        type: 'reverse_mismatch',
        expected: bind.employeeId,
        actual: reverseEmp.id
      });
    } else {
      verification.reverseMatches++;
    }
  }

  verification.coverageRate = (verification.forwardMatches + verification.reverseMatches) / (verification.total * 2);
  verification.mismatchRate = (verification.forwardEmpty + verification.forwardMismatch + verification.reverseEmpty + verification.reverseMismatch) / (verification.total * 2);

  return verification;
}

function spotCheck10Employees(snapshot, compareResult, sampleIndices) {
  const { employees } = snapshot;
  const { registry, asOfDate, allowanceCenter } = compareResult;
  const results = [];

  const indices = sampleIndices || [];
  while (indices.length < 10) {
    const r = Math.floor(Math.random() * employees.length);
    if (!indices.includes(r)) indices.push(r);
  }
  const finalIndices = indices.slice(0, 10);

  for (const idx of finalIndices) {
    const expected = employees[idx];
    const empId = 'E' + String(idx + 1).padStart(6, '0');
    const actual = registry.findById(empId);

    if (!actual) {
      results.push({
        index: idx,
        employeeId: empId,
        name: expected.name,
        success: false,
        error: '员工未找到'
      });
      continue;
    }

    const expectedYearsOfService = expected.yearsOfService;
    const actualYearsOfService = actual.calcYearsOfService(asOfDate);
    const yearsOfServiceMatch = expectedYearsOfService === actualYearsOfService;

    const expectedProbation = expected.isProbationFlag;
    const actualProbation = actual.isProbation(asOfDate);
    const probationMatch = expectedProbation === actualProbation;

    const expectedSocialName = expected.socialAreaName;
    const actualSocialAreaCode = AREA_CODE_MAP[actual.workLocation] || 'XA';
    const actualSocialName = getSocialInsuranceAreaName(actualSocialAreaCode, snapshot.year, snapshot.month);
    const socialNameMatch = expectedSocialName === actualSocialName;

    const expectedPerfRatio = expected.payrollGradePerformanceRatio;
    const actualGrade = getPresetGrade(actual.payrollGrade);
    const actualPerfRatio = actualGrade ? actualGrade.performanceRatio : 0;
    const perfRatioMatch = Math.abs(expectedPerfRatio - actualPerfRatio) < 0.0001;

    const allMatch = yearsOfServiceMatch && probationMatch && socialNameMatch && perfRatioMatch;

    results.push({
      index: idx,
      employeeId: empId,
      name: actual.name,
      success: allMatch,
      checks: {
        yearsOfService: {
          expected: expectedYearsOfService,
          actual: actualYearsOfService,
          match: yearsOfServiceMatch
        },
        probation: {
          expected: expectedProbation,
          actual: actualProbation,
          match: probationMatch
        },
        socialInsuranceArea: {
          expected: expectedSocialName,
          actual: actualSocialName,
          match: socialNameMatch
        },
        performanceRatio: {
          expected: expectedPerfRatio,
          actual: actualPerfRatio,
          match: perfRatioMatch
        }
      }
    });
  }

  const passedCount = results.filter(r => r.success).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    allPassed: passedCount === results.length,
    details: results
  };
}

module.exports = {
  buildMonthlySnapshot,
  compareSnapshotToSystemImport,
  build50Bindings,
  verifyBidirectionalBindings,
  spotCheck10Employees,
  _snapshotStore,
  getSocialInsuranceAreaName,
  computePayrollGradeDetails,
  computeAllowanceTotal,
  ensureCustomPayrollGrades
};
