# AGENTS.md

## 1. 项目定位

本项目是面向猎头/招聘交付场景的 B 端 AI 辅助系统。

核心目标不是做通用招聘管理系统，而是围绕“岗位画像、候选人搜索、硬性过滤、AI 匹配评估、候选人排序、原始页面回链、匹配报告”形成稳定闭环。

系统应优先保障以下能力：

1. 岗位画像规则清晰、可复用、可追溯。
2. 搜索任务状态明确，异步流程可恢复。
3. 候选人匹配结论可解释、可审计。
4. 原始页面回链可靠，便于猎头回到来源平台发起沟通。
5. 插件采集、简历附件、候选人数据处理符合风控与合规要求。

本项目不以“快速堆页面”为目标。所有实现必须服从领域模型、状态机、审计、幂等和数据安全要求。

当前输出目标是 MVP 版本，优先面向单用户或小范围试用场景，先跑通岗位画像、SearchRun、候选人提交、硬筛、AI 评估、排序、审计和回链闭环。

MVP 当前不要求实现：

- 完整 ATS。
- 多租户。
- 团队权限。
- 组织管理。
- 完整 RBAC 角色模型。
- 全局审计中间件。
- Outbox。
- 对象存储。

以上能力属于后续生产化演进项。MVP 仍必须保留 Web Token / Plugin Token 身份边界、owner 级访问控制、SearchRun 事件、AI Assessment 审计、失败原因和敏感数据最小暴露。

---

## 2. 技术栈说明

### 2.1 Web App

采用：

- Vite
- React
- TanStack Router
- TanStack Query
- TanStack Table
- TanStack Form
- shadcn/ui
- Tailwind CSS

职责：

- 提供岗位画像维护页面。
- 提供搜索任务创建、确认、进度查看页面。
- 提供候选人列表、筛选、排序、批量操作页面。
- 提供 AI 匹配报告、合适点、不合适点、证据说明展示。
- 提供原始页面回链入口。
- 提供任务失败、重试、重评估等操作入口。

前端不得承载核心业务规则。前端可以做交互校验和展示逻辑，但岗位画像规则、硬性过滤、状态流转、匹配评分、权限判断，必须以后端领域层结果为准。

### 2.2 API Layer

采用：

- Fastify
- Zod request validation
- Zod response validation
- JWT auth
- Web Token / Plugin Token 身份边界
- owner 级访问控制
- RBAC，后续实现
- Tenant Context，后续实现
- Audit middleware，后续实现
- OpenAPI generation

职责：

- 接收前端、插件、CSV、外部适配器请求。
- 完成请求参数校验。
- MVP 当前注入用户身份上下文，并区分 Web Token / Plugin Token。
- SearchRun、JobProfile、附件、AI 审计接口至少按 `ownerId` 或创建用户做访问控制。
- 组织、租户、RBAC 角色上下文后续实现。
- 调用 Application Layer。
- 返回稳定、可版本化的 API 响应。
- MVP 当前必须保留 SearchRun 事件、AI Assessment 审计和失败原因。
- 全局请求审计、导出审计、对象访问审计后续实现。

API Layer 不得直接操作领域规则，不得直接编排复杂业务流程，不得绕过 Application Layer 调用 Infrastructure。

### 2.3 Application Layer

职责：

- SearchRun orchestration
- Candidate import / fetch workflow
- Hard filter execution
- AI assessment execution
- Reassessment workflow
- Queue dispatch and retry policy
- Export workflow

Application Layer 负责业务用例编排，但不承载核心判断规则。

示例服务：

- `CreateSearchRunService`
- `GenerateSearchCriteriaService`
- `ConfirmSearchCriteriaService`
- `DispatchCandidateFetchService`
- `RunHardFilterService`
- `RunAIAssessmentService`
- `ReassessCandidateService`
- `FinalizeSearchRunService`
- `ExportSearchResultService`

Application Layer 可以：

- 开启事务。
- 调用领域对象。
- 调用 Repository。
- 派发队列任务。
- 记录应用事件。
- 处理重试、失败、补偿。

Application Layer 不应：

- 直接写复杂 SQL。
- 直接拼接 AI Prompt。
- 直接判断岗位匹配规则。
- 直接判断 SearchRun 状态能否流转。
- 直接访问 Redis、对象存储、HTTP 外部服务。

