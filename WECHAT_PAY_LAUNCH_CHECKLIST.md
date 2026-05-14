# 微信支付与客户资质切换清单

## 1. 客户需要提供的资料

- 小程序 AppID
- 小程序 AppSecret
- 微信支付商户号 `mch_id`
- API v3 密钥
- 商户证书序列号
- 商户私钥文件 `apiclient_key.pem`
- 微信支付平台证书文件，用于回调验签
- 正式 HTTPS API 域名
- OSS 或图片上传域名，如客户也要换存储主体

## 2. 后端环境变量

上线前在 `backend/.env` 中替换：

```env
WECHAT_APP_ID=客户小程序AppID
WECHAT_APP_SECRET=客户小程序AppSecret
WECHAT_PAY_ENABLED=true
WECHAT_PAY_MOCK_MODE=false
WECHAT_PAY_APP_ID=客户小程序AppID
WECHAT_PAY_MCH_ID=客户微信支付商户号
WECHAT_PAY_API_V3_KEY=客户APIv3密钥
WECHAT_PAY_MCH_SERIAL_NO=客户商户证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_PAY_PLATFORM_CERT_PATH=./certs/wechatpay_platform.pem
WECHAT_PAY_NOTIFY_URL=https://正式后端域名/api/pay/wechat/notify
```

证书文件不要提交到代码仓库，放到服务器安全目录，并确保运行后端的用户可读。

## 3. 小程序配置

- 将 `frontend/project.config.json` 的 `appid` 改成客户小程序 AppID。
- 将 `frontend/app.js` 的 `API_BASE_URL` 改成正式 HTTPS 后端域名。
- 微信公众平台配置服务器域名：
  - request 合法域名：正式 HTTPS 后端域名
  - uploadFile 合法域名：OSS 或后端上传域名
  - downloadFile 合法域名：图片展示域名

## 4. 微信支付商户平台配置

- 设置 API v3 密钥。
- 下载商户私钥和证书，记录商户证书序列号。
- 下载或配置微信支付平台证书，用于后端验签。
- 确认 JSAPI 支付产品已开通。
- 确认小程序 AppID 已关联到商户号。
- 回调地址使用：

```text
https://正式后端域名/api/pay/wechat/notify
```

## 5. 联调顺序

1. 启动正式数据库和后端。
2. 访问 `https://正式后端域名/api/health`，确认后端可访问。
3. 用客户 AppID 编译小程序。
4. 手机微信登录小程序，确认能获取客户小程序下的 `openid`。
5. 后台生成一笔测试物业账单，金额建议先用小额。
6. 小程序发起物业费支付，确认能拉起微信支付。
7. 支付成功后检查：
   - `PaymentOrder.status` 为 `SUCCESS`
   - `PaymentOrder.transactionNo` 有微信交易号
   - 对应 `PropertyBill.status` 为 `PAID`
8. 测试重复回调，确认不会重复更新或重复记账。
9. 如启用家政在线支付，创建 `paymentStatus=PENDING` 的家政订单并重复同样流程。
10. 完成后再提交小程序审核。

## 6. 常见问题

- 如果能下单但不回调，检查 `WECHAT_PAY_NOTIFY_URL` 是否公网可访问且 HTTPS 证书有效。
- 如果回调验签失败，检查平台证书路径和证书是否匹配当前微信支付平台证书。
- 如果 `wx.requestPayment` 报签名错误，检查商户私钥、商户证书序列号、AppID、商户号是否属于同一套资质。
- 如果小程序无法请求后端，检查微信公众平台的 request 合法域名。
- 如果客户资质未到，本地保留 `WECHAT_PAY_ENABLED=false`、`WECHAT_PAY_MOCK_MODE=true` 即可继续 mock 测试。
