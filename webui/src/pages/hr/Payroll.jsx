import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Card, Table, Button, Tag, Modal, Space, Statistic, Row, Col, Progress, message } from 'antd'
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { BRAND_COLORS } from '../../theme.js'
import { KPIS, EMPLOYEES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

// 板块配置
const BU_CONFIG = {
  GROUP_HQ: { name: '集团总部', color: BRAND_COLORS.TEXT_MUTED },
  BU_MEIHONG: { name: '康源美宏', color: BRAND_COLORS.BU_MEIHONG },
  BU_FUZHI_EDU: { name: '福祉教育', color: BRAND_COLORS.BU_FUZHI_EDU },
  BU_QIXIANG: { name: '耆祥', color: BRAND_COLORS.BU_QIXIANG }
}

// 职级对应基础工资（模拟）
const GRADE_SALARY = { M4: 25000, M3: 18000, L3: 8000, L2: 5000, L1: 4000 }

// 生成月度核算结果（基于员工档案模拟）
function buildPayrollResults() {
  return EMPLOYEES.map((emp, i) => {
    const base = GRADE_SALARY[emp.grade] || 5000
    const performance = Math.round(base * 0.15)
    const overtime = i % 3 === 0 ? 200 : 0
    const allowance = 300
    const seniority = 100
    const gross = base + performance + overtime + allowance + seniority
    const social = Math.round(gross * 0.105)
    const tax = Math.round(gross * 0.03)
    const deduction = social + tax
    const net = gross - deduction
    return {
      key: emp.empId,
      empId: emp.empId,
      empName: emp.name,
      bu: emp.bu,
      gross,
      deduction,
      net,
      status: i < 4 ? 'DONE' : 'PENDING'
    }
  })
}

// DAG 节点定义：11 个节点，覆盖薪酬核算全流程
const DAG_NODES = [
  { id: 'base', name: '基础工资', status: 'done' },
  { id: 'absence', name: '缺勤扣款', status: 'done' },
  { id: 'perf', name: '绩效', status: 'done' },
  { id: 'seniority', name: '工龄', status: 'done' },
  { id: 'overtime', name: '加班费', status: 'done' },
  { id: 'allowance', name: '津贴', status: 'done' },
  { id: 'other', name: '其他', status: 'doing' },
  { id: 'gross', name: '应发合计', status: 'pending' },
  { id: 'social', name: '社保扣缴', status: 'pending' },
  { id: 'tax', name: '个税预扣', status: 'pending' },
  { id: 'net', name: '实发合计', status: 'pending' },
]

// 节点状态配置
const NODE_STATUS_CONFIG = {
  done: { label: '已完成', color: BRAND_COLORS.SUCCESS, icon: <CheckCircleOutlined /> },
  doing: { label: '进行中', color: BRAND_COLORS.PRIMARY, icon: <LoadingOutlined /> },
  pending: { label: '待执行', color: BRAND_COLORS.TEXT_MUTED, icon: <ClockCircleOutlined /> },
}

// DAG 节点卡片
function DagNode({ node }) {
  const cfg = NODE_STATUS_CONFIG[node.status]
  return (
    <div style={{
      minWidth: 96,
      padding: '10px 14px',
      borderRadius: 8,
      border: `1.5px solid ${node.status === 'pending' ? BRAND_COLORS.BORDER : cfg.color}`,
      background: node.status === 'pending' ? '#FAFAFA' : `${cfg.color}0D`,
      textAlign: 'center',
      transition: 'all 0.3s',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: BRAND_COLORS.TEXT }}>{node.name}</div>
      <div style={{ fontSize: 11, color: cfg.color, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {cfg.icon}
        {cfg.label}
      </div>
    </div>
  )
}

export default function PayrollPage() {
  const user = getCurrentUser()
  const [progressModalOpen, setProgressModalOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [nodes, setNodes] = useState(DAG_NODES)
  const [results] = useState(buildPayrollResults)
  const timerRef = useRef(null)
  const completedRef = useRef(false)

  // KPI 计算
  const kpis = useMemo(() => {
    const totalGross = results.reduce((s, r) => s + r.gross, 0)
    const totalNet = results.reduce((s, r) => s + r.net, 0)
    const totalDeduction = results.reduce((s, r) => s + r.deduction, 0)
    const headcount = results.length
    return { totalGross, totalNet, totalDeduction, headcount }
  }, [results])

  // 启动月度核算
  const handleStartCalc = () => {
    setProgress(0)
    setNodes(DAG_NODES.map(n => ({ ...n, status: 'pending' })))
    completedRef.current = false
    setProgressModalOpen(true)
  }

  // 进度模拟：定时递增进度
  useEffect(() => {
    if (!progressModalOpen) return
    timerRef.current = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 100))
    }, 500)
    return () => clearInterval(timerRef.current)
  }, [progressModalOpen])

  // 根据进度更新 DAG 节点状态
  useEffect(() => {
    if (!progressModalOpen || progress === 0) return
    const nodeCount = DAG_NODES.length
    const completedCount = Math.floor((progress / 100) * nodeCount)
    setNodes(DAG_NODES.map((n, i) => {
      if (progress >= 100) return { ...n, status: 'done' }
      if (i < completedCount) return { ...n, status: 'done' }
      if (i === completedCount) return { ...n, status: 'doing' }
      return { ...n, status: 'pending' }
    }))
    if (progress >= 100 && !completedRef.current) {
      completedRef.current = true
      message.success('月度核算完成，所有节点已处理')
    }
  }, [progress, progressModalOpen])

  // 表格列定义
  const columns = [
    { title: '工号', dataIndex: 'empId', key: 'empId', width: 100 },
    { title: '姓名', dataIndex: 'empName', key: 'empName', width: 100 },
    {
      title: '板块', dataIndex: 'bu', key: 'bu', width: 110,
      render: (bu) => {
        const cfg = BU_CONFIG[bu]
        return <Tag style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}10` }}>{cfg.name}</Tag>
      }
    },
    {
      title: '应发（元）', dataIndex: 'gross', key: 'gross', width: 120, align: 'right',
      render: (v) => v.toLocaleString()
    },
    {
      title: '扣款（元）', dataIndex: 'deduction', key: 'deduction', width: 120, align: 'right',
      render: (v) => <span style={{ color: BRAND_COLORS.ERROR }}>-{v.toLocaleString()}</span>
    },
    {
      title: '实发（元）', dataIndex: 'net', key: 'net', width: 120, align: 'right',
      render: (v) => <span style={{ fontWeight: 600, color: BRAND_COLORS.PRIMARY }}>{v.toLocaleString()}</span>
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s) => s === 'DONE'
        ? <Tag color="green">已核算</Tag>
        : <Tag color="default">待核算</Tag>
    },
  ]

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: BRAND_COLORS.TEXT }}>月度薪酬核算</h2>
          <span style={{ fontSize: 13, color: BRAND_COLORS.TEXT_MUTED }}>
            DAG 驱动的薪酬核算引擎，支持全集团月度薪酬一键核算{user ? ` · 当前操作员：${user.name}` : ''}
          </span>
        </div>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartCalc} size="large">
          启动月度核算
        </Button>
      </div>

      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="本月应发总额"
              value={kpis.totalGross}
              precision={0}
              prefix="¥"
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="本月实发总额"
              value={kpis.totalNet}
              precision={0}
              prefix="¥"
              suffix="元"
              valueStyle={{ color: BRAND_COLORS.PRIMARY }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="本月扣款总额"
              value={kpis.totalDeduction}
              precision={0}
              prefix="¥"
              suffix="元"
              valueStyle={{ color: BRAND_COLORS.ERROR }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="本月核算人数"
              value={kpis.headcount}
              suffix="人"
            />
          </Card>
        </Col>
      </Row>

      {/* DAG 流程可视化 */}
      <Card title="核算流程（DAG 节点）" style={{ borderRadius: 12, marginBottom: 16 }} bodyStyle={{ padding: 24 }}>
        {/* 输入节点层：7 个收入/扣款项汇聚到应发 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {nodes.slice(0, 7).map(n => <DagNode key={n.id} node={n} />)}
        </div>
        {/* 汇聚箭头 */}
        <div style={{ textAlign: 'center', color: BRAND_COLORS.BORDER, fontSize: 20, margin: '6px 0' }}>↓</div>
        {/* 应发合计节点 */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DagNode node={nodes[7]} />
        </div>
        <div style={{ textAlign: 'center', color: BRAND_COLORS.BORDER, fontSize: 20, margin: '6px 0' }}>↓</div>
        {/* 社保 + 个税 */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <DagNode node={nodes[8]} />
          <DagNode node={nodes[9]} />
        </div>
        <div style={{ textAlign: 'center', color: BRAND_COLORS.BORDER, fontSize: 20, margin: '6px 0' }}>↓</div>
        {/* 实发合计节点 */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DagNode node={nodes[10]} />
        </div>
      </Card>

      {/* 核算结果表格 */}
      <Card title="月度核算结果" style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
        <Table
          columns={columns}
          dataSource={results}
          rowKey="empId"
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 800 }}
          size="middle"
          summary={(data) => {
            const totalGross = data.reduce((s, r) => s + r.gross, 0)
            const totalDeduction = data.reduce((s, r) => s + r.deduction, 0)
            const totalNet = data.reduce((s, r) => s + r.net, 0)
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><strong>合计</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} align="right"><strong>{totalGross.toLocaleString()}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><strong style={{ color: BRAND_COLORS.ERROR }}>-{totalDeduction.toLocaleString()}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><strong style={{ color: BRAND_COLORS.PRIMARY }}>{totalNet.toLocaleString()}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
      </Card>

      {/* 进度模拟弹窗 */}
      <Modal
        title="月度核算进行中"
        open={progressModalOpen}
        onCancel={() => setProgressModalOpen(false)}
        footer={[
          <Button key="close" type={progress >= 100 ? 'primary' : 'default'} onClick={() => setProgressModalOpen(false)}>
            {progress >= 100 ? '完成' : '关闭'}
          </Button>
        ]}
        width={560}
        maskClosable={false}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Progress
            type="dashboard"
            percent={progress}
            strokeColor={BRAND_COLORS.PRIMARY}
          />
          <div style={{ marginTop: 16, fontSize: 14, color: BRAND_COLORS.TEXT_MUTED }}>
            {progress < 100 ? `正在执行核算节点... ${progress}%` : '核算完成！所有节点已处理完毕'}
          </div>
          {user && (
            <div style={{ marginTop: 8, fontSize: 12, color: BRAND_COLORS.TEXT_MUTED }}>
              操作人：{user.name}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}