# 浏览器插件接入协议

> 文档性质：现状事实源（协议契约）——插件与主工程之间的对外协议，字段与错误码变化时原地改写并同步 `docs/31-technical-openapi.yaml`。

## 1. 边界

主工程只接收插件提交的数据，不接收、不处理插件风险状态，也不配置或调度抓取节奏。浏览器插件自行负责平台抓取、风控规避、重试节奏和用户侧提示。

## 2. 登录

插件使用邮箱和密码登录：

```text
POST /api/plugin/auth/login
```

请求：

```json
{
  "email": "hunter@example.com",
  "password": "change-me"
}
```

响应：

```json
{
  "token": "plugin-token",
  "tokenType": "Bearer",
  "expiresIn": 604800
}
```

插件应将 Plugin Token 保存在插件本地安全存储中。收到 `AuthError` 后停止当前批次并提示用户重新登录。

## 3. 创建插件 SearchRun

插件不直接创建 `SearchRun`。Web 用户在主工程中创建插件来源的 `SearchRun` 后，插件通过 `searchRunId` 提交数据。

Web 创建接口：

```text
POST /api/search-runs/one-time
```

关键字段：

- `sourceType = "plugin"`
- `targetResultCount`：10-500，默认 200。

## 4. 候选人提交

插件提交候选人需要 Plugin Bearer Token：

```text
POST /api/plugin/search-runs/:id/candidates
```

请求：

```json
{
  "batchId": "boss-20260606-001",
  "sourcePlatform": "Boss",
  "candidates": [
    {
      "fingerprint": "platform-profile-id-or-url",
      "resume": {
        "name": "候选人A",
        "title": "解决方案顾问",
        "city": "上海",
        "educationLevel": "本科",
        "yearsOfExperience": 8,
        "industries": ["企业服务"],
        "keywords": ["解决方案", "客户成功"],
        "summary": "负责复杂项目推动。"
      },
      "intent": "高",
      "activityLevel": "低",
      "sourceLead": {
        "platform": "Boss",
        "url": "https://example.test/profile/1",
        "searchContext": "关键词：解决方案；城市：上海",
        "fallbackClues": ["解决方案顾问", "企业服务", "上海"]
      }
    }
  ]
}
```

语义：

- 接口快速返回已接收。
- 后台按 `SearchRun` 聚合处理。
- 默认聚合窗口 30 秒。
- 单个 `SearchRun` 缓冲满 20 条候选人立即触发评估。

## 5. 附件上传

插件先提交候选人，再上传简历附件并绑定 `candidateId`。

```text
POST /api/plugin/search-runs/:searchRunId/candidates/:candidateId/resume-attachment
```

约束：

- 仅插件可上传。
- 单个附件最大 20MB。
- 每个候选人第一阶段只保留一个附件。
- 重复上传覆盖旧附件。
- 本地存储按 `SearchRun` 分目录。

推荐支持文件类型：

- PDF：`application/pdf`
- Word：`application/msword`
- Word OpenXML：`application/vnd.openxmlformats-officedocument.wordprocessingml.document`

## 6. 批次状态上报

插件可上报当前批次状态：

```text
POST /api/plugin/search-runs/:id/batches/:batchId/status
```

建议状态：

- `Submitted`
- `Completed`
- `Failed`
- `Stopped`

主工程第一阶段只记录批次状态，不参与抓取风控判断。

## 7. 状态轮询

插件轮询：

```text
GET /api/search-runs/:id
```

建议频率：

- 正常抓取中：10 秒一次。
- 收到 `RateLimited`：降频到 30-60 秒。
- 收到终止类错误：停止当前批次，不再轮询。

## 8. 错误码动作

| 错误码 | 插件动作 |
|---|---|
| `ValidationError` | 记录错误，跳过该候选人或该附件 |
| `SearchRunCompleted` | 停止当前批次 |
| `SearchRunCancelled` | 停止当前批次 |
| `SearchRunFailed` | 停止当前批次并提示用户 |
| `AuthError` | 停止当前批次，提示重新登录 |
| `RateLimited` | 降频后重试 |
| `InternalError` | 有限重试，超过次数后停止 |

## 9. 指纹规则

插件优先提供稳定 `fingerprint`。兜底优先级：

1. 来源平台 profile id。
2. profile URL。
3. 联系方式。
4. 姓名 + 公司 + 职位。
