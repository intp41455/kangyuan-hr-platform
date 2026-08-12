# 智慧化人资考勤薪酬一体化自动化平台 · V2.0 - 实施计划 (36项任务)

> 阶段依赖：**主数据中心 → 钉钉数据源接入 → 考勤引擎 → 假期引擎 → 薪酬引擎 → 审批集成 → 异常检测 → 自助确认 → AI Agent → 审计归档 → 集成测试 → 上线部署**
> 6个月分6期上线：M1（1-10） M2（11-20） M3（21-26） M4（27-31） M5（32-35） M6（36）

---

## 阶段一 · 主数据中心（P0 · 共10项 · M1完成）

## [x] Task 1.1：员工全生命周期主数据模型设计与实现 (8状态)
- **Priority**: high
- **Depends On**: None
- **Description**：
  - 定义 EmployeeModel：id/name/idCard/mobile/entity/dept1/dept2/position/directLeader/entryDate/regularDate/status(8状态)/payrollGrade/workLocation/firstWorkDate/exemptSocialTax/bankCard/bankName/isFinance/history(transfers/promotions/adjustments) 22字段
  - 实现8状态流转：入职待报到→试用期→正式→调动中→晋升中→待离职→离职→退休
  - 实现方法：calcYearsOfService() 双记录（firstWorkDate优先，缺省用entryDate）、calcSeniorityPay() = 年限×100元/年（10年封顶可配置）、isProbation() 精确判定
  - 岗位标签：教育岗/非教育岗/外勤岗/高管免打卡岗，用于后续规则分支
- **Acceptance Criteria Addressed**: AC-1, AC-11
- **Test Requirements**：
  - `programmatic` TR-1.1.1：构造2023.6.19入职的正式员工→工龄=3年→工龄工资=300元（2026.8.11核算）
  - `programmatic` TR-1.1.2：构造2026.5.20入职，regularDate=2026.8.20→8月15日调用isProbation返回true，9月1日返回false
  - `programmatic` TR-1.1.3：8状态机流转顺序合法，跨状态非法跳转抛出异常
- **Notes**: 已有基础代码在src/modules/master_data/employee_model.js，在此基础上扩展岗位标签/8状态/10年封顶

## [x] Task 1.2：员工花名册导入与钉钉通讯录userId双向绑定模块
- **Priority**: high
- **Depends On**: Task 1.1
- **Description**：
  - 从Excel/钉钉通讯录批量导入员工主数据，做字段校验（必填/身份证18位+校验位/手机号11位/银行卡号Luhn校验）
  - 实现 findByName / findByMobile / findByDingtalkUserId 三种查询方法
  - 建立映射表 EmployeeDingtalkMap：employeeId ↔ dingtalkUserId ↔ deptId
  - 重复导入幂等处理（手机号+身份证双主键去重）
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**：
  - `programmatic` TR-1.2.1：导入100条模拟花名册→全部插入，重复导入第二次记录数不变
  - `programmatic` TR-1.2.2：非法身份证（末位校验错）/手机号（10位）/必填字段缺失→返回明确错误信息，不入库
  - `human-judgement` TR-1.2.3：查询接口响应时间<50ms（1万条数据量）
- **Notes**: 与Task 2.1钉钉通讯录同步模块形成双向更新闭环

## [x] Task 1.3：岗位薪级标准库模型（≥4薪级 + 9:1/8:2双比例）
- **Priority**: high
- **Depends On**: Task 1.1
- **Description**：
  - 定义 PayrollGradeModel：id/gradeCode/gradeName/baseSalaryRatio/performanceRatio/baseAmount/performanceAmount/probationRatio(80%)
  - 预置4薪级：专家级(9:1) / 副总级(9:1) / 实习生级(10:0无绩效) / 社保代缴级(特殊比例0:0仅代缴)
  - 实现方法：calcPerformancePay(score百分比)、calcProbationPay() = 标准工资×80%（副总级验证9520元/11900×80%）
  - 支持自定义薪级新增：动态比例（8:2业务岗）、补贴字段、试用期比例（90%可配置）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**：
  - `programmatic` TR-1.3.1：副总级(标准11900，绩效占比10%)→绩效100分=1190元，90分=1071元
  - `programmatic` TR-1.3.2：副总级试用期工资 = 11900×80% = 9520元（精确值比对）
  - `programmatic` TR-1.3.3：自定义新增8:2业务岗→绩效100分拿20%部分，逻辑正确
  - `human-judgement` TR-1.3.4：薪级配置支持非技术HR在管理页面修改热生效

## [x] Task 1.4：5参保地社保公积金差异化基数配置模块
- **Priority**: high
- **Depends On**: Task 1.1
- **Description**：
  - 定义 SocialInsuranceAreaModel：areaCode/areaName/pensionRatio(8%统一)/unemploymentRatio(0.3%/地区可微差)/medicalRatio(2%)/bigMedicalSupplement(西安8元/其他地区可配置)/housingFundRatio(8%/10%/12%可配置)/baseLowerLimit/baseUpperLimit/effectiveDate
  - 预置5地：西安(5132医保新基数2026.8月起)/天水/白银/平凉/兰州
  - 实现 calcSocialInsurance(employee)：按员工workLocation路由到对应地区配置，自动核算个人缴费合计
  - 基数调整支持历史版本：8月前西安按4990，8月起按5132，按核算月份自动切换
