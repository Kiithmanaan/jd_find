# 猎头自动寻访与 AI 辅助筛选工程化落地架构确认稿

> 文档性质：现状事实源——描述当前技术架构、领域模型、状态机与工程边界，设计变化时原地改写。SearchRun 状态枚举以 `src/domain/types.ts` 为代码事实源，本文档第 2 节映射表受 `npm run contracts:check` 校验。

## 1. 产出定位

本文档用于在代码实现前确认业务需求到工程架构的转译边界。它不是 PRD、页面原型、数据库设计或接口设计，也不展开具体功能模块实现。

系统 MVP 定位为：面向单兵猎头的岗位驱动型一次性自动寻访与 AI 辅助筛选工具。

MVP 第一价值：

```text
帮助猎头围绕一个已确认岗位画像，更快获得一批可判断、可解释、可回链的候选人结果。
```

明确不做：

- 不做完整 ATS。
- 不做长期人才库。
- 不做企业客户管理。
- 不做团队协作流。
- 不自动沟通候选人。
- 不替代猎头做最终判断。
- 不为保障回链而突破来源平台风控。

## 2. 业务模型到工程边界的转译

### Actor

MVP 仅保留两个业务参与者：

- 猎头顾问：主参与者，拥有岗位画像确认权、寻访启动权、候选人最终判断权和原平台沟通责任。
- AI 寻访助手：辅助参与者，只负责条件建议、候选人匹配分析和解释生成。

工程含义：

- 权限体系先只围绕单用户顾问设计。
- AI 能力必须被业务规则约束，不能独立推进沟通、推荐或最终决策。

### Object

核心领域对象按业务闭环建模：

```text
JobProfile
  ├─ SearchCondition
  ├─ HardRequirement
  ├─ SoftRequirement
  └─ SearchRun
       ├─ CandidateResult
       │    ├─ MatchAssessment
       │    └─ SourceLead
       └─ SearchEvent
```

工程含义：

- `JobProfile` 是寻访、筛选、评分和解释的源头。
- `SearchRun` 表示一次性寻访任务，是 MVP 的主要运行边界。
- `CandidateResult` 只属于某个岗位画像或寻访任务，不升级为长期 Candidate 人才对象。
- `SourceLead` 是业务闭环对象，不只是普通链接字段。

### Rule

核心规则必须进入工程控制流：

- 岗位画像未确认，不允许启动寻访。
- 搜索条件必须在寻访前确认。
- AI 可以建议条件，但猎头拥有最终确认权。
- MVP 单次寻访目标规模默认 200 份候选人结果；API 允许在 10-500 范围内显式配置，Domain 创建 SearchRun 时必须固化本次任务的 `targetResultCount` 快照。
- 候选人去重范围限定在当前岗位画像或当前寻访任务内。
- 候选人必须先经过硬筛，再进入软性匹配。
- 匹配结果必须包含综合分、合适点和不合适点。
- 候选人列表只按匹配分排序。
- 求职意向和活跃度只展示，不参与排序。
- 来源线索必须尽可能保留。
- 回链保障与平台风控冲突时，风控优先。
- AI 不自动沟通候选人，不替代猎头最终判断。

### Use Case

P0 核心能力：

- 维护岗位画像。
- 确认搜索与匹配条件。
- 启动一次性寻访。
- 获取候选人结果。
- 当前岗位内去重。
- 执行硬性条件筛选。
- 执行软性匹配评估。
- 生成候选人匹配解释。
- 查看候选人结果。
- 回到原平台沟通。

P0 支撑能力：

- AI 生成岗位条件建议。
- 处理寻访异常中止。
- 处理来源线索失效后的辅助找回。

P1 演进能力：

- 根据结果调整岗位画像。
- AI 给出画像优化建议。
- 生成沟通话术草稿，但不自动发送。

### Event

主干事件：

```text
JobProfileConfirmed
→ SearchStarted
→ CandidateResultsAcquired
→ CandidateResultsDeduplicated
→ HardFilterCompleted
→ SoftMatchAssessed
→ SearchCompleted
```

异常事件：

```text
RiskControlTriggered
→ SearchInterrupted

SearchFailed

SourceLeadExpired
→ FallbackSourceCluesProvided
```

