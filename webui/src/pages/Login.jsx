import React, { useState } from 'react'
import { Card, Form, Input, Button, Radio, Space, Typography, Divider, App } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { BRAND_COLORS } from '../theme.js'
import { mockLogin } from '../mock/auth.js'

const { Title, Text, Link } = Typography

const DEMO_USERS = [
  { empId: 'EMP001', label: '王宁（HR 总监）', role: 'HR_ADMIN' },
  { empId: 'EMP002', label: '李明（高管）', role: 'EXECUTIVE' },
  { empId: 'EMP003', label: '张三（普通员工）', role: 'EMPLOYEE' }
]

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { message } = App.useApp()

  const handleLogin = (empId) => {
    setLoading(true)
    setTimeout(() => {
      const user = mockLogin(empId)
      message.success(`欢迎回来，${user.name}`)
      // 按角色跳转
      const target = user.role === 'EMPLOYEE' ? '/self' : (user.role === 'EXECUTIVE' ? '/dashboard/overview' : '/hr/employees')
      navigate(target)
      setLoading(false)
    }, 400)
  }

  const onFinish = (values) => {
    handleLogin(values.empId)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${BRAND_COLORS.PRIMARY} 0%, #993D00 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <Card
        style={{
          width: 420,
          maxWidth: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
        }}
        bodyStyle={{ padding: 32 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: BRAND_COLORS.PRIMARY,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 28,
            marginBottom: 12
          }}>康</div>
          <Title level={4} style={{ margin: 0, color: BRAND_COLORS.TEXT }}>
            康源智慧人资平台
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            陕西省康源投资集团有限公司
          </Text>
        </div>

        <Form
          name="login"
          layout="vertical"
          initialValues={{ empId: 'EMP001' }}
          onFinish={onFinish}
        >
          <Form.Item label="选择登录身份（演示用）" name="empId">
            <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
              {DEMO_USERS.map(u => (
                <Radio.Button
                  key={u.empId}
                  value={u.empId}
                  style={{ width: '100%', marginBottom: 8, borderRadius: 6 }}
                >
                  {u.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{ marginTop: 8 }}
            >
              进入平台
            </Button>
          </Form.Item>
        </Form>

        <Divider plain style={{ margin: '16px 0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>或</Text>
        </Divider>

        <Button
          block
          size="large"
          onClick={() => message.info('钉钉免登：实际部署时自动调用 dingtalk-jsapi')}
        >
          使用钉钉免登
        </Button>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            提示：生产环境通过钉钉容器自动鉴权，无需手动登录
          </Text>
        </div>
      </Card>
    </div>
  )
}
