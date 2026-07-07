# 代码 TODO 与独立开发任务拆解

本文档只记录当前仍需开发或复核的代码类事项。已完成的第一阶段能力不重复列入；产品级前端、浏览器插件本体等后置事项会标明边界，避免误当作当前主工程 P0。

## 任务状态口径

- `P0`：影响生产接线、部署一致性或主闭环可靠性的近期任务。
- `P1`：第一阶段后续增强，可独立排期。
- `后置`：已确认暂不进入当前主工程实现，作为后续项目或前端里程碑。
- `非主工程`：不在本仓库实现，只保留协议或边界约束。

## P0-01 AI Assessment 生产接线核对

- 背景：README 曾记录 API 进程内插件增量评估和重评估的 HTTP AI 生产接线未完成；当前生产入口已使用 `createAIAssessmentFromEnv`，需要复核文档与代码是否已对齐。
- 所属层：API Layer、Application Layer、Infrastructure Layer。
- 建议文件范围：`src/api/production-app.ts`、`src/infrastructure/ai/create-ai-assessment.ts`、`src/application/plugin-candidate.service.ts`、`src/application/reassess-job-profile-candidates.ts`、相关测试和 README。
- 交付内容：确认 API、Worker、插件增量评估、重评估均使用同一 AI Assessment port 接线；若已完成则更新文档口径，若未完成则补齐接线。
- 验收标准：mock、HTTP、LangGraph OpenAI provider 的配置路径清晰；成功和失败调用均进入 AI Assessment 审计链路。
- 测试建议：补充生产入口 AI provider 注入测试；保留 `createAIAssessmentFromEnv` 单元测试；运行 `npm run contracts:check`、`npm run typecheck`、`npm test`。

## P0-02 插件聚合持久化

- 背景：当前插件聚合使用 API 进程内定时器，单进程 MVP 可用；多进程或 Worker 部署时存在重复处理、漏处理和取消状态不一致风险。
- 所属层：Application Layer、Infrastructure Layer、Queue。
- 建议文件范围：`src/application/plugin-candidate.service.ts`、`src/infrastructure/bullmq/`、`src/workers/`、`src/api/app.ts`、相关 repository 测试。
- 交付内容：将 30 秒聚合窗口、20 条立即触发、取消后停止处理迁移到 Redis/BullMQ 或持久队列。
- 验收标准：多 API 进程下同一 SearchRun 不重复评估；取消、完成、失败状态下不再处理待聚合候选人；失败原因可查询。
- 测试建议：增加队列级集成测试，覆盖窗口触发、阈值触发、取消后跳过、重复任务幂等。

## P0-03 插件提交限流

- 背景：插件协议要求第一阶段做 API key + SearchRun 维度的保护型限流，并返回 `RateLimited`。
- 所属层：API Layer、Application Layer。
- 建议文件范围：`src/api/app.ts`、`src/api/schemas.ts`、`docs/plugin-integration-protocol.md`、API 测试。
- 交付内容：为插件候选人提交和附件上传入口增加简单限流，错误码与协议保持一致。
- 验收标准：超限返回 `RateLimited`；正常批量提交不受影响；错误响应不暴露敏感信息。
- 测试建议：API 测试覆盖正常提交、同一 SearchRun 高频提交超限、不同 SearchRun 互不影响。

## P0-04 部署前集成验证

- 背景：本地单元测试已覆盖主路径，但上线前仍需用真实 PostgreSQL、Redis、API、Worker 和附件目录做 smoke 验证。
- 所属层：Infrastructure Layer、部署脚本、文档。
- 建议文件范围：`docs/deployment-guide.md`、`docs/operations-runbook.md`、`docs/demo-script.md`、CI 或 smoke 脚本。
- 交付内容：形成可重复执行的部署前验证步骤，覆盖 migration、创建用户、登录、插件 SearchRun、候选人提交、附件上传下载、AI 审计查询。
- 验收标准：一台本地或云端 Docker Compose 环境可按文档跑通；失败时能定位到数据库、Redis、Worker、AI provider 或附件目录。
- 测试建议：执行 `npm run db:up`、`npm run prisma:deploy`、`npm run build`、`npm start`、`npm run worker:search` 和 demo 请求。

## P1-01 真实 Source Adapter 接入

- 背景：主工程不直接实现招聘平台抓取，但需要支持真实来源数据通过统一 Source Adapter 或受控内部数据源接入。
- 所属层：Application Layer、Infrastructure Layer。
- 建议文件范围：`src/application/ports.ts`、`src/domain/source-adapter-contract.ts`、`src/infrastructure/`、Source Adapter 测试。
- 交付内容：实现可配置的真实 Source Adapter，建议优先选择通用 HTTP Source Adapter 或内部数据源 Adapter。
- 验收标准：输出统一 `SourceAcquisitionResult`；风控信号仍优先中止；不把抓取节奏、风控规避策略写入主工程。
- 测试建议：契约测试覆盖正常候选人、风险信号、脏数据、SourceLead 缺失 fallback 的校验失败。

