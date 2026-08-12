/**
 * 主数据中心模块 (Master Data Center)
 * 阶段一：Task 1-4
 * 依赖顺序：Task1(员工主数据) → Task2(社保公积金) → Task3(工龄) → Task4(绩效)
 */
const { EmployeeModel, EMPLOYEE_STATUS, ENTITY_MAP } = require('./employee_model');
const { PayrollGradeModel, PRESET_GRADES } = require('./payroll_grade_model');

class MasterDataCenter {
  constructor() {
    this.employees = new Map();    // id → EmployeeModel
    this.grades = new Map();       // code → PayrollGradeModel
    this.socialInsurance = new Map(); // employeeId → 社保基数
    this.seniorityLedger = new Map(); // employeeId → 工龄台账
    this.performanceLedger = new Map(); // employeeId → 季度绩效
    // 加载预置薪级
    PRESET_GRADES.forEach(g => this.grades.set(g.code, g));
  }

  /** Task 1.2 导入员工花名册 */
  importEmployees(rows) {
    let count = 0;
    rows.forEach(r => {
      const emp = new EmployeeModel(r);
      if (emp.id) {
        this.employees.set(emp.id, emp);
        count++;
      }
    });
    return count;
  }

  /** 按姓名查找员工 */
  findByName(name) {
    return [...this.employees.values()].filter(e => e.name === name);
  }
}

// 自检样例
if (require.main === module) {
  const mdc = new MasterDataCenter();
  const testEmp = new EmployeeModel({
    id:'E001', name:'测试', entryDate:'2023-06-19', 
    payrollGrade:'VICE_PRESIDENT_HAO', status:'正式员工'
  });
  console.log('=== 主数据中心自检 ===');
  console.log('预置薪级数:', mdc.grades.size);
  console.log('测试员工工龄:', testEmp.calcYearsOfService(new Date('2025-07-03')), '年');
  console.log('测试员工工龄工资:', testEmp.calcSeniorityPay(new Date('2025-07-03')), '元');
  console.log('测试员工试用期判定(2024/7):', testEmp.isProbation(new Date('2024-07-01')));
  const g = mdc.grades.get('VICE_PRESIDENT_HAO');
  console.log('副总薪级 绩效100分绩效工资:', g.calcPerformancePay(100));
  console.log('副总薪级 试用期薪资:', g.calcProbationPay());
}

module.exports = MasterDataCenter;
