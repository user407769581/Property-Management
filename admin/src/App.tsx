import { App as AntdApp, ConfigProvider, Spin } from 'antd'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { resourceConfigs } from './config/resources'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ResourcePage } from './pages/ResourcePage'
import { useAuthStore } from './stores/auth'

function RequireAuth() {
  const { token, hydrated } = useAuthStore()

  if (!hydrated) {
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

function HomeEntry() {
  const user = useAuthStore((state) => state.user)

  if (user?.role === 'super_admin') {
    return <DashboardPage />
  }

  const firstVisibleResource = resourceConfigs.find((item) => !item.roles || item.roles.includes(user?.role || ''))
  if (!firstVisibleResource) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={`/resource/${firstVisibleResource.key}`} replace />
}

export default function App() {
  const hydrate = useAuthStore((state) => state.hydrate)
  const token = useAuthStore((state) => state.token)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#C5A572',
          borderRadius: 10,
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomeEntry />} />
              <Route path="/resource/:key" element={<ResourcePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
