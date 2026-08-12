import React, { useState, useMemo } from 'react'
import { Card, Table, Button, Tag, Modal, Space, Statistic, Row, Col, message } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  HistoryOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { BRAND_COLORS } from '../../theme.js'
import { RULES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

// 风险等级配置：不同风险用不同颜色 Tag
const RISK_CONFIG = {
  OK: { label: '合规', color: 'green' },     // 绿色
  MID: { label: '中风险', color: 'gold' },    // 黄色
  HIGH: { label: '高风险', color: 'red' },    // 红色
}

export default function RulesPage() {
  const user = getCurrentUser()
  const [modalVisible, setModalVisible] = useState(false)
  const [modalContent, setModalContent] = useState({ title: '', body: '' })

  // 统计数据
  const stats = useMemo(() => {
    const total = RULES.length
    const ok = RULES.filter(r => r.risk === 'OK').length
    const risk = RULES.filter(r => r.risk !== 'OK').length
    return { total, ok, risk }
  }, [])

  // 新增规则
  const handleAdd = () => {
    setModalContent({
      title: '新增规则',
      body: '实际部署时打开编辑表单，支持新增薪酬、考勤、假期等规则，并配置规则模式、风险等级与来源。'
    })
    setModalVisible(true)
  }

  // 编辑规则
  const handleEdit = (record) => {
    setModalContent({
      title: `编辑规则 - ${record.rCode}`,
      body: `实际部署时打开编辑表单，可修改规则「${record.name}」的名称、模式、描述、风险等级等字段。`
    })
    setModalVisible(true)
  }

  // 查看历史版本
  const handleHistory = (record) => {
    setModalContent({
      title: `历史版本 - ${record.rCode}`,
      body: `实际部署时打开版本历史面板，支持查看规则「${record.name}」的变更记录与回滚操作。`
    })
    setModalVisible(true)
  }

  // 表格列定义
  const columns = [
    {
      title: '规则编号', dataIndex: 'rCode', key: 'rCode', width: 100,
      render: (v) => <span style={{ fontFamily: 'monospace', color: BRAND_COLORS.PRIMARY, fontWeight: 600 }}>{v}</span>
    },
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '类别', dataIndex: 'category', key: 'category', width: 100 },
    {
      title: '模式', dataIndex: 'mode', key: 'mode', width: 140,
      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
    },
    { title: '描述', dataIndex: 'desc', key: 'desc', ellipsis: true },
    {
      title: '风险', dataIndex: 'risk', key: 'risk', width: 90,
      render: (risk) => {
        const cfg = RISK_CONFIG[risk]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      }
    },
    { title: '来源', dataIndex: 'source', key: 'source', width: 160, ellipsis: true },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => handleHistory(record)}>
            历史版本
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: BRAND_COLORS.TEXT }}>规则配置中心</h2>
          <span style={{ fontSize: 13, color: BRAND_COLORS.TEXT_MUTED }}>
            管理薪酬、考勤、假期等核算规则，支持版本追溯与风险标记{user ? ` · 当前操作员：${user.name}` : ''}
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增规则
        </Button>
      </div>

      {/* 顶部统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="规则总数"
              value={stats.total}
              suffix="条"
              prefix={<SettingOutlined style={{ color: BRAND_COLORS.PRIMARY }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="合规规则数"
              value={stats.ok}
              suffix="条"
              prefix={<CheckCircleOutlined style={{ color: BRAND_COLORS.SUCCESS }} />}
              valueStyle={{ color: BRAND_COLORS.SUCCESS }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
            <Statistic
              title="风险规则数"
              value={stats.risk}
              suffix="条"
              prefix={<WarningOutlined style={{ color: BRAND_COLORS.ERROR }} />}
              valueStyle={{ color: BRAND_COLORS.ERROR }}
            />
          </Card>
        </Col>
      </Row>

      {/* 规则列表表格 */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 24 }}>
        <Table
          columns={columns}
          dataSource={RULES}
          rowKey="rCode"
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </Card>

      {/* 操作提示弹窗 */}
      <Modal
        title={modalContent.title}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={<Button type="primary" onClick={() => setModalVisible(false)}>知道了</Button>}
        width={480}
      >
        <div style={{ padding: '8px 0', fontSize: 14, color: BRAND_COLORS.TEXT, lineHeight: 1.8 }}>
          {modalContent.body}
        </div>
      </Modal>
    </div>
  )
}