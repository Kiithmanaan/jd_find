# Demo 脚本

本文档用于第一阶段本地演示，覆盖启动、创建用户、发起插件 SearchRun、提交候选人、查询结果、AI 审计和异常状态。

## 1. 环境准备

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:deploy
npm run build
```

创建演示账号：

```bash
USER_EMAIL=hunter@example.com USER_PASSWORD='change-me' npm run user:create
```

启动 API：

```bash
npm start
```

启动前端：

```bash
npm run web:dev
```

访问：

```text
http://127.0.0.1:5173
```

## 2. 演示岗位画像

详细 demo 数据见 `docs/demo-data.md`。

岗位：高级解决方案顾问。

硬性条件：

- 全文关键词：解决方案、客户成功。
- 城市：上海。
- 行业：企业服务。
- 学历：本科及以上。
- 最低工作年限：5 年。

软性条件：

- 复杂项目推动。
- 客户理解能力。

候选人样例：

- 陈明：预期推荐。
- 李然：预期待定。
- 周琪：预期不推荐。
- 王磊：预期硬筛淘汰。
- 赵敏：预期硬筛淘汰。

## 3. 标准演示流程

1. 使用 Web 登录。
2. 使用 Plugin 登录。
3. 在前端创建插件类型 `SearchRun`，目标数量使用 50。
4. 使用默认候选人 JSON 提交一批候选人。
5. 刷新 `SearchRun`，确认原始提交数量增加。
6. 打开候选人列表，点击匹配分查看详情。
7. 打开 AI 审计，确认存在输入快照和输出快照。

## 4. API 演示命令

Web 登录：

```bash
curl -s http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"hunter@example.com","password":"change-me"}'
```

插件登录：

```bash
curl -s http://127.0.0.1:3000/api/plugin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"hunter@example.com","password":"change-me"}'
```

查询 `SearchRun`：

```bash
curl -s http://127.0.0.1:3000/api/search-runs/{searchRunId} \
  -H "Authorization: Bearer ${WEB_TOKEN}"
```

查询 AI 审计：

```bash
curl -s http://127.0.0.1:3000/api/search-runs/{searchRunId}/ai-assessment-audits \
  -H "Authorization: Bearer ${WEB_TOKEN}"
```

## 5. 异常状态演示

`Failed`：

- 将 AI 服务配置为不可用 endpoint。
- 发起一次 Mock/CSV 搜索。
- Worker 处理失败后，查询 `SearchRun.failureReason`。

`Cancelled`：

- 使用 Web Token 调用 `POST /api/search-runs/{searchRunId}/cancel`。
- 查询 `SearchRun.status = Cancelled`。
- 再使用插件提交候选人，确认返回 `SearchRunCancelled`。

`Interrupted`：

- 使用 Mock Source Adapter 提供 `riskSignal`。
- Worker 处理后确认 `SearchRun.status = Interrupted`。

## 6. 通过标准

- API 健康检查返回 `ok`。
- Web 与 Plugin 均可登录。
- 插件类型 `SearchRun` 可创建。
- 插件可提交候选人。
- 候选人可进入硬筛与 AI 评估流程。
- AI 审计可查询。
- Failed / Interrupted / Cancelled 均可演示。
