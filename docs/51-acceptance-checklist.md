# 第一阶段验收清单

> 文档性质：追踪（现状）——记录验收项、验证方式、通过标准和当前状态，状态变化时原地更新。与 `docs/50-todo.md`（前瞻）和 `CHANGELOG.md`（回顾）联动，规则见 `docs/README.md` 第 5 节。

## 1. 基础工程

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 后端类型检查 | `npm run typecheck` | 命令通过 | 已完成 |
| 前端类型检查 | `npm run web:typecheck` | 命令通过 | 已完成 |
| Prisma schema 校验 | `DATABASE_URL=... npm run prisma:validate` | 命令通过 | 已完成 |
| 自动化测试 | `npm test` | 全部测试通过 | 已完成 |
| 前端构建 | `npm run web:build` | 构建成功 | 已完成 |
| CI | GitHub Actions | push 后执行全量检查 | 已完成 |
| 部署前真实环境集成验证 | 手动 smoke（真实 PostgreSQL + Redis + API + Worker） | migration、登录、一次性寻访（含 BullMQ 异步处理）、硬筛、AI 评估、审计、重评估、插件提交、附件上传下载、取消全部跑通 | 已完成 |
| 生产错误日志 | 自动化测试（`tests/api.test.ts`） | API 未捕获异常时 `setErrorHandler` 至少输出一行结构化 stderr 日志（含请求方法、路径、SearchRun id、错误名称与消息） | 已完成 |

## 2. 认证与账号

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 创建用户 | `npm run user:create` | 用户写入数据库 | 已完成 |
| Web 登录 | `POST /api/auth/login` | 返回 Web JWT | 已完成 |
| 插件登录 | `POST /api/plugin/auth/login` | 返回 Plugin Token | 已完成 |
| Token 过期提示 | API 契约测试 | 过期后返回 `TokenExpired` | 已完成 |

## 3. SearchRun 与插件提交

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 创建插件 SearchRun | `POST /api/search-runs/one-time` | 返回 `202` 与 `searchRunId` | 已完成 |
| 目标数量 10-500 | API 校验 | 超出范围返回校验错误 | 已完成 |
| 插件提交候选人 | `POST /api/plugin/search-runs/:id/candidates` | 返回已接收或处理结果 | 已完成 |
| 异步聚合 | 集成测试 | 30 秒窗口或 20 条触发评估 | 已完成 |
| SearchRun 取消 | API 测试 | Running 可取消，插件停止提交 | 已完成 |
| 列出所有 JobProfile | API 测试 | `GET /api/job-profiles` 按当前用户过滤返回列表 | 后置 |
| 列出所有 SearchRun | API 测试 | `GET /api/search-runs` 按当前用户/画像过滤返回列表 | 后置 |
| 插件候选人提交限流 | 自动化测试（`tests/api.test.ts`、`tests/rate-limiter.test.ts`） | 同一 Plugin Token + SearchRun 超过阈值时返回 `429 RateLimited` 并带 `retryAfterSeconds` | 已完成（`RedisRateLimiter` 生产路径待真实 Redis smoke 验证，见 `docs/50-todo.md`） |
| 插件附件上传限流 | 自动化测试（`tests/api.test.ts`、`tests/rate-limiter.test.ts`） | 同一 Plugin Token + SearchRun 超过阈值时返回 `429 RateLimited` 并带 `retryAfterSeconds` | 已完成（`RedisRateLimiter` 生产路径待真实 Redis smoke 验证，见 `docs/50-todo.md`） |

