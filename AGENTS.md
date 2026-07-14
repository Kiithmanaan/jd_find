# AGENTS.md

> 文档性质：规范（agent 入口）——AI Agent 参与本项目的行为约定与事实源指针。文档体系、架构、规约的正文在 `docs/` 中（入口 `docs/README.md`），本文档不维护副本。

## 0. 文档驱动实施流程

流程的唯一事实源是 `docs/README.md`：文档性质分层、阅读顺序、文档职责、冲突优先级、TODO/验收/CHANGELOG 联动和标准落地路径都在那里定义，本文档不维护副本。

Agent 执行要点：

- 修改前按 `docs/README.md` 第 2 节顺序阅读相关文档（只读相关部分），再在文档约束下阅读现有代码，优先复用已有领域对象、类型和接口。
- 判断本次修改是否改变行为或契约（业务能力、领域规则、状态机、权限、审计、幂等、API、插件协议、AI 契约、硬筛规则、前端可见行为、部署运维）：是——先按落地路径更新文档，再改代码；否（不改行为的类型修复、局部整理、测试补充、按现有文档修明显实现错误）——直接改代码，汇报时说明判断理由。
- 任何可交付修改必须映射到 `docs/51-acceptance-checklist.md` 中至少一个验收项；没有覆盖的，先补验收项再实现。
- 完成后按联动规则单向流动：验证记录写入 `CHANGELOG.md`，更新验收状态，从 `docs/50-todo.md` 移除对应事项。
- 不得先改代码再补文档，除非用户明确要求临时实验；临时实验不得进入主分支。
- 汇报时说明读取了哪些文档、修改了哪些文档、验收项如何更新、运行了哪些验证。

## 1. 项目定位

本项目是面向猎头/招聘交付场景的 B 端 AI 辅助系统，围绕“岗位画像、候选人搜索、硬性过滤、AI 匹配评估、候选人排序、原始页面回链、匹配报告”形成稳定闭环。当前输出目标是 MVP，面向单用户或小范围试用场景。本项目不以“快速堆页面”为目标，所有实现必须服从领域模型、状态机、审计、幂等和数据安全要求。

产品范围与业务口径的事实源是 `docs/00-requirements-baseline.md`；MVP 不要求实现的生产化演进项清单见 `docs/10-technical-architecture.md` 第 11 节。

## 2. 事实源指针

规则正文在 docs 与代码中，本文档只保留指针和不变量：

| 主题 | 事实源 |
|---|---|
| 产品口径：画像版本、重评估、SearchRun 规则、候选人/去重/附件、认证权限 | `docs/00-requirements-baseline.md` |
| 领域模型、状态机、事件、SearchRun 状态/事件/展示语义映射表 | `docs/10-technical-architecture.md` 第 2、7 节 |
| 技术栈、分层职责、依赖规则、架构纪律 | `docs/10-technical-architecture.md` 第 12-14 节 |
| AI 输入输出契约、prompt/agent 版本、审计口径 | `docs/21-requirements-ai-agent-contract.md` |
| 硬筛维度、两段式规则结构、配置 | `docs/22-requirements-hard-filter-config.md` |
| 插件协议、错误码、指纹规则 | `docs/30-technical-plugin-protocol.md` |
| API 契约 | `docs/31-technical-openapi.yaml` |
| 目录结构、编码规范、测试要求、安全规约、审查清单、质量门槛 | `docs/40-engineering-development-guide.md` |
| 类型与状态枚举的代码事实源 | `src/domain/types.ts` |

术语与命名的事实源是 `docs/00-requirements-baseline.md` 第 14 节领域词汇表（与 `src/domain/types.ts` 同步）。使用任何领域名词前先对照词汇表，不得使用表外的同义变体（如 Candidate、AIAssessment）。

任何修改不得违反以下领域不变量（细则见上表事实源）：

