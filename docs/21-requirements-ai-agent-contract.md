# AI 与 Agent 说明

本文档基于已提供的 `jd-clarify` skill，定义第一阶段岗位画像生成、软性条件生成、匹配评估和审计口径。

## 1. Skill 定位

`jd-clarify` 面向 RPO/HRO 招聘场景，用于：

- 解析 JD 和招聘需求。
- 产出岗位画像、筛选 SOP、淘汰规则。
- 识别信息缺口和候选人关键信息缺口。
- 将筛选条件分流到简历筛选、AI 文字聊天筛选、招聘专家电话筛选。
- 支持岗位画像版本迭代。
- 支持移动端 JD 重构和 RPA 打招呼话术生成。

第一阶段接入原则：

- `jd-clarify` 只作为 prompt 和逻辑参考，不作为主工程运行时依赖。
- 主工程内实现自己的 agent 编排、结构化输出校验、AI 审计和错误处理。
- 外部 AI 服务只承担模型调用能力，不能替代主工程的业务契约。
- prompt version 和 agent version 由主工程生成并保存。

## 2. 模式

模式 A：画像与筛选 SOP。

- 默认模式。
- 产出岗位画像、关键信息检查、三层筛选分流、执行 SOP、版本迭代记录。

模式 B：JD 重构与 RPA 话术。

- 用户明确要求优化 JD、移动端 JD、打招呼话术时启用。
- 输出职位名称、岗位亮点、岗位职责、任职要求、自动化打招呼话术、AI 初面内容。

双模式：

- 同时要求画像/SOP 和 JD/话术时，先输出模式 A，再输出模式 B。

## 3. 岗位画像生成输入

输入字段按可得信息尽量提供：

- 岗位基础：名称、职级、汇报线、团队规模、地点、出差/班次、薪酬区间。
- 待遇：固定薪资、奖金、提成、补贴、试用期。
- 工作制度：工作时间、单双休、加班、远程/现场。
- 业务目标：3-6 个月关键结果。
- 经验要求：行业、职能年限、场景经验、项目体量。
- 能力要求：硬技能、工具栈、方法论、语言能力。
- 约束：到岗、稳定性、轮班、地域、特殊要求。
- 客户公司信息：阶段、赛道、产品、规模、结构、管理风格、晋升、激励、紧急度。
- 用工关系：签约主体、用工主体、社保主体、考勤管理、汇报对象、外包/派遣/项目制。

缺失信息必须标记 `待确认`。

## 4. 岗位画像输出

固定输出：

- 岗位使命。
- Must Have：3-5 条。
- Good to Have：2-4 条。
- Red Flags：2-4 条。
- 公司语境校准。
- 用工关系校准。

如有公司信息，额外输出公司信息影响映射：

- 公司信息点。
- 对岗位画像的影响。
- 对筛选阈值的影响。
- 对沟通卖点的影响。

如有用工关系信息，额外输出用工关系影响映射：

- 签约/用工/社保/管理信息。
- 对候选人接受度的影响。
- 对筛选条件的影响。
- 对外发布与沟通口径。

## 5. 软性条件生成 Agent

输入：

- 当前 `JobProfileVersion`。
- 用户原始软性要求文本。
- Must Have / Good to Have / Red Flags。
- 公司语境和用工关系校准。

输出：

- 生成后的匹配 prompt。
- prompt version。
- agent version。
- 软性条件解释文本。
- 可审计输入快照。

最小契约：

```json
{
  "matchingPrompt": "string",
  "promptVersion": "soft-condition-v1",
  "agentVersion": "jd-soft-condition-v1",
  "explanation": "string",
  "inputSnapshot": {}
}
```

规则：

- 软性条件不采用固定维度配置。
- 软性条件来源于自然语言要求。
- 每条条件必须可验证、可执行。
- 抽象标签必须转为行为或证据描述。

## 5.1 澄清访谈 Agent（逼问式画像梳理）

定位：

- 多轮问答把"想招什么人"从模糊说法逼问成可执行的画像草稿。
- 一次只问一个问题；每个问题必须附一条具体的推荐答案（`suggestedAnswer`），让用户确认或纠正。
- 模糊词（资深、能力强等）必须逼问成可判断的标准。
- AI 只产出草稿建议，画像确认仍必须由用户动作触发。

