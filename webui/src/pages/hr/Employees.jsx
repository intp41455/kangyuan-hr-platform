import React, { useState, useMemo } from 'react'
import { Card, Table, Button, Tag, Modal, Input, Select, Space, Statistic, Row, Col, Descriptions, Typography } from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  TeamOutlined,
  UserOutlined,
  ClockCircleOutlined,
  ApartmentOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { BRAND_COLORS } from '../../theme.js'
import { EMPLOYEES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Text } = Typography

// 板块配置：名称 + 标识色
const BU_CONFIG = {
  GROUP_HQ: { name: '集团总部', color: BRAND_COLORS.TEXT_MUTED },
  BU_MEIHONG: { name: '康源美宏', color: BRAND_COLORS.BU_MEIHONG },
  BU_FUZHI_EDU: { name: '福祉教育', color: BRAND_COLORS.BU_FUZHI_EDU },
  BU_QIXIANG: { name: '耆祥', color: BRAND_COLORS.BU_QIXIANG }
}

// 员工状态配置
const STATUS_CONFIG = {
  ACTIVE: { label: '在职', color: 'green' },
  PROBATION: { label: '试用期', color: 'orange' }
}

// 板块标签组件
function BuTag({ bu }) {
  const cfg = BU_CONFIG[bu] || { name: bu, color: BRAND_COLORS.TEXT_MUTED }
  return (
    <Tag style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}10` }}>
      {cfg.name}
    </Tag>
  )
}

export default function EmployeesPage() {
  const user = getCurrentUser()
  const [searchName, setSearchName] = useState('')
  const [filterDept, setFilterDept] = useState(undefined)
  const [filterBU, setFilterBU] = useState(undefined)
  const [detailEmp, setDetailEmp] = useState(null)

  // 统计数据
  const stats = useMemo(() => {
    const total = EMPLOYEES.length
    const active = EMPLOYEES.filter(e => e.status === 'ACTIVE').length
    const probation = EMPLOYEES.filter(e => e.status === 'PROBATION').length
    const buDist = {}
    EMPLOYEES.forEach(e => {
      buDist[e.bu] = (buDist[e.bu] || 0) + 1
    })
    return { total, active, probation, buDist }
  }, [])

  // 部门筛选选项
  const deptOptions = useMemo(() => {
    const depts = [...new Set(EMPLOYEES.map(e => e.dept))]
    return depts.map(d => ({ label: d, value: d }))
  }, [])

  // 筛选后的员工列表
  const filteredEmployees = useMemo(() => {
    return EMPLOYEES.filter(e => {
      const keyword = searchName.trim().toLowerCase()
      if (keyword && !e.name.toLowerCase().includes(keyword) && !e.empId.toLowerCase().includes(keyword)) return false
      if (filterDept && e.dept !== filterDept) return false
      if (filterBU && e.bu !== filterBU) return false
      return true
    })
  }, [searchName, filterDept, filterBU])

  // 重置筛选
  const handleReset = () => {
    setSearchName('')
    setFilterDept(undefined)
    setFilterBU(undefined)
  }

  // 表格列定义
  const columns = [
    {
      title: '工号',
      dataIndex: 'empId',
      key: 'empId',
      width: 100,
      render: (v) => <Text code>{v}</Text>
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (text, record) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{text}</span>
          {record.status === 'PROBATION' && <Tag color="orange">试用期</Tag>}
        </Space>
      )
    },
    {
      title: '部门',
      dataIndex: 'dept',
      key: 'dept',
      ellipsis: true,
    },
    {
      title: '岗位',
      dataIndex: 'position',
      key: 'position',
      width: 120,
    },
    {
      title: '板块',
      dataIndex: 'bu',
      key: 'bu',
      width: 110,
      render: (bu) => <BuTag bu={bu} />
    },
    {
      title: '职级',
      dataIndex: 'grade',
      key: 'grade',
      width: 70,
    },
    {
      title: '工作地',
      dataIndex: 'workLocation',
      key: 'workLocation',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => {
        const cfg = STATUS_CONFIG[status]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailEmp(record)}>
          查看详情
        </Button>
      )
    }
  ]

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: BRAND_COLORS.TEXT }}>员工档案管理</h2>
          <Text type="secondary" style={{ fontSize: 13 }}>
            管理全集团员工档案信息，支持按姓名、部门、板块筛选与查看{user ? ` · 当前操作员：${user.name}` : ''}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={handleReset}>重置筛选</Button>
      </div>

      {/* 顶部统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="总人数"
              value={stats.total}
              suffix="人"
              prefix={<TeamOutlined style={{ color: BRAND_COLORS.PRIMARY }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="在职"
              value={stats.active}
              suffix="人"
              prefix={<UserOutlined style={{ color: BRAND_COLORS.SUCCESS }} />}
              valueStyle={{ color: BRAND_COLORS.SUCCESS }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="试用期"
              value={stats.probation}
              suffix="人"
              prefix={<ClockCircleOutlined style={{ color: BRAND_COLORS.WARNING }} />}
              valueStyle={{ color: BRAND_COLORS.WARNING }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ApartmentOutlined style={{ color: BRAND_COLORS.PRIMARY }} />
              <span style={{ fontSize: 14, color: BRAND_COLORS.TEXT_MUTED }}>按板块分布</span>
            </div>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {Object.entries(stats.buDist).map(([bu, count]) => {
                const cfg = BU_CONFIG[bu] || { name: bu, color: BRAND_COLORS.TEXT_MUTED }
                return (
                  <div key={bu} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: BRAND_COLORS.TEXT }}>{cfg.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, marginLeft: 'auto' }}>{count}人</span>
                  </div>
                )
              })}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 筛选 + 员工表格 */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索姓名 / 工号"
            prefix={<SearchOutlined />}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            placeholder="按部门筛选"
            value={filterDept}
            onChange={setFilterDept}
            options={deptOptions}
            style={{ width: 240 }}
            allowClear
            showSearch
          />
          <Select
            placeholder="按板块筛选"
            value={filterBU}
            onChange={setFilterBU}
            options={Object.entries(BU_CONFIG).map(([k, v]) => ({ label: v.name, value: k }))}
            style={{ width: 160 }}
            allowClear
          />
        </Space>

        <Table
          columns={columns}
          dataSource={filteredEmployees}
          rowKey="empId"
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 960 }}
          size="middle"
        />
      </Card>

      {/* 员工详情弹窗 */}
      <Modal
        title="员工详情"
        open={!!detailEmp}
        onCancel={() => setDetailEmp(null)}
        footer={<Button onClick={() => setDetailEmp(null)}>关闭</Button>}
        width={640}
      >
        {detailEmp && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="工号">{detailEmp.empId}</Descriptions.Item>
            <Descriptions.Item label="姓名">{detailEmp.name}</Descriptions.Item>
            <Descriptions.Item label="入职日期">{detailEmp.entryDate}</Descriptions.Item>
            <Descriptions.Item label="转正日期">{detailEmp.regularDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="部门" span={2}>{detailEmp.dept}</Descriptions.Item>
            <Descriptions.Item label="岗位">{detailEmp.position}</Descriptions.Item>
            <Descriptions.Item label="职级">{detailEmp.grade}</Descriptions.Item>
            <Descriptions.Item label="所属板块"><BuTag bu={detailEmp.bu} /></Descriptions.Item>
            <Descriptions.Item label="工作地">{detailEmp.workLocation}</Descriptions.Item>
            <Descriptions.Item label="状态" span={2}>
              {(() => {
                const cfg = STATUS_CONFIG[detailEmp.status]
                return <Tag color={cfg.color}>{cfg.label}</Tag>
              })()}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}