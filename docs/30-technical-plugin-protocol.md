# 浏览器插件接入协议

> 文档性质：现状事实源（协议契约）——插件与主工程之间的对外协议，字段与错误码变化时原地改写并同步 `docs/31-technical-openapi.yaml`。

## 1. 边界

主工程接收插件提交的数据，并在服务端完成来源平台原始响应的字段映射与解析（见 §4b）。主工程仍不接收、不处理插件风险状态，也不配置、不调度、不限流抓取节奏。浏览器插件自行负责平台抓取、风控规避、重试节奏和用户侧提示。

即：**解析归服务端，抓取归插件**。这样来源平台改字段名时，只需服务端部署一次映射修复，无需向全部用户发版插件。

### 1.1 原始载荷留存

`/raw-candidates`（§4b）提交的原始响应按原样完整落库，不做字段过滤，不做个人信息最小化，无保留期限。原始响应包含来源平台返回的全部内容，其中可能含手机号、邮箱、即时通讯号等直接标识信息。

本项目已知并接受该取舍，用于支撑映射漂移排查与历史回溯。相应的合规与数据安全责任在部署方，不在本协议约束范围内。

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

## 4b. 原始响应提交（服务端解析）

§4 由插件解析后提交结构化候选人；本节由插件提交来源平台的**原始响应**，解析在服务端完成。两者并存，见 §4c 迁移。新接入一律走本节。

```text
POST /api/plugin/search-runs/:id/raw-candidates
```

请求：

```json
{
  "batchId": "raw-boss-20260720-001",
  "sourcePlatform": "Boss",
  "captureVersion": "0.2.0",
  "payloads": [
    {
      "url": "https://www.zhipin.com/wapi/zpjob/rec/geek/list?page=1",
      "matched": "exact",
      "capturedAt": "2026-07-20T10:00:00.000Z",
      "json": { "code": 0, "zpData": { "geekList": [] } }
    }
  ]
}
```

字段：

- `batchId`：与 §4 同语义（同 `SearchRun` 内幂等键）。建议加 `raw-` 前缀，避免与 §4 的 batchId 命名空间碰撞。
- `sourcePlatform`：必须是服务端映射注册表已知的平台，否则 `ValidationError`。
- `captureVersion`：插件版本，用于把解析异常关联到具体插件版本。可选。
- `payloads[].url`：该响应的来源接口地址。
- `payloads[].matched`：`exact` 表示命中插件的已知接口白名单，`heuristic` 表示由启发式规则捕获。服务端据此区分处理并统计，用于发现来源平台新上线的接口。
- `payloads[].json`：原始响应体，**服务端不校验其结构**。校验结构等于把字段名再次写死进契约，与本节目的相悖。

约束：

- 单请求最多 20 个 payload，请求体最大 8MB，超出返回 `PayloadTooLarge`。
- 结构上限：嵌套深度 ≤6、单次提取候选人对象 ≤200、单对象键 ≤64、字符串 ≤512 字符。超限即中止并返回 `ValidationError`。该上限用于防止畸形载荷拖垮请求处理，不是数据过滤手段。
- 限流独立于 §4，默认 30 次/60 秒。

响应（202）：

```json
{
  "searchRunId": "search-run-id",
  "status": "Acquiring",
  "rawSubmittedCount": 38,
  "acceptedCount": 35,
  "candidateCount": 35,
  "parse": {
    "mappingVersion": "boss-2026-07-20.1",
    "geeksExtracted": 38,
    "draftsParsed": 35,
    "rejected": 3,
    "rejectedReasons": {
      "missingName": 0,
      "missingTitle": 3,
      "missingCity": 0,
      "missingEducation": 0,
      "notAGeek": 0
    }
  }
}
```

语义：

- 与 §4 一致：快速返回已接收，后台按 `SearchRun` 聚合处理，聚合窗口 30 秒，缓冲满 20 条立即触发评估。
- `parse.mappingVersion` 为服务端当前映射版本，插件应展示给用户，便于在解析异常时无需发版即可定位。
- `draftsParsed` 为 0 时仍返回 202，但该批次不计入 `rawSubmittedCount`。插件应据此明确提示"服务端未能解析本次抓取"，而非静默继续。
- 幂等：同一 `(searchRunId, batchId)` 重复提交按原始请求体摘要判定。摘要取自原始请求体而非解析结果，因此服务端映射版本升级后重放同一批次仍返回幂等成功，不会因解析结果变化而报 `BatchConflict`。

### 4c. 解析诊断

```text
GET /api/plugin/search-runs/:id/parse-diagnostics
```

返回该 `SearchRun` 下各批次的解析统计，含 `mappingVersion`、各项计数、拒绝原因分布，以及 `keyCensus`——原始响应中各字段名的出现次数。

来源平台改字段名时，`keyCensus` 中旧字段名计数归零、同时出现满额的未识别新字段名，与拒绝原因计数并列，可直接定位到需要修改的映射字段。

### 4d. §4 与 §4b 的迁移关系

- §4 `/candidates` 长期保留，作为服务端解析异常时的逃生通道，不做废弃。
- 插件不得对同一批次同时提交 §4 与 §4b，否则会重复计入 `rawSubmittedCount`。客户端解析仅在 §4b 返回 5xx/404 时作为兜底启用。
- 两条路径共用同一 `(searchRunId, batchId)` 唯一约束，故即便误发也会得到 `BatchConflict` 而非重复计数。

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

## 6. 批次状态上报（未实现）

> 状态：**planned, not implemented**。本节描述的端点从未实现，插件侧亦无调用。保留为待决项，不作为现行契约。

```text
POST /api/plugin/search-runs/:id/batches/:batchId/status
```

设想状态：`Submitted` / `Completed` / `Failed` / `Stopped`。

现状说明：

- 服务端批次生命周期已由 `PluginCandidateBatchRecord` 记录，§4 与 §4b 的 202 响应已携带批次接收结果与解析统计。
- 本端点唯一无法被上述机制覆盖的场景，是**纯客户端侧的批次终止**（如用户中途关闭标签页导致抓取中断，服务端无从得知）。
- 若后续确需该能力，应作为独立特性按自身价值决策，而非为使本文档自洽而补实现。

## 7. 状态轮询

插件轮询插件专用状态端点（plugin token，只返回状态与计数，不含候选人明细）：

```text
GET /api/plugin/search-runs/:id/status
```

响应：

```json
{
  "id": "search-run-id",
  "status": "Assessed",
  "rawSubmittedCount": 12,
  "targetResultCount": 200
}
```

> 注：Web 端读取完整 SearchRun（含候选人）走 `GET /api/search-runs/:id`，只接受 Web Token；插件持 Plugin Token 应使用上面的 `/plugin/.../status` 端点。

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

兜底优先级：

1. 来源平台 profile id。
2. profile URL。
3. 联系方式。
4. 姓名 + 公司 + 职位。
5. 以上均不可得时：对该候选人记录取内容哈希。

生成方：

- §4 `/candidates`：由插件生成并提交。
- §4b `/raw-candidates`：**由服务端生成**。服务端按上述优先级从原始响应中推导，并做归一化——去首尾空白、大小写归一、剥除 profile URL 的 query 参数。归一化是必要的：同一候选人的 `?id=X&lid=Y` 与 `?id=X` 否则会被判为两人。

第 5 项必须是确定性的内容哈希。任何带随机数的兜底都会同时破坏批次幂等摘要与 `(searchRunId, fingerprint)` 唯一约束下的重放语义。

去重范围目前限于单个 `SearchRun` 内，不跨 run、不跨职位画像。