### 2.4 Domain Layer

核心领域对象：

- `JobProfile`
- `SearchRun`
- `Candidate`
- `CandidateSummary`
- `HardFilter`
- `MatchScore`
- `AIAssessment`
- `OriginalSourceLink`
- `ResumeAttachment`
- `DomainEvent`

核心规则：

- JobProfile rules
- SearchRun state machine
- Candidate identity rules
- Hard filter rules
- Match score rules
- AI assessment contract
- Original source link rules
- Candidate summary rules

Domain Layer 是本项目的业务核心。任何核心业务规则必须进入 Domain Layer，并具备单元测试。

Domain Layer 不得依赖：

- Fastify
- Prisma
- Redis
- BullMQ
- HTTP client
- React
- 文件系统
- 对象存储 SDK
- 具体 AI 服务 SDK

Domain Layer 应保持纯净，优先使用纯函数、值对象、聚合根和领域服务。

### 2.5 Infrastructure Layer

采用：

- Prisma
- PostgreSQL
- BullMQ
- Redis
- Object Storage，后续实现
- CSV adapter
- Plugin adapter
- HTTP AI adapter
- LangChain adapter
- LangGraph workflow
- Outbox，后续实现
- Audit log，后续实现
- Error log
- Observability，后续实现

职责：

- 数据持久化。
- 队列执行。
- 外部 AI 服务调用。
- 插件数据接收。
- CSV 解析。
- LangChain / LangGraph AI 编排、模型调用、结构化输出解析和 trace 元数据收集。
- MVP 当前允许本地简历附件存储，但 API 响应不得暴露本地 `storagePath`。
- 原始页面截图或存证存储后续实现。
- 日志、指标、追踪后续完善。

Infrastructure Layer 实现接口，不定义业务规则。LangChain / LangGraph 只能作为 Infrastructure adapter 实现 Application Layer 定义的 port，不得替代领域规则、状态机、权限判断或审计链路。

---

## 3. 分层依赖规则

依赖方向必须单向。

```text
Web App
  ↓
API Layer
  ↓
Application Layer
  ↓
Domain Layer

Infrastructure Layer
  ↑ implements interfaces required by Application / Domain
```

允许：

- API Layer 调用 Application Layer。
- Application Layer 调用 Domain Layer。
- Application Layer 依赖 Repository / Adapter interface。
- Infrastructure Layer 实现 Repository / Adapter interface。
- Infrastructure Layer 可以实现 LangChain / LangGraph AI adapter。
- Web App 调用 API。

禁止：

- Domain Layer 依赖 Infrastructure。
- Domain Layer 依赖 Prisma Model。
- Domain Layer 依赖 Fastify Request。
- Application Layer 直接使用 Prisma Client。
- API Layer 直接使用 Prisma Client。
- Web App 复制后端业务规则。
- Queue Job 绕过 Application Layer 直接改业务状态。
- Domain、Application、API、Web App 直接 import `@langchain/*`。
- Domain、Application、API、Web App 依赖 LangGraph state 类型。
- Queue Job 直接调用 LangGraph；必须通过 Application Service 和 `AIAssessmentPort`。

---

## 4. 目录建议