- **Acceptance Criteria Addressed**: AC-5, AC-4
- **Test Requirements**：
  - `programmatic` TR-1.4.1：西安员工2026年7月医保基数=4990；8月=5132（核算月份自动切换）
  - `programmatic` TR-1.4.2：西安8月公积金比例10%、基数10000→公积金个人=1000，大额医疗补=8
  - `programmatic` TR-1.4.3：5地各抽1人社保合计与人工计算误差≤0.01元
- **Notes**: 数据来源于人社局官网标准，制度委员会每年7月复核更新

## [x] Task 1.5：津贴补贴配置中心（≥30项）
- **Priority**: medium
- **Depends On**: Task 1.3
- **Description**：
  - AllowanceModel：id/code/name/type(固定/浮动/一次性/按天)/amount(元)/applyTo(全体/指定部门/指定薪级/指定员工)/effectiveDate/expireDate
  - 预置项：住房补贴/交通补贴/通讯补贴/餐补(工作日按天)/全勤奖/高温补贴(6-8月)/节日补贴(春节/端午/中秋)/外派补贴/教育课时补贴/证书津贴/独生子女补贴
  - 支持批量导入、批量开关、个人临时加项/扣项操作需审批
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**：
  - `programmatic` TR-1.5.1：餐补按工作日22天×20元=440元自动核算
  - `programmatic` TR-1.5.2：高温补贴6-8月发放，5月/9月自动停止（按核算月份自动判断）
  - `human-judgement` TR-1.5.3：津贴加项操作必须生成审批流，手动加扣的明细永久留痕

## [x] Task 1.6：个税累计预扣法引擎（7级累进+6项专项附加扣除）
- **Priority**: high
- **Depends On**: Task 1.1, Task 1.3
- **Description**：
  - 实现个税算法：累计预扣预缴应纳税所得额 = 累计收入 - 累计免税收入 - 累计减除费用(5000/月) - 累计专项扣除(社保公积金) - 累计专项附加扣除 - 累计其他扣除
  - 专项附加扣除6项：子女教育(1000/孩/月)、房贷利息(1000/月)、住房租金(1500/1100/800按城市)、赡养老人(2000/月独生子女)、继续教育(400/月学历/3600证书年)、3岁以下婴幼儿照护(2000/孩/月)
  - 7级税率表（3%/10%/20%/25%/30%/35%/45%）与速算扣除数
  - 历史累计数据：年度开始→当前月累计数据查询接口
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**：
  - `programmatic` TR-1.6.1：月入10000，无专项附加，社保个人合计1500→首月个税=(10000-5000-1500)×3%=105元
  - `programmatic` TR-1.6.2：月入50000，子女教育2孩+房贷利息+赡养老人→专项附加=2000+1000+2000=5000/月，第3个月累计计算与税务局结果误差≤1元
  - `human-judgement` TR-1.6.3：税务政策调整时（如专项附加扣除标准变化）配置中心可修改，无需代码变更

## [x] Task 1.7：规则引擎框架（403条规则可配置+版本管理）
- **Priority**: high
- **Depends On**: None
- **Description**：
  - 规则DSL：JSON Schema 定义 rule {id/R编号/name/category(§4假期/§5考勤/§12薪酬)/formula/effectiveDate/expireDate/来源/sourceDocument/page}
  - 规则执行器：依赖注入计算图 DAG 按依赖顺序执行，支持断点调试
  - 版本管理：每条规则 history[] 记录变更历史；支持回滚至任意历史版本
  - 规则单元测试：每条规则至少2个测试用例（正常+边界），测试覆盖率≥95%
- **Acceptance Criteria Addressed**: AC-9, AC-2, AC-3
- **Test Requirements**：
  - `programmatic` TR-1.7.1：加载403条规则→全部解析成功，无语法错误/无循环依赖
  - `programmatic` TR-1.7.2：单条规则修改→版本号+1，变更人/时间/审批单号自动记录
  - `programmatic` TR-1.7.3：规则执行超时(>5s)自动熔断并报警

## [x] Task 1.8：编码标准与数据字典（员工ID/部门ID/岗位ID三级编码）
- **Priority**: medium
- **Depends On**: None
- **Description**：
  - 三级编码规则：员工ID=E+6位数字自增；部门ID=D+层级码(2+2)；岗位ID=P+4位
  - 数据字典：8状态枚举、16类考勤异常枚举、假期8类枚举、审批状态枚举、地区编码字典
  - 字典表前后端共享，钉钉机器人推送/钉钉小程序数据绑定统一使用
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**：
  - `programmatic` TR-1.8.1：所有枚举值全系统引用一致，无魔法数字（硬编码数字/字符串）
  - `human-judgement` TR-1.8.2：数据字典表有清晰注释，新人HR可10分钟理解全部含义

## [x] Task 1.9：员工主数据管理页面（钉钉微应用后台管理端）
- **Priority**: medium
- **Depends On**: Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 1.8
- **Description**：
  - 员工列表/新增/编辑/详情四页，操作分权限（HR专员可改基本信息/分管副总可改薪级/财务改银行卡）
  - 批量导入/批量导出/批量调整薪级/批量调动部门（每步需审批）
  - 员工画像页：8状态时间轴/异动历史/工龄/社保参保地/假期余额/调休余额可视化
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**：
  - `human-judgement` TR-1.9.1：非HR账号无权访问薪资/身份证/银行卡敏感字段
  - `human-judgement` TR-1.9.2：列表筛选10条件(部门/状态/入职日期/薪级/参保地)组合正常，响应<1s

