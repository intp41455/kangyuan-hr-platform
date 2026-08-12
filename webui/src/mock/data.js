// Mock 数据层 - 模拟后端 API 返回数据
// 与后端 src/modules/* 引擎完全对齐，便于后续平滑对接真实 API

export const KPIS = {
  totalEmployees: 314,
  monthlyPayrollCost: 4286000,  // 元
  payrollAccuracy: 99.95,        // %
  selfConfirmRate: 98.7,        // %
  timeReduction: 97.875,        // %
  historyReplayError: 0.08,     // %
  failureRecoveryRate: 100      // %
}

// 三大业务板块 KPI 拆分
export const BU_BREAKDOWN = [
  {
    code: 'BU_MEIHONG',
    name: '康源美宏',
    fullName: '养老机构运营',
    employees: 168,
    monthlyCost: 2680000,
    avgSalary: 15952,
    monthlyAnomaly: 12,
    buColor: '#CC5500'
  },
  {
    code: 'BU_FUZHI_EDU',
    name: '福祉教育',
    fullName: '护理人才培育',
    employees: 96,
    monthlyCost: 1180000,
    avgSalary: 12291,
    monthlyAnomaly: 8,
    buColor: '#2A6FB0'
  },
  {
    code: 'BU_QIXIANG',
    name: '耆祥',
    fullName: '社区居家上门',
    employees: 50,
    monthlyCost: 426000,
    avgSalary: 8520,
    monthlyAnomaly: 5,
    buColor: '#4A8A3B'
  }
]

// 月度人力成本趋势（最近 6 个月）
export const MONTHLY_COST_TREND = {
  months: ['3月', '4月', '5月', '6月', '7月', '8月'],
  meihong: [2520000, 2580000, 2610000, 2650000, 2680000, 2680000],
  fuzhi: [1080000, 1120000, 1150000, 1170000, 1180000, 1180000],
  qixiang: [380000, 395000, 410000, 420000, 426000, 426000]
}

// 员工档案列表
export const EMPLOYEES = [
  { empId: 'EMP001', name: '王宁', entryDate: '2018-03-01', regularDate: '2018-06-01', dept: '集团总部·人力资源部', position: 'HR总监', grade: 'M3', bu: 'GROUP_HQ', workLocation: '西安', status: 'ACTIVE' },
  { empId: 'EMP002', name: '李明', entryDate: '2015-07-15', regularDate: '2016-01-15', dept: '集团总部·董事会', position: '副总裁', grade: 'M4', bu: 'GROUP_HQ', workLocation: '西安', status: 'ACTIVE' },
  { empId: 'EMP003', name: '张三', entryDate: '2024-03-01', regularDate: '2024-06-01', dept: '康源美宏·西安养护院', position: '护理员', grade: 'L2', bu: 'BU_MEIHONG', workLocation: '西安', status: 'ACTIVE' },
  { empId: 'EMP004', name: '李四', entryDate: '2023-09-01', regularDate: '2023-12-01', dept: '福祉教育·护理学院', position: '教师', grade: 'L3', bu: 'BU_FUZHI_EDU', workLocation: '西安', status: 'ACTIVE' },
  { empId: 'EMP005', name: '王五', entryDate: '2022-05-01', regularDate: '2022-08-01', dept: '耆祥·社区上门部', position: '护理员', grade: 'L2', bu: 'BU_QIXIANG', workLocation: '天水', status: 'ACTIVE' },
  { empId: 'EMP006', name: '赵六', entryDate: '2024-07-01', regularDate: null, dept: '康源美宏·天水分院', position: '护理员', grade: 'L1', bu: 'BU_MEIHONG', workLocation: '天水', status: 'PROBATION' }
]

