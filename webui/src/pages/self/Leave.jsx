import React, { useState } from 'react'
import {
  Card, Row, Col, Progress, Button, Modal, Form, Input, Select, DatePicker,
  Upload, Table, Tag, Space, Typography, message,
} from 'antd'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND_COLORS } from '../../theme.js'
import { LEAVE_BALANCE } from '../../mock/data.js'

const { Text } = Typography
const { RangePicker } = DatePicker

// 卡片通用样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12, marginBottom: 16 }
const cardBodyStyle = { padding: 24 }

// 最近请假记录 Mock 数据
const LEAVE_RECORDS = [
  { id: 'L001', type: '年假', startDate: '2026-07-15', endDate: '2026-07-16', days: 2, status: 'APPROVED', approver: '王宁' },
  { id: 'L002', type: '事假', startDate: '2026-08-03', endDate: '2026-08-03', days: 1, status: 'APPROVED', approver: '王宁' },
  { id: 'L003', type: '病假', startDate: '2026-06-20', endDate: '2026-06-20', days: 0.5, status: 'REJECTED', approver: '王宁' },
]

// 假种选项
const LEAVE_TYPE_OPTIONS = [
  { label: '年假', value: 'ANNUAL' },
  { label: '调休', value: 'COMP' },
  { label: '病假', value: 'SICK' },
  { label: '事假', value: 'PERSONAL' },
]

// 状态映射
const statusMap = {
  APPROVED: { text: '已批准', color: 'success' },
  PENDING: { text: '审批中', color: 'processing' },
  REJECTED: { text: '已驳回', color: 'error' },
}

