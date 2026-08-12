import React, { useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Button, Space, theme } from 'antd'
import {
  HomeOutlined,
  TeamOutlined,
  DollarOutlined,
  SettingOutlined,
  AlertOutlined,
  DashboardOutlined,
  UserOutlined,
  CalendarOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { BRAND_COLORS } from '../theme.js'
import { getCurrentUser, mockLogout, hasPermission } from '../mock/auth.js'

const { Header, Sider, Content } = Layout

// 按用户角色返回菜单
function getMenuItems(user) {
  const items = []
  if (hasPermission(user, 'self:read')) {
    items.push({
      key: '/self',
      icon: <HomeOutlined />,
      label: '我的首页',
      children: [
        { key: '/self/payslip', icon: <DollarOutlined />, label: '我的工资单' },
        { key: '/self/leave', icon: <CalendarOutlined />, label: '我的假期余额' },
        { key: '/self/attendance', icon: <CalendarOutlined />, label: '我的考勤' }
      ]
    })
  }
  if (hasPermission(user, 'hr:read')) {
    items.push({
      key: '/hr',
      icon: <TeamOutlined />,
      label: 'HR 管理',
      children: [
        { key: '/hr/employees', icon: <TeamOutlined />, label: '员工档案' },
        { key: '/hr/payroll', icon: <DollarOutlined />, label: '月度核算' },
        { key: '/hr/anomalies', icon: <AlertOutlined />, label: '异常处理' },
        { key: '/hr/rules', icon: <SettingOutlined />, label: '规则配置' }
      ]
    })
  }
  if (hasPermission(user, 'dashboard:read')) {
    items.push({
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '高管驾驶舱',
      children: [
        { key: '/dashboard/overview', icon: <DashboardOutlined />, label: '集团总览' },
        { key: '/dashboard/bu', icon: <TeamOutlined />, label: '板块对比' },
        { key: '/dashboard/compliance', icon: <AlertOutlined />, label: '合规风险' }
      ]
    })
  }
  return items
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = getCurrentUser()
  const { token } = theme.useToken()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // 选中状态：匹配最长前缀
  const selectedKeys = [location.pathname]
  const openKeys = ['/' + location.pathname.split('/')[1]]

  const handleMenuClick = ({ key }) => {
    navigate(key)
  }

  const handleLogout = () => {
    mockLogout()
    navigate('/login')
  }

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: `${user.name} · ${user.dept}`
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout
      }
    ]
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{
          background: '#FFFFFF',
          borderRight: `1px solid ${BRAND_COLORS.BORDER}`,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto'
        }}
      >
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 20px',
          borderBottom: `1px solid ${BRAND_COLORS.BORDER}`
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: BRAND_COLORS.PRIMARY,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            marginRight: collapsed ? 0 : 10,
            flexShrink: 0
          }}>康</div>
          {!collapsed && (
            <div style={{ lineHeight: '20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND_COLORS.TEXT }}>康源智慧人资</div>
              <div style={{ fontSize: 10, color: BRAND_COLORS.TEXT_MUTED }}>v1.0.0</div>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={getMenuItems(user)}
          onClick={handleMenuClick}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#FFFFFF',
          borderBottom: `1px solid ${BRAND_COLORS.BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <span style={{ fontSize: 14, color: BRAND_COLORS.TEXT_MUTED }}>
              欢迎回来，{user.name}
            </span>
          </Space>
          <Space size={16}>
            <Button type="text" icon={<BellOutlined />} />
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: BRAND_COLORS.PRIMARY }} size={32}>
                  {user.name?.charAt(0)}
                </Avatar>
                <span style={{ fontSize: 13 }}>{user.name}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          padding: 24,
          background: BRAND_COLORS.PRIMARY_BG,
          minHeight: 'calc(100vh - 56px)'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
