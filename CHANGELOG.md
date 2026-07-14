# 变更记录

> 文档性质：追踪（回顾向）——append-only，记录已完成并验证的变更。待办与风险见 `docs/50-todo.md`，验收状态见 `docs/51-acceptance-checklist.md`。条目格式见 `docs/40-engineering-development-guide.md` 第 7 节。

# 未发布 - 截至 2026-07-14

以下内容自 `docs/50-todo.md` 的历史"已完成"记录迁移而来，时间跨度覆盖第一阶段开发至今。

## 新增

- 统一 AI Assessment Provider 接线（mock / HTTP / LangGraph OpenAI 走同一 `AIAssessmentPort`）。
- BullMQ 插件聚合：插件候选人提交经 BullMQ 队列 + Worker 异步聚合处理，替代 API 进程内定时器。
- 插件提交批次幂等。
- OriginalSourceLink（别名 `SourceLead`）主链路：创建、验证、失效、fallback 线索。
- 不可变评估历史与覆盖式重新评估。
- 附件 storage key（API 响应不暴露本地 `storagePath`）。
- 前端核心 API 闭环：轻量工作台接真实 API，覆盖登录、画像版本确认、启动寻访、候选人查询、AI 审计查询。
- 前端共享组件迁移到统一类型契约（`web/src/lib/api-types.ts`）并接回工作台；画像详情、寻访确认、寻访任务列表、硬筛配置查看已接线。
- 生产错误日志：`setErrorHandler` 未捕获异常分支向 stderr 输出一行结构化 JSON 日志（`method`、`path`、`params`、`errorName`、`errorMessage`、`stack`）；DomainError 422 分支不受影响。
- 插件提交限流：新增 `RateLimiter` 端口，提供 `InMemoryRateLimiter` 和基于 `INCR`/`PTTL`/`PEXPIRE` 的 `RedisRateLimiter`。候选人提交与附件上传按 Plugin Token + SearchRun 限流，超限返回 `429 RateLimited`、`retryAfterSeconds` 和 `Retry-After`；阈值可经 `PLUGIN_CANDIDATE_RATE_LIMIT`、`PLUGIN_ATTACHMENT_RATE_LIMIT`、`PLUGIN_RATE_LIMIT_WINDOW_SECONDS` 调整。

## 文档

- 新建领域词汇表（`docs/00` 第 14 节）：术语与代码名对照的唯一事实源，与 `src/domain/types.ts` 同步；`AGENTS.md` 改为引用。
- 系统配置契约：`.env.example` 声明为配置事实源，`docs/60` 第 3 节改为引用；`contracts:check` 新增校验——src（`process.env.*`、Zod env schema）与 prisma schema（`env()`）消费的环境变量必须在 `.env.example` 声明。首次运行即发现并补上了缺失声明的 `RESUME_ATTACHMENT_DIR`。
- 建立文档驱动框架：`docs/README.md` 第 1 节定义主题轴（十二类职责）+ 性质轴（规范/现状事实源/决策记录/追踪）+ 横切规则；全部文档头部加性质声明行。
- 新建本 `CHANGELOG.md`，TODO 完成叙事迁移至此；`docs/00` 移出漂移追踪与风险章节（归入 `docs/50-todo.md`）；`docs/11` 标记为决策存档并标注已被取代条目。
- `AGENTS.md` 瘦身为 agent 入口（约 950 行 → 约 130 行）：技术栈、分层职责、依赖规则、架构纪律迁入 `docs/10` 第 12-14 节；目录结构、编码规范、测试要求、安全规约、审查清单、质量门槛迁入 `docs/40`；删除其中从未实现的 SearchRun 状态机描述，术语对齐代码（`CandidateResult`/`MatchAssessment`/`OriginalSourceLink`）。
- 修正 `docs/10` 第 14.7 节与 `docs/00` 第 3 节的口径冲突：业务评估结果采用覆盖式重评估，历史事实经 AI 审计链路追溯。

## 修复

- CI Node 版本与 `engines` 声明不一致（CI 自建立起一直失败，未被发现）；升级 CI 到 Node 22。
- BullMQ 自定义 Job ID 含 `:` 在新版本（实测 5.78.0）被拒绝，导致插件/mock 一次性寻访在真实 BullMQ 上必定 500；改用 `-` 分隔符。该 bug 由部署前真实环境集成验证发现——单测只覆盖 `InMemorySearchRunQueue`，从未真正过一遍 BullMQ。

## 移除

- 清理前端 mock 数据与孤儿代码：删除 `lib/types.ts`、`mock-data.ts`、`hooks/queries.ts`、`AddCandidateDialog`。
- 产品决策：不做 Web 端手动添加候选人——真实候选人提交只走插件 Plugin Token 通道，Web 用户没有对应权限边界，不新增该端点。

## 验证

- 部署前集成验证：在真实 PostgreSQL + Redis + API + Worker 上跑通完整链路——migration、Web/Plugin 登录、mock 一次性寻访（经 BullMQ 队列 + Worker 异步处理）、硬筛淘汰/通过分流、AI 评估（mock provider）、AI 审计查询、候选人汇总、重新评估、插件 SearchRun 创建、插件候选人批量提交、附件上传与下载、SearchRun 取消，全部通过。
- 限流自动化测试：`tests/rate-limiter.test.ts` 验证内存与 Redis 限流器计数逻辑，`tests/api.test.ts` 验证 429 响应与错误日志；`RedisRateLimiter` 仍待真实 Redis smoke 验证，风险记录见 `docs/50-todo.md`。