工程含义：

- 事件用于串联任务状态、审计、失败恢复和观测。
- MVP 不把每个候选人的所有中间变化都事件化。
- 风控事件必须能打断主流程。
- 系统异常必须落为 `SearchFailed` 事件，并保留可查询失败原因。

### Scenario

MVP 必须覆盖四个场景：

- SCN-01：基于岗位画像的一次性候选人寻访。
- SCN-02：岗位画像调优循环，作为 P1 前置扩展点保留。
- SCN-03：来源线索失效后的辅助找回。
- SCN-04：风控风险触发后的寻访中止。


### SearchRun 状态 / 事件 / 展示阶段映射

`SearchRunStatus` 的代码枚举以 `src/domain/types.ts` 为准，OpenAPI、前端展示和运行手册必须通过下表保持语义一致。

| Domain Status | 主事件 | 面向用户的阶段语义 | 说明 |
| --- | --- | --- | --- |
| Created | - | 已创建 | 领域对象刚创建，尚未启动执行。 |
| Running | SearchStarted | 寻访中 | Worker 或插件 SearchRun 已启动。 |
| Acquired | CandidateResultsAcquired | 已获取候选人 | 已接收来源候选人草稿。 |
| Deduplicated | CandidateResultsDeduplicated | 已去重 | 已完成当前 SearchRun 内去重。 |
| HardFiltered | HardFilterCompleted | 已硬筛 | 已完成硬性条件过滤。 |
| Assessed | SoftMatchAssessed | 已评估 | 已完成 AI 软性匹配评估或插件增量评估。 |
| Completed | SearchCompleted | 已完成 | 任务已进入可交付状态，候选人按结构化评分排序。 |
| Interrupted | RiskControlTriggered / SearchInterrupted | 风控中止 | 来源风险优先，任务停止继续补齐候选人。 |
| Failed | SearchFailed | 失败 | 系统异常或外部依赖异常，必须保留失败原因。 |
| Cancelled | SearchInterrupted | 已取消 | 用户主动取消，后续队列任务不得继续推进。 |

## 3. 推荐总体架构

采用分层架构 + 异步任务 + 事件驱动的组合。

```text
Client / Web App
  ↓
API Layer
  ↓
Application Orchestrator
  ↓
Domain Services
  ↓
Workers and Adapters
  ↓
Infrastructure
```

### Client / Web App

承载猎头顾问操作：

- 录入岗位需求。
- 查看 AI 条件建议。
- 确认岗位画像。
- 启动一次性寻访。
- 查看候选人结果与匹配解释。
- 打开来源线索回到原平台。

不承载：

- ATS 流程看板。
- 候选人长期跟进状态。
- 团队管理。
- 自动沟通入口。

### API Layer

负责对外请求入口和基础校验：

- 用户身份识别。
- 输入合法性校验。
- 请求幂等控制。
- 业务命令转发。
- 查询结果返回。

API 层不承载 AI 业务判断，不直接执行寻访采集。

### Application Orchestrator

负责业务流程编排，是 MVP 的核心控制层：

- 控制岗位画像确认后才能启动寻访。
- 创建和推进 `SearchRun`。
- 发布和消费业务事件。
- 调度寻访、去重、硬筛、软性匹配、解释生成任务。
- 接收风控信号并中止流程。
- 维护任务状态和可恢复点。

### Domain Services

负责领域规则执行：

- 岗位画像服务：维护画像、条件、权重和确认状态。
- 寻访任务服务：管理一次性寻访运行状态。
- 候选人结果服务：保存候选人结果、去重和排序。
- 匹配评估服务：执行硬筛结果归档、软性匹配结果归档。
- 来源线索服务：管理回链、来源上下文和辅助找回信息。
- 风控决策服务：接收风险信号，输出暂停或中止决策。

### Workers and Adapters

负责耗时和外部依赖任务：

- Source Adapter Worker：根据搜索条件从来源渠道获取候选人结果草稿。
- Deduplication Worker：在当前岗位画像或当前寻访任务内去重。
- Hard Filter Worker：执行确定性条件筛选。
- AI Assessment Worker：对硬筛通过候选人生成软性匹配评估。
- Explanation Worker：生成匹配分、合适点、不合适点。
- Risk Monitor Worker：监测验证码、访问限制、页面不可达、来源异常等风险。

