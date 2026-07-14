# 开发手册

> 文档性质：规范——开发规约的事实源：本地开发、分支提交、目录结构、编码规范、测试要求、安全规约、审查清单与质量门槛。架构与分层依赖规则见 `docs/10-technical-architecture.md` 第 12-14 节；AI Agent 行为约定见 `AGENTS.md`。

## 1. 本地启动

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:deploy
npm run prisma:generate
```

启动 API：

```bash
npm run build
npm start
```

启动 Worker：

```bash
npm run worker:search
```

启动前端：

```bash
npm run web:dev
```

## 2. 常用命令

```bash
npm run typecheck
npm run web:typecheck
env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate
npm test
npm run web:build
npm run contracts:check
```

## 3. 分支和提交

分支：

```text
codex/中文短描述
```

提交：

```text
feat: 增加插件提交接口
docs: 写回确认细节和设计风险
fix: 修复候选人去重问题
```

合并到 `main` 前必须执行全量检查：

```bash
npm run typecheck
npm run web:typecheck
env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate
npm test
npm run web:build
```

## 4. 目录结构

当前代码按层横向切分，新增文件必须放入所属层的对应目录：

```text
src/
  api/                 # Fastify app、路由、schemas、server 入口
    app.ts
    production-app.ts
    schemas.ts
    server.ts
  application/         # 用例编排、ports、鉴权
    ports.ts
    search-orchestrator.ts
    search-run-job-handler.ts
    ...
  domain/              # 领域对象与规则，保持纯净、无框架依赖
    job-profile.ts
    search-run.ts
    hard-filter.ts
    ai-assessment-contract.ts
    original-source-link.ts
    ...
  infrastructure/      # Adapter 实现，按技术类别分子目录
    prisma/  bullmq/  redis/  memory/  langgraph/
    ai/  http/  csv/  local/  mock/  source/
  config/              # 环境变量加载
  workers/             # 队列 worker 入口
  scripts/             # 运维脚本

web/
  src/
    components/        # layout / shared / ui（shadcn 风格）
    lib/               # api-client、api-types、utils

tests/                 # 测试平铺，按被测对象命名 *.test.ts
```

规则：

- 新增 Infrastructure 实现放入对应技术子目录，没有合适子目录时新建。
- 测试放在 `tests/` 下，文件名与被测对象一致，例如 `hard-filter.test.ts`。
- 若后续模块数量增长导致单层目录臃肿，可演进为按业务模块纵切（`modules/<module>/{domain,application,infrastructure,api}`）；演进时必须同步更新本节。
- 无论目录如何演进，必须保留清晰的 domain / application / infrastructure / api 边界。

## 5. 架构边界

主工程负责：

- 用户认证。
- JobProfile / JobProfileVersion。
- SearchRun。
- 插件数据 ingestion。
- 去重、硬筛、AI 评估、排序、审计。
- 附件保存和下载。

主工程不负责：

- 真实招聘平台抓取。
- 插件抓取节奏。
- 插件风控规避策略。
- ATS、Offer、客户推进、长期人才库。

分层职责、依赖方向和架构纪律的事实源是 `docs/10-technical-architecture.md` 第 12-14 节。

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
  'Created',
  'Running',
  'Acquired',
  'Deduplicated',
  'HardFiltered',
  'Assessed',
  'Completed',
  'Interrupted',
  'Failed',
  'Cancelled',
]);

type SearchRunStatus = z.infer<typeof SearchRunStatusSchema>;
```

### 6.2 命名规范

类与类型：

- `JobProfile`
- `SearchRun`
- `CandidateResult`
- `MatchAssessment`

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

- `search-orchestrator.test.ts`
- `hard-filter.test.ts`
- `ai-assessment-contract.test.ts`

### 6.3 API DTO

API DTO 必须独立于 Domain Entity 和 Prisma Model。

禁止直接返回 Prisma Model：

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
- LangChain / LangGraph structured output schema 必须独立于 API DTO 和 Domain Entity，且必须版本化。
- 失败时返回明确错误码和错误字段。
- 模型输出 schema 校验失败必须显式抛错，不得 fallback 成默认推荐结果。

### 6.5 错误处理

禁止吞错：

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

后续多租户版本必须补充 tenant id。

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