## [x] Task 1.10：主数据中心验收测试（用6月/7月真实数据回放）
- **Priority**: high
- **Depends On**: Task 1.1 ~ Task 1.9
- **Description**：
  - 导入6月/7月真实花名册数据（脱敏后），验证主数据完整度100%
  - 抽查10名员工：工龄工资/试用期状态/社保地区/薪级比例与原Excel完全一致
  - 建立钉钉通讯录userId映射表，覆盖率100%
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**：
  - `programmatic` TR-1.10.1：6月100名员工主数据比对→正确率≥99%
  - `programmatic` TR-1.10.2：7月100名员工主数据比对→正确率≥99%
  - `human-judgement` TR-1.10.3：钉钉映射表抽查50人可在钉钉通讯录查到对应用户

---

## 阶段二 · 钉钉数据接入 + 考勤引擎（P0 · 共10项 · M2完成）

## [x] Task 2.1：钉钉通讯录同步模块（双向同步+事件订阅）
- **Priority**: high
- **Depends On**: Task 1.2, Task 1.8
- **Description**：
  - 使用 dws contact / 通讯录事件订阅 双向同步：钉钉新增/修改→主数据中心更新；主数据中心修改→钉钉回写
  - 增量同步：每1小时轮询 + 变更事件实时推送双保险
  - 部门组织架构同步：dept1/dept2层级与钉钉deptId一一对应
  - 同步冲突处理：钉钉为主真源，系统修改需审批后回写钉钉
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**：
  - `programmatic` TR-2.1.1：钉钉新增员工→10分钟内主数据中心自动新增（幂等不重复）
  - `programmatic` TR-2.1.2：主数据中心修改员工直属上级（经审批）→钉钉通讯录10分钟内同步更新
  - `programmatic` TR-2.1.3：同步失败3次重试→成功，超过阈值钉钉机器人报警给管理员

## [x] Task 2.2：钉钉考勤组与规则自动读取模块
- **Priority**: high
- **Depends On**: Task 2.1
- **Description**：
  - 使用 dws attendance rules 读取所有考勤组：总部考勤组（8:30-18:00）、教育机构考勤组、西安办事处/天水/白银/平凉/兰州分点考勤组
  - 识别打卡时间、弹性工作制、免打卡人员名单（高管/外勤岗，需FR-3.6豁免名单交叉校验）
  - 考勤组与员工部门自动匹配，避免跨考勤组打卡
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**：
  - `programmatic` TR-2.2.1：读取≥5个考勤组→配置完整，打卡时间/工作日/弹性规则正确
  - `human-judgement` TR-2.2.2：免打卡名单与豁免审批名单比对，识别不在名单中的异常（如非正式审批的高管豁免需补证）

## [x] Task 2.3：月度打卡原始数据全量采集
- **Priority**: high
- **Depends On**: Task 2.2
- **Description**：
  - 使用 dws attendance record get + shift list + summary 批量拉取
  - 拉取字段：日期/上班打卡时间/下班打卡时间/打卡地点/打卡设备/外勤标记/补卡申请单号/出差申请单号/请假申请单号
  - D-3日（或月度考勤周期结束次日）23:59全量任务自动触发，失败自动重试
  - 数据校验：当日应有打卡而缺失的自动标记缺卡
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**：
  - `programmatic` TR-2.3.1：6月/7月各100人×全月30天打卡数据拉取→完整度≥99.9%，缺失有明确原因（API失败/该日无需打卡）
  - `programmatic` TR-2.3.2：同一员工重复拉取→数据一致（幂等）
  - `programmatic` TR-2.3.3：API失败指数退避重试3次，钉钉推送失败兜底短信

## [x] Task 2.4：16类考勤异常识别引擎（FR-2.3）
- **Priority**: high
- **Depends On**: Task 2.3, Task 1.7
- **Description**：
  - 16类异常分类：①迟到(≤10min警告/≥10min扣20/≥30min记旷工0.5天) ②早退 ③缺卡(≤2次可补免/≥3次每次50元) ④旷工(当日×3扣) ⑤平日加班 ⑥周末加班 ⑦节假日加班 ⑧事假 ⑨病假 ⑩年假 ⑪婚假 ⑫产假 ⑬陪产假 ⑭丧假 ⑮调休抵扣 ⑯外勤/出差未审批
  - 识别规则全部走Task1.7规则引擎，每条异常生成异常单号ATXXXX
  - 支持批量规则：同一员工当月迟到≥3次自动叠加扣款20元
- **Acceptance Criteria Addressed**: AC-2, AC-11
- **Test Requirements**：
  - `programmatic` TR-2.4.1：构造16类各5条模拟打卡数据→识别准确率100%，分类无混淆
  - `programmatic` TR-2.4.2：员工当月迟到第3次→自动增加20元扣款项，前2次不触发
  - `programmatic` TR-2.4.3：缺卡1次有补卡审批→豁免；缺卡4次→3×50=150元扣款