```text
src/
  app/
    server.ts
    routes/
    middlewares/
    schemas/
    openapi/

  modules/
    job-profile/
      domain/
        job-profile.ts
        job-profile-rule.ts
        job-profile-weight.ts
        job-profile.test.ts
      application/
        create-job-profile.service.ts
        update-job-profile.service.ts
        confirm-search-criteria.service.ts
      infrastructure/
        prisma-job-profile.repository.ts
      api/
        job-profile.routes.ts
        job-profile.dto.ts

    search-run/
      domain/
        search-run.ts
        search-run-state-machine.ts
        search-run-event.ts
        search-run.test.ts
      application/
        create-search-run.service.ts
        dispatch-search-run.service.ts
        finalize-search-run.service.ts
      infrastructure/
        prisma-search-run.repository.ts
        bullmq-search-run.queue.ts
      api/
        search-run.routes.ts
        search-run.dto.ts

    candidate/
      domain/
        candidate.ts
        candidate-identity.ts
        candidate-summary.ts
        original-source-link.ts
        hard-filter.ts
        match-score.ts
      application/
        import-candidate.service.ts
        run-hard-filter.service.ts
        export-candidate.service.ts
      infrastructure/
        prisma-candidate.repository.ts
        csv-candidate.adapter.ts
        plugin-candidate.adapter.ts
      api/
        candidate.routes.ts
        candidate.dto.ts

    ai-assessment/
      domain/
        ai-assessment.ts
        ai-assessment-contract.ts
        ai-assessment-result.ts
      application/
        run-ai-assessment.service.ts
        reassess-candidate.service.ts
      infrastructure/
        http-ai-assessment.adapter.ts
        prompt-template.repository.ts
      api/
        ai-assessment.routes.ts

  shared/
    domain/
      entity.ts
      value-object.ts
      domain-event.ts
      result.ts
      errors.ts
    application/
      unit-of-work.ts
      transaction.ts
    infrastructure/
      prisma/
      redis/
      logger/
      object-storage/
      outbox/
    api/
      auth/
      rbac/      # 后续实现
      tenant/    # 后续实现
      audit/     # 后续实现
```

目录可以按实际团队习惯微调，但必须保留清晰的 domain / application / infrastructure / api 边界。

---

## 5. 核心领域规则

### 5.1 JobProfile

岗位画像是搜索、过滤、评分、报告的依据。

必须包含：

- 岗位基本信息。
- 硬性条件。
- 软性条件。
- 固定权重。
- 权重百分比展示。
- 搜索条件。
- 用户确认状态。
- 版本号。
- 创建人与更新时间。

规则：

- 用户确认后的岗位画像不得被静默覆盖。
- 搜索任务必须引用某一版本的岗位画像。
- 后续修改岗位画像，不得影响历史 SearchRun 的判断依据。
- 岗位画像中的硬性条件必须可以被解释和回放。

### 5.2 SearchRun

SearchRun 是一次寻访任务。

建议状态：

```text
draft
criteria_confirmed
queued
searching
filtering
assessing
completed
failed
cancelled
```

规则：

- 未确认搜索条件，不得进入 queued。
- queued 后不得修改本次任务使用的岗位画像快照。
- searching / filtering / assessing 状态下，允许局部失败。
- completed 不代表所有候选人都成功评估，而代表任务已完成可交付。
- failed 必须记录失败阶段和失败原因。
- cancelled 后不得继续执行队列任务。
- 状态流转必须由 SearchRun state machine 判断。

### 5.3 Candidate

Candidate 是候选人业务对象，不等同于简历附件。

候选人识别建议使用：

- 姓名，若可用。
- 公司轨迹。
- 学校。
- 来源平台。
- 原始页面标识。
- 简历摘要 hash。
- 联系方式 hash，若合规允许。

规则：

- 不得单纯依赖姓名判断同一候选人。
- 不得在无权限上下文中返回敏感信息。
- 候选人可存在多个来源链接。
- 候选人可对应多个搜索任务结果。
- 候选人摘要必须与原始材料建立证据关系。

### 5.4 HardFilter

硬性过滤用于排除明显不符合岗位要求的候选人。

规则：

- 硬性过滤结果必须包含通过/不通过。
- 不通过必须给出原因。
- 不得只返回布尔值。
- 规则必须可单元测试。
- 数据不足时应返回 `unknown` 或 `need_review`，不得强行判定失败。

### 5.5 AIAssessment

AI 评估必须结构化。

必须记录：

- assessment id
- candidate id
- search run id
- job profile version
- prompt version
- model name
- input summary
- output JSON
- match score
- suitable points
- unsuitable points
- evidence references
- confidence
- cost
- latency
- error reason
- created at
- provider
- graph version，若使用 LangGraph

规则：

- AI 输出必须经过 Zod 校验。
- LangChain / LangGraph 输出必须先经过模型输出 schema 校验，再经过 Domain Layer 的 AI assessment contract 校验。
- 校验失败不得入库为有效评估。
- 校验失败必须写入 AI Assessment 审计失败记录。
- AI 文本结论不得直接作为唯一排序依据。
- 模型原始输出不得直接作为可信数据入库或排序依据。
- 排序应使用结构化评分字段。
- 重评估必须保留历史评估记录。
- 人工修正不得覆盖原 AI 输出，应另存 correction。
- 使用 LangGraph 时必须记录 provider、model、prompt version、agent version、graph version、输入快照、输出快照和失败原因。