来源渠道以 Adapter 抽象，避免业务层绑定具体平台。

### Infrastructure

基础设施建议：

- 关系型数据库：保存核心领域对象、任务状态、事件日志。
- 队列：承载异步寻访、筛选、AI 评估任务。
- 对象存储：保存合规允许的页面快照、来源辅助材料、AI 审计材料。
- 缓存：保存任务进度、短期去重索引、来源适配器运行状态。
- 可观测系统：记录任务耗时、成功率、中止原因、AI 输出质量和风控触发情况。

## 4. 核心流程架构

### 4.1 岗位画像确认

```text
猎头输入岗位需求
→ AI 生成条件建议
→ 猎头调整搜索条件、硬性条件、软性条件和权重
→ 猎头确认岗位画像
→ 发布 JobProfileConfirmed
```

控制点：

- AI 输出只能作为建议。
- 未确认画像不能启动寻访。
- 搜索条件必须前置确认。

### 4.2 一次性寻访

```text
JobProfileConfirmed
→ 猎头启动寻访
→ 创建 SearchRun
→ 发布 SearchStarted
→ Source Adapter Worker 获取候选人结果草稿
→ 达到目标规模或触发中止条件
→ 发布 CandidateResultsAcquired
```

控制点：

- MVP 目标规模为 200。
- 采集过程必须持续接收风控信号。
- 风控优先级高于结果规模和回链完整性。

### 4.3 去重与筛选

```text
CandidateResultsAcquired
→ 当前岗位内去重
→ CandidateResultsDeduplicated
→ 硬性条件筛选
→ HardFilterCompleted
→ 软性匹配评估
→ SoftMatchAssessed
```

控制点：

- 去重范围不扩展为全局人才库。
- 硬筛失败者不进入软性匹配。
- 软性匹配只针对硬筛通过候选人。

### 4.4 解释与排序

```text
SoftMatchAssessed
→ 生成综合分
→ 生成合适点
→ 生成不合适点
→ 按匹配分排序
→ SearchCompleted
```

控制点：

- 匹配解释是必须项。
- 求职意向和活跃度只展示，不参与排序。
- 候选人结果不是最终推荐结论。

### 4.5 原平台回链

```text
猎头查看候选人结果
→ 点击 SourceLead
→ 回到原平台
→ 猎头人工沟通候选人
```

控制点：

- 系统不自动发送消息。
- 来源线索需要尽可能保留来源渠道、原始上下文和辅助找回信息。
- 回链失效时进入辅助找回流程。

## 5. 异常与风控架构

### 5.1 来源线索失效

触发条件：

- 原链接失效。
- 候选人页面不可达。
- 来源平台页面结构变化。
- 候选人信息被隐藏或下架。

处理方式：

```text
SourceLeadExpired
→ 展示来源渠道
→ 展示来源搜索上下文
→ 展示候选人可识别摘要
→ 展示合规保存的辅助材料
→ 猎头自行回原平台查找
```

### 5.2 风控风险触发

触发条件：

- 验证码。
- 登录异常。
- 访问频率限制。
- 来源渠道拒绝访问。
- 候选人页面连续不可达。
- 回链保存动作带来账号风险。

处理方式：

```text
RiskControlTriggered
→ Application Orchestrator 暂停或中止 SearchRun
→ 发布 SearchInterrupted
→ 记录风险原因
→ 展示中止说明
```

原则：

- 风控优先于回链。
- 风控优先于 200 份结果规模。
- 风控优先于自动重试。

## 6. AI 工程边界

AI 可以做：

- JD 解析。
- 搜索条件建议。
- 硬性条件建议。
- 软性条件建议。
- 权重建议。
- 候选人软性匹配评估。
- 综合分生成。
- 合适点和不合适点生成。

AI 不可以做：

- 自动确认岗位画像。
- 自动启动寻访。
- 自动沟通候选人。
- 自动替猎头推荐候选人。
- 自动修改已确认条件。
- 在硬筛失败后仍继续做软性匹配来“补救”。

