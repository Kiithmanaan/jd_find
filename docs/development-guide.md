# 开发手册

## 1. 本地启动

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:deploy
npm run prisma:generate
```

启动 API：

```bash
npm run build
npm start
```

启动 Worker：

```bash
npm run worker:search
```

启动前端：

```bash
npm run web:dev
```

## 2. 常用命令

```bash
npm run typecheck
npm run web:typecheck
env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate
npm test
npm run web:build
```

## 3. 分支和提交

分支：

```text
codex/中文短描述
```

提交：

```text
feat: 增加插件提交接口
docs: 写回确认细节和设计风险
fix: 修复候选人去重问题
```

合并到 `main` 前必须执行全量检查：

```bash
npm run typecheck
npm run web:typecheck
env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate
npm test
npm run web:build
```

## 4. 架构边界

主工程负责：

- 用户认证。
- JobProfile / JobProfileVersion。
- SearchRun。
- 插件数据 ingestion。
- 去重、硬筛、AI 评估、排序、审计。
- 附件保存和下载。

主工程不负责：

- 真实招聘平台抓取。
- 插件抓取节奏。
- 插件风控规避策略。
- ATS、Offer、客户推进、长期人才库。

## 5. 新增 API 的要求

- 使用 `/api` 前缀。
- 明确错误码。
- 失败响应包含可行动的错误信息。
- 插件接口必须校验 Plugin Token。
- Web 接口第一阶段使用 Web JWT。
- 高风险变更需要补集成测试。

## 6. 新增领域能力的要求

- 优先改领域纯函数，再接 API/Prisma/前端。
- 不在 API 层直接塞业务规则。
- SearchRun 状态变化需要事件。
- AI 调用需要审计。
- 硬筛 trace 和软性匹配 trace 需要可回溯。

## 7. 版本发布记录格式

每次发布记录使用以下格式：

```markdown
# v0.x.y - YYYY-MM-DD

## 新增
- 

## 修复
- 

## 文档
- 

## 迁移
- 

## 验证
- `npm run typecheck`
- `npm run web:typecheck`
- `env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate`
- `npm test`
- `npm run web:build`
```
