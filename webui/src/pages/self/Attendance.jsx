import React, { useState } from 'react'
import {
  Card, Row, Col, Statistic, Table, Tag, Button, Modal, Form, Input, Select,
  DatePicker, Space, Typography, message,
} from 'antd'
import { EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND_COLORS } from '../../theme.js'
import { ANOMALIES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Text } = Typography

// 卡片通用样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12, marginBottom: 16 }
const cardBodyStyle = { padding: 24 }

// 异常类型映射：LATE 黄、MISS_PUNCH 橙、ABSENT 红
const anomalyTypeMap = {
  LATE: { text: '迟到', color: 'gold' },
  MISS_PUNCH: { text: '缺卡', color: 'orange' },
  ABSENT: { text: '旷工', color: 'red' },
}

// 状态映射
const statusMap = {
  PENDING: { text: '待处理', color: 'warning' },
  RESOLVED: { text: '已处理', color: 'success' },
}

// 补卡类型选项
const PUNCH_TYPE_OPTIONS = [
  { label: '上班补卡', value: 'CLOCK_IN' },
  { label: '下班补卡', value: 'CLOCK_OUT' },
  { label: '全天补卡', value: 'ALL_DAY' },
]

export default function SelfAttendance() {
  const user = getCurrentUser()
  const [appealOpen, setAppealOpen] = useState(false)
  const [form] = Form.useForm()

  // 过滤当前员工的异常
  const myAnomalies = ANOMALIES.filter((a) => a.empId === user?.empId)

  // 本月考勤统计
  const lateCount = myAnomalies.filter((a) => a.type === 'LATE').length
  const missPunchCount = myAnomalies.filter((a) => a.type === 'MISS_PUNCH').length
  const absentCount = myAnomalies.filter((a) => a.type === 'ABSENT').length
  const shouldAttendDays = 22 // 本月应出勤天数（Mock）
  const actualAttendDays = shouldAttendDays - absentCount

  // 提交补卡申请
  const handleAppeal = () => {
    form.validateFields().then(() => {
      message.success('补卡申请已提交，等待审批')
      setAppealOpen(false)
      form.resetFields()
    })
  }

  // 异常表格列
  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (d) => dayjs(d).format('M月D日'),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (t) => <Tag color={anomalyTypeMap[t]?.color}>{anomalyTypeMap[t]?.text || t}</Tag>,
    },
    { title: '描述', dataIndex: 'desc', key: 'desc' },
    {
      title: '扣款',
      dataIndex: 'penalty',
      key: 'penalty',
      render: (p) => (p > 0 ? <Text type="danger">-¥{p.toFixed(2)}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag>,
    },
  ]

  return (
    <div>
      {/* 顶部本月考勤统计 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic title="应出勤天数" value={shouldAttendDays} suffix="天" />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic title="实际出勤天数" value={actualAttendDays} suffix="天" valueStyle={{ color: BRAND_COLORS.SUCCESS }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic title="迟到次数" value={lateCount} suffix="次" valueStyle={{ color: BRAND_COLORS.WARNING }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic title="缺卡次数" value={missPunchCount} suffix="次" valueStyle={{ color: BRAND_COLORS.WARNING }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic title="旷工天数" value={absentCount} suffix="天" valueStyle={{ color: BRAND_COLORS.ERROR }} />
          </Card>
        </Col>
      </Row>

      {/* 本月异常清单 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle}>
        <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
          <Col>
            <Text strong style={{ fontSize: 16 }}>本月异常清单</Text>
          </Col>
          <Col>
            <Button type="primary" icon={<EditOutlined />} onClick={() => setAppealOpen(true)}>
              补卡申请
            </Button>
          </Col>
        </Row>
        <Table
          columns={columns}
          dataSource={myAnomalies}
          rowKey="id"
          pagination={false}
          size="middle"
          locale={{ emptyText: '本月暂无考勤异常' }}
        />
      </Card>

      {/* 补卡申请 Modal */}
      <Modal
        title="补卡申请"
        open={appealOpen}
        onCancel={() => setAppealOpen(false)}
        onOk={handleAppeal}
        okText="提交申请"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="补卡日期" rules={[{ required: true, message: '请选择补卡日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="补卡类型" rules={[{ required: true, message: '请选择补卡类型' }]}>
            <Select options={PUNCH_TYPE_OPTIONS} placeholder="请选择补卡类型" />
          </Form.Item>
          <Form.Item name="reason" label="补卡原因" rules={[{ required: true, message: '请填写补卡原因' }]}>
            <Input.TextArea rows={3} placeholder="请说明补卡原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