### 5.6 OriginalSourceLink

原始页面回链是核心能力。

必须包含：

- source platform
- original url
- normalized url
- external id
- last verified at
- verification status
- fallback metadata
- screenshot storage key
- risk level

规则：

- 原始链接不得作为普通字符串散落在 Candidate 中。
- 回链必须支持失效检测。
- 高匹配候选人可保存截图存证。
- 存证策略必须遵守风控要求。
- 插件采集不得过度侵入来源平台。

---

## 6. 编码规范

### 6.1 TypeScript

要求：

- 必须开启 `strict`。
- 禁止使用隐式 `any`。
- 禁止滥用 `as unknown as`。
- 公共函数必须声明输入和输出类型。
- Domain 层优先使用显式类型和值对象。
- 外部输入必须经过 Zod 校验。
- 内部领域对象不得直接暴露数据库模型。

推荐：

```ts
type SearchRunId = string;
type CandidateId = string;
type JobProfileId = string;
```

禁止：

```ts
function handle(data: any) {
  return data.status === 'ok';
}
```

推荐：

```ts
const SearchRunStatusSchema = z.enum([
  'draft',
  'criteria_confirmed',
  'queued',
  'searching',
  'filtering',
  'assessing',
  'completed',
  'failed',
  'cancelled',
]);

type SearchRunStatus = z.infer<typeof SearchRunStatusSchema>;
```

### 6.2 命名规范

类与类型：

- `JobProfile`
- `SearchRun`
- `CandidateSummary`
- `AIAssessmentResult`

应用服务：

- `CreateSearchRunService`
- `RunHardFilterService`
- `ReassessCandidateService`

接口：

- `CandidateRepository`
- `AIAssessmentAdapter`
- `AttachmentStorage`

实现类：

- `PrismaCandidateRepository`
- `HttpAIAssessmentAdapter`
- `S3AttachmentStorage`

测试文件：

- `search-run-state-machine.test.ts`
- `hard-filter.test.ts`
- `ai-assessment-contract.test.ts`

### 6.3 API DTO

API DTO 必须独立于 Domain Entity 和 Prisma Model。

禁止直接返回 Prisma Model。

禁止：

```ts
return prisma.candidate.findMany();
```

推荐：

```ts
const candidates = await service.execute(query);
return CandidateListResponseSchema.parse(candidates);
```

### 6.4 Zod 使用规范

所有边界输入必须校验：

- HTTP request body
- HTTP query
- HTTP params
- Plugin payload
- CSV row
- AI output
- Queue job payload
- Environment variables

要求：

- Request schema 与 Response schema 分开。
- Adapter payload schema 与 Domain schema 分开。
- AI output schema 必须版本化。
- LangChain / LangGraph structured output schema 必须独立于 API DTO 和 Domain Entity。
- LangChain / LangGraph output schema 必须版本化。
- 失败时返回明确错误码和错误字段。
- 模型输出 schema 校验失败必须显式抛错，不得 fallback 成默认推荐结果。

### 6.5 错误处理

禁止吞错。

禁止：

```ts
try {
  await runAssessment();
} catch {}
```

推荐：

```ts
try {
  await runAssessment();
} catch (error) {
  await errorLogRepository.save({
    scope: 'ai_assessment',
    reason: normalizeError(error),
    candidateId,
    searchRunId,
  });

  throw new AssessmentFailedError(candidateId, error);
}
```

错误必须区分：

- validation error
- permission error
- domain rule error
- infrastructure error
- external service error
- queue retryable error
- queue non-retryable error

### 6.6 日志规范

MVP 当前日志应尽量包含：

- request id
- user id
- search run id
- candidate id
- job id
- event name
- duration
- error reason

后续多租户版本必须补充：

- tenant id

禁止在日志中输出：

- 完整简历原文。
- 身份证号。
- 手机号。
- 邮箱明文。
- 未脱敏联系方式。
- 未授权的候选人隐私信息。

