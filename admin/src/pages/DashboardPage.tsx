import { App, Card, Col, Row, Statistic, Table, Typography } from 'antd'
import { useEffect, useState } from 'react'

import { http } from '../lib/http'

interface DashboardCard {
  key: string
  label: string
  value: number
}

interface OperationLog {
  id: string
  module: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export function DashboardPage() {
  const [cards, setCards] = useState<DashboardCard[]>([])
  const [logs, setLogs] = useState<OperationLog[]>([])
  const { message } = App.useApp()

  useEffect(() => {
    const load = async () => {
      try {
        const result = await http.get('/api/admin/dashboard/overview') as {
          data: {
            cards: DashboardCard[]
            recentOperations: OperationLog[]
          }
        }
        setCards(result.data.cards)
        setLogs(result.data.recentOperations)
      } catch (error) {
        message.error('仪表盘加载失败')
        console.error(error)
      }
    }

    void load()
  }, [])

  return (
    <Row gutter={[16, 16]}>
      {cards.map((item) => (
        <Col key={item.key} xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title={item.label} value={item.value} />
          </Card>
        </Col>
      ))}
      <Col span={24}>
        <Card title="最近操作">
          <Table<OperationLog>
            rowKey="id"
            pagination={false}
            dataSource={logs}
            columns={[
              {
                title: '模块',
                dataIndex: 'module',
                key: 'module',
              },
              {
                title: '动作',
                dataIndex: 'action',
                key: 'action',
              },
              {
                title: '详情',
                key: 'detail',
                render: (_, item) => (
                  <Typography.Text type="secondary">
                    {item.operator} · {item.detail}
                  </Typography.Text>
                ),
              },
              {
                title: '时间',
                key: 'createdAt',
                render: (_, item) => new Date(item.createdAt).toLocaleString(),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