AI 输出要求：

- 必须绑定具体岗位画像版本。
- 必须绑定候选人结果。
- 必须保留输入、输出和模型版本审计信息。
- 必须允许猎头把 AI 输出作为参考，而非最终判断。

## 7. 状态机建议

### JobProfile 状态

```text
Draft
→ Suggested
→ Confirmed
→ Archived
```

说明：

- `Draft`：猎头正在维护。
- `Suggested`：AI 已生成条件建议，待猎头确认。
- `Confirmed`：可用于启动寻访。
- `Archived`：不再用于新寻访。

### SearchRun 状态

```text
Created
→ Running
→ Acquired
→ Deduplicated
→ HardFiltered
→ Assessed
→ Completed
```

异常状态：

```text
Interrupted
Failed
Cancelled
```

说明：

- `Interrupted` 用于风控或来源异常导致的业务中止。
- `Failed` 用于系统异常。
- `Failed` 必须可从查询接口看到失败原因，不能只存在于 Worker 日志。
- `Cancelled` 用于猎头主动取消。

### CandidateResult 状态

```text
Acquired
→ Deduplicated
→ HardPassed / HardRejected
→ Assessed
→ Displayable
```

说明：

- `HardRejected` 不进入软性匹配。
- `Displayable` 表示可展示给猎头判断。

## 8. 非功能要求

### 可恢复性

- SearchRun 必须有可恢复检查点。
- 异步任务应具备幂等能力。
- 重试不得突破风控策略。

### 可观测性

必须监控：

- 单次寻访耗时。
- 候选人获取数量。
- 去重比例。
- 硬筛通过率。
- AI 评估耗时。
- SearchRun 完成率。
- SearchRun 中止率。
- 风控触发类型。
- SourceLead 失效率。

### 审计

必须记录：

- 岗位画像确认记录。
- AI 条件建议记录。
- 寻访任务事件记录。
- 候选人筛选与匹配结果。
- 来源线索访问与失效记录。
- 风控触发和中止原因。

### 合规与安全

- 只保存 MVP 闭环需要的数据。
- 不把候选人结果升级为长期人才资产。
- 来源辅助材料必须受合规边界约束。
- AI 输入输出应避免泄露不必要的敏感信息。

## 9. MVP 验收门槛

业务闭环验收：

- 猎头可以从岗位需求形成已确认岗位画像。
- 已确认岗位画像可以启动一次性寻访。
- 一次寻访以 200 份候选人结果为目标。
- 候选人结果能在当前岗位内去重。
- 硬性条件筛选先于软性匹配。
- 软性匹配结果包含综合分、合适点和不合适点。
- 候选人结果按匹配分排序。
- 求职意向和活跃度只展示，不参与排序。
- 猎头可以通过来源线索回原平台人工沟通。

边界验收：

- 系统没有 ATS 状态流。
- 系统没有长期人才库。
- 系统没有自动沟通能力。
- 系统没有 AI 自动最终推荐能力。
- 系统没有全局候选人去重。

异常验收：

- SourceLead 失效时能展示辅助找回信息。
- 风控风险触发时能中止寻访。
- 风控优先级高于回链完整性。
- 风控优先级高于完成 200 份结果。

工程验收：

- 主流程由状态和事件驱动，不依赖单个同步请求长时间阻塞。
- 外部来源通过 Adapter 接入。
- AI 能力通过独立 Worker 或服务调用，不嵌入核心业务状态机。
- SearchRun 具备事件日志和可观测指标。
- 异步任务具备幂等和失败恢复策略。
- 工程修改必须先通过文档门禁：需求基线、技术设计、TODO、验收清单均确认或同步后，才能进入代码实现。
- 需求、技术设计、TODO 与验收清单存在冲突时，必须先修正文档冲突，再实现代码。

## 10. 后续代码落地顺序

建议代码实现按以下顺序推进：

1. 建立项目骨架、基础配置和测试框架。
2. 实现领域模型与状态机，不接真实外部来源。
3. 实现 JobProfile 确认规则和 SearchRun 编排。
4. 用 mock Source Adapter 跑通一次性寻访。
5. 实现当前岗位内去重、硬筛和排序规则。
6. 接入 mock AI Assessment Worker，跑通匹配解释。
7. 实现 SourceLead 和回链失效辅助找回结构。
8. 实现 RiskControlTriggered 到 SearchInterrupted 的中止链路。
9. 增加端到端业务闭环测试。
10. 再评估真实来源接入和真实 AI 模型接入。