// 工资单明细（员工自助）
export const PAYSLIP = {
  empId: 'EMP003',
  empName: '张三',
  period: '2026-08',
  items: [
    { category: '应发', name: '基本工资', amount: 5000 },
    { category: '应发', name: '绩效工资', amount: 800 },
    { category: '应发', name: '工龄工资', amount: 100 },
    { category: '应发', name: '岗位津贴', amount: 300 },
    { category: '应发', name: '加班费(转调休)', amount: 0 },
    { category: '扣款', name: '事假扣款(1天)', amount: -229.89 },
    { category: '扣款', name: '迟到扣款(1次)', amount: -10 },
    { category: '社保', name: '养老保险(8%)', amount: -400 },
    { category: '社保', name: '医疗保险(2%)', amount: -100 },
    { category: '社保', name: '失业保险(0.3%)', amount: -15 },
    { category: '社保', name: '公积金(10%)', amount: -500 },
    { category: '社保', name: '大病医疗', amount: -8 },
    { category: '个税', name: '累计预扣个税', amount: -45.20 }
  ],
  grossPay: 6200,
  totalDeduction: 1308.09,
  netPay: 4891.91,
  confirmed: false
}

// 假期余额
export const LEAVE_BALANCE = {
  empId: 'EMP003',
  annual: { total: 5, used: 1, remaining: 4, expireDate: '2026-12-31' },
  compTime: { total: 16, used: 4, remaining: 12, expireAt: '2026-11-15' },
  sick: { used: 0, paid: true },
  personal: { used: 1 }
}

// 规则列表（HR管理后台用）
export const RULES = [
  { rCode: 'R-001', name: '工作日加班费', category: '§12薪酬', mode: 'NO_CALC', desc: '不作数不补不扣（视为效率问题）', risk: 'MID', source: '康源集团实际执行规则' },
  { rCode: 'R-002', name: '周末加班费', category: '§12薪酬', mode: 'COMPTIME_ONLY', desc: '1:1 转调休·不发 200%', risk: 'OK', source: '劳动法§44(二)' },
  { rCode: 'R-003', name: '法定节假日加班费', category: '§12薪酬', mode: 'COMPTIME_ONLY', desc: '1:1 转调休·不发 300%', risk: 'HIGH', source: '康源集团实际执行规则' },
  { rCode: 'R-004', name: '旷工扣款', category: '§5考勤', mode: 'ABSENT_1X', desc: '按事假 1 倍扣（原 3 倍已废止）', risk: 'OK', source: '合规化调整' },
  { rCode: 'R-005', name: '迟到/缺卡扣款', category: '§5考勤', mode: 'LATE_PER_TIME', desc: '单次 10 元 + 取消全勤奖', risk: 'OK', source: '康源集团实际执行规则' },
  { rCode: 'R-006', name: '病假扣款(有病历)', category: '§4假期', mode: 'SICK_20', desc: '扣 20%·发 80%', risk: 'OK', source: '陕西省工资支付条例' },
  { rCode: 'R-007', name: '病假扣款(无病历)', category: '§4假期', mode: 'SICK_100', desc: '按事假 100% 扣', risk: 'OK', source: '视为事假处理' },
  { rCode: 'R-008', name: '工龄工资', category: '§12薪酬', mode: 'SENIORITY_100', desc: '100元/年·封顶10年=1000元/月', risk: 'OK', source: '企业自主' },
  { rCode: 'R-009', name: '试用期待遇', category: '§12薪酬', mode: 'PROBATION_80', desc: '80% 工资', risk: 'OK', source: '劳动合同法§20' }
]

// 月度异常清单
export const ANOMALIES = [
  { id: 'A001', empId: 'EMP003', empName: '张三', type: 'LATE', date: '2026-08-05', desc: '迟到 15 分钟', status: 'PENDING', penalty: 10 },
  { id: 'A002', empId: 'EMP005', empName: '王五', type: 'MISS_PUNCH', date: '2026-08-08', desc: '下班缺卡', status: 'PENDING', penalty: 10 },
  { id: 'A003', empId: 'EMP006', empName: '赵六', type: 'ABSENT', date: '2026-08-09', desc: '全天未打卡未请假', status: 'PENDING', penalty: 0 },
  { id: 'A004', empId: 'EMP004', empName: '李四', type: 'LATE', date: '2026-08-10', desc: '迟到 5 分钟', status: 'RESOLVED', penalty: 10 }
]