## 4. 候选人、筛选与评估

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 单次 SearchRun 内去重 | 自动化测试 | 重复 fingerprint 只保留一条 | 已完成 |
| 跨 SearchRun 去重 | 集成测试 | 同 JobProfile 汇总去重 | 已完成 |
| 硬筛优先 | 自动化测试 | 硬筛淘汰者不进入 AI 评估 | 已完成 |
| 配置驱动硬筛 | 集成测试 | 淘汰/合格规则由配置驱动 | 已完成 |
| AI 推荐结论 | 契约测试 | 输出推荐/待定/不推荐 | 已完成 |
| 重新评估 | 集成测试 | 覆盖旧业务评估结果 | 已完成 |
| 搜索词迭代闭环 | 自动化测试 + API 测试 + 浏览器端到端 | Completed run 可触发分析并落库建议（推荐组 vs 淘汰组词频/特征对比、新增词/移除词/理由）；未完成 run 422；并发 409；审计 agentType=`search-refinement`；工作台可查看建议并一键应用到草稿版本 | 已完成（migration 待部署时 `prisma migrate deploy` 复核） |
| 澄清访谈 Agent | 自动化测试 + API 测试 + 浏览器端到端 | 七组话题顺序推进、一次一问附推荐答案；答完产出画像草稿（JD 文本/硬性条件建议/软性条件/排除信号/搜索关键词）；mock 与 langgraph provider 均可注入；工作台问答面板可完成访谈并用草稿创建版本草稿 | 已完成（migration 待部署时 `prisma migrate deploy` 复核） |
| 寻访报告 | 自动化测试 + API 测试 + 浏览器检查 | `GET /api/search-runs/:id/report` 与 `GET /api/job-profiles/:id/report` 返回漏斗数字、Top 候选人、待定清单与跨 run 汇总；工作台面板可展示两级报告 | 已完成 |
| 排除信号进评估契约 | 自动化测试 + 契约测试 + 浏览器端到端 | 画像可录入 `negativeSignals` 并随版本拷贝；评估 prompt 注入排除信号与 `verificationHint`；prompt version 升级为 `match-assessment-v2`；mock provider 命中排除信号追加风险点并降档；工作台可编辑排除信号并随草稿版本保存 | 已完成（migration 尚未在真实 PostgreSQL 上应用验证，部署时执行 `prisma migrate deploy` 复核） |

## 5. 附件

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 插件上传附件 | API 测试 | 20MB 内附件可上传 | 已完成 |
| 重复上传覆盖 | API 测试 | 同候选人只保留最新附件 | 已完成 |
| 附件下载 | API 测试 | Web 用户可下载 | 已完成 |

## 6. 前端

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| 运维演示工作台 | 浏览器检查 | 接入真实后端 API，展示登录、画像版本确认、启动寻访、候选人查询、AI 审计查询 | 已完成 |
| JobProfile 页面 | 产品验收 | 支持列表、编辑、确认、详情（列表与编辑仍缺；确认与只读详情已在工作台内嵌实现，受限于无 `GET /api/job-profiles` 列表端点） | 后置 |
| 版本与重评估页面 | 产品验收 | 支持历史版本和重评估入口（已在工作台内嵌面板实现，非独立路由页面） | 已完成 |
| SearchRun 详情 | 产品验收 | 展示状态、进度、候选人、审计（已在工作台内嵌面板实现；任务列表受限于无 `GET /api/search-runs` 列表端点，仅能展示当前手动追踪的单条） | 已完成 |
| 匹配详情弹窗 | 产品验收 | 展示推荐结论和三类要点（匹配点/不匹配点/风险点） | 后置 |
| 前端自动化测试 | 测试框架 | `web/` 下建立组件测试，覆盖已接线的共享组件 | 后置 |

## 7. 文档与部署

| 验收项 | 验证方式 | 通过标准 | 当前状态 |
|---|---|---|---|
| OpenAPI | 文件检查 | 覆盖现有 API 和插件 API | 已完成 |
| 插件协议 | 文件检查 | 协议字段和错误码完整 | 已完成 |
| 部署手册 | 文件检查 | 单机 Caddy + Compose 可执行 | 已完成 |
| 运维手册 | 文件检查 | 覆盖备份、恢复、排障 | 已完成 |
| 文档索引 | 文件检查 | `docs/README.md` 说明文档职责、阅读顺序、冲突处理和落地路径 | 已完成 |
| 文档驱动实施流程 | 文件检查 | `AGENTS.md` 明确需求、技术设计、TODO、验收、代码的修改顺序 | 已完成 |
| TODO 与验收联动 | 文件检查 | TODO 文档和验收文档互相约束后置事项、进入实现事项和完成状态 | 已完成 |
| 领域词汇表 | 文件检查 | `docs/00` 第 14 节定义术语与代码名对照并与 `src/domain/types.ts` 同步，`AGENTS.md` 引用不复制 | 已完成 |
| 配置契约 | `npm run contracts:check` | src 与 prisma schema 消费的环境变量必须在 `.env.example` 声明 | 已完成 |