## [x] Task 2.5：教育板块加班特殊规则区分引擎（FR-2.5）
- **Priority**: high
- **Depends On**: Task 2.4, Task 1.1 (岗位标签)
- **Description**：
  - 根据员工岗位标签（教育岗/非教育岗）自动分支：教育岗平日加班按制度执行豁免/非豁免；非教育岗统一1.5倍
  - 周末/节假日教育岗加班规则按制度区分；跨月加班自动归入对应核算月
  - 教育岗豁免清单需FR-3.6书面审批名单交叉校验，名单外教育岗不得豁免
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**：
  - `programmatic` TR-2.5.1：教育岗+非教育岗平日加班各2小时→二者核算结果差异符合制度规定
  - `programmatic` TR-2.5.2：教育岗不在豁免名单→按正常标准核算（不得豁免）
  - `human-judgement` TR-2.5.3：比对6/7月教育板块加班工资总额与原Excel→误差率≤0.5%

## [x] Task 2.6：钉钉机器人异常派单与催办模块（FR-2.4 FR-2.6）
- **Priority**: high
- **Depends On**: Task 2.4
- **Description**：
  - 使用 dws chat send-by-bot 发消息：异常T+1小时内→员工个人+直属上级
  - 自动创建"缺卡说明/加班确认/外勤补审批"审批单（使用 dws oa approval create）
  - 每日18:00二次催办：未闭环异常DING消息提醒（dws ding 发送）
  - 催办SLA统计：24h内闭环率、48h内闭环率报表
- **Acceptance Criteria Addressed**: AC-2, AC-5, AC-11
- **Test Requirements**：
  - `programmatic` TR-2.6.1：员工A缺卡1次→机器人消息2分钟内送达→自动创建补卡审批单
  - `programmatic` TR-2.6.2：异常产生30小时未闭环→18:00自动DING催办
  - `human-judgement` TR-2.6.3：钉钉机器人消息卡片UI友好，显示异常类型、时间、扣款金额、一键确认按钮

## [x] Task 2.7：考勤异常自动与OA审批闭环回写
- **Priority**: high
- **Depends On**: Task 2.6
- **Description**：
  - 监听OA审批流结果：dws oa approval tasks 轮询 + 事件订阅
  - 审批通过→异常状态更新为"已闭环"，对应扣款/加班/调休抵扣自动回写
  - 审批驳回→二次派发异常给员工补充材料，审批人变更/转交自动同步
  - 所有回写操作留痕操作日志
- **Acceptance Criteria Addressed**: AC-5, AC-2
- **Test Requirements**：
  - `programmatic` TR-2.7.1：补卡审批通过→异常状态变为闭环，扣款50元回写取消（如补卡有效）
  - `programmatic` TR-2.7.2：请假审批驳回→异常标记未闭环，二次催办
  - `programmatic` TR-2.7.3：审批转交他人→系统记录转交链路，审计可查

## [x] Task 2.8：月度考勤汇总与确认单自动生成
- **Priority**: medium
- **Depends On**: Task 2.4 ~ Task 2.7
- **Description**：
  - 考勤汇总维度：按部门/按员工/按异常类型/按加班总时长/按假期总天数
  - D-2 10:00 自动生成钉钉在线表格版考勤确认单（使用 dws sheet 写入 axls），HR与部门负责人可在线查看
  - 钉钉文档考勤月度报告（使用 dws doc 自动创建富文本报告：异常排名TOP10、加班TOP10、假期消耗情况）
- **Acceptance Criteria Addressed**: AC-2, AC-6
- **Test Requirements**：
  - `programmatic` TR-2.8.1：100人员工考勤汇总自动生成→与人工汇总差额≤1人
  - `human-judgement` TR-2.8.2：钉钉在线表格排版规范，部门分Sheet，合计行有公式自动SUM

## [x] Task 2.9：考勤管理后台页面（钉钉微应用）
- **Priority**: medium
- **Depends On**: Task 2.1 ~ Task 2.8, Task 1.9
- **Description**：
  - 实时仪表盘：异常总览/闭环率/今日待催办/SLA进度条（D-3至D日关键节点）
  - 异常查询：按员工/部门/类型/状态/时间范围多维筛选
  - 批量处理：批量豁免（需审批）/批量转工单/批量导出
- **Acceptance Criteria Addressed**: AC-2, AC-11
- **Test Requirements**：
  - `human-judgement` TR-2.9.1：仪表盘实时更新延迟≤1分钟，闭环率数据真实
  - `human-judgement` TR-2.9.2：批量豁免操作自动生成审批，无审批不得生效

## [x] Task 2.10：考勤引擎验收测试（6/7月真实数据回放 + 钉钉环境联调）
- **Priority**: high
- **Depends On**: Task 2.1 ~ Task 2.9
- **Description**：
  - 用钉钉真实6月/7月打卡数据回放，考勤异常识别正确率与人工比对≥99%
  - D-3→D-2 12:00 异常闭环率模拟≥95%达成
  - 教育板块加班专项校验：与原Excel工资表加班项目误差≤1%
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-11
- **Test Requirements**：
  - `programmatic` TR-2.10.1：6月100人考勤异常→与HR人工表比对正确率≥99%
  - `programmatic` TR-2.10.2：7月100人考勤异常→与HR人工表比对正确率≥99%
  - `human-judgement` TR-2.10.3：教育板块加班金额核验，差异说明合理

