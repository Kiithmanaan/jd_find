# jd_find · Boss 直聘候选人抓取插件

配套 jd_find 主工程的 Chrome MV3 插件：在 Boss 直聘上**半自动、用户触发**地把候选人提交到主工程，走后台聚合 → 硬筛 → AI 评估。

## 设计边界（风控红线，务必遵守）

参考了 `warterbili/BossZhipin_reverse` 与 `joohw/boss-cli`。Boss 有较强风控（Warlock/risk-detection、DevTools 检测、`navigator.webdriver`、403 跳转）。本插件刻意采取**最低风险姿态**：

- **只被动只读**：运行在你已登录的 Boss 标签页内，只读你正在浏览的页面数据。
- **用户触发**：数据由你点击「抓取本页候选人」才提交，不自动翻页、不批量爬取。
- **不做任何绕过**：不注入/拦截安全脚本、不改指纹、不伪造签名请求、不自动跳转。
- 请以正常人类节奏浏览；主工程侧对提交有限流（默认 60 次/分钟）。

> `boss-cli` 的经验：每当 Boss 前端安全版本变更就应停用工具复核。若插件行为异常或页面出现风控验证，请停止使用并排查。

## 架构

```
Boss 页面 MAIN world:  hook.js(document_start) 只读包裹 fetch/XHR，捕获候选人 JSON
        │ CustomEvent
Boss 页面 隔离世界:     content.js 悬浮面板 + 按指纹缓冲去重 + DOM 卡片兑底 + 字段映射
        │ chrome.runtime 消息
后台 service-worker:   分批 ≤20 条 → POST /api/plugin/search-runs/:id/candidates（限流退避 + 终态检测）
        ▼
主工程:                30s 聚合 → 硬筛 → AI 评估 → 落库
```

## 构建

```bash
cd extension
npm install
npm run build      # 产出 dist/（含 manifest.json 与各 bundle）
npm run watch      # 开发时热重建
npm run typecheck
```

## 加载到 Chrome

1. 打开 `chrome://extensions`，右上角开启「开发者模式」。
2. 点「加载已解压的扩展程序」，选择 `extension/dist` 目录。
3. 需要 Chrome 111+（用到 `content_scripts` 的 `world: "MAIN"`）。

## 使用

1. 在主工程创建一个 **sourceType=plugin** 的 SearchRun，记下它的 `searchRunId`。
2. 点插件图标，弹窗里填 API 地址（默认 `http://47.116.191.196`）、邮箱、密码登录，再填入 `searchRunId` 保存。
3. 打开 Boss 搜索/推荐页，**滚动浏览**让页面加载候选人数据（hook 会自动捕获）。
4. 点右下角悬浮面板的「抓取本页候选人」→ 提交，面板显示接收计数。
5. 约 30 秒后在主工程工作台看到候选人分流结果。

## 校准指引（重要）

DOM 结构与候选人 JSON 字段名会随 Boss 改版变化，下面两处需对着真实页面校准：

- **字段映射** `src/content/field-map.ts`：首次抓取时，插件会把捕获到的**第一条候选人 JSON** 打到页面 console（`[jd_find] 采样 Boss 候选人 JSON…`）。据此核对/补全 `BossGeekLike` 的字段名与 `mapBossGeek` 的取值路径。
- **DOM 兑底选择器** `src/content/scrape-dom.ts` 的 `SELECTORS`：当 hook 抓不到 JSON 时才用。对着搜索页 DevTools 校准卡片/姓名/职位/城市/学历/经验的选择器。

hook 捕获哪些请求由 `src/content/hook.ts` 的 `CANDIDATE_URL_PATTERNS` 决定，可按真实端点收敛。

## 已知限制（第一阶段）

- 只取**列表级字段**（姓名/职位/城市/学历/经验/行业/关键词/简述）。完整简历在沙箱 iframe `iframe[src*='c-resume']` 内，本阶段不解析/OCR。
- 简历附件上传接口服务端已就绪（`POST /api/plugin/search-runs/:id/candidates/:candidateId/resume-attachment`），插件本阶段暂未接入。
- 若在 popup 把 API 地址改到别的 host，需同步 `manifest.json` 的 `host_permissions` 后重新加载，否则 fetch 被浏览器拦截。

## 契约事实源

- 协议：`../docs/30-technical-plugin-protocol.md`
- OpenAPI：`../docs/31-technical-openapi.yaml`（base path `/api`）