## 11. 当前默认决策

- MVP 采用单用户顾问模型。
- MVP 以 `SearchRun` 作为一次性寻访运行边界。
- MVP 不引入招聘项目对象。
- MVP 不引入长期 Candidate 对象。
- MVP 不做全局去重。
- MVP 不做自动沟通。
- MVP 先用 Adapter 抽象来源渠道，真实渠道接入后置。
- MVP 先用 AI 服务边界和审计结构约束，具体模型选择后置。

MVP 阶段不要求实现（生产化演进项）：完整 ATS、多租户、团队权限、组织管理、完整 RBAC 角色模型、全局审计中间件、Outbox、对象存储。MVP 仍必须保留 Web Token / Plugin Token 身份边界、owner 级访问控制、SearchRun 事件、AI Assessment 审计、失败原因和敏感数据最小暴露。

## 12. 技术栈与分层职责

### 12.1 Web App

采用：

- Vite
- React
- TanStack Router / TanStack Query / TanStack Table
- TanStack Form，后续按需引入
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

### 12.2 API Layer

采用：Fastify、Zod request/response validation、JWT auth、Web Token / Plugin Token 身份边界、owner 级访问控制、OpenAPI generation；RBAC、Tenant Context、Audit middleware 后续实现。

职责：

- 接收前端、插件、CSV、外部适配器请求，完成请求参数校验。
- MVP 当前注入用户身份上下文，并区分 Web Token / Plugin Token；SearchRun、JobProfile、附件、AI 审计接口至少按 `ownerId` 或创建用户做访问控制；组织、租户、RBAC 角色上下文后续实现。
- 调用 Application Layer，返回稳定、可版本化的 API 响应。
- MVP 当前必须保留 SearchRun 事件、AI Assessment 审计和失败原因；全局请求审计、导出审计、对象访问审计后续实现。

API Layer 不得直接操作领域规则，不得直接编排复杂业务流程，不得绕过 Application Layer 调用 Infrastructure。

### 12.3 Application Layer

职责：SearchRun orchestration、候选人导入/抓取 workflow、硬筛执行、AI 评估执行、重评估 workflow、队列派发与重试策略、导出 workflow。Application Layer 负责业务用例编排，但不承载核心判断规则。

现有应用模块（`src/application/`）：`search-orchestrator.ts`、`search-run-job-handler.ts`、`search-run-phases.ts`、`plugin-candidate.service.ts`、`reassess-job-profile-candidates.ts`、`source-link.service.ts`、`ports.ts`、`auth.ts`。

Application Layer 可以：开启事务、调用领域对象、调用 Repository、派发队列任务、记录应用事件、处理重试/失败/补偿。

Application Layer 不应：直接写复杂 SQL、直接拼接 AI Prompt、直接判断岗位匹配规则、直接判断 SearchRun 状态能否流转、直接访问 Redis/对象存储/HTTP 外部服务。

### 12.4 Domain Layer

核心领域对象（类型定义以 `src/domain/types.ts` 为准）：

- `JobProfile` / `JobProfileVersion`
- `SearchRun` / `SearchEvent`
- `CandidateResult` / `CandidateDraft`
- `MatchAssessment`
- `AIAssessmentAuditRecord`
- `OriginalSourceLink`（别名 `SourceLead`）
- `ResumeAttachment`
- `HardConditionRule` / `HardConditionDimension`

核心规则（对应 `src/domain/` 下的模块）：

- JobProfile 版本与确认规则（`job-profile.ts`）
- SearchRun 状态机与事件（`search-run.ts`、`events.ts`）
- 候选人指纹去重与汇总（`candidate-summary.ts`）
- 硬筛规则（`hard-filter.ts`）
- AI assessment 契约（`ai-assessment-contract.ts`）
- 回链规则（`original-source-link.ts`）
- Source adapter 契约（`source-adapter-contract.ts`）