后续多租户版本必须补充 tenant_id。

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

后续生产化版本必须补充 tenant id 和 idempotency key。

规则：

- MVP 当前队列任务必须有基本失败记录，插件候选人提交要尽量避免重复写入。
- 队列任务幂等键、多次重试策略和可重试/不可重试错误分类后续完善。
- 队列任务不得直接绕过 Application Service。
- 队列任务成功后必须更新业务状态。
- 队列任务失败必须记录 ErrorLog。
- cancelled 的 SearchRun 不得继续执行。

### 6.9 前端编码规范

前端当前按组件类型组织（`web/src/components/{layout,shared,ui}` 加 `web/src/lib`）；页面增多后可演进为按业务 feature 组织（`features/{job-profile,search-run,candidate,ai-assessment,shared}`），演进时同步更新本节。

要求：

- 远程数据统一使用 TanStack Query。
- 表格状态必须可控。
- 复杂表格列配置独立维护。
- 表单 schema 与 API schema 保持一致。
- 权限态、空状态、加载态、失败态必须完整。
- 前端不得复制后端评分规则。
- 前端不得自行推断 SearchRun 状态流转。

## 7. 测试要求

### 7.1 Domain Unit Test

必须覆盖：

- JobProfile 权重规则。
- SearchRun 状态机。
- HardFilter 判断。
- MatchAssessment 匹配分计算。
- AIAssessmentContract 校验。
- OriginalSourceLink 状态判断。
- CandidateResult 指纹去重规则。

### 7.2 Application Test

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

### 7.3 API Test

MVP 当前必须覆盖：

- 请求校验失败。
- 权限不足。
- 正常响应结构。
- 错误响应结构。
- SearchRun 事件或 AI 审计关键路径。

后续多租户和审计体系必须补充：租户隔离、审计日志写入。

### 7.4 Infrastructure Test

MVP 当前必须覆盖：

- Repository 映射。
- AI adapter 输出校验。
- CSV adapter 脏数据处理。

后续生产化版本必须补充：队列 job 幂等、Object storage 上传与访问权限、Outbox 事件投递。

## 8. 安全与合规规约

风控与插件采集的业务口径事实源是 `docs/00-requirements-baseline.md` 第 6 节；本节为工程侧执行规约。

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
- MVP 当前保留可追溯的 SearchRun 事件和插件提交记录；完整采集行为审计后续实现。

## 9. 新增 API 的要求

- 使用 `/api` 前缀。
- 明确错误码。
- 失败响应包含可行动的错误信息。
- 插件接口必须校验 Plugin Token。
- Web 接口第一阶段使用 Web JWT。
- 高风险变更需要补集成测试。

## 10. 新增领域能力的要求

- 优先改领域纯函数，再接 API/Prisma/前端。
- 不在 API 层直接塞业务规则。
- SearchRun 状态变化需要事件。
- AI 调用需要审计。
- 硬筛 trace 和软性匹配 trace 需要可回溯。

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

## 12. 合并前质量门槛

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

后续生产化版本必须补充：租户隔离、RBAC 角色模型、全局审计日志、Outbox、对象存储与临时访问链接、队列幂等键和多次重试策略。

## 13. 版本发布记录格式

发布记录写入仓库根目录 `CHANGELOG.md`，每次发布使用以下格式：

```markdown
# v0.x.y - YYYY-MM-DD

## 新增
- 

## 修复
- 

## 文档
- 

## 迁移
- 

## 验证
- `npm run typecheck`
- `npm run web:typecheck`
- `env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate`
- `npm test`
- `npm run web:build`
```

## 14. 文档与代码契约联动

当前 API 边界输入以 `src/api/schemas.ts` 的 Zod schema 作为请求校验事实源，`docs/31-technical-openapi.yaml` 作为对外发布契约。后续任务统一以 `docs/50-todo.md` 为事实源。

修改 API 字段、枚举、默认值、领域状态、任务状态或验收口径时，必须同步更新对应文档，并运行：

```bash
npm run contracts:check
```

该检查会校验 `SearchRunStatus`、`targetResultCount` 等 P0 契约在 Domain 类型、Zod schema、OpenAPI 和架构映射表之间保持一致，并确认 `docs/50-todo.md` 已接入 README、开发手册和任务关键词检查。