### 6.7 数据库规范

MVP 当前核心表应至少包含：

- id
- created_at
- updated_at
- created_by
- updated_by

后续多租户版本必须补充：

- tenant_id

重要业务表建议包含：

- version
- status
- deleted_at
- metadata
- audit fields

禁止：

- 直接物理删除核心业务数据。
- 在无索引字段上做高频查询。
- 用 JSON 字段承载主要查询条件。
- 用字符串散落表示状态，必须有枚举约束。
- 历史 SearchRun 依赖可变 JobProfile。

### 6.8 队列规范

MVP 当前 Queue job payload 应至少包含：

- job id
- search run id
- candidate id，若适用
- attempt
- created at
- payload version

后续生产化版本必须补充：

- tenant id
- idempotency key

规则：

- MVP 当前队列任务必须有基本失败记录，插件候选人提交要尽量避免重复写入。
- 队列任务幂等键、多次重试策略和可重试/不可重试错误分类后续完善。
- 队列任务不得直接绕过 Application Service。
- 队列任务成功后必须更新业务状态。
- 队列任务失败必须记录 ErrorLog。
- cancelled 的 SearchRun 不得继续执行。

### 6.9 前端编码规范

前端页面应按业务组织：

```text
features/
  job-profile/
  search-run/
  candidate/
  ai-assessment/
  shared/
```

要求：

- 远程数据统一使用 TanStack Query。
- 表格状态必须可控。
- 复杂表格列配置独立维护。
- 表单 schema 与 API schema 保持一致。
- 权限态、空状态、加载态、失败态必须完整。
- 前端不得复制后端评分规则。
- 前端不得自行推断 SearchRun 状态流转。

---

## 7. 架构纪律

### 7.1 业务规则不得外泄

凡属于以下内容，必须进入 Domain Layer：

- 岗位画像权重。
- 硬性条件判断。
- 匹配分计算。
- 状态流转。
- AI 评估结果解释。
- 原始回链有效性规则。
- 候选人去重规则。

不得写在：

- React Component。
- API Route。
- Prisma Repository。
- Queue Processor。
- Adapter。
- SQL 查询片段。

LangGraph prompt / node 不得实现：

- 硬性条件判断。
- SearchRun 状态流转。
- 权限判断。
- 候选人去重。
- 匹配排序规则。

### 7.2 状态必须由状态机控制

SearchRun、CandidateAssessment、OriginalSourceLink 均应有明确状态。

禁止直接赋值：

```ts
searchRun.status = 'completed';
```

推荐：

```ts
searchRun.complete();
```

状态变化必须：

- 校验前置状态。
- 记录状态事件。
- MVP 当前至少写入 SearchRun 事件和失败原因。
- 完整审计日志后续实现。
- 必要时发布 Domain Event。
- LangGraph 不得直接修改 SearchRun 状态，必须通过 Application Service 调用领域状态机。

### 7.3 AI 输出必须可追溯

任何 AI 结论都必须能回答：

- 用了哪个岗位画像版本？
- 用了哪个 Prompt 版本？
- 用了哪个模型？
- 输入材料是什么？
- 输出结构是什么？
- 为什么给这个分？
- 哪些证据支持结论？
- 是否被人工修正过？

无法追溯的 AI 结果不得作为排序、推荐、导出依据。

使用 LangChain / LangGraph 时，还必须能回答：

- 使用了哪个 graph version？
- 执行了哪些节点？
- 哪个节点调用了模型？
- 模型输出经过了哪个 schema 校验？
- 失败发生在哪个节点？

所有 LangGraph AI 调用必须进入 AI Assessment 审计链路。

### 7.4 原始页面回链优先级高

OriginalSourceLink 是核心对象。

开发中不得将其简化为一个 `url` 字段。

回链必须支持：

- 平台标识。
- 原始 URL。
- 标准化 URL。
- 外部候选人 ID。
- 最后验证时间。
- 失效状态。
- 备用定位信息。
- 高匹配截图存证。

### 7.5 数据安全优先

候选人数据、简历附件、联系方式属于敏感数据。

要求：

