import { LoadingOutlined, UploadOutlined } from '@ant-design/icons'
import { App, Button, Image, Space } from 'antd'
import type { UploadProps } from 'antd'
import { Upload } from 'antd'
import { useState } from 'react'

import { http } from '../lib/http'

interface OssUploadFieldProps {
  value?: string
  onChange?: (value: string) => void
}

export function OssUploadField({ value, onChange }: OssUploadFieldProps) {
  const [loading, setLoading] = useState(false)
  const { message } = App.useApp()

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: 'image/*',
    customRequest: async ({ file, onError, onSuccess }) => {
      try {
        setLoading(true)
        const targetFile = file as File
        const policyResult = await http.post('/api/admin/uploads/policy', {
          directory: 'admin-images',
          filename: targetFile.name,
          mimeType: targetFile.type || 'image/png',
        }) as {
          data: {
            host: string
            key: string
            policy: string
            signature: string
            accessId: string
          }
        }

        const formData = new FormData()
        formData.append('key', policyResult.data.key)
        formData.append('policy', policyResult.data.policy)
        formData.append('OSSAccessKeyId', policyResult.data.accessId)
        formData.append('Signature', policyResult.data.signature)
        formData.append('success_action_status', '200')
        formData.append('file', targetFile)

        const response = await fetch(policyResult.data.host, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('OSS upload failed')
        }

        const uploadedUrl = `${policyResult.data.host}/${policyResult.data.key}`
        onChange?.(uploadedUrl)
        onSuccess?.({}, new XMLHttpRequest())
        message.success('图片上传成功')
      } catch (error) {
        console.error(error)
        message.error('图片上传失败')
        onError?.(error as Error)
      } finally {
        setLoading(false)
      }
    },
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Upload {...uploadProps}>
        <Button icon={loading ? <LoadingOutlined /> : <UploadOutlined />} loading={loading}>
          选择并上传图片
        </Button>
      </Upload>
      {value ? <Image src={value} alt="uploaded" width={180} /> : null}
    </Space>
  )
}
