# 部署手册

## 1. 第一阶段部署形态

- 单台云服务器。
- Docker Compose 自托管 PostgreSQL 和 Redis。
- API、Worker、前端在服务器本机 build。
- 不使用 Docker 镜像仓库。
- 使用 Caddy 做 HTTPS 反向代理。
- HTTPS 证书使用 Let's Encrypt。

待填写：

- 云服务器规格。
- 生产域名。
- 服务器登录用户。
- 部署目录。

## 2. 生产目录建议

```text
/opt/jd-search/
  app/
  data/
    postgres/
    redis/
    uploads/
    backups/
  logs/
```

## 3. 环境变量

生产 `.env` 必填：

```text
DATABASE_URL=
JWT_SECRET=
PORT=3000
HOST=127.0.0.1
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SEARCH_RUN_QUEUE_NAME=search-runs
AI_ASSESSMENT_PROVIDER=mock
AI_ASSESSMENT_ENDPOINT=
AI_ASSESSMENT_API_KEY=
AI_ASSESSMENT_PROVIDER_NAME=mock
AI_ASSESSMENT_MODEL=external-ai-assessment
AI_ASSESSMENT_TIMEOUT_MS=30000
```

要求：

- `JWT_SECRET` 必须使用强随机值。
- `.env` 不提交到 git。
- 生产 `DATABASE_URL` 指向 Compose PostgreSQL。

## 4. 部署步骤

```bash
git pull
npm ci
npm run prisma:generate
npm run build
npm run web:build
npm run prisma:deploy
npm run user:create
```

启动依赖：

```bash
npm run db:up
```

启动 API：

```bash
npm start
```

启动 Worker：

```bash
npm run worker:search
```

## 5. Caddy 反向代理

示例：

```text
example.com {
  encode gzip

  handle /api/* {
    reverse_proxy 127.0.0.1:3000
  }

  handle {
    root * /opt/jd-search/app/dist-web
    try_files {path} /index.html
    file_server
  }
}
```

## 6. 数据持久化

PostgreSQL：

- 必须使用持久化 volume。
- 每日 `pg_dump`。
- 备份保留 14 天。

Redis：

- 建议开启持久化或使用 volume。
- 第一阶段 Redis 主要用于队列状态。

附件：

- 本地附件目录建议放在 `/opt/jd-search/data/uploads`。
- 第一阶段按 `SearchRun` 分目录。

## 7. 发布前检查

```bash
npm run typecheck
npm run web:typecheck
env DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jd_search npm run prisma:validate
npm test
npm run web:build
```
