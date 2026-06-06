# 非代码类 TODO

本文档只列当前仍未完成的非代码类事项。已落成的说明文档不再重复列入 TODO。

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

## 3. 仍需专项文档

- 单独制定浏览器插件侧风控规避调度策略文档；该文档属于插件项目，不进入主工程风控职责。
- 补充 AI 输出质量样例集。
- 在生产环境信息明确后，补齐部署手册中的待填写项。

## 4. 近期实现风险

- 插件增量聚合：近期实现队列和缓冲策略，按 30 秒窗口 / 20 条阈值收敛。
- `JobProfileVersion`、重新评估和候选人汇总视图：近期优先做领域模型调整，顺序为先模型后前端。
- AI 契约冲突：近期优先移除禁止推荐旧限制，并扩展 `MatchAssessment`。

## 5. MVP 后复核风险

- 候选人数据合规风险：MVP 版本暂不考虑，正式上线前再复核。
- Web 权限模型风险：MVP 版本暂不考虑，正式多人使用前再复核。

## 6. 已完成的非代码产物

- `docs/demo-script.md`
- `docs/acceptance-checklist.md`
- `docs/plugin-integration-protocol.md`
- `docs/ai-agent-spec.md`
- `docs/hard-condition-config.md`
- `docs/frontend-product-design.md`
- `docs/demo-data.md`
- `docs/openapi.yaml`
- `docs/development-guide.md`
- `docs/deployment-guide.md`
- `docs/operations-runbook.md`
