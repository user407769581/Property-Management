import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

import { http } from '../lib/http'
import { useAuthStore } from '../stores/auth'

interface LoginForm {
  username: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const { message } = App.useApp()

  const handleSubmit = async (values: LoginForm) => {
    try {
      const result = await http.post('/api/admin/auth/login', values) as {
        data: {
          token: string
          user: {
            id: string
            username: string
            role: string
            name: string
          }
        }
      }
      setSession(result.data.token, result.data.user)
      message.success('登录成功')
      navigate('/', { replace: true })
    } catch (error) {
      message.error('账号或密码错误，请重新输入')
      console.error(error)
    }
  }

  return (
    <div className="login-shell">
      <Card className="login-card" variant="borderless">
        <Typography.Title level={2}>物业管理后台</Typography.Title>
        <Typography.Paragraph type="secondary">
          首次请使用系统初始化账号登录，并在账号管理中及时修改密码。
        </Typography.Paragraph>
        <Form<LoginForm> layout="vertical" initialValues={{ username: 'admin' }} onFinish={handleSubmit}>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="请输入账号" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