export default function SelfLeave() {
  const [applyOpen, setApplyOpen] = useState(false)
  const [form] = Form.useForm()

  // 调休过期预警（过期前 14 天）
  const compExpireDate = dayjs(LEAVE_BALANCE.compTime.expireAt)
  const daysToExpire = compExpireDate.diff(dayjs(), 'day')
  const compWarning = daysToExpire <= 14 && LEAVE_BALANCE.compTime.remaining > 0

  // 环形进度百分比
  const annualPercent = Math.round((LEAVE_BALANCE.annual.used / LEAVE_BALANCE.annual.total) * 100)
  const compPercent = Math.round((LEAVE_BALANCE.compTime.used / LEAVE_BALANCE.compTime.total) * 100)

  // 提交请假申请
  const handleApply = () => {
    form.validateFields().then(() => {
      message.success('请假申请已提交，等待审批')
      setApplyOpen(false)
      form.resetFields()
    })
  }

  // 请假记录表格列
  const columns = [
    { title: '假种', dataIndex: 'type', key: 'type', render: (t) => <Tag>{t}</Tag> },
    { title: '开始日期', dataIndex: 'startDate', key: 'startDate' },
    { title: '结束日期', dataIndex: 'endDate', key: 'endDate' },
    { title: '天数', dataIndex: 'days', key: 'days', render: (d) => `${d} 天` },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag>,
    },
    { title: '审批人', dataIndex: 'approver', key: 'approver' },
  ]

  return (
    <div>
      {/* 顶部标题 + 申请按钮 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle}>
        <Row align="middle" justify="space-between">
          <Col>
            <Text strong style={{ fontSize: 16 }}>我的假期余额</Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplyOpen(true)}>
              申请请假
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 4 个假期余额卡片 */}
      <Row gutter={16}>
        {/* 年假 */}
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>年假余额</Text>
              <Progress
                type="circle"
                percent={annualPercent}
                size={100}
                strokeColor={BRAND_COLORS.PRIMARY}
                format={() => (
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.PRIMARY }}>
                      {LEAVE_BALANCE.annual.remaining}
                    </div>
                    <div style={{ fontSize: 10, color: BRAND_COLORS.TEXT_MUTED }}>剩余天</div>
                  </div>
                )}
                style={{ margin: '12px 0' }}
              />
              <div style={{ fontSize: 12, color: BRAND_COLORS.TEXT_MUTED }}>
                总额 {LEAVE_BALANCE.annual.total} 天 / 已用 {LEAVE_BALANCE.annual.used} 天
              </div>
              <div style={{ fontSize: 11, color: BRAND_COLORS.WARNING, marginTop: 4 }}>
                过期日：{LEAVE_BALANCE.annual.expireDate}
              </div>
            </div>
          </Card>
        </Col>

        {/* 调休 */}
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>调休余额</Text>
              <Progress
                type="circle"
                percent={compPercent}
                size={100}
                strokeColor={compWarning ? BRAND_COLORS.ERROR : BRAND_COLORS.BU_QIXIANG}
                format={() => (
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: compWarning ? BRAND_COLORS.ERROR : BRAND_COLORS.BU_QIXIANG }}>
                      {LEAVE_BALANCE.compTime.remaining}
                    </div>
                    <div style={{ fontSize: 10, color: BRAND_COLORS.TEXT_MUTED }}>剩余小时</div>
                  </div>
                )}
                style={{ margin: '12px 0' }}
              />
              <div style={{ fontSize: 12, color: BRAND_COLORS.TEXT_MUTED }}>
                总额 {LEAVE_BALANCE.compTime.total}h / 已用 {LEAVE_BALANCE.compTime.used}h
              </div>
              <div style={{ fontSize: 11, color: compWarning ? BRAND_COLORS.ERROR : BRAND_COLORS.WARNING, marginTop: 4 }}>
                过期日：{LEAVE_BALANCE.compTime.expireAt}
                {compWarning && '（即将过期）'}
              </div>
            </div>
          </Card>
        </Col>

        {/* 病假 */}
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>病假</Text>
              <div style={{
                margin: '12px 0',
                fontSize: 32,
                fontWeight: 700,
                color: BRAND_COLORS.BU_FUZHI_EDU,
              }}>
                {LEAVE_BALANCE.sick.used}
                <span style={{ fontSize: 14, color: BRAND_COLORS.TEXT_MUTED, fontWeight: 400 }}> 天</span>
              </div>
              <Tag color="blue" style={{ marginBottom: 8 }}>本年已用 · 带薪</Tag>
              <div style={{ fontSize: 11, color: BRAND_COLORS.TEXT_MUTED, marginTop: 4 }}>
                有病历扣 20%，无病历按事假
              </div>
            </div>
          </Card>
        </Col>

        {/* 事假 */}
        <Col span={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>事假</Text>
              <div style={{
                margin: '12px 0',
                fontSize: 32,
                fontWeight: 700,
                color: BRAND_COLORS.WARNING,
              }}>
                {LEAVE_BALANCE.personal.used}
                <span style={{ fontSize: 14, color: BRAND_COLORS.TEXT_MUTED, fontWeight: 400 }}> 天</span>
              </div>
              <Tag color="orange" style={{ marginBottom: 8 }}>本月已用</Tag>
              <div style={{ fontSize: 11, color: BRAND_COLORS.TEXT_MUTED, marginTop: 4 }}>
                事假按日工资 100% 扣款
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 最近请假记录 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle} title="最近请假记录">
        <Table
          columns={columns}
          dataSource={LEAVE_RECORDS}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      </Card>

      {/* 申请请假 Modal */}
      <Modal
        title="申请请假"
        open={applyOpen}
        onCancel={() => setApplyOpen(false)}
        onOk={handleApply}
        okText="提交申请"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="假种" rules={[{ required: true, message: '请选择假种' }]}>
            <Select options={LEAVE_TYPE_OPTIONS} placeholder="请选择假种" />
          </Form.Item>
          <Form.Item name="range" label="起止日期" rules={[{ required: true, message: '请选择起止日期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="请假原因" rules={[{ required: true, message: '请填写请假原因' }]}>
            <Input.TextArea rows={3} placeholder="请说明请假原因" />
          </Form.Item>
          <Form.Item name="attachment" label="附件（病假需上传病历）">
            <Upload beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>点击上传</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