---

## 阶段三 · 假期引擎 + 薪酬核算引擎（P0 · 共6项 · M3完成）

## [x] Task 3.1：8类假期管理引擎（年假阶梯+清零延期+调休有效期）
- **Priority**: high
- **Depends On**: Task 1.7, Task 1.1
- **Description**：
  - 假期定义模型 LeaveTypeModel：8大类型代码/名称/最少单位(天/小时)/是否需病历/是否带薪/是否可跨年度/是否可预支
  - 年假阶梯：入职满1年5天/满10年10天/满20年15天（按法定标准）
  - 6.1入职分界规则：6.1前入职按自然年计算年假；6.1后入职按入职周年/剩余月数折算
  - 清零延期审批：未休年假默认自然年末清零，延期需审批→最长延至次年Q2末→未延自动作废
  - 调休有效期：加班产生→有效期180天→过期前14天钉钉预警
- **Acceptance Criteria Addressed**: AC-2, AC-6
- **Test Requirements**：
  - `programmatic` TR-3.1.1：2023.6.19入职→2026年8月年假=10天（满3年≥1不满10，按法定5天？按实际制度确定）
  - `programmatic` TR-3.1.2：调休181天前产生→过期自动作废，过期前14天机器人预警
  - `programmatic` TR-3.1.3：病假≥3天→要求上传病历附件，无附件审批流自动驳回
  - `human-judgement` TR-3.1.4：6.1入职分界规则的执行符合制度委员会确认的最终版本

## [x] Task 3.2：预支假期与特殊豁免审批管控（FR-3.5 FR-3.6）
- **Priority**: high
- **Depends On**: Task 3.1, Task 2.7
- **Description**：
  - 试用期员工禁止预支年假（自动拦截）
  - 转正员工预支年假≤5天：二级审批（直属→部门负责人）；>5天：三级审批（+分管副总）
  - 特殊考勤豁免（高管免打卡/特殊岗位）：必须有书面审批单备案才可在系统中开启
  - 历史3项已存在豁免补审批流程：在系统中发起"补录豁免"审批，审批通过后写入生效
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**：
  - `programmatic` TR-3.2.1：试用期员工申请预支年假3天→系统自动拦截，审批单无法创建
  - `programmatic` TR-3.2.2：转正员工申请预支年假7天→自动路由至三级审批，缺失节点自动报警
  - `human-judgement` TR-3.2.3：豁免名单每月自动导出供制度委员会复核签字

## [x] Task 3.3：薪酬核算引擎核心（基础+绩效+工龄+试用期+缺勤）
- **Priority**: high
- **Depends On**: Task 1.3, Task 1.6, Task 2.4, Task 3.1, Task 1.5
- **Description**：
  - 核算顺序DAG（依赖顺序不可颠倒）：基础工资→缺勤扣款→绩效工资→工龄工资→加班费→津贴补贴→其他加扣项→应发工资→社保公积金→个税→实发工资
  - 计薪日支持21.75法定/当月实际计薪日两种模式可配置
  - 缺勤规则：事假当日100%扣；病假当日发80%基本工资（需有病历，无病历按事假）；旷工当日×3扣；迟到早退累计≥3次扣20元
  - 转正当月/入职当月/离职当月工资按日折算（折算公式：日工资=月工资÷21.75）
- **Acceptance Criteria Addressed**: AC-4, AC-11
- **Test Requirements**：
  - `programmatic` TR-3.3.1：副总级标准11900，9:1比例，绩效100分，工龄3年，全勤→应发=11900+300=12200
  - `programmatic` TR-3.3.2：当月15日转正（试用期工资80%）→上半月试用期/下半月正式，按日折算正确
  - `programmatic` TR-3.3.3：事假2天+病假3天（有病案）→病假扣20%×3+事假100%×2，金额精准
  - `programmatic` TR-3.3.4：旷工1天→扣3倍当日工资

## [x] Task 3.4：加班费核算引擎 + 教育板块独立薪酬包
- **Priority**: high
- **Depends On**: Task 2.5, Task 3.3
- **Description**：
  - 三类加班标准：平日小时工资=月工资÷21.75÷8 ×1.5倍；周末×2倍；法定节假日×3倍
  - 教育岗豁免规则严格按Task2.5分支执行
  - 教育板块独立薪酬包：课时补贴/绩效包与总部口径分离，独立出表独立审批
  - 调休抵扣自动优先：员工有剩余调休→优先抵消平日加班（按1:1小时），剩余部分按倍数发钱
- **Acceptance Criteria Addressed**: AC-3, AC-4
- **Test Requirements**：
  - `programmatic` TR-3.4.1：月薪8700，平日加班4小时→8700÷21.75÷8×1.5×4 = 300元（精算校验）
  - `programmatic` TR-3.4.2：调休余额8小时→平日加班8小时→优先抵扣，加班费=0元
  - `human-judgement` TR-3.4.3：教育板块独立包工资表与总部工资表分别出Sheet，合计正确

