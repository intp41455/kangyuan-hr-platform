import React from 'react'
import { Card, Row, Col, Statistic, Space, Typography, Button, List, Empty } from 'antd'
import {
  DollarOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
  BellOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { BRAND_COLORS } from '../../theme.js'
import { PAYSLIP, LEAVE_BALANCE, EMPLOYEES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Title, Text } = Typography

// 卡片通用样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12, marginBottom: 16 }
const cardBodyStyle = { padding: 24 }

export default function SelfHome() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  // 从员工档案中查找岗位
  const employee = EMPLOYEES.find((e) => e.empId === user?.empId)
  const position = employee?.position || '—'

  // 4 个快捷入口配置
  const quickEntries = [
    {
      key: 'payslip',
      title: '我的工资单',
      icon: <DollarOutlined />,
      desc: `${PAYSLIP.period} 期`,
      route: '/self/payslip',
      color: BRAND_COLORS.PRIMARY,
    },
    {
      key: 'annual',
      title: '年假余额',
      icon: <CalendarOutlined />,
      desc: `剩余 ${LEAVE_BALANCE.annual.remaining} 天`,
      route: '/self/leave',
      color: BRAND_COLORS.BU_FUZHI_EDU,
    },
    {
      key: 'comp',
      title: '调休余额',
      icon: <ClockCircleOutlined />,
      desc: `剩余 ${LEAVE_BALANCE.compTime.remaining} 小时`,
      route: '/self/leave',
      color: BRAND_COLORS.BU_QIXIANG,
    },
    {
      key: 'attendance',
      title: '考勤记录',
      icon: <CalendarOutlined />,
      desc: '本月考勤',
      route: '/self/attendance',
      color: BRAND_COLORS.WARNING,
    },
  ]

  // 待办提醒列表
  const todos = []
  // 调休即将过期
  if (LEAVE_BALANCE.compTime.remaining > 0) {
    todos.push({
      key: 'comp-expire',
      type: 'warning',
      title: '调休即将过期',
      desc: `剩余 ${LEAVE_BALANCE.compTime.remaining} 小时，将于 ${LEAVE_BALANCE.compTime.expireAt} 过期`,
      action: '去查看',
      route: '/self/leave',
    })
  }
  // 本月未确认工资单
  if (!PAYSLIP.confirmed) {
    todos.push({
      key: 'payslip-confirm',
      type: 'error',
      title: '本月工资单待确认',
      desc: `${PAYSLIP.period} 工资单尚未确认，实发 ¥${PAYSLIP.netPay.toFixed(2)}`,
      action: '去确认',
      route: '/self/payslip',
    })
  }

  return (
    <div>
      {/* 顶部欢迎卡片 */}
      <Card style={cardStyle} bodyStyle={cardBodyStyle}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: BRAND_COLORS.PRIMARY,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {user?.name?.charAt(0) || '员'}
              </div>
              <div>
                <Title level={4} style={{ margin: 0, color: BRAND_COLORS.TEXT }}>
                  {user?.name || '员工'}，欢迎回来
                </Title>
                <Space size={8} style={{ marginTop: 4 }}>
                  <Text type="secondary">{user?.dept || '—'}</Text>
                  <Text type="secondary">·</Text>
                  <Text type="secondary">{position}</Text>
                </Space>
              </div>
            </Space>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs().format('YYYY年M月D日 dddd')}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 4 个快捷入口卡片 */}
      <Row gutter={16}>
        {quickEntries.map((entry) => (
          <Col span={6} key={entry.key}>
            <Card
              hoverable
              style={{ ...cardStyle, cursor: 'pointer' }}
              bodyStyle={cardBodyStyle}
              onClick={() => navigate(entry.route)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space direction="vertical" size={4}>
                  <Text strong style={{ fontSize: 15, color: BRAND_COLORS.TEXT }}>{entry.title}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{entry.desc}</Text>
                </Space>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: `${entry.color}1A`,
                  color: entry.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}>
                  {entry.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 当月工资概览 + 待办提醒 */}
      <Row gutter={16}>
        <Col span={16}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle} title={`${PAYSLIP.period} 工资概览`}>
            <Row gutter={16}>
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
                <Statistic
                  title="实发合计"
                  prefix="¥"
                  value={PAYSLIP.netPay}
                  precision={2}
                  valueStyle={{ color: BRAND_COLORS.PRIMARY, fontSize: 24, fontWeight: 700 }}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button type="link" onClick={() => navigate('/self/payslip')}>
                查看工资单明细 <RightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle} title={<Space><BellOutlined /> 待办提醒</Space>}>
            {todos.length === 0 ? (
              <Empty description="暂无待办" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                itemLayout="horizontal"
                dataSource={todos}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="action" type="link" size="small" onClick={() => navigate(item.route)}>
                        {item.action}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <ExclamationCircleOutlined style={{
                          fontSize: 20,
                          color: item.type === 'error' ? BRAND_COLORS.ERROR : BRAND_COLORS.WARNING,
                        }} />
                      }
                      title={<Text strong style={{ fontSize: 13 }}>{item.title}</Text>}
                      description={<Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