七组固定话题（顺序有依赖关系，不可乱序）：

1. `role-purpose` 岗位存在意义
2. `hard-gates` 硬门槛
3. `vital-skills` 命脉技能与验证方式
4. `negative-signals` 排除信号
5. `target-companies` 目标公司与人才来源
6. `search-keywords` 搜索关键词与渠道
7. `soft-preferences` 软性偏好与加分项

会话与产出：

- 会话持久化，状态为 `InProgress`、`Completed`、`Abandoned`。
- 每轮问答记录 `InterviewTurn`，内嵌该轮 AI 调用元数据（provider、model、prompt version、agent version、graph version、耗时），即本 Agent 的审计载体；不写入 `AIAssessmentAuditRecord`（该表要求关联 SearchRun）。
- 全部话题回答完毕后产出画像草稿 `draftOutput`：
  - `jdText`：JD 文本。
  - `hardRequirementNotes`：硬性条件文本建议（不生成结构化规则，结构化配置仍由用户在硬筛配置中完成）。
  - `softRequirements`：软性条件（尽量附 `verificationHint`）。
  - `negativeSignals`：排除信号。
  - `searchKeywords`：搜索关键词，至少 1 个。
- 草稿应用走既有 `POST /api/job-profiles/:id/versions/draft`，由前端预填、用户确认。

版本口径：

- prompt version：`clarification-interview-v1`。
- agent version：`jd-clarification-interview-v1`。
- LangGraph graph version：`clarification-interview-graph-v1`。
- Provider 默认 `mock`，可切换 `langgraph-openai`（env：`CLARIFICATION_INTERVIEW_PROVIDER` 等）。

## 6. 匹配 Agent

输入：

- `JobProfileVersion`。
- 软性匹配 prompt。
- 排除信号：画像中命中即提示风险的简历特征描述（`negativeSignals`，可为空）。
- 软性条件的验证方式提示（`SoftRequirement.verificationHint`，可选）：说明看简历中什么信号才算真正满足该条件。
- 硬筛通过候选人。
- 候选人简历摘要、来源线索、意向、活跃度。

输出：

- 匹配分：0-100。
- 推荐结论枚举：`推荐`、`待定`、`不推荐`。
- 推荐结论说明：自然语言文本。
- 合适点：最多 3 条。
- 不合适点：最多 3 条。
- 风险点：最多 3 条。
- trace：说明评分和结论依据。
- assessedAt。
- jobProfileVersionId。
- prompt version。
- agent version。

最小契约：

```json
{
  "candidateId": "string",
  "score": 0,
  "recommendation": "推荐",
  "recommendationReason": "string",
  "matchedPoints": ["string"],
  "unmatchedPoints": ["string"],
  "riskPoints": ["string"],
  "trace": "string",
  "assessedAt": "2026-06-06T00:00:00.000Z",
  "jobProfileVersionId": "string",
  "promptVersion": "match-assessment-v2",
  "agentVersion": "jd-match-assessment-v2"
}
```

校验规则：

- `score` 必须为 0-100 的整数。
- `recommendation` 只能是 `推荐`、`待定`、`不推荐`。
- `matchedPoints`、`unmatchedPoints`、`riskPoints` 每类最多 3 条。
- `trace` 必须能关联岗位画像、软性 prompt 和候选人证据。
- 硬筛淘汰候选人不得进入匹配 Agent。

排除信号对照规则：

- 画像配置了 `negativeSignals` 时，匹配 Agent 必须逐条对照候选人简历。
- 命中的排除信号优先写入 `riskPoints`，每条注明命中的信号。
- `riskPoints` 上限仍为 3 条：命中信号超过 3 条时按严重程度截断，截断是预期口径。
- 排除信号命中不强制改变推荐结论，但必须在 `recommendationReason` 或 `trace` 中说明影响。

prompt version 迁移说明：

- `match-assessment-v1`：不含排除信号与验证方式提示的初版契约。
- `match-assessment-v2`：输入增加 `negativeSignals` 与 `verificationHint`，输出要求风险点逐条对照排除信号。
- 历史审计记录保留 v1 标识，与 v2 记录并存，属预期行为，用于区分两代评估口径。
- HTTP AI Adapter 的外部服务需同步接受请求体中新增的 `negativeSignals` 与 `softRequirements[].verificationHint` 字段。

