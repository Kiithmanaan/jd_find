# JD Search

岗位驱动的一次性自动寻访与 AI 辅助筛选 MVP 骨架。

当前代码实现的是工程架构第一阶段：用 Mock Source Adapter 和 Mock AI Assessment 跑通从已确认岗位画像到候选人结果排序、解释、回链与风控中止的业务闭环。

## 当前范围

已实现：

- TypeScript + Fastify 项目骨架。
- 领域模型：`JobProfile`、`SearchRun`、`CandidateResult`、`MatchAssessment`、`SourceLead`。
- 业务规则：画像确认、插件寻访目标数量配置、当前任务内去重、硬筛优先、软性匹配、匹配分排序。
- AI 边界：只做 Mock 条件下的匹配评估和解释，不自动沟通、不最终推荐。
- 风控边界：风险触发后 `SearchRun` 中止，不继续补齐候选人结果。
- 失败边界：外部来源或 AI 评估异常会保存 `Failed` 快照和失败原因，便于 API 查询和 Worker 排障。
- 用户认证：Web 登录 JWT、Plugin Token、Prisma 用户仓库、用户创建脚本。
- Repository 端口和内存实现。
- BullMQ 队列适配器边界。
- Prisma Repository 实现。
- Prisma schema 持久化模型。
- Prisma migrations：初始化表结构、AI 评估审计、SearchRun 失败原因。
- BullMQ Worker 入口。
- 生产 API 入口使用 Prisma Repository 和 BullMQ Queue。
- API 入口：健康检查、一次性寻访入队、寻访任务查询、AI 评估审计查询。
- Source Adapter 契约：来源结果规范化、风控优先、SourceLead 回链/辅助找回线索校验。
- CSV Source Adapter：从本地 CSV 文件读取候选人草稿，作为非第三方平台的真实输入来源。
- AI Assessment 契约：匹配分规范化、解释必填、禁止最终决策措辞。
- AI Assessment 审计：记录评估输入快照、输出快照、provider 和 model。
- HTTP AI Assessment Adapter：通过通用 HTTP endpoint 接入外部 AI 评估服务。
- 插件 ingestion API：插件 SearchRun 创建、插件候选人批量提交、按创建用户限制提交范围。
- GitHub Actions CI：push / pull request 时执行依赖安装、Prisma generate/validate、后端类型检查、前端类型检查、测试和前端构建。
- React/Vite 运维工作台：Web/插件登录、插件 SearchRun 创建、候选人批次提交、SearchRun 查询、AI 审计查询。

未实现：

- 真实招聘平台接入。
- 真实 AI 模型接入。
- 完整产品级前端界面。
- 浏览器插件本体。
- 简历附件上传和下载。
- ATS、长期人才库、自动沟通。

## 安装

```bash
npm install
```

准备本地环境变量：

```bash
cp .env.example .env
```

API 和 Worker 启动时会自动加载当前目录下的 `.env`。已有系统环境变量优先级更高，不会被 `.env` 覆盖。

## 验证

```bash
npm run typecheck
npm test
npm run prisma:validate
```

## 本地基础设施

启动 PostgreSQL 和 Redis：

```bash
npm run db:up
```

停止：

```bash
npm run db:down
```

生成 Prisma Client：

```bash
npm run prisma:generate
```

开发环境创建/应用迁移：

```bash
npm run prisma:dev
```

生产或类生产环境应用迁移：

```bash
npm run prisma:deploy
```

当前仓库已包含 migration：

- `prisma/migrations/20260604150000_init/migration.sql`
- `prisma/migrations/20260604161000_ai_assessment_audit/migration.sql`
- `prisma/migrations/20260604170000_search_run_failure_reason/migration.sql`
- `prisma/migrations/20260606110000_job_profile_versions/migration.sql`
- `prisma/migrations/20260606112000_hard_condition_config/migration.sql`
- `prisma/migrations/20260606130000_users_and_incremental_search/migration.sql`

## 运行 API

`npm start` 使用生产接线：Prisma Repository + BullMQ Queue。请先启动 PostgreSQL / Redis 并应用 migration。

```bash
npm run build
npm start
```

默认监听：

```text
http://127.0.0.1:3000
```

## 运行前端

开发模式：

```bash
npm run web:dev
```

默认监听：

```text
http://127.0.0.1:5173
```

前端开发服务会把 `/api` 代理到 `http://127.0.0.1:3000`。

生产构建：

