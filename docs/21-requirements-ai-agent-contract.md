# AI 与 Agent 说明

> 文档性质：现状事实源（专项需求）——AI 输入输出契约、prompt/agent 版本与审计口径的事实源。

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

## 6. 匹配 Agent

输入：

- `JobProfileVersion`。
- 软性匹配 prompt。
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
  "promptVersion": "match-assessment-v1",
  "agentVersion": "jd-match-assessment-v1"
}
```

校验规则：

- `score` 必须为 0-100 的整数。
- `recommendation` 只能是 `推荐`、`待定`、`不推荐`。
- `matchedPoints`、`unmatchedPoints`、`riskPoints` 每类最多 3 条。
- `trace` 必须能关联岗位画像、软性 prompt 和候选人证据。
- 硬筛淘汰候选人不得进入匹配 Agent。

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