## 6.1 搜索词迭代 Agent（search-refinement）

定位：

- SearchRun 完成后，对比"推荐"候选人与被淘汰候选人（硬筛淘汰 ∪ 不推荐）的简历特征，产出下一轮寻访的搜索条件建议。
- 第一阶段由用户手动触发，HTTP 同步执行，同一 SearchRun 同时只允许一个分析（409）。
- "待定"候选人不参与对比。
- 推荐组为空时也必须产出结论（当前关键词可能过宽或过窄），不视为失败。

输入：

- `JobProfile`（当前搜索条件、排除信号）。
- 推荐组候选人简历。
- 淘汰组候选人简历与硬筛淘汰原因。

输出契约：

```json
{
  "suggestedSearchCondition": { "keywords": ["string"], "cities": [], "industries": [], "educationLevels": [] },
  "addedKeywords": ["string"],
  "droppedKeywords": ["string"],
  "reasoning": "string"
}
```

校验规则：

- `reasoning` 必填，必须引用具体特征证据。
- `suggestedSearchCondition.keywords` 至少 1 个。
- `addedKeywords` / `droppedKeywords` 允许为空数组。

持久化与审计：

- 建议落库 `SearchRefinementSuggestionRecord`，绑定 `searchRunId` 与 `jobProfileVersionId`，一个 run 可多次生成、保留历史。
- 审计写入 `AIAssessmentAuditRecord`，`agentType` 为 `search-refinement`；失败调用也保留输入快照与 prompt。
- prompt version：`search-refinement-v1`；agent version：`jd-search-refinement-v1`；graph version：`search-refinement-graph-v1`。
- Provider 默认 `mock`（确定性词频启发式，本身即可用 baseline），可切换 `langgraph-openai`（env：`SEARCH_REFINEMENT_PROVIDER` 等）。
- 建议应用走既有草稿版本创建端点，由前端预填、用户确认，AI 不直接修改画像。

## 7. 关键信息检查

每个维度输出：

- 当前状态：完整 / 部分完整 / 缺失。
- 缺口说明。
- 对招聘决策的影响。
- 建议澄清问题。
- 最小可沟通口径。

优先检查：

- 业务优先级。
- 必须项边界。
- 经验锚点。
- 薪酬与级别。
- 到岗要求。
- 否决项。
- 待遇清晰度。
- 工作强度。
- 候选人价值点。
- 公司匹配锚点。
- 用工关系接受度。

## 8. 三层筛选分流

筛选渠道：

- 简历可验证筛选。
- AI 文字聊天可验证筛选。
- 招聘专家电话可验证筛选。

原则：

- 每个条件只放在最早且最可靠的筛选环节。
- 白领优先简历与项目证据。
- 灰领优先聊天或电话确认可上岗性，再结合简历补证。
- 蓝领优先电话或聊天确认班次、通勤、到岗、稳定性。

## 9. AI 审计

必须保存：

- 输入快照。
- 输出快照。
- 实际 prompt。
- prompt version。
- agent version。
- provider。
- model。
- 成功调用耗时。
- 失败调用错误类型和错误信息。
- 失败调用的输入快照和 prompt。

审计记录最小契约：

```json
{
  "agentType": "job-profile | soft-condition | match-assessment",
  "provider": "string",
  "model": "string",
  "promptVersion": "string",
  "agentVersion": "string",
  "prompt": "string",
  "inputSnapshot": {},
  "outputSnapshot": {},
  "durationMs": 0,
  "status": "success",
  "errorType": null,
  "errorMessage": null
}
```

## 10. 质量验收样例

合格输出：

- 推荐结论为枚举之一。
- 合适点、不合适点、风险点不超过 3 条。
- trace 能回到岗位画像和候选人证据。
- 不返回请求范围外候选人。
- 硬筛淘汰候选人不进入软性匹配。
- 不确定信息标记 `待确认`。

不合格输出：

- 使用“沟通好”“抗压强”等无证据抽象标签。
- 推荐结论缺失或不在枚举内。
- 合适点超过 3 条。
- 未记录 prompt version 或 agent version。
- 未说明用工关系待确认项。
