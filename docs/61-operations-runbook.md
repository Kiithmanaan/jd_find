# 运营与排障手册

## 1. 日常检查

检查 API：

```bash
curl http://127.0.0.1:3000/api/health
```

检查数据库：

```bash
docker compose ps postgres
```

检查 Redis：

```bash
docker compose ps redis
```

## 2. 备份

每日执行：

```bash
pg_dump "$DATABASE_URL" > /opt/jd-search/data/backups/jd_search_$(date +%F).sql
```

保留 14 天：

```bash
find /opt/jd-search/data/backups -name 'jd_search_*.sql' -mtime +14 -delete
```

## 3. 恢复演练

1. 停止 API 和 Worker。
2. 确认备份文件。
3. 在测试数据库中恢复。
4. 执行 `npm run prisma:validate`。
5. 启动 API。
6. 抽查 `JobProfile`、`SearchRun`、AI 审计和附件下载。

## 4. 常见问题

API 无法启动：

- 检查 `.env` 是否存在。
- 检查 `DATABASE_URL` 是否正确。
- 检查 `JWT_SECRET` 是否存在。
- 检查 PostgreSQL 和 Redis 是否运行。

登录失败：

- 确认用户已通过 `npm run user:create` 创建。
- 确认邮箱已小写归一化。
- 确认密码未误包含 shell 转义字符。

插件提交失败：

- `AuthError`：重新登录插件。
- `SearchRunCompleted`：停止当前批次。
- `SearchRunCancelled`：停止当前批次。
- `ValidationError`：记录并跳过该候选人。
- `RateLimited`：降频重试。

AI 评估失败：

- 查看 `SearchRun.failureReason`。
- 查看 AI 审计失败记录。
- 检查 AI endpoint、api key、timeout。

前端空白：

- 执行 `npm run web:build`。
- 检查 Caddy root 是否指向 `dist-web`。
- 检查浏览器控制台错误。

## 5. 日志建议

第一阶段建议将 API、Worker、Caddy、PostgreSQL、Redis 日志分开保存。

日志目录：

```text
/opt/jd-search/logs/
```

排障时优先收集：

- 请求路径。
- 用户 id。
- SearchRun id。
- JobProfile id。
- 错误码。
- 响应状态码。
