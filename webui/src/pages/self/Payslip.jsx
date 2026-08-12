import React, { useState } from 'react'
import {
  Card, Row, Col, Statistic, Tag, Button, Modal, Form, Input, Select,
  Space, Typography, message,
} from 'antd'
import {
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND_COLORS } from '../../theme.js'
import { PAYSLIP } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Text } = Typography
const { TextArea } = Input

// 卡片通用样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12, marginBottom: 16 }
const cardBodyStyle = { padding: 24 }

// 可选月份（Mock，实际对接后端后会动态拉取）
const PERIOD_OPTIONS = ['2026-06', '2026-07', '2026-08'].map((p) => ({ label: p, value: p }))

// 金额格式化：正数前缀 +¥，负数前缀 -¥
function formatMoney(amount) {
  const abs = Math.abs(amount).toFixed(2)
  return amount >= 0 ? `+¥${abs}` : `-¥${abs}`
}

export default function SelfPayslip() {
  const user = getCurrentUser()
  const [period, setPeriod] = useState(PAYSLIP.period)
  const [confirmed, setConfirmed] = useState(PAYSLIP.confirmed)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeForm] = Form.useForm()

  // 按 category 分组工资项
  const incomeItems = PAYSLIP.items.filter((i) => i.category === '应发')
  const deductionItems = PAYSLIP.items.filter((i) => i.category === '扣款')
  const insuranceItems = PAYSLIP.items.filter((i) => i.category === '社保' || i.category === '个税')

  // 确认工资单
  const handleConfirm = () => {
    setConfirmed(true)
    message.success('工资单已确认')
  }

  // 提交异议
  const handleDisputeSubmit = () => {
    disputeForm.validateFields().then(() => {
      message.success('异议已提交，HR 将尽快处理')
      setDisputeOpen(false)
      disputeForm.resetFields()
    })
  }

  // 渲染单列工资项
  const renderColumn = (title, items, color) => (
    <div>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: BRAND_COLORS.TEXT_MUTED,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${BRAND_COLORS.BORDER}`,
      }}>
        {title}
      </div>
      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
          }}
        >
          <Text style={{ fontSize: 13, color: BRAND_COLORS.TEXT }}>{item.name}</Text>
          <Text style={{ fontSize: 13, color, fontWeight: 500, fontFamily: 'monospace' }}>
            {formatMoney(item.amount)}
          </Text>
        </div>
      ))}
    </div>
  )

  // 格式化所属期显示
  const periodLabel = dayjs(PAYSLIP.period + '-01').format('YYYY年M月')

  return (
    <div>
      {/* 顶部周期切换 + 操作按钮 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16}>
              <Text strong style={{ fontSize: 16 }}>我的工资单</Text>
              <Select
                value={period}
                onChange={setPeriod}
                options={PERIOD_OPTIONS}
                style={{ width: 140 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ExclamationCircleOutlined />} onClick={() => setDisputeOpen(true)}>
                我有异议
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirm}
                disabled={confirmed}
              >
                {confirmed ? '已确认' : '确认工资单'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 工资单主体 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle}>
        {/* 顶部信息：员工名、所属期、状态 */}
        <Row align="middle" justify="space-between" style={{ marginBottom: 24 }}>
          <Col>
            <Space size={32}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>员工姓名</Text>
                <div style={{ fontSize: 16, fontWeight: 600, color: BRAND_COLORS.TEXT }}>
                  {PAYSLIP.empName}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>所属期间</Text>
                <div style={{ fontSize: 16, fontWeight: 600, color: BRAND_COLORS.TEXT }}>
                  {periodLabel}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>工号</Text>
                <div style={{ fontSize: 16, fontWeight: 600, color: BRAND_COLORS.TEXT }}>
                  {PAYSLIP.empId}
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Tag
              color={confirmed ? 'success' : 'warning'}
              icon={confirmed ? <CheckCircleOutlined /> : <WarningOutlined />}
              style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6 }}
            >
              {confirmed ? '已确认' : '待确认'}
            </Tag>
          </Col>
        </Row>

        {/* 三列布局：应发项 / 扣款项 / 社保个税 */}
        <Row gutter={24}>
          <Col span={8}>{renderColumn('应发项', incomeItems, BRAND_COLORS.SUCCESS)}</Col>
          <Col span={8}>{renderColumn('扣款项', deductionItems, BRAND_COLORS.ERROR)}</Col>
          <Col span={8}>{renderColumn('社保 / 个税', insuranceItems, BRAND_COLORS.ERROR)}</Col>
        </Row>

        {/* 底部汇总：应发合计、扣款合计、实发合计（大字号高亮） */}
        <div style={{
          marginTop: 24,
          paddingTop: 24,
          borderTop: `2px solid ${BRAND_COLORS.BORDER}`,
        }}>
          <Row gutter={24} align="middle">
            <Col span={8}>
              <Statistic title="应发合计" prefix="¥" value={PAYSLIP.grossPay} precision={2} />
            </Col>
            <Col span={8}>
              <Statistic
                title="扣款合计"
                prefix="-¥"
                value={PAYSLIP.totalDeduction}
                precision={2}
                valueStyle={{ color: BRAND_COLORS.ERROR }}
              />
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'right' }}>
                <Statistic
                  title="实发合计"
                  prefix="¥"
                  value={PAYSLIP.netPay}
                  precision={2}
                  valueStyle={{ color: BRAND_COLORS.PRIMARY, fontSize: 24, fontWeight: 700 }}
                />
              </div>
            </Col>
          </Row>
        </div>
      </Card>

      {/* 异议 Modal */}
      <Modal
        title="提交工资单异议"
        open={disputeOpen}
        onCancel={() => setDisputeOpen(false)}
        onOk={handleDisputeSubmit}
        okText="提交异议"
        cancelText="取消"
      >
        <Form form={disputeForm} layout="vertical">
          <Form.Item
            name="dispute"
            label="异议说明"
            rules={[{ required: true, message: '请填写异议说明' }]}
          >
            <TextArea
              rows={4}
              placeholder="请详细描述您对工资单的异议内容，如金额计算、扣款项目等..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
