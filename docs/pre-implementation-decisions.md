# 代码实现前确认清单

本文档列出从架构方案进入代码实现前必须锁定的工程决策。除非用户明确调整，后续代码实现按“默认建议”执行。

## 1. 项目形态

默认建议：先实现单体应用内的清晰分层架构，而不是一开始拆微服务。

理由：

- MVP 业务闭环短，核心风险在领域边界、异步任务、AI 边界和风控中止，不在服务数量。
- 单体分层更利于快速跑通端到端闭环。
- 后续可按 Worker、Adapter、AI Assessment、Risk Control 边界拆出独立服务。

实现约束：

- 代码目录必须体现 `api`、`application`、`domain`、`workers`、`infrastructure` 的职责边界。
- 领域层不得依赖外部来源平台 SDK、浏览器自动化或具体 AI SDK。

## 2. 技术栈

默认建议：TypeScript 全栈。

推荐组合：

- Runtime：Node.js。
- API：Fastify 或 NestJS 二选一，默认 Fastify。
- Database：PostgreSQL。
- ORM：Prisma。
- Queue：BullMQ + Redis。
- Test：Vitest。
- E2E：Playwright 或 API 级集成测试，MVP 优先 API 级。

理由：

- TypeScript 适合快速定义领域类型、状态机和异步 Worker。
- Fastify 足够轻量，避免框架结构过早主导领域模型。
- Prisma 便于后续从领域模型落到数据模型。
- BullMQ 能覆盖 MVP 异步任务、重试、失败隔离和任务进度。

## 3. MVP 第一阶段实现方式

默认建议：先用 Mock Source Adapter 和 Mock AI Assessment 跑通业务闭环。

第一阶段不接：

- 真实招聘平台。
- 真实爬取或浏览器自动化。
- 真实 AI 模型。
- 真实短信、IM 或自动沟通能力。

必须先跑通：

```text
JobProfile Confirmed
→ SearchRun Created
→ Mock Candidates Acquired
→ Deduplicated
→ HardFiltered
→ Mock AI Assessed
→ Sorted
→ SourceLead Displayable
→ Risk Interruption Testable
→ Failure Snapshot Testable
```

## 4. 数据边界

默认建议：以 `SearchRun` 作为一次性寻访运行边界。

必须坚持：

- `CandidateResult` 不作为长期人才对象。
- 不做全局候选人去重。
- 不做候选人长期跟进状态。
- 不引入企业客户、招聘项目、面试、Offer 等 ATS 对象。

## 5. AI 边界

默认建议：AI 能力先抽象为端口接口，第一阶段由 Mock 实现。

端口能力只包含：

- 生成岗位条件建议。
- 对硬筛通过候选人做软性匹配。
- 生成匹配分、合适点、不合适点。

不得包含：

- 自动确认岗位画像。
- 自动启动寻访。
- 自动沟通候选人。
- 自动最终推荐。

## 6. 风控边界

默认建议：风控先作为领域事件和任务中止机制实现，真实风控信号由 Adapter 后续接入。

第一阶段必须可测试：

- Worker 能主动上报 `RiskControlTriggered`。
- Orchestrator 能将 `SearchRun` 置为 `Interrupted`。
- 已触发风控时，不继续补齐 200 份结果。
- 风控优先级高于回链完整性和自动重试。

## 7. 失败可观测边界

默认建议：外部来源、AI 评估或适配器执行异常时，由 Orchestrator 保存 `Failed` 快照并继续向 Worker 抛错。

第一阶段必须可测试：

- `SearchRun` 能进入 `Failed` 状态。
- `SearchRun` 能保存 `failureReason`。
- 事件日志包含 `SearchFailed`。
- 异常继续向上抛出，便于队列重试、死信或告警策略接管。

## 8. 验收优先级

第一批代码完成的最低验收：

- 能创建并确认岗位画像。
- 未确认画像不能启动寻访。
- 能创建一次 `SearchRun`。
- 能通过 Mock Source Adapter 生成候选人结果。
- 能在当前任务内去重。
- 能先硬筛再软性匹配。
- 硬筛失败者不进入软性匹配。
- 能生成匹配分、合适点、不合适点。
- 能按匹配分排序。
- 求职意向和活跃度不参与排序。
- 能保存并展示 `SourceLead`。
- 能模拟风控触发并中止任务。
- 能模拟 AI 或来源异常并保存 `Failed` 快照。

## 9. 已确认执行口径

以下事项已作为第一阶段代码生成输入：

1. 是否接受 TypeScript + Fastify + Prisma + BullMQ 作为默认技术栈。
2. 是否接受第一阶段只接 Mock Source Adapter，不接真实平台。
3. 是否接受第一阶段先落地 AI Assessment 契约、Mock AI 和通用 HTTP AI Adapter；真实模型服务由外部 AI endpoint 封装，生产 API 进程内接线后置。
4. 是否优先实现 API + 领域 + Worker，不先做完整前端界面。