## P1-02 SourceLead 失效检测

- 背景：Domain 已有 `OriginalSourceLink` 状态机，主流程仍主要使用 `SourceLead.expired` 字段；需要统一失效检测和展示口径。
- 所属层：Domain Layer、Application Layer、API Layer。
- 建议文件范围：`src/domain/original-source-link.ts`、`src/domain/source-adapter-contract.ts`、`src/api/schemas.ts`、相关测试。
- 交付内容：补充 SourceLead / OriginalSourceLink 的映射与失效标记入口，保留 fallback clues。
- 验收标准：链接失效可标记 expired；不会自动重新搜索；API 响应继续提供辅助找回线索。
- 测试建议：Domain 测试覆盖 verify、expire、重复 expire；API 或 application 测试覆盖失效后查询响应。

## P1-03 软性条件生成 Agent

- 背景：软性条件生成 Agent 已在文档确认，但当前主流程主要完成匹配评估，需要补齐岗位画像侧的软性 prompt 生成与审计。
- 所属层：Application Layer、Domain Layer、Infrastructure Layer、API Layer。
- 建议文件范围：`src/domain/ai-assessment-contract.ts`、`src/application/`、`src/infrastructure/ai/`、`docs/ai-agent-spec.md`、相关测试。
- 交付内容：新增软性条件生成服务和 AI port/adapter，保存用户原始软性要求、生成 prompt、prompt version、agent version、输入输出快照。
- 验收标准：AI 输出经过 Zod 和领域契约校验；失败调用进入 AI 审计；不直接依赖 LangGraph 类型到 Domain/API。
- 测试建议：覆盖成功输出、缺字段、模型调用失败三类场景。

## P1-04 认证增强

- 背景：当前已有 Web JWT 和 Plugin Token；尚未支持 token 刷新、修改密码和忘记密码。
- 所属层：API Layer、Application Layer、Infrastructure Layer。
- 建议文件范围：`src/application/auth.ts`、`src/api/app.ts`、`src/infrastructure/prisma/`、Prisma schema 和 API 测试。
- 交付内容：优先实现修改密码，再评估 refresh token 和忘记密码。
- 验收标准：不破坏 Web Token / Plugin Token 身份边界；密码更新后旧凭据不可继续登录；错误信息不泄露账号存在性细节。
- 测试建议：API 测试覆盖旧密码错误、新密码登录、旧密码失效、Plugin Token 权限不扩大。

## 后置-01 前端真实 API 化与产品级页面

- 背景：当前 React/Vite 前端是本地 mock 运维演示工作台；完整产品级前端已确认后置。
- 所属层：Web App。
- 建议文件范围：`web/src/lib/api-client.ts`、`web/src/hooks/queries.ts`、`web/src/App.tsx`、`web/src/components/`。
- 交付内容：先将轻量运维页接入真实 API，再分阶段实现 JobProfile 版本、重评估、SearchRun 详情、候选人列表、匹配详情和 AI 审计弹窗。
- 验收标准：远程数据统一走 TanStack Query；前端不复制后端硬筛、评分和状态流转规则；错误、空态、加载态完整。
- 测试建议：运行 `npm run web:typecheck`、`npm run web:build`，必要时增加前端交互 smoke。

## 非主工程-01 浏览器插件本体

- 背景：主仓库已提供插件协议和 ingestion API，但浏览器插件本体不在主工程实现。
- 所属层：独立插件项目。
- 建议文件范围：独立插件仓库；本仓库仅维护 `docs/plugin-integration-protocol.md` 和 API 契约。
- 交付内容：插件实现登录、Token 保存、SearchRun 轮询、候选人批量提交、附件上传、错误码动作。
- 验收标准：插件遵守主工程协议；主工程不接收或处理插件风控状态，不配置抓取频率或拟人化策略。
- 测试建议：用主工程本地 API 做协议联调，覆盖 `ValidationError`、`RateLimited`、`SearchRunCompleted`、`SearchRunCancelled`、`AuthError`。

## 维护规则

- 修改任务状态、优先级或边界时，同步更新 README 和开发手册中的文档入口。
- 新增影响 API 字段、领域状态、默认值或验收口径的任务时，同步更新 OpenAPI、架构文档或验收清单。
- 每次调整本文档后运行 `npm run contracts:check`，确保代码 TODO 文档仍在文档代码联动体系内。
