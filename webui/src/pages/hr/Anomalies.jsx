import React, { useState, useMemo } from 'react'
import { Card, Table, Button, Tag, Modal, Space, Statistic, Row, Col, Popconfirm, message, Descriptions } from 'antd'
import {
  ClockCircleOutlined,
  StopOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  UndoOutlined,
  CheckOutlined
} from '@ant-design/icons'
import { BRAND_COLORS } from '../../theme.js'
import { ANOMALIES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

// 异常类型配置：不同类型用不同颜色 Tag
const TYPE_CONFIG = {
  LATE: { label: '迟到', color: 'gold' },         // 黄色
  MISS_PUNCH: { label: '缺卡', color: 'orange' },  // 橙色
  ABSENT: { label: '旷工', color: 'red' },          // 红色
}

// 状态配置
const STATUS_CONFIG = {
  PENDING: { label: '待处理', color: 'orange' },
  RESOLVED: { label: '已处理', color: 'default' },
}

export default function AnomaliesPage() {
  const user = getCurrentUser()
  const [anomalies, setAnomalies] = useState(ANOMALIES)
  const [detail, setDetail] = useState(null)

  // 按类型统计
  const stats = useMemo(() => {
    const late = anomalies.filter(a => a.type === 'LATE').length
    const missPunch = anomalies.filter(a => a.type === 'MISS_PUNCH').length
    const absent = anomalies.filter(a => a.type === 'ABSENT').length
    const pending = anomalies.filter(a => a.status === 'PENDING').length
    return { late, missPunch, absent, pending }
  }, [anomalies])

  // 撤销扣款
  const handleRevokePenalty = (record) => {
    setAnomalies(prev => prev.map(a =>
      a.id === record.id ? { ...a, penalty: 0 } : a
    ))
    message.success(`已撤销 ${record.empName} 的扣款`)
  }

  // 标记已处理
  const handleResolve = (record) => {
    setAnomalies(prev => prev.map(a =>
      a.id === record.id ? { ...a, status: 'RESOLVED' } : a
    ))
    message.success(`已标记 ${record.empName} 的异常为已处理`)
  }

  // 表格列定义
  const columns = [
    { title: '工号', dataIndex: 'empId', key: 'empId', width: 100 },
    { title: '姓名', dataIndex: 'empName', key: 'empName', width: 90 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 90,
      render: (type) => {
        const cfg = TYPE_CONFIG[type]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      }
    },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '描述', dataIndex: 'desc', key: 'desc', ellipsis: true },
    {
      title: '扣款（元）', dataIndex: 'penalty', key: 'penalty', width: 100, align: 'right',
      render: (v) => v > 0
        ? <span style={{ color: BRAND_COLORS.ERROR }}>-{v}</span>
        : <span style={{ color: BRAND_COLORS.TEXT_MUTED }}>0</span>
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (status) => {
        const cfg = STATUS_CONFIG[status]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      }
    },
    {
      title: '操作', key: 'action', width: 230, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>
            查看
          </Button>
          <Popconfirm
            title="确认撤销此扣款？"
            description="撤销后扣款金额将归零"
            onConfirm={() => handleRevokePenalty(record)}
          >
            <Button type="link" size="small" icon={<UndoOutlined />} disabled={record.penalty === 0}>
              撤销扣款
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认标记为已处理？"
            onConfirm={() => handleResolve(record)}
          >
            <Button type="link" size="small" icon={<CheckOutlined />} disabled={record.status === 'RESOLVED'}>
              标记已处理
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: BRAND_COLORS.TEXT }}>考勤异常处理</h2>
        <span style={{ fontSize: 13, color: BRAND_COLORS.TEXT_MUTED }}>
          处理月度考勤异常记录，支持撤销扣款与状态流转{user ? ` · 当前操作员：${user.name}` : ''}
        </span>
      </div>

      {/* 顶部按类型统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="迟到次数"
              value={stats.late}
              suffix="次"
              prefix={<ClockCircleOutlined style={{ color: BRAND_COLORS.WARNING }} />}
              valueStyle={{ color: BRAND_COLORS.WARNING }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="缺卡次数"
              value={stats.missPunch}
              suffix="次"
              prefix={<StopOutlined style={{ color: BRAND_COLORS.PRIMARY }} />}
              valueStyle={{ color: BRAND_COLORS.PRIMARY }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="旷工次数"
              value={stats.absent}
              suffix="次"
              prefix={<WarningOutlined style={{ color: BRAND_COLORS.ERROR }} />}
              valueStyle={{ color: BRAND_COLORS.ERROR }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="待处理数"
              value={stats.pending}
              suffix="条"
              prefix={<ExclamationCircleOutlined style={{ color: stats.pending > 0 ? BRAND_COLORS.ERROR : BRAND_COLORS.TEXT_MUTED }} />}
              valueStyle={{ color: stats.pending > 0 ? BRAND_COLORS.ERROR : BRAND_COLORS.TEXT_MUTED }}
            />
          </Card>
        </Col>
      </Row>

      {/* 异常清单表格 */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
        <Table
          columns={columns}
          dataSource={anomalies}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1000 }}
          size="middle"
          rowClassName={(record) => record.status === 'PENDING' ? 'anomaly-pending-row' : 'anomaly-resolved-row'}
        />
        {/* 待处理高亮、已处理置灰的行样式 */}
        <style>{`
          .anomaly-pending-row > td {
            background: ${BRAND_COLORS.PRIMARY_LIGHT} !important;
          }
          .anomaly-resolved-row > td {
            color: ${BRAND_COLORS.TEXT_MUTED};
          }
        `}</style>
      </Card>

      {/* 异常详情弹窗 */}
      <Modal
        title="异常详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
        width={560}
      >
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="异常编号">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_CONFIG[detail.status].color}>{STATUS_CONFIG[detail.status].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="工号">{detail.empId}</Descriptions.Item>
            <Descriptions.Item label="姓名">{detail.empName}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={TYPE_CONFIG[detail.type].color}>{TYPE_CONFIG[detail.type].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="日期">{detail.date}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{detail.desc}</Descriptions.Item>
            <Descriptions.Item label="扣款金额" span={2}>
              {detail.penalty > 0 ? `${detail.penalty} 元` : '无扣款'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}