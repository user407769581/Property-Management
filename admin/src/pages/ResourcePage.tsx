import { App, Button, Card, Descriptions, Drawer, Form, Image, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import type { FormListFieldData } from 'antd/es/form'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { BillBatchActions } from '../components/BillBatchActions'
import { OssUploadField } from '../components/OssUploadField'
import { findResourceConfig, type ResourceField, type ResourceOption } from '../config/resources'
import { formatDateTime, formatEnumLabel } from '../lib/display'
import { http } from '../lib/http'
import { useAuthStore } from '../stores/auth'

type RecordItem = Record<string, unknown>
type FieldOptionsState = Record<string, ResourceOption[]>
type StaffDispatchAction = {
  method: 'post' | 'put'
  url: string
  payloadKey: 'maintainerId' | 'housekeeperId'
  successLabel: string
}

const newVoteOption = () => ({
  id: crypto.randomUUID(),
  title: '',
  votes: 0,
})

function VoteOptionsFormList({ minCount = 2 }: { minCount?: number }) {
  return (
    <Form.List name="options">
      {(fields, { add, remove }) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          {fields.map((field: FormListFieldData) => (
            <Space key={field.key} style={{ width: '100%' }} align="start">
              <Form.Item name={[field.name, 'title']} style={{ flex: 1, marginBottom: 0 }}>
                <Input placeholder="选项文字（用户端可见）" />
              </Form.Item>
              <Form.Item name={[field.name, 'id']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'votes']} hidden initialValue={0}>
                <Input />
              </Form.Item>
              <Button type="link" danger onClick={() => remove(field.name)} disabled={fields.length <= minCount}>
                删除
              </Button>
            </Space>
          ))}
          <Button type="dashed" onClick={() => add(newVoteOption())} block>
            添加选项
          </Button>
        </Space>
      )}
    </Form.List>
  )
}

/** 租房：封面 + imagesJson 数组 URL，去重 */
function parseRentalGallery(record: RecordItem): string[] {
  const urls: string[] = []
  const cover = String(record.coverImage ?? '').trim()
  if (cover) urls.push(cover)
  const raw = record.imagesJson
  if (raw == null || raw === '') return urls
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw)
  try {
    const arr = JSON.parse(str) as unknown
    if (Array.isArray(arr)) {
      for (const u of arr) {
        const s = String(u ?? '').trim()
        if (s && !urls.includes(s)) urls.push(s)
      }
    }
  } catch {
    /* 非法 JSON 忽略 */
  }
  return urls
}

const getFieldOptions = (field: ResourceField, fieldOptions: FieldOptionsState) => {
  if (field.options?.length) {
    return field.options
  }
  return fieldOptions[field.key] || []
}

const renderFieldInput = (field: ResourceField, fieldOptions: FieldOptionsState) => {
  if (field.type === 'number') {
    return <InputNumber style={{ width: '100%' }} disabled={field.readonly} />
  }
  if (field.type === 'textarea') {
    return <Input.TextArea rows={4} disabled={field.readonly} />
  }
  if (field.type === 'upload') {
    return <OssUploadField />
  }
  if (field.type === 'select' || field.type === 'remoteSelect') {
    return <Select disabled={field.readonly} options={getFieldOptions(field, fieldOptions)} />
  }
  return <Input disabled={field.readonly} />
}