Domain Layer 是本项目的业务核心。任何核心业务规则必须进入 Domain Layer，并具备单元测试。

Domain Layer 不得依赖：Fastify、Prisma、Redis、BullMQ、HTTP client、React、文件系统、对象存储 SDK、具体 AI 服务 SDK。Domain Layer 应保持纯净，优先使用纯函数、值对象、聚合根和领域服务。

### 12.5 Infrastructure Layer

采用：Prisma、PostgreSQL、BullMQ、Redis、CSV adapter、Plugin adapter、HTTP AI adapter、LangChain / LangGraph adapter、Error log；Object Storage、Outbox、Audit log、Observability 后续实现。

职责：

- 数据持久化、队列执行、外部 AI 服务调用、插件数据接收、CSV 解析。
- LangChain / LangGraph AI 编排、模型调用、结构化输出解析和 trace 元数据收集。
- MVP 当前允许本地简历附件存储，但 API 响应不得暴露本地 `storagePath`。
- 原始页面截图或存证存储后续实现；日志、指标、追踪后续完善。

Infrastructure Layer 实现接口，不定义业务规则。LangChain / LangGraph 只能作为 Infrastructure adapter 实现 Application Layer 定义的 port，不得替代领域规则、状态机、权限判断或审计链路。

## 13. 分层依赖规则

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

## 14. 架构纪律

### 14.1 业务规则不得外泄

凡属于以下内容，必须进入 Domain Layer：岗位画像权重、硬性条件判断、匹配分计算、状态流转、AI 评估结果解释、原始回链有效性规则、候选人去重规则。

不得写在：React Component、API Route、Prisma Repository、Queue Processor、Adapter、SQL 查询片段。

LangGraph prompt / node 不得实现：硬性条件判断、SearchRun 状态流转、权限判断、候选人去重、匹配排序规则。

### 14.2 状态必须由状态机控制

SearchRun、CandidateResult、OriginalSourceLink 均应有明确状态。

禁止直接赋值：

```ts
searchRun.status = 'Completed';
```

推荐：

```ts
searchRun.complete();
```

状态变化必须：

- 校验前置状态。
- 记录状态事件。
- MVP 当前至少写入 SearchRun 事件和失败原因；完整审计日志后续实现。
- 必要时发布 Domain Event。
- LangGraph 不得直接修改 SearchRun 状态，必须通过 Application Service 调用领域状态机。

### 14.3 AI 输出必须可追溯

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

### 14.4 原始页面回链优先级高

OriginalSourceLink 是核心对象，开发中不得将其简化为一个 `url` 字段。

回链必须支持：平台标识、原始 URL、标准化 URL、外部候选人 ID、最后验证时间、失效状态、备用定位信息、高匹配截图存证。

### 14.5 数据安全优先

候选人数据、简历附件、联系方式属于敏感数据。

要求：

- 最小化保存，分级授权访问。
- MVP 当前至少按用户身份或 `ownerId` 控制访问；访问记录审计、导出记录审计后续实现。
- 附件使用对象存储后续实现；MVP 当前允许本地附件存储，但 API 响应不得暴露本地 `storagePath`。
- 对象存储临时访问链接后续实现，届时必须有过期时间。
- 日志不得输出敏感原文。
- 高匹配截图存证必须受策略限制。

### 14.6 幂等优先

以下操作必须幂等：CSV 导入、插件候选人上报、候选人抓取、硬性过滤、AI 评估、重评估、任务完成、导出。

幂等键建议由以下信息组成：

```text
search_run_id + candidate_source + external_candidate_id + operation_type
```

后续多租户版本补充 `tenant_id`。

### 14.7 历史结果不得被静默改写

以下数据一旦用于 SearchRun，应保留历史版本：JobProfile、SearchCriteria、Prompt version、候选人快照/摘要、Original source link metadata。

AI 评估遵循 `docs/00-requirements-baseline.md` 第 3 节口径：业务评估结果采用覆盖式重评估（同一候选人 + 同一 `JobProfileVersion` 只保留最新），但 AI 审计记录保留所有调用的输入/输出快照，历史事实通过审计链路可追溯。

允许新增版本，不允许静默覆盖历史事实。