## [x] Task 3.5：社保公积金5地差异化核算（FR-4.8）+ 工资汇总表多维度
- **Priority**: high
- **Depends On**: Task 1.4, Task 3.3
- **Description**：
  - 5地独立配置，按员工workLocation自动匹配；8月西安基数5132切换验证
  - 社保基数上下限：低于下限按下限，高于上限按上限
  - 工资汇总表4维度：按部门/按岗位/按薪级/按子机构
  - 银行批量代发模板：工行/建行/农行3大银行标准格式TXT/CSV自动导出
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**：
  - `programmatic` TR-3.5.1：5地各抽1人→社保五险+公积金+大额医疗补合计与人工计算误差≤0.01元
  - `programmatic` TR-3.5.2：西安2026年7月医保基数4990 vs 8月5132→自动切换，差异可追溯
  - `human-judgement` TR-3.5.3：银行代发文件格式与银行模板逐字段比对正确

## [x] Task 3.6：薪酬引擎验收测试（6/7月真实工资表100%回放对比）
- **Priority**: high
- **Depends On**: Task 3.1 ~ Task 3.5
- **Description**：
  - 6月/7月真实数据完整回放：考勤数据+绩效分数+津贴补贴+社保基数+员工状态全量输入
  - 全公司核算结果与原Excel工资表比对：差异员工数≤0.1%，差异额≤1元视为舍入误差
  - 专项校验：个税/社保/加班费/教育板块独立薪酬包 四大项误差率≤0.5%
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5
- **Test Requirements**：
  - `programmatic` TR-3.6.1：6月全部员工工资→实发工资与原表差异≤0.1%（员工数占比）
  - `programmatic` TR-3.6.2：7月全部员工工资→实发工资与原表差异≤0.1%（员工数占比）
  - `human-judgement` TR-3.6.3：每个差异项有明确合理原因（政策调整、原表舍入方式、一次性补贴等）

---

## 阶段四 · 审批集成 + 异常检测 + 合规审计（P1 · 共5项 · M3/M4完成）

## [x] Task 4.1：审批矩阵可配置 + SLA时效监控（FR-5.1 FR-5.2 FR-5.6）
- **Priority**: high
- **Depends On**: Task 1.7
- **Description**：
  - 审批矩阵配置中心：每类审批（请假/加班/补卡/薪酬异常/预支假期/豁免/调休延期）可配置2/3/4级审批人
  - 审批阈值统一2000元（制度委员会确认后可配置为其他值），支持双档切换避免冲突
  - SLA时间节点：D-3→18:00考勤异常闭环；D-2→14:00薪酬初算/18:00薪酬确认；D-1→12:00员工确认率；D日→09:00工资推送财务
  - SLA未达标：钉钉机器人+短信红黄灯预警
- **Acceptance Criteria Addressed**: AC-5, AC-11
- **Test Requirements**：
  - `programmatic` TR-4.1.1：申请金额≤2000元→二级审批；>2000元→三级审批；路由正确
  - `programmatic` TR-4.1.2：D-3 18:00考勤异常闭环率<95%→黄灯；<90%→红灯并短信通知HR总监
  - `human-judgement` TR-4.1.3：审批矩阵配置页面非技术HR可操作

## [x] Task 4.2：薪酬异常自动检测引擎（环比±20%波动 + 数据完整性 + 逻辑一致性）
- **Priority**: high
- **Depends On**: Task 3.6, Task 4.1
- **Description**：
  - FR-7.1 数据完整性检测：打卡缺失率>1%报警；社保基数为0/银行卡号为空→阻断发放
  - FR-4.11 环比波动检测：单员工薪酬环比≥±20%自动标注"薪酬异常说明"审批单（三级审批）
  - FR-7.2 逻辑一致性：同一薪级同一部门员工基础工资标准一致，识别遗漏（如转正未调薪）
  - 异常报告自动生成钉钉文档，附差异明细与金额
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**：
  - `programmatic` TR-4.2.1：模拟A员工上月10000→本月6000（请假10天，降40%）→自动生成异常审批
  - `programmatic` TR-4.2.2：银行卡号为空的5名员工→工资发放前自动阻断，状态标记"待补卡"
  - `programmatic` TR-4.2.3：副总级应发11900而实际10000（转正未调薪）→逻辑一致性检测报警

## [x] Task 4.3：合规审计模块（规则版本+操作日志+一键导出审计报告）
- **Priority**: medium
- **Depends On**: Task 1.7, Task 2.7, Task 3.6
- **Description**：
  - FR-7.3 规则版本管理：每条规则变更记录（版本号/变更人/变更时间/审批单号/原因）
  - FR-7.4 操作日志：所有人工修改/豁免/延期操作→操作人+IP+审批单号+前后值，保留≥180天
  - FR-7.5 AC-10 一键导出审计报告（PDF/Word）：8大章节（花名册+考勤+假期+薪酬+社保+规则版本+操作+审批SLA）
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**：
  - `programmatic` TR-4.3.1：修改规则"工龄工资100→150"→版本号从v1→v2，完整变更记录
  - `programmatic` TR-4.3.2：人工修改员工工资加项1000元→操作日志完整
  - `human-judgement` TR-4.3.3：审计报告PDF格式规范，8大章节内容完整无缺页