- 最小化保存。
- 分级授权访问。
- MVP 当前至少按用户身份或 `ownerId` 控制访问。
- 访问记录审计后续实现。
- 导出记录审计后续实现。
- 附件使用对象存储后续实现。
- MVP 当前允许本地附件存储，但 API 响应不得暴露本地 `storagePath`。
- 对象存储临时访问链接后续实现，届时必须有过期时间。
- 日志不得输出敏感原文。
- 高匹配截图存证必须受策略限制。

### 7.6 幂等优先

以下操作必须幂等：

- CSV 导入。
- 插件候选人上报。
- 候选人抓取。
- 硬性过滤。
- AI 评估。
- 重评估。
- 任务完成。
- 导出。

幂等键建议由以下信息组成：

```text
search_run_id + candidate_source + external_candidate_id + operation_type
```

后续多租户版本补充 `tenant_id`。

### 7.7 历史结果不得被静默改写

以下数据一旦用于 SearchRun，应保留历史版本：

- JobProfile。
- SearchCriteria。
- Prompt version。
- AI assessment output。
- Match score。
- Candidate snapshot / summary。
- Original source link metadata。

允许新增版本，不允许静默覆盖历史事实。

---

## 8. 测试要求

### 8.1 Domain Unit Test

必须覆盖：

- JobProfile 权重规则。
- SearchRun 状态机。
- HardFilter 判断。
- MatchScore 计算。
- AIAssessmentContract 校验。
- OriginalSourceLink 状态判断。
- Candidate identity 去重规则。

### 8.2 Application Test

必须覆盖：

- 创建搜索任务。
- 确认搜索条件。
- 派发队列。
- 候选人导入。
- 硬性过滤执行。
- AI 评估执行。
- 重评估。
- 任务完成。
- 局部失败恢复。

### 8.3 API Test

MVP 当前必须覆盖：

- 请求校验失败。
- 权限不足。
- 正常响应结构。
- 错误响应结构。
- SearchRun 事件或 AI 审计关键路径。

后续多租户和审计体系必须补充：

- 租户隔离。
- 审计日志写入。

### 8.4 Infrastructure Test

MVP 当前必须覆盖：

- Repository 映射。
- AI adapter 输出校验。
- CSV adapter 脏数据处理。

后续生产化版本必须补充：

- 队列 job 幂等。
- Object storage 上传与访问权限。
- Outbox 事件投递。

---

## 9. 安全与合规约束

必须遵守：

- 不保存不必要的 PII。
- 不在日志中打印候选人敏感信息。
- 不将完整简历原文传递给无关服务。
- 不让前端直接访问对象存储永久地址；MVP 本地附件存储不得向前端暴露本地 `storagePath`。
- 不绕过权限导出候选人。
- 不过度侵入第三方招聘平台。
- 不保存低匹配候选人的无必要截图。
- 高匹配截图存证必须有业务原因和访问权限。

涉及插件采集时，应优先考虑：

- 用户主动触发。
- 明确提示采集范围。
- 限制采集频率。
- 避免模拟破坏性操作。
- 避免绕过平台访问控制。
- MVP 当前保留可追溯的 SearchRun 事件和插件提交记录。
- 完整采集行为审计后续实现。

---

## 10. AI 协作规范

当 AI Agent 参与编码、改造、生成文件时，必须遵守以下规则。

### 10.1 修改前

必须先判断修改属于哪一层：

- Web App
- API Layer
- Application Layer
- Domain Layer
- Infrastructure Layer

不得跨层随意修改。

涉及 AI 能力、LangChain 或 LangGraph 时，必须先检查：

- 现有 `AIAssessmentPort`。
- AI Assessment 审计链路。
- prompt version。
- agent version。
- 现有模型输出契约。

### 10.2 修改中

必须遵守：

- 先读现有类型和接口。
- 优先复用现有领域对象。
- 不新增重复概念。
- 不绕过状态机。
- 不绕过 Repository interface。
- 不直接把业务规则写进 route、component、processor。
- 不使用 `any` 逃避类型问题。
- 不用临时 mock 替代真实边界设计。
- 不硬编码租户、用户、状态、模型名。
- 新增 AI graph 必须以 adapter 形式接入现有 port，不允许新增平行 AI 调用路径。
- LangGraph 节点必须职责单一，不得写成多模式函数。
- 不得使用 flag 参数切换 LangGraph 节点行为。