export function ResourcePage() {
  const { key } = useParams()
  const config = findResourceConfig(key)
  const user = useAuthStore((state) => state.user)
  const [items, setItems] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<RecordItem | null>(null)
  const [fieldOptions, setFieldOptions] = useState<FieldOptionsState>({})
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [staffOptions, setStaffOptions] = useState<ResourceOption[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>()
  const [staffDispatchAction, setStaffDispatchAction] = useState<StaffDispatchAction | null>(null)
  const [dispatchTitle, setDispatchTitle] = useState('选择服务人员')
  const [detailRecord, setDetailRecord] = useState<RecordItem | null>(null)
  const [form] = Form.useForm<RecordItem>()
  const { message } = App.useApp()

  const loadServiceStaffOptions = async (role: 'REPAIR' | 'HOUSEKEEPING') => {
    const result = await http.get(`/api/admin/service-staff?role=${role}`) as { data: Array<Record<string, unknown>> }
    const options = (result.data || [])
      .filter((item) => String(item.status || '') === 'ACTIVE')
      .map((item) => {
        const id = String(item.sourceId || '')
        const name = String(item.name || '')
        const skill = String(item.skill || '')
        const phone = String(item.phone || '')
        return {
          value: id,
          label: `${name}${skill ? `（${skill}）` : ''}${phone ? ` - ${phone}` : ''}`,
        }
      })
    return options
  }

  const loadItems = async () => {
    if (!config) return
    setLoading(true)
    try {
      const result = await http.get(config.endpoint) as { data: RecordItem[] | RecordItem }
      const payload = config.mode === 'single' ? [result.data as RecordItem] : (result.data as RecordItem[])
      setItems(payload)
    } catch (error) {
      message.error('数据加载失败')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!config) return
    let cancelled = false
    const endpoint = config.endpoint
    const run = async () => {
      setLoading(true)
      try {
        const result = await http.get(endpoint) as { data: RecordItem[] | RecordItem }
        if (cancelled) return
        const payload = config.mode === 'single' ? [result.data as RecordItem] : (result.data as RecordItem[])
        setItems(payload)
      } catch (error) {
        if (!cancelled) {
          message.error('数据加载失败')
          console.error(error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [key, config?.endpoint, config?.mode, message])

  useEffect(() => {
    const loadFieldOptions = async () => {
      if (!config) return
      const remoteFields = config.fields.filter((field) => field.type === 'remoteSelect' && field.optionsEndpoint)
      if (!remoteFields.length) {
        setFieldOptions({})
        return
      }

      try {
        const loaded = await Promise.all(
          remoteFields.map(async (field) => {
            const result = await http.get(field.optionsEndpoint!) as { data: RecordItem[] }
            return [
              field.key,
              result.data.map((item) => ({
                label: String(item[field.optionLabelKey || 'name'] || item.name || item.label || ''),
                value: String(item[field.optionValueKey || 'id'] || item.id || ''),
              })),
            ] as const
          }),
        )
        setFieldOptions(Object.fromEntries(loaded))
      } catch (error) {
        message.error('关联选项加载失败')
        console.error(error)
      }
    }

    void loadFieldOptions()
  }, [config, key, message])

  const renderDetailFieldValue = (field: ResourceField, value: unknown) => {
    if (field.type === 'upload' && typeof value === 'string' && value) {
      return (
        <img
          src={value}
          alt=""
          style={{ maxWidth: 240, maxHeight: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
        />
      )
    }
    if (field.type === 'textarea' && typeof value === 'string') {
      const text = value.replace(/<[^>]+>/g, '').trim()
      return text || '-'
    }
    if (field.type === 'voteOptions' && Array.isArray(value)) {
      const titles = (value as { title?: string }[])
        .map((o) => String(o.title || '').trim())
        .filter(Boolean)
      return titles.length ? titles.join('、') : '—'
    }
    const fieldLabel =
      field.type === 'select' || field.type === 'remoteSelect'
        ? getFieldOptions(field, fieldOptions).find((option) => String(option.value) === String(value ?? ''))?.label
        : undefined
    const enumLabel = formatEnumLabel(value, field.key)
    const dateTimeText = formatDateTime(value, field.key)
    const displayText = fieldLabel || enumLabel || dateTimeText
    if (displayText) return displayText
    if (value === null || value === undefined || value === '') return '-'
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
    return JSON.stringify(value)
  }

  const columns = useMemo(() => {
    if (!config) return []

    const baseColumns = config.fields
      .filter((field) => !field.hiddenInTable)
      .map((field) => ({
      title: field.label,
      dataIndex: field.key,
      key: field.key,
      render: (value: unknown) => {
        if (field.type === 'upload' && typeof value === 'string' && value) {
          return (
            <img
              src={value}
              alt={field.label}
              style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
            />
          )
        }
        if (field.type === 'voteOptions') {
          return Array.isArray(value) ? `${value.length} 个选项` : '—'
        }
        if (field.type === 'textarea' && typeof value === 'string') {
          const text = value.replace(/<[^>]+>/g, '').trim()
          return text || '-'
        }
        const fieldLabel = (field.type === 'select' || field.type === 'remoteSelect')
          ? getFieldOptions(field, fieldOptions).find((option) => String(option.value) === String(value || ''))?.label
          : undefined
        const enumLabel = formatEnumLabel(value, field.key)
        const dateTimeText = formatDateTime(value, field.key)
        const displayText = fieldLabel || enumLabel || dateTimeText
        if (field.key === 'status' && typeof value === 'string') {
          return <Tag color="blue">{displayText || value}</Tag>
        }
        if (displayText) {
          return displayText
        }
        return typeof value === 'string' || typeof value === 'number' ? value : '-'
      },
      }))

    const handleAction = async (
      action: NonNullable<typeof config.rowActions>[number],
      row: RecordItem,
    ) => {
      try {
        if (action.staffSelector) {
          const options = await loadServiceStaffOptions(action.staffSelector.role)
          if (!options.length) {
            message.error('暂无可派单的服务人员，请先在服务人员模块启用人员')
            return
          }
          setStaffOptions(options)
          setSelectedStaffId(undefined)
          setDispatchTitle(action.staffSelector.title || '选择服务人员')
          setStaffDispatchAction({
            method: action.method,
            url: action.buildUrl(row as Record<string, unknown>),
            payloadKey: action.staffSelector.payloadKey,
            successLabel: action.label,
          })
          setDispatchModalOpen(true)
          return
        }

        await http[action.method](action.buildUrl(row as Record<string, unknown>), action.payload || {})
        message.success(`${action.label}成功`)
        await loadItems()
      } catch (error) {
        message.error(`${action.label}失败`)
        console.error(error)
      }
    }

    if (config.hideActions) {
      return baseColumns
    }

    return [
      ...baseColumns,
      {
        title: '操作',
        key: 'actions',
        render: (_value: unknown, row: RecordItem) => (
          <Space>
            {config.detailModal && (
              <Button size="small" onClick={() => setDetailRecord(row)}>
                详情
              </Button>
            )}
            {!config.editDisabled && (
              <Button
                size="small"
                onClick={() => {
                  setEditingItem(row)
                  const base = { ...row, password: '' } as Record<string, unknown>
                  if (config.key === 'votes') {
                    const opts = row.options
                    base.options = Array.isArray(opts) && opts.length
                      ? opts.map((o: { id?: string; title?: string; votes?: number }) => ({
                          id: String(o.id || crypto.randomUUID()),
                          title: String(o.title ?? ''),
                          votes: Math.max(0, Number(o.votes) || 0),
                        }))
                      : [newVoteOption(), newVoteOption()]
                  }
                  form.setFieldsValue(base as never)
                  setDrawerOpen(true)
                }}
              >
                编辑
              </Button>
            )}
            {config.rowActions?.map((action) =>
              action.visible && !action.visible(row) ? null : (
                <Button
                  key={action.key}
                  size="small"
                  type={action.key.includes('approve') || action.key.includes('assign') ? 'primary' : 'default'}
                  onClick={() => void handleAction(action, row)}
                >
                  {action.label}
                </Button>
              ),
            )}
          </Space>
        ),
      },
    ]
  }, [config, fieldOptions, form, message])

  if (!config) {
    return <Card>未找到对应模块</Card>
  }

  if (config.roles && !config.roles.includes(user?.role || '')) {
    return <Card>当前账号无权限访问该模块</Card>
  }

  const handleCreate = () => {
    setEditingItem(null)
    form.resetFields()
    const initialValues = Object.fromEntries(
      config.fields.filter((field) => field.initialValue !== undefined).map((field) => [field.key, field.initialValue]),
    )
    if (config.mode === 'single' && items[0]) {
      form.setFieldsValue(items[0] as never)
    } else {
      form.setFieldsValue(initialValues as never)
    }
    if (config.key === 'votes') {
      form.setFieldsValue({
        options: [newVoteOption(), newVoteOption()],
      } as never)
    }
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload: Record<string, unknown> = { ...values }

    if (config.key === 'votes') {
      const raw = (payload.options || []) as Array<{ id?: string; title?: string; votes?: number }>
      const cleaned = raw
        .map((o) => ({
          id: String(o.id || crypto.randomUUID()),
          title: String(o.title || '').trim(),
          votes: Math.max(0, Number(o.votes) || 0),
        }))
        .filter((o) => o.title.length > 0)
      if (cleaned.length < 2) {
        message.error('请至少填写 2 个有效投票选项')
        return
      }
      payload.options = cleaned
    }

    try {
      if (config.mode === 'single') {
        await http.put(config.endpoint, payload)
      } else if (editingItem) {
        const updateKey = config.updateKey || 'id'
        await http.put(`${config.endpoint}/${editingItem[updateKey]}`, payload)
      } else {
        await http.post(config.endpoint, payload)
      }

      message.success('保存成功')
      setDrawerOpen(false)
      await loadItems()
    } catch (error) {
      message.error('保存失败')
      console.error(error)
    }
  }

  const handleDispatchConfirm = async () => {
    if (!staffDispatchAction || !selectedStaffId) {
      message.warning('请选择服务人员')
      return
    }
    setDispatching(true)
    try {
      await http[staffDispatchAction.method](staffDispatchAction.url, {
        [staffDispatchAction.payloadKey]: selectedStaffId,
      })
      message.success(`${staffDispatchAction.successLabel}成功`)
      setDispatchModalOpen(false)
      setSelectedStaffId(undefined)
      setStaffDispatchAction(null)
      await loadItems()
    } catch (error) {
      message.error('派单失败')
      console.error(error)
    } finally {
      setDispatching(false)
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ display: 'flex' }}>
      <Card
        extra={
          <Space>
            {config.headerActions?.map((action) => (
              <Button
                key={action.key}
                onClick={async () => {
                  try {
                    await http[action.method](action.buildUrl({} as Record<string, unknown>), action.payload || {})
                    message.success(`${action.label}成功`)
                    await loadItems()
                  } catch (error) {
                    message.error(`${action.label}失败`)
                    console.error(error)
                  }
                }}
              >
                {action.label}
              </Button>
            ))}
            {config.customMode === 'bills' && <BillBatchActions onSuccess={loadItems} />}
            {!config.createDisabled && (
              <Button type="primary" onClick={handleCreate}>
                {config.mode === 'single' ? '编辑配置' : '新增'}
              </Button>
            )}
            {config.mode === 'single' && config.createDisabled && (
              <Button type="primary" onClick={handleCreate}>
                编辑配置
              </Button>
            )}
          </Space>
        }
      >
        <Table<RecordItem>
          rowKey={(record) => String(record[config.updateKey || 'id'] || Math.random())}
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={config.mode === 'single' ? false : { pageSize: 8 }}
          scroll={{ x: true }}
        />
      </Card>

      <Drawer
        title={editingItem ? `编辑${config.label}` : `新增${config.label}`}
        size="large"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => void handleSave()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {config.fields
            .filter((field) => !field.hiddenInForm && field.type !== 'voteOptions')
            .map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={field.label}
                rules={field.readonly || field.required === false ? [] : [{ required: true, message: `请输入${field.label}` }]}
              >
                {renderFieldInput(field, fieldOptions)}
              </Form.Item>
            ))}
          {config.fields.some((f) => f.type === 'voteOptions') && (
            <Form.Item label="投票选项" required tooltip="至少保留 2 个有效选项（标题非空）">
              <VoteOptionsFormList minCount={2} />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      <Modal
        title={`${config.label}详情`}
        width={720}
        open={detailRecord != null}
        onCancel={() => setDetailRecord(null)}
        footer={
          <Button type="primary" onClick={() => setDetailRecord(null)}>
            关闭
          </Button>
        }
      >
        {detailRecord && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              {config.fields.map((field) => (
                <Descriptions.Item key={field.key} label={field.label}>
                  {renderDetailFieldValue(field, detailRecord[field.key])}
                </Descriptions.Item>
              ))}
              {config.key === 'rentals' && (
                <>
                  {detailRecord.layout != null && String(detailRecord.layout).trim() !== '' && (
                    <Descriptions.Item label="户型">{String(detailRecord.layout)}</Descriptions.Item>
                  )}
                  {detailRecord.phone != null && String(detailRecord.phone).trim() !== '' && (
                    <Descriptions.Item label="联系电话">{String(detailRecord.phone)}</Descriptions.Item>
                  )}
                </>
              )}
            </Descriptions>
            {config.key === 'rentals' && parseRentalGallery(detailRecord).length > 0 && (
              <div>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  全部图片（含多图）
                </Typography.Title>
                <Image.PreviewGroup>
                  <Space wrap size={8}>
                    {parseRentalGallery(detailRecord).map((src, i) => (
                      <Image
                        key={`${src}-${i}`}
                        width={112}
                        height={84}
                        style={{ objectFit: 'cover', borderRadius: 8 }}
                        src={src}
                      />
                    ))}
                  </Space>
                </Image.PreviewGroup>
              </div>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title={dispatchTitle}
        open={dispatchModalOpen}
        confirmLoading={dispatching}
        onCancel={() => {
          if (dispatching) return
          setDispatchModalOpen(false)
          setSelectedStaffId(undefined)
          setStaffDispatchAction(null)
        }}
        onOk={() => void handleDispatchConfirm()}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="请选择服务人员"
          options={staffOptions}
          value={selectedStaffId}
          onChange={(value) => setSelectedStaffId(value)}
          showSearch
          optionFilterProp="label"
        />
      </Modal>
    </Space>
  )
}
