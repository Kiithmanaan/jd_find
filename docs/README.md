# 文档索引与实施路径

本文档是项目实施前的文档入口。任何功能、修复、重构、接口、数据模型、前端交互、AI 能力、插件协议、部署或运维相关修改，都必须先按本文档确认阅读顺序和联动关系。

## 1. 修改前必读顺序

1. `docs/00-requirements-baseline.md`：最高优先级需求与工程决策基线。
2. `docs/10-technical-architecture.md`、`docs/11-technical-implementation-decisions.md`：总体技术架构与实施决策。
3. 相关专项需求或协议文档：前端、AI、硬筛、插件、OpenAPI 等。
4. `docs/50-todo.md`：确认待办、后置事项和风险追踪。
5. `docs/51-acceptance-checklist.md`：确认验收项、验证方式、通过标准和当前状态。
6. 现有代码：在文档约束下阅读实现，不得跳过文档直接改代码。

## 2. 文档职责

- `00-requirements-baseline.md`：产品范围、业务规则、权限口径、风险口径和冲突裁决源。
- `10-technical-architecture.md`：业务模型到工程边界的总体技术设计。
- `11-technical-implementation-decisions.md`：技术栈、分层、第一阶段实现方式和验收优先级。
- `20-requirements-frontend-product.md`：产品级前端页面、字段、状态和交互需求。
- `21-requirements-ai-agent-contract.md`：AI 输入、输出、prompt version、agent version、审计和质量验收。
- `22-requirements-hard-filter-config.md`：硬筛维度、规则结构、配置和 trace 展示。
- `30-technical-plugin-protocol.md`：浏览器插件登录、提交、附件、批次状态和错误码协议。
- `31-technical-openapi.yaml`：API 接口契约。
- `40-engineering-development-guide.md`：本地开发、分支提交、架构边界和验证命令。
- `50-todo.md`：待办、后置项、阻塞信息和实现风险。
- `51-acceptance-checklist.md`：验收项、验证方式、通过标准和完成状态。
- `60-operations-deployment-guide.md`、`61-operations-runbook.md`：部署、备份、恢复和排障。
- `70-demo-script.md`、`71-demo-data.md`：演示流程和演示数据。

## 3. 冲突处理规则

当文档之间存在冲突时，按以下优先级处理：

1. `00-requirements-baseline.md`
2. 当前专项需求或协议文档。
3. `10-technical-architecture.md`
4. `11-technical-implementation-decisions.md` 和专项技术设计。
5. `50-todo.md`
6. `51-acceptance-checklist.md`
7. 演示、部署、运维类文档。
8. `README.md`

若高优先级文档与低优先级文档冲突，必须以高优先级文档为准，并同步修正低优先级文档。

## 4. TODO 与验收联动

- TODO 记录“要做什么、为什么后置、阻塞条件是什么”。
- 验收文档记录“做到什么程度算完成、怎么验证、当前状态是什么”。
- TODO 中进入实现的事项，必须在验收文档中有对应验收项。
- 验收文档中标记为后置的事项，必须在 TODO 中有对应追踪项。
- 完成实现后，先更新验收状态，再在 TODO 中移除或标记完成。
- 新需求若暂不实现，必须进入 TODO；若决定实现，必须进入验收文档。

## 5. 标准落地路径

涉及文档修改时，必须按以下顺序执行：

1. 更新需求文档。
2. 更新技术设计文档。
3. 更新 TODO 文档。
4. 更新验收文档。
5. 修改代码。
6. 运行验收文档中对应的验证命令或测试场景。
7. 汇报读取了哪些文档、修改了哪些文档、验收项如何更新、运行了哪些验证。