### 10.3 修改后

必须确认：

- 类型检查通过。
- 单元测试通过。
- 新增业务规则有测试。
- 新增 API 有 schema。
- MVP 当前新增队列任务要有基本失败记录并避免明显重复写入。
- 后续生产化新增队列任务必须有幂等键。
- 新增 AI 输出有 Zod 校验。
- MVP 当前新增数据表应有必要索引和创建/更新时间字段。
- 后续生产化新增数据表必须补充审计字段和租户字段。
- 新增外部调用有错误处理与日志。
- 新增真实 AI provider 有最小 smoke 或 integration 验证路径。

### 10.4 禁止行为

AI Agent 不得：

- 删除审计逻辑。
- 简化权限判断。
- 删除状态机判断。
- 直接覆盖历史评估结果。
- 将 AI 输出直接作为可信数据入库。
- 将候选人敏感信息写入日志。
- 将业务规则写入 React 组件。
- 将 Prisma Model 直接返回给前端。
- 将队列任务写成不可重试、不可追踪的脚本。
- 在没有 schema 的情况下接收插件或 CSV 数据。
- 在 Domain、Application、API 或 Web App 中直接使用 LangChain / LangGraph SDK。
- 绕过 `AIAssessmentPort`、AI 审计或 SearchRun 状态机调用真实模型。

---

## 11. 代码审查清单

提交代码前，必须检查：

- 是否符合分层依赖。
- 是否新增或修改了核心领域规则。
- 是否为领域规则补充测试。
- 是否绕过了状态机。
- 是否绕过了权限。
- 是否有审计记录。
- 是否有错误处理。
- 是否有幂等设计。
- MVP 当前是否有用户身份边界和 owner 级访问控制。
- 后续多租户版本是否有租户隔离。
- 是否有敏感信息泄露风险。
- 是否保持历史数据可追溯。
- 是否影响 SearchRun 历史结果。
- 是否影响 AI 评估可解释性。
- 是否影响原始页面回链。

---

## 12. 推荐开发顺序

建议按以下顺序建设：

1. Domain Layer：JobProfile、SearchRun、Candidate、HardFilter、AIAssessmentContract。
2. Database Schema：核心表、状态字段、版本字段、审计字段。
3. Application Services：SearchRun 创建、确认、派发、过滤、评估。
4. Queue：BullMQ job、幂等、失败恢复。
5. API：Fastify routes、Zod schema、权限、审计。
6. Web App：岗位画像、任务看板、候选人列表、匹配报告。
7. Infrastructure Adapters：CSV、Plugin、HTTP AI；Object Storage 后续实现。
8. Observability：MVP 先覆盖错误和任务状态；成本、耗时、任务追踪后续完善。
9. 风控增强：回链验证、截图存证、附件访问控制。
10. 运营统计：通过率、评分分布、来源质量、AI 失败原因。

---

## 13. 最低质量门槛

MVP 当前任何功能上线前，必须满足：

- 有明确所属模块。
- 有明确领域对象。
- 有 Zod schema。
- 有用户身份边界；Web Token / Plugin Token 必须区分。
- SearchRun、JobProfile、附件、AI 审计等敏感接口至少有 `ownerId` 或创建用户访问控制。
- 有错误处理。
- 涉及 SearchRun 的变更有状态事件或失败原因。
- 涉及 AI 判断的变更有 AI Assessment 审计。
- 有基础测试。
- 涉及队列或外部输入时，至少避免明显重复写入；完整幂等键后续完善。
- 有敏感数据处理策略，若涉及候选人或简历。
- 有可追溯记录，若涉及 AI 判断或匹配排序。
- 新增真实 AI provider 接入前，有最小 smoke 或 integration 验证。
- 真实 AI provider 至少覆盖结构化输出成功、输出缺字段、模型调用失败三类场景。
- 没有 AI Assessment 审计的模型调用不得进入主流程。

不满足以上条件的功能，不应进入主分支。

后续生产化版本必须补充：

- 租户隔离。
- RBAC 角色模型。
- 全局审计日志。
- Outbox。
- 对象存储与临时访问链接。
- 队列幂等键和多次重试策略。
