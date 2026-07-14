# TODO 与后置事项

本文档记录当前仍未完成的事项、后置事项和实现风险。任何进入实现的 TODO，必须先在 `docs/51-acceptance-checklist.md` 中具备对应验收项。

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

## 4. 近期实现风险

- 插件提交限流：候选人提交和附件上传仍需按 Plugin Token + SearchRun 增加保护型限流，并返回 `RateLimited`。
- 生产错误可观测性缺失：API 的 `Fastify({ logger: false })` 加上兜底 `setErrorHandler` 只返回 `{error:"InternalServerError"}`，不打印任何日志——这次集成验证排查 BullMQ 报错时，如果不临时加 `console.error` 根本看不到真实异常。需要补至少一行服务端错误日志（stdout 或接入日志系统），否则生产环境出问题基本没法排查。
- 真实 Source Adapter：主工程只实现合规的通用 HTTP 或内部数据源 Adapter，不实现第三方平台风控规避；继续维护 SourceLead/OriginalSourceLink 契约。
- 软性条件生成 Agent：需要补齐画像侧生成、双层 schema 校验及成功/失败审计。
- 认证增强：优先实现修改密码，再评估 refresh token 和忘记密码。
- 产品前端：轻量工作台已接真实 API，且已把画像详情、寻访确认、寻访任务列表、硬筛配置查看这几个共享组件接回工作台；完整产品视觉（独立路由页面）、浏览器插件本体和非核心运营页面仍后置。
- 列表类端点缺失：目前没有 `GET /api/job-profiles`（按用户列出画像）和 `GET /api/search-runs`（按用户/画像列出寻访任务）。画像详情面板和寻访任务列表面板已接入真实类型契约，但受限于这两个端点缺失——画像内容靠当前确认版本现拼、任务列表只能展示当前手动追踪的单条记录，不是真正的列表页；补齐这两个端点后组件本身不需要再改。
- 前端测试覆盖为零：`web/` 下没有任何测试文件，新接入的共享组件目前只能靠手动浏览器验证，没有回归保护。

已完成：统一 AI Assessment Provider 接线、BullMQ 插件聚合、批次幂等、OriginalSourceLink 主链路、不可变评估历史、附件 storage key、前端核心 API 闭环、前端共享组件迁移到统一类型契约（`web/src/lib/api-types.ts`）并接回工作台、清理前端 mock 数据与孤儿代码（删除 `lib/types.ts`/`mock-data.ts`/`hooks/queries.ts`/`AddCandidateDialog`）、CI Node 版本与 `engines` 声明不一致的修复（此前 CI 自建立起就一直失败，未被发现）、**部署前集成验证**（见下）。

### 部署前集成验证结果

在真实 PostgreSQL + Redis + API + Worker 上跑通了完整链路：migration、Web/Plugin 登录、mock 一次性寻访（经 BullMQ 队列 + Worker 异步处理）、硬筛淘汰/通过分流、AI 评估（mock provider）、AI 审计查询、候选人汇总、重新评估、插件 SearchRun 创建、插件候选人批量提交、附件上传与下载、SearchRun 取消——全部验证通过。

过程中发现并修复了一个真实的生产环境阻断性 bug：`bullmq-search-run-queue.ts` 用 `:` 拼接自定义 Job ID（如 `one-time-search:<uuid>`），这在写代码时的 bullmq 版本上是合法的，但 `package.json` 声明的 `^5.26.2` 允许安装到的新版本（实测 `5.78.0`）新增了校验规则，直接拒绝含 `:` 的自定义 ID，导致任何插件/mock 一次性寻访请求在真实 BullMQ 上必定 500。测试套件测不出来是因为单测只测了 `InMemorySearchRunQueue`，从没有真正过一遍 BullMQ——这正是本条 TODO 存在的原因。已修复为 `-` 分隔符。

不做（产品决策）：Web 端手动添加候选人——真实候选人提交只走插件 Plugin Token 通道，Web 用户没有对应权限边界，决定不新增该端点，已删除对应的 `AddCandidateDialog` 组件。

## 5. MVP 后复核风险

- 候选人数据合规风险：MVP 版本暂不考虑，正式上线前再复核。
- Web 权限模型风险：MVP 版本暂不考虑，正式多人使用前再复核。

## 6. 已完成的文档产物

- `docs/README.md`
- `docs/00-requirements-baseline.md`
- `docs/10-technical-architecture.md`
- `docs/11-technical-implementation-decisions.md`
- `docs/20-requirements-frontend-product.md`
- `docs/21-requirements-ai-agent-contract.md`
- `docs/22-requirements-hard-filter-config.md`
- `docs/30-technical-plugin-protocol.md`
- `docs/31-technical-openapi.yaml`
- `docs/40-engineering-development-guide.md`
- `docs/50-todo.md`
- `docs/51-acceptance-checklist.md`
- `docs/60-operations-deployment-guide.md`
- `docs/61-operations-runbook.md`
- `docs/70-demo-script.md`
- `docs/71-demo-data.md`
