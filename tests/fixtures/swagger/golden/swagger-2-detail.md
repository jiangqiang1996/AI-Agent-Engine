# 接口详情：GET /orders/{id}

文档：Order API
说明：查询订单详情
Base URL：https://api.example.com/v1
认证：BearerAuth

## 路径参数
- id（必填）: string - 订单 ID

## 查询参数
- 未声明。

## 请求头
- X-Trace-Id: string - 链路追踪 ID

## Cookie 参数
- 未声明。

## 请求体字段
- 未声明请求体。

## curl 示例
```bash
curl -X GET 'https://api.example.com/v1/orders/<id>' \
  -H 'X-Trace-Id: <X-Trace-Id>'
```
> 示例使用占位值，不代表请求可直接成功。

## 响应
- 200: 成功返回订单
  - id（必填）: string - 订单 ID
  - status（必填）: string - 订单状态
- 404: 订单不存在
  - 未声明字段。