## [x] Task 4.4：GitHub PR规则变更CI流水线（FR-10.1~10.4）
- **Priority**: medium
- **Depends On**: Task 1.7
- **Description**：
  - 规则配置以YAML/JSON文件形式存储在GitHub仓库
  - GitHub Actions：每次PR→403条规则单元测试+集成测试+回归测试+6/7月工资回放对比→通过率100%方可合并
  - 灰度发布机制：合并后→测试部门试运行7天→全量推广
  - 一键回滚：出现问题→一键切换回上一稳定版本规则配置
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**：
  - `programmatic` TR-4.4.1：提交修改规则PR→CI运行403+测试→失败自动阻止合并
  - `programmatic` TR-4.4.2：7天灰度期无异常→自动全量；灰度期发现问题→一键回滚
  - `human-judgement` TR-4.4.3：规则变更PR模板含"制度委员会审批单号"必填项，缺失不允许合并

## [x] Task 4.5：财务系统代发接口（网银文件导出 / 银企直连预留）
- **Priority**: medium
- **Depends On**: Task 3.5, Task 4.1
- **Description**：
  - 模式A（低预算立即可用）：审批通过→自动生成工行/建行/农行代发TXT/CSV文件，HR下载上传网银
  - 模式B（未来扩展银企直连）：预留标准API接口对接银行SDK，自动代发+回执处理
  - 工资发放电子回单自动归档钉盘，按年/月分目录
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**：
  - `programmatic` TR-4.5.1：工行代发模板文件→逐字段比对银行官方样例→100%匹配
  - `human-judgement` TR-4.5.2：代发文件下载需HR+财务双人审批（双人四眼原则）

---

## 阶段五 · 自助确认 + AI人资Agent + 钉钉文档知识库（P1 · 共5项 · M4/M5完成）

## [x] Task 5.1：钉钉微应用员工自助端（工资条/考勤/假期/申诉工单）
- **Priority**: high
- **Depends On**: Task 2.8, Task 3.6, Task 1.9
- **Description**：
  - 钉钉小程序/工作台入口：员工免登录，钉钉身份自动鉴权
  - 工资条：D-1自动推送，支持按年月查询/PDF下载/数字签名水印/防截图
  - 考勤确认：D-2生成考勤确认单，在线一键确认/异议点击申诉
  - 假期中心：剩余年假/病假/调休余额可视化，一键申请请假
  - 申诉工单SLA 24h：未回复自动升级至HR负责人
- **Acceptance Criteria Addressed**: AC-7, AC-11
- **Test Requirements**：
  - `programmatic` TR-5.1.1：100名员工D-1 09:00工资条推送成功率≥99.9%
  - `human-judgement` TR-5.1.2：工资条UI界面敏感信息脱敏（中间*号），点击查看完整需二次验证
  - `human-judgement` TR-5.1.3：工资异议申诉→工单自动创建，24小时未回复自动升级

## [ ] Task 5.2：人资专项RAG知识库（403条规则 + 制度原文）
- **Priority**: high
- **Depends On**: Task 1.7, Task 4.3
- **Description**：
  - 知识库结构：考勤管理制度（康源发〔2024〕06号）+ 人资制度全文 + 假期管理细则 + 加班细则 + 审批矩阵 + 薪酬制度 + 社保政策（5地）+ 个税政策
  - RAG向量化嵌入：每条规则引用对应制度原文片段
  - 钉钉知识库（wiki）对接：制度文档统一存储在钉盘知识库，系统同步读取为唯一真源
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**：
  - `programmatic` TR-5.2.1：403条规则全部对应知识库文档，缺失率=0%
  - `human-judgement` TR-5.2.2：抽查20条规则，RAG召回的制度原文片段准确对应

## [x] Task 5.3：人资AI Agent（制度问答+薪酬测算+异常分析+月度汇报）
- **Priority**: high
- **Depends On**: Task 5.2, Task 1.7, Task 4.2
- **Description**：
  - FR-8.1 制度问答：每条回答附带R编号+制度文件名+页码+生效日期，可溯源
  - FR-8.2 薪酬测算计算器：员工可模拟"请假X天+加班Y小时→工资变化多少"（仅预测，非实际发放）
  - FR-8.3 薪酬异常差异报告：异常员工自动生成文字+表格分析报告
  - FR-8.4 月度自动汇报：每月D+3自动生成钉钉文档汇报（考勤异常率/薪酬波动/假期消耗/加班统计）
  - FR-8.5 预测与预警：人工成本预测/年假清零预警/调休过期预警
  - 钉钉群聊值班：FR-8.6 人事行政工作群自动回复制度咨询
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**：
  - `human-judgement` TR-5.3.1：随机50道自然语言制度题→回答准确率≥95%，附引用来源
  - `programmatic` TR-5.3.2：请假5天测算→与实际核算逻辑误差≤1元
  - `human-judgement` TR-5.3.3：群聊自动回复非标准问题→自动转工单，回答不过度承诺

## [x] Task 5.4：钉钉文档与AI听记自动化入知识库（FR-9.1~FR-9.3）
- **Priority**: medium
- **Depends On**: Task 5.2
- **Description**：
  - 钉盘知识库目录结构制度化：制度文件/审批文件/会议纪要/月度报告 四大目录
  - 钉钉文档在线表格双向同步：绩效分数表/考勤异常清单→平台与钉钉axls双向同步
  - AI听记纪要自动入库：dws minutes 转写→自动提取规则决策点→待制度委员会审批→审批通过自动更新规则引擎
- **Acceptance Criteria Addressed**: AC-8, AC-1
- **Test Requirements**：
  - `programmatic` TR-5.4.1：钉盘知识库制度文件更新→2小时内RAG知识库同步更新
  - `human-judgement` TR-5.4.2：听记纪要提取的决策点→准确无误，人工复核率100%

