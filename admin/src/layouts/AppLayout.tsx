import { LogoutOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Typography } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { resourceConfigs } from '../config/resources'
import { formatEnumLabel } from '../lib/display'
import { useAuthStore } from '../stores/auth'

const { Header, Sider, Content } = Layout

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const currentRole = user?.role || ''
  const visibleResources = resourceConfigs.filter((item) => {
    if (currentRole === 'super_admin') {
      return !item.roles || item.roles.includes('super_admin')
    }
    return !item.roles || item.roles.includes(currentRole)
  })
  const canSeeDashboard = user?.role === 'super_admin'

  const selectedKey = useMemo(() => {
    if (!canSeeDashboard && location.pathname === '/') {
      return visibleResources[0]?.key || ''
    }
    // 必须用路径段精确匹配，不能用 includes：例如 housekeeping-orders 含子串 houses 会误匹配「房屋」菜单
    const m = location.pathname.match(/^\/resource\/([^/?#]+)\/?$/)
    const pathKey = m?.[1]
    if (pathKey) {
      const matched = visibleResources.find((item) => item.key === pathKey)
      if (matched) {
        return matched.key
      }
    }
    if (location.pathname === '/' || location.pathname === '') {
      return canSeeDashboard ? 'dashboard' : visibleResources[0]?.key || ''
    }
    return canSeeDashboard ? 'dashboard' : visibleResources[0]?.key || ''
  }, [canSeeDashboard, location.pathname, visibleResources])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} breakpoint="lg" collapsedWidth={72}>
        <div className="brand">物业管理后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            ...(canSeeDashboard
              ? [
                  {
                    key: 'dashboard',
                    icon: <Avatar size={20}>盘</Avatar>,
                    label: '总览',
                    onClick: () => navigate('/'),
                  },
                ]
              : []),
            ...visibleResources.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              onClick: () => navigate(`/resource/${item.key}`),
            })),
          ]}
        />
      </Sider>
      <Layout>
        <Header className="topbar">
          <Space align="center" size={16}>
            <div className="topbar-user">
              <Typography.Text strong className="topbar-user-name">
                {user?.name || '未登录用户'}
              </Typography.Text>
              <Typography.Text type="secondary" className="topbar-user-role">
                {formatEnumLabel(user?.role, 'role') || user?.role || ''}
              </Typography.Text>
            </div>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
            >
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 20 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
