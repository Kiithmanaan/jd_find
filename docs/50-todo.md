# TODO 与后置事项

> 文档性质：追踪（前瞻向）——只记录未完成事项、后置事项、阻塞信息和实现风险，高频更新。事项完成后：验证记录进 `CHANGELOG.md`，验收状态更新进 `docs/51-acceptance-checklist.md`，然后从本文档移除。任何进入实现的 TODO，必须先在 `docs/51-acceptance-checklist.md` 中具备对应验收项。

## 1. 仍需外部信息

- 明确第一阶段云服务器规格。
- 明确生产域名。
- 明确服务器登录用户和部署目录。
- 明确第一阶段生产初始用户邮箱和交付方式。

## 2. 仍需补充的产品物料

- 产出 JobProfile 版本与重新评估的高保真页面稿。
- 产出 SearchRun 详情页高保真页面稿。
- 产出候选人列表与匹配详情弹窗高保真页面稿。
- 产出附件下载入口高保真页面稿。

说明：下一阶段代码类 TODO 先不做产品级前端代码，上述高保真页面稿不阻塞后端实现。

## 3. 仍需专项文档

- 单独制定浏览器插件侧风控规避调度策略文档；该文档属于插件项目，不进入主工程风控职责。
- 补充 AI 输出质量样例集。
- 在生产环境信息明确后，补齐部署手册中的待填写项。

## 4. 参考方法论增强（四阶段，进行中）

参考 recruiting-copilot 猎头方法论确定的四项增强，按改动成本从小到大依次实施，每阶段独立分支交付：

- **阶段A（已完成）排除信号进评估契约**：画像增加 `negativeSignals` 与软性条件 `verificationHint`，注入匹配 prompt，风险点逐条对照，prompt version 升级 v2。已完成浏览器端到端验证；migration `20260716090000_negative_signals` 尚未在真实 PostgreSQL 上应用（本地 Docker 不可用），部署时 `prisma migrate deploy` 复核。过程中发现并修复工作台既有 bug：`apiRequest` 对无 body 的 POST（确认版本/取消/重评估）强制携带 `content-type: application/json`，导致真实 API 返回 `FST_ERR_CTP_EMPTY_JSON_BODY` 500；同时把草稿创建/版本确认的错误接入工作台错误提示条。
- **阶段B（已完成）寻访报告**：`GET /api/search-runs/:id/report`（当轮漏斗 + Top 候选人 + 待定清单）与 `GET /api/job-profiles/:id/report`（跨 run 累计漏斗 + 去重后最新评估分布），工作台两个折叠面板已接入并完成浏览器验证。两级口径差异（run 级=当轮快照、profile 级分布跟随最新评估）已写入需求基线。
- **阶段C（已完成）澄清访谈 Agent**：七组话题逼问式画像梳理，会话持久化（migration `20260717090000_clarification_interview_sessions`），产出画像草稿字段，工作台简易问答面板。审计不写 `AIAssessmentAuditRecord`（该表 FK 强关联 SearchRun），改为问答 turns 内嵌每轮 AI 元数据。并发回答的读-改-写竞态按单用户操作接受，后续可加乐观检查。
- **阶段D（已完成）搜索词迭代闭环**：SearchRun 完成后手动触发推荐组 vs 淘汰组分析（HTTP 同步 + 复用重评估锁表、`refinement:` 前缀隔离键空间，见 docs/11 第 10 节），建议持久化 `SearchRefinementSuggestionRecord`（migration `20260717100000_search_refinement_suggestions`），审计写 `AIAssessmentAuditRecord`（agentType=`search-refinement`），前端"应用建议"创建草稿版本。

## 5. 近期实现风险

- 真实 Source Adapter：主工程只实现合规的通用 HTTP 或内部数据源 Adapter，不实现第三方平台风控规避；继续维护 SourceLead/OriginalSourceLink 契约。
- 软性条件生成 Agent：需要补齐画像侧生成、双层 schema 校验及成功/失败审计。
- 认证增强：优先实现修改密码，再评估 refresh token 和忘记密码。
- 产品前端：轻量工作台已接真实 API，共享组件已接回工作台；完整产品视觉（独立路由页面）、浏览器插件本体和非核心运营页面仍后置。
- 列表类端点缺失：目前没有 `GET /api/job-profiles`（按用户列出画像）和 `GET /api/search-runs`（按用户/画像列出寻访任务）。画像详情面板和寻访任务列表面板已接入真实类型契约，但受限于这两个端点缺失——画像内容靠当前确认版本现拼、任务列表只能展示当前手动追踪的单条记录；补齐端点后组件本身不需要再改。
- 前端测试覆盖为零：`web/` 下没有任何测试文件，已接线的共享组件目前只能靠手动浏览器验证，没有回归保护。
- `RedisRateLimiter` 限流生产路径待真实 Redis smoke 验证：当前只验证了假客户端下的计数逻辑（开发环境无可用 Redis/Docker）。下次有真实 Redis 环境时应验证并发提交下限流是否生效、TTL 是否正确过期。
- 三项新增 migration（排除信号、澄清访谈、搜索词迭代）待部署环境执行 `prisma migrate deploy` 后复核。

## 6. MVP 后复核风险

- 候选人数据合规风险：MVP 版本暂不考虑，正式上线前再复核；第一阶段维持全部保存、不脱敏、不删除、不导出口径。
- Web 权限模型风险：MVP 版本暂不考虑，正式多人使用前再复核；第一阶段 Web 用户全局可见、插件按自己的 `SearchRun` 写入。
- 多进程部署下插件聚合、AI Assessment 批次触发与 SearchRun 状态一致性：MVP 单机形态已验证，生产多实例部署前需复核队列持久化和状态一致性。