- 已确认的 `JobProfileVersion` 不可编辑；SearchRun 绑定启动时的画像版本快照；历史结果不得被静默改写。
- 状态流转必须经领域状态机判断并记录 SearchRun 事件；`Failed` 必须保留可查询的失败原因；`Cancelled` 后队列任务不得继续推进。
- 候选人先硬筛后软性匹配；硬筛不通过者不进入 AI 评估；硬筛结果必须带原因和 trace，不得只返回布尔值。
- AI 输出必须经 schema 校验后才可入库；审计记录保留输入/输出快照、prompt version、agent version、provider、model 和失败原因；排序使用结构化评分字段，不以 AI 文本结论为唯一依据。
- 回链对象不得退化为普通 url 字符串；失效时标记 expired 并保留 `fallbackClues`。

## 3. AI 协作规范

当 AI Agent 参与编码、改造、生成文件时，必须遵守以下规则。

### 3.1 语言规范

除非用户在当前请求中明确要求使用其他语言，AI Agent 必须默认使用中文完成以下内容：

- 对用户的阶段性说明、问题分析、最终总结和后续建议。
- git commit message、PR 标题、PR 描述、变更摘要和代码审查说明。
- 面向业务用户、运营用户或招聘交付用户的界面文案、错误提示和空状态文案。
- 文档、注释和测试用例描述。

允许保留英文的内容仅限：

- 代码标识符、类型名、函数名、文件名、目录名、包名、命令、日志字段、API 字段和数据库字段。
- 业界通用技术名词、框架名、协议名、模型名和第三方服务名。
- conventional commit 的类型前缀，例如 `feat`、`fix`、`docs`、`refactor`；前缀后的说明必须使用中文。

禁止在没有用户明确要求的情况下，将中文说明、业务文案或提交说明改写为英文。

### 3.2 修改前

开始代码修改前，必须先完成 `## 0. 文档驱动实施流程` 中的检查。

必须先判断修改属于哪一层（Web App / API / Application / Domain / Infrastructure，分层职责见 `docs/10-technical-architecture.md` 第 12 节），不得跨层随意修改。

涉及 AI 能力、LangChain 或 LangGraph 时，必须先检查：

- 现有 `AIAssessmentPort`。
- AI Assessment 审计链路。
- prompt version 和 agent version。
- 现有模型输出契约。

### 3.3 修改中

必须遵守：

- 先读现有类型和接口，优先复用现有领域对象，不新增重复概念。
- 不绕过状态机，不绕过 Repository interface。
- 不直接把业务规则写进 route、component、processor。
- 不使用 `any` 逃避类型问题。
- 不用临时 mock 替代真实边界设计。
- 不硬编码租户、用户、状态、模型名。
- 新增 AI graph 必须以 adapter 形式接入现有 port，不允许新增平行 AI 调用路径。
- LangGraph 节点必须职责单一，不得写成多模式函数，不得使用 flag 参数切换节点行为。

### 3.4 修改后

必须确认：

- 类型检查、单元测试通过；涉及契约时 `npm run contracts:check` 通过。
- 按 `docs/40-engineering-development-guide.md` 第 11 节代码审查清单和第 12 节合并前质量门槛自查。
- 按 `## 0. 文档驱动实施流程` 的联动规则归档：CHANGELOG、验收状态、TODO。

### 3.5 禁止行为

AI Agent 不得：

- 删除审计逻辑。
- 简化权限判断。
- 删除状态机判断。
- 直接覆盖历史评估结果。
- 将 AI 输出直接作为可信数据入库。
- 将候选人敏感信息写入日志。
- 将业务规则写入 React 组件。
- 将 Prisma Model 直接返回给前端。
- 将队列任务写成不可重试、不可追踪的脚本。
- 在没有 schema 的情况下接收插件或 CSV 数据。
- 在 Domain、Application、API 或 Web App 中直接使用 LangChain / LangGraph SDK。
- 绕过 `AIAssessmentPort`、AI 审计或 SearchRun 状态机调用真实模型。
