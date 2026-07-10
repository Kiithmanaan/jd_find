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
- 部署前集成验证：需要在真实 PostgreSQL、Redis、API、Worker 和附件目录上跑通 migration、登录、插件提交、附件与 AI 审计 smoke。
- 真实 Source Adapter：主工程只实现合规的通用 HTTP 或内部数据源 Adapter，不实现第三方平台风控规避；继续维护 SourceLead/OriginalSourceLink 契约。
- 软性条件生成 Agent：需要补齐画像侧生成、双层 schema 校验及成功/失败审计。
- 认证增强：优先实现修改密码，再评估 refresh token 和忘记密码。
- 产品前端：轻量工作台已接真实 API；完整产品视觉、浏览器插件本体和非核心运营页面后置。

已完成：统一 AI Assessment Provider 接线、BullMQ 插件聚合、批次幂等、OriginalSourceLink 主链路、不可变评估历史、附件 storage key 和前端核心 API 闭环。

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