## [x] Task 5.5：人资专项数据大屏 + 高管驾驶舱
- **Priority**: medium
- **Depends On**: Task 5.1, Task 4.2, Task 4.3
- **Description**：
  - 数据大屏：月度实时SLA进度条（D-3→D日里程碑）、人工成本趋势、加班TOP10部门、假期清零倒计时
  - 高管驾驶舱：环比薪酬波动、离职率、试用期通过率、人效指标（人均营收/人均薪酬）
  - 钉钉机器人月度订阅：每月D+3高管自动收到核心指标汇总（图文）
- **Acceptance Criteria Addressed**: AC-11, AC-10
- **Test Requirements**：
  - `human-judgement` TR-5.5.1：数据大屏指标定义清晰，财务口径与人力口径一致
  - `human-judgement` TR-5.5.2：高管权限控制，仅分管副总以上可访问驾驶舱敏感数据

---

## 阶段六 · 集成测试 + 双轨并行 + 正式上线（P0 · 共5项 · M5/M6完成）

## [ ] Task 6.1：集成测试全链路（端到端D-3→D日SLA闭环演练）
- **Priority**: high
- **Depends On**: Task 1.1~5.5 全部完成
- **Description**：
  - 完整场景演练：模拟真实月度核算全流程 D-3 采集→D-3异常→D-2 14:00核算→D-2异常审批→D-1 12:00员工确认→D日09:00推送财务
  - 注入故障测试：钉钉API失败/审批人离职/数据缺失/网络故障 4类异常场景注入，系统自动恢复
  - 性能压力测试：500人/1000人/3000人三档全量核算性能≤30分钟
- **Acceptance Criteria Addressed**: AC-11, AC-2, AC-4
- **Test Requirements**：
  - `programmatic` TR-6.1.1：D-3→D日5个SLA节点100%按时达成
  - `programmatic` TR-6.1.2：钉钉API失败自动恢复率100%（模拟失败测试）
  - `programmatic` TR-6.1.3：1000人全量核算耗时≤30分钟
  - `human-judgement` TR-6.1.4：故障注入测试的人工恢复时间≤10分钟

## [/] Task 6.2：6个月历史数据完整回放验证（2026年2月~7月 × 6个月）
- **Priority**: high
- **Depends On**: Task 6.1
- **Description**：
  - 6个月历史全量回放：钉钉原始打卡数据/审批记录/工资表 全量回灌系统
  - 结果比对：6个月工资实发合计误差率≤0.1%，识别出的制度冲突/特殊处理全部列表
  - 历史数据修正建议：输出《历史数据修正建议报告》供制度委员会决策
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5
- **Test Requirements**：
  - `programmatic` TR-6.2.1：6个月每月工资实发总额 vs 原Excel误差率≤0.1%
  - `human-judgement` TR-6.2.2：识别的特殊处理案例全部列出，制度委员会签字确认

## [/] Task 6.3：双轨并行期（1个月）人工核算与系统核算比对
- **Priority**: high
- **Depends On**: Task 6.2
- **Description**：
  - 并行期（建议9月）：HR正常Excel核算 + 系统自动核算 双轨
  - 每日比对：差异项当日澄清，如规则问题立即修复
  - 并行期结束标准：连续30天，每日差异员工数≤0.1%且无单笔金额差异>100元
- **Acceptance Criteria Addressed**: AC-4, AC-12
- **Test Requirements**：
  - `programmatic` TR-6.3.1：并行期30天每日差异率均≤0.1%
  - `human-judgement` TR-6.3.2：HR签字确认《并行期比对报告》，制度委员会批准正式上线

## [ ] Task 6.4：全员培训与操作手册（钉钉文档+AI Agent自助培训）
- **Priority**: medium
- **Depends On**: Task 6.3
- **Description**：
  - 操作手册4类分角色：HR专员手册/部门负责人手册/普通员工手册/高管驾驶舱手册
  - 培训方式：钉钉文档 + 钉钉AI听记培训录音 + AI Agent模拟答题测试
  - 培训考核：全员制度问答测试≥80分通过（钉钉AI表格自动打分）
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**：
  - `human-judgement` TR-6.4.1：4类手册内容完整，新员工可在2小时内独立完成基本操作
  - `human-judgement` TR-6.4.2：培训考核通过率≥95%（不合格补考）

## [/] Task 6.5：正式上线 + 运维保障体系 + 6个月后效果评估（AC-12 达成≤2人时目标）
- **Priority**: high
- **Depends On**: Task 6.3, Task 6.4
- **Description**：
  - 正式上线切换（建议10月发薪月）
  - 运维保障：D-3→D日7×24应急小组；钉钉机器人故障报警15分钟响应
  - 6个月后效果评估：月度核算总人时≤2、异常率≤2%、员工自助确认率≥98%、满意度调查≥90分
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**：
  - `human-judgement` TR-6.5.1：上线首3个月无重大故障（定义：导致发薪延迟≥1工作日）
  - `human-judgement` TR-6.5.2：6个月后月度核算总人时实测≤2小时（HR+行政合计）
  - `human-judgement` TR-6.5.3：全员满意度调查≥90分，正式签发《人资智能化转型验收报告》
