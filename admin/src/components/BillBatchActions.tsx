import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'

import { http } from '../lib/http'

type RecordItem = Record<string, unknown>

interface OptionItem {
  label: string
  value: string
}

interface HouseOption {
  id: string
  roomNo: string
  ownerTypeName: string
}

interface ArrearsFormValues {
  buildingId?: string
  month: Dayjs
  items: Array<{
    houseId: string
    amount?: number
  }>
}

interface BillBatchActionsProps {
  onSuccess: () => Promise<void>
}

const getCurrentMonth = () => dayjs().startOf('month')

export function BillBatchActions({ onSuccess }: BillBatchActionsProps) {
  const [buildingOptions, setBuildingOptions] = useState<OptionItem[]>([])
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [arrearsOpen, setArrearsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [arrearsForm] = Form.useForm<ArrearsFormValues>()
  const { message } = App.useApp()

  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const result = await http.get('/api/admin/buildings') as { data: RecordItem[] }
        setBuildingOptions(
          result.data.map((item) => ({
            label: String(item.name || ''),
            value: String(item.id || ''),
          })),
        )
      } catch (error) {
        message.error('楼栋列表加载失败')
        console.error(error)
      }
    }

    void loadBuildings()
  }, [message])

  const loadHouses = async (buildingId: string) => {
    const result = await http.get('/api/admin/houses', {
      params: { buildingId },
    }) as { data: RecordItem[] }
    const rows = result.data.map((item) => ({
      id: String(item.id || ''),
      roomNo: String(item.roomNo || ''),
      ownerTypeName: String(item.ownerTypeName || ''),
    }))
    setHouses(rows)
    arrearsForm.setFieldsValue({
      items: rows.map((item) => ({
        houseId: item.id,
        amount: undefined,
      })),
    })
  }

  const openArrearsModal = () => {
    setHouses([])
    arrearsForm.setFieldsValue({
      month: getCurrentMonth(),
      items: [],
    })
    setArrearsOpen(true)
  }

  const handleImportArrears = async () => {
    const values = await arrearsForm.validateFields()
    const items = (values.items || [])
      .filter((item) => Number(item.amount || 0) > 0)
      .map((item, index) => ({
        houseId: item.houseId,
        amount: Number(item.amount || 0),
        title: `${values.month.format('YYYY-MM')}历史欠费-${houses[index]?.roomNo || ''}`,
      }))

    if (!items.length) {
      message.warning('请至少填写一户欠费金额')
      return
    }

    setSubmitting(true)
    try {
      const result = await http.post('/api/admin/bills/import-arrears', {
        buildingId: values.buildingId || undefined,
        month: values.month.format('YYYY-MM'),
        items,
      }) as { data: { createdCount: number } }
      message.success(`已补录 ${result.data.createdCount} 条欠费`)
      setArrearsOpen(false)
      await onSuccess()
    } catch (error) {
      message.error('欠费补录失败')
      console.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button onClick={openArrearsModal}>按户补录欠费</Button>

      <Modal
        title="按户补录历史欠费"
        open={arrearsOpen}
        onCancel={() => setArrearsOpen(false)}
        onOk={() => void handleImportArrears()}
        confirmLoading={submitting}
        width={820}
        destroyOnHidden
      >
        <Form form={arrearsForm} layout="vertical">
          <Space align="start" style={{ width: '100%' }}>
            <Form.Item name="buildingId" label="筛选楼栋（可选）" style={{ minWidth: 260 }}>
              <Select
                allowClear
                options={buildingOptions}
                onChange={(value) => {
                  if (!value) {
                    setHouses([])
                    arrearsForm.setFieldsValue({ items: [] })
                    return
                  }
                  void loadHouses(String(value))
                }}
              />
            </Form.Item>
            <Form.Item
              name="month"
              label="欠费账期"
              rules={[{ required: true, message: '请选择账期' }]}
              style={{ minWidth: 220 }}
            >
              <DatePicker picker="month" style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          {houses.length > 0 ? (
            <Space orientation="vertical" size={12} style={{ display: 'flex' }}>
              {houses.map((house, index) => (
                <Space key={house.id} align="baseline" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 220 }}>
                    <Typography.Text strong>{house.roomNo}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">{house.ownerTypeName || '未配置业主类型'}</Typography.Text>
                  </div>
                  <Form.Item name={['items', index, 'houseId']} hidden initialValue={house.id}>
                    <Input />
                  </Form.Item>
                  <Form.Item name={['items', index, 'amount']} label="欠费金额" style={{ marginBottom: 0, minWidth: 180 }}>
                    <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="不填则跳过" />
                  </Form.Item>
                </Space>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">先选择楼栋，再逐户填写需要补录的欠费金额。</Typography.Text>
          )}
        </Form>
      </Modal>
    </>
  )
}