```bash
npm run web:build
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

硬性条件配置：

```text
GET /api/hard-condition-config
```

创建初始用户：

```bash
npm run build
USER_EMAIL=hunter@example.com USER_PASSWORD='change-me' npm run user:create
```

Web 登录：

```text
POST /api/auth/login
→ { token, tokenType: "Bearer", expiresIn }
```

插件登录：

```text
POST /api/plugin/auth/login
→ { token, tokenType: "Bearer", expiresIn }
```

一次性寻访启动接口采用异步语义：

```text
POST /api/search-runs/one-time
→ 202 Accepted
→ { jobId, searchRunId, status: "Queued", statusUrl }
```

Mock 来源请求体：

```json
{
  "jobProfile": {},
  "sourceType": "mock",
  "candidates": [],
  "riskSignal": null
}
```

`sourceType` 省略时默认按 `mock` 处理。

CSV 来源请求体：

```json
{
  "jobProfile": {},
  "sourceType": "csv",
  "csvFilePath": "/absolute/path/to/candidates.csv"
}
```

插件来源请求体需要 Web Bearer Token：

```json
{
  "jobProfile": {},
  "sourceType": "plugin",
  "targetResultCount": 200
}
```

插件提交候选人需要 Plugin Bearer Token：

```text
POST /api/plugin/search-runs/:id/candidates
```

```json
{
  "batchId": "batch-1",
  "sourcePlatform": "Boss",
  "candidates": []
}
```

任务查询：

```text
GET /api/search-runs/:id
```

当来源适配器或 AI 评估异常时，Worker 仍会保存可查询的 `SearchRun`：

```json
{
  "status": "Failed",
  "failureReason": "Error: AI service unavailable",
  "events": [{ "type": "SearchFailed" }]
}
```

AI 评估审计查询：

```text
GET /api/search-runs/:id/ai-assessment-audits
```

错误边界：

- `400 ValidationError`：请求结构或字段格式不合法。
- `422 DomainError`：请求结构合法，但违反业务规则，例如岗位画像未确认。
- `404 SearchRunNotFound`：查询的寻访任务不存在。

## 运行 Worker

需要先准备 PostgreSQL 和 Redis，并配置 `.env` 中的连接信息。可以用 `npm run db:up` 启动本地依赖。

```bash
npm run build
npm run worker:search
```

## 架构文档

- `docs/engineering-architecture.md`：工程化落地架构确认稿。
- `docs/pre-implementation-decisions.md`：代码实现前确认清单。
- `docs/confirmed-decisions.md`：当前已确认的产品与工程决策。
- `docs/non-code-todo.md`：非代码类 TODO 清单。

## Source Adapter 契约

真实来源适配器必须返回统一的 `SourceAcquisitionResult`：

```text
{ candidates: CandidateDraft[], riskSignal?: RiskSignal }
```

契约约束：

- 如果返回 `riskSignal`，候选人结果会被清空，后续流程进入风控中止。
- `SourceLead` 必须至少包含直接 URL 或辅助找回线索。
- `SourceLead.platform` 和 `SourceLead.searchContext` 必须存在。
- 候选人草稿会在进入筛选前进行 trim 和空值清理。

## CSV Source Adapter

CSV adapter 用于本地文件输入，不触碰第三方平台。

必需表头：

```text
fingerprint,name,title,city,educationLevel,yearsOfExperience,industries,keywords,summary,intent,activityLevel,platform,sourceUrl,searchContext,fallbackClues
```

规则：

- 第一行必须是表头。
- `industries`、`keywords`、`fallbackClues` 使用分号 `;` 分隔。
- `yearsOfExperience` 必须是非负整数。
- `sourceUrl` 可以为空，但此时 `fallbackClues` 至少要有一条。
- CSV 支持双引号包裹的字段和字段内逗号。

样例见 `tests/fixtures/candidates.csv`。

## AI Assessment 契约

真实 AI 评估实现必须返回 `Map<candidateId, MatchAssessment>`。

契约约束：

- 只评估硬筛通过的候选人。
- 必须覆盖本次请求范围内的全部候选人。
- 不得返回请求范围外的候选人评估。
- 匹配分会被规范到 `0-100`。
- `fitPoints` 至少包含一条解释。
- `fitPoints` 和 `riskPoints` 会清理空文本。
- 禁止输出“最终推荐”“建议录用”“必须沟通”等最终决策措辞。

## AI Assessment 审计

当一次寻访存在硬筛通过候选人并完成 AI 评估后，系统会写入 AI 审计记录。

审计内容：

- `searchRunId`
- `jobProfileId`
- `provider`
- `model`
- 参与评估的候选人 id
- 岗位画像和候选人输入快照
- 归一化后的 AI 输出快照

风控中止或没有硬筛通过候选人时，不写 AI 审计记录。

审计记录可以通过 API 按寻访任务查询：

```text
GET /api/search-runs/:id/ai-assessment-audits
→ { searchRunId, records }
```

## HTTP AI Assessment Adapter

Worker 默认使用 mock AI。通过 `.env` 可以切换为通用 HTTP AI endpoint：

```text
AI_ASSESSMENT_PROVIDER=http
AI_ASSESSMENT_ENDPOINT=https://your-ai-service.example/assess
AI_ASSESSMENT_API_KEY=optional-token
AI_ASSESSMENT_PROVIDER_NAME=http
AI_ASSESSMENT_MODEL=external-ai-assessment
AI_ASSESSMENT_TIMEOUT_MS=30000
```

请求格式：

```json
{
  "jobProfile": {
    "id": "job-1",
    "title": "岗位名称",
    "searchCondition": {},
    "hardRequirements": [],
    "softRequirements": []
  },
  "candidates": [
    {
      "id": "run-1-candidate-1",
      "fingerprint": "candidate-fingerprint",
      "resume": {}
    }
  ]
}
```

响应格式：

```json
{
  "assessments": [
    {
      "candidateId": "run-1-candidate-1",
      "score": 86,
      "fitPoints": ["具备客户理解能力"],
      "riskPoints": ["需要人工确认求职意向"]
    }
  ]
}
```

HTTP AI 返回结果仍会经过 AI Assessment 契约校验，并写入 AI 审计。

## 下一步

建议继续按以下顺序实现：

1. 在本地 Docker PostgreSQL 上执行 migration 并做集成验证。
2. 接入真实 AI Assessment Port，并沿用现有输入输出审计查询链路。
3. 接入真实 Source Adapter。
4. 增加前端或轻量运维界面。
