# LifeOS Sprint 0 评估报告与实施计划

## Context
用户希望把「鲜食记」(Expo 54 / RN 0.81.5 / Expo Router 6 / Supabase) 渐进扩展为个人+家庭生活管家 LifeOS，按《Codex Agent Implementation Brief》执行。本轮是 Sprint 0：只读评估、验证报告、设计 DB 扩展与导航、给出文件清单/步骤/风险。评估阶段未修改代码或数据库；Sprint 0 只新增文档、基线 migration 副本和 CI。开发分支：`claude/lifeos-project-assessment-3hkon5`。

## 1. 基线结果（已实际运行）
- `npm test`：**23/23 通过**（node --experimental-strip-types，无需安装依赖）。
- `npx tsc --noEmit`：**通过**（`npm ci` 后，exit 0）。
- `npm run lint`：**通过**（exit 0，无告警）。
- 当前分支与 `main`(aaf1bb8) 一致，工作区干净。

## 2. 报告准确性核对
**准确：** 技术栈版本、`app.json`（`web.output: server`、EAS projectId、typedRoutes、reactCompiler）、Provider 结构、NativeTabs / Web 底部 Tab、`household_snapshots`(payload+version 乐观锁)、Web 三个通知适配器为空实现、README 明确无 Service Worker、`inventory.tsx`(3828 行)/`recipes.tsx`(2985 行) 过大、`schema.sql` 的 RLS/RPC 设计（快照只能经 `push_household_snapshot` SECURITY DEFINER RPC 写入）。

**需要纠正 / 报告遗漏：**
1. **不存在“无账号访客模式”。** `src/components/app-access-gate.tsx` 在 `!configured || !session || !household` 时强制显示 `AccountScreen`；README「没有配置 Supabase 时全部本地功能仍可用」已过时。产品问题「是否继续允许访客」的前提不成立——现状就是必须登录+有家庭。
2. **健康数据不是“个人数据被家人看到”，而是“全家共用一份”。** `AppCloudSnapshot = {kitchen, health}` 每家一行，两位成员的饮食/饮水记录、碳水目标、过敏偏好会被合并、互相覆盖。这比报告所述的隐私问题更根本。
3. **一人只能属于一个家庭**（`create_household`/`accept_household_invite` 抛 `already-in-household`）。这简化了 LifeOS 设计：个人任务 `household_id` 可为 null，家庭任务取用户唯一家庭。
4. **AI API Routes 无鉴权**（`src/app/ai/*+api.ts` 直接用服务端 `OPENAI_API_KEY`），部署后任何人可调用消耗额度。报告未提及——建议提前修复。
5. **快照无上限增长**：`transactions`、`deletedInventory`、`cookingHistory`、`mealRecords` 全部进同一 JSON，每次改动全量上传；Web 端 `localStorage` 约 5MB 上限。进一步证明新模块不应进快照。
6. **数据库无 migration 体系**：只有一个可重复执行的 `supabase/schema.sql`（含 `drop policy if exists`），无 `supabase/config.toml`、无 migrations 目录；无法确认生产库与该文件一致。
7. **CI 不可用**：唯一 workflow 是 SLSA 模板（无构建步骤，release 时会失败），没有运行 test/tsc/lint 的 CI。
8. **命名冲突**：鲜食记已有 `storageLocations`(冷藏/冷冻…) 概念，新表建议命名 `home_locations` / `home_items`，避免与食品“存放位置”混淆。
9. **iPhone 现状是 PWA**（README：无 Apple Developer Program，Safari 添加到主屏幕）。这直接决定推送路线：iOS 16.4+ PWA 的 Web Push 才是首选，原生 APNs 需要付费开发者账号 + Development Build。

## 3. 对报告的修改建议
- **数据模型精简**：`recurrence_rules` 与任务 1:1，合并为 `task_definitions` 的列；`task_reminders` MVP 先用 `reminders jsonb`，Sprint 4 再拆表。一次性任务也用单个 occurrence（`occurrence_key='once'`）统一模型，“今天/逾期/已完成”只查 `task_occurrences`。
- **重复算法写成纯 TS 模块**（`src/shared/time/recurrence.ts`，零依赖），客户端按需生成未来 N 期 occurrence（`insert … on conflict do nothing`），Sprint 4 的 Edge Function（Deno 可直接 import TS）复用同一文件，避免两套逻辑。occurrence 以“本地日期”为键，仅在发通知时换算为时刻 → 天然规避 DST 问题。
- **推送顺序调整**：先 Web Push（PWA，iPhone+Mac 都覆盖），原生 Expo Push 视是否购买开发者账号再定。
- **导航**：不要把库存/菜谱/健康塞进一个 Hub 后丢掉 Tab 高亮——用 Expo Router 路由组 `(pantry)` 保持 URL 不变（见 §5）。
- **新增 Sprint 0 安全项**：AI 路由校验 Supabase JWT；新增 CI。
- **健康数据**：Sprint 0 只记录现状；拆分到个人存储（如 `personal_snapshots`）作为独立、需用户确认的迁移，不与 LifeOS 任务同批上线。
- **RLS 测试环境**：本容器无 Docker 跑不了 `supabase start`；建议用户新建一个**独立的免费 Supabase 开发项目**作为 staging，所有 migration 先在那里执行+测试，再人工应用到生产。

## 4. 数据库扩展设计（全部增量、可回滚，Sprint 2 才实施）
新增 migration `supabase/migrations/<ts>_lifeos_tasks.sql`（配套 `supabase/rollback/<ts>_lifeos_tasks_down.sql` = drop 新表/函数，不触及旧表）：

- `task_definitions`：`id, owner_user_id, household_id null, scope check in ('personal','household'), title, notes, category, priority, assignee_id null, kind ('once'|'recurring'), due_date, due_time, timezone default 'America/Vancouver', freq ('daily'|'weekly'|'monthly'|'every_n_days'), interval, weekdays smallint[], month_day, start_date, end_date, anchor ('schedule'|'completion'), reminders jsonb, archived_at, deleted_at(软删除可恢复), version bigint, created_at, updated_at`。约束：`scope='household' ⇔ household_id not null`。
- `task_occurrences`：`id, task_id, occurrence_key, scheduled_date, scheduled_time, status ('pending'|'done'|'skipped'), completed_at, completed_by, snoozed_to, version, updated_at`，`UNIQUE(task_id, occurrence_key)`。完成一期只改该行 → 满足“10-26 浴巾不影响 11-02”。`anchor='completion'` 时完成后才生成下一期。
- RLS：新函数 `private.can_access_task(task_id)` = personal → `owner_user_id = auth.uid()`；household → 复用现有 `private.is_household_member(household_id)`。SELECT/INSERT/UPDATE/DELETE 分别建策略；occurrence 经 task 判定。触发器校验 `assignee_id` 是家庭成员、`updated_at/version` 自增。
- 并发：客户端 `update … where id = $1 and version = $2`，0 行 = 冲突，提示而非覆盖。
- Realtime：两表加入 `supabase_realtime` publication。
- Sprint 3：`home_locations`(树，触发器防环)、`home_items`、`inventory_movements`，同样模式。Sprint 4：`device_subscriptions`、`notification_deliveries`。

## 5. 前端导航方案（Sprint 1）
- 五个顶级入口：**总览 `/`（现有 index 首页扩展）/ 任务 `/tasks` / 收纳 `/items` / 鲜食记 `(pantry)` / 我的 `/profile`**。
- `src/app/(pantry)/` 路由组 + Stack：移入 `inventory, recipes, recommend, planner, insights`（`git mv`，URL 不变，`/inventory`、通知 `url:'/recipes'`、`router.push` 全部兼容），新增 `(pantry)/pantry.tsx` 作为鲜食记入口页（库存/菜谱/健康/菜单/报告卡片）。若 NativeTabs 对路由组表现异常，退回“`/pantry` Hub + 原页面 hidden trigger”方案。
- Mac：`app-tabs.web.tsx` 用 `useWindowDimensions()`，宽度 ≥ 1024 时 `CustomTabList` 渲染为左侧竖向侧边栏、`TabSlot` 右侧内容区；< 1024 保持现有底部玻璃 Tab。复用同一 `TabTrigger` 列表，不新建导航体系。
- 总览：在现有 `home-sections-v1` 区块机制里新增「今日任务」区块（Sprint 2 接数据），不重写首页。
- 文案用现有 `useLanguage().text(zh, en)`。`app.json` 名称/图标暂不改（产品决定）。

## 6. 文件修改清单
**Sprint 0（低风险，确认后执行）**
- `npm ci` → 记录 `tsc`/`lint` 基线（若有既有错误，只记录不修）。
- 新增 `docs/lifeos/sprint-0-assessment.md`（本报告入库）。
- 新增 `supabase/migrations/20261101000000_baseline.sql`（= 现 `schema.sql` 副本，标注“已存在于生产，勿重复执行”）+ `supabase/README.md`（migration/回滚/备份流程：先 Dashboard 备份或 `pg_dump`，再 staging，再生产）。
- 新增 `.github/workflows/ci.yml`：`npm ci && npm test && npx tsc --noEmit && npm run lint`。SLSA 模板保留不动（或由你决定删除）。
- `src/app/ai/analyze-import+api.ts`、`organize-recipes+api.ts`：校验 `Authorization: Bearer <supabase access token>`（`supabase.auth.getUser(token)`）；对应客户端 `src/services/ai-import.ts`、`recipe-ai.ts` 携带 token。（可选，需你同意，会改变行为）
- `README.md`：修正访客模式描述。

**Sprint 1**
- `src/components/app-tabs.tsx`、`src/components/app-tabs.web.tsx`（新 5 入口 + 侧边栏）
- `src/app/(pantry)/_layout.tsx`、`src/app/(pantry)/pantry.tsx`；`git mv` 五个鲜食记页面进组
- `src/app/tasks.tsx`、`src/app/items.tsx`（占位页，“即将上线”）
- `src/components/app-access-gate.tsx`（`@/app/account` 引用核对）
- 测试：`tests/navigation-routes.test.ts`（断言旧路径列表仍存在于 `src/app`）

**Sprint 2（预告）**：`src/shared/time/recurrence.ts` + `tests/recurrence.test.ts`（每天/指定星期/每 N 周/月末 31→30/2月/DST 3-08 与 11-01 Vancouver/完成后 N 天/浴巾用例）；`src/features/tasks/{api,context,components}`；migration + rollback；`tests/permissions/` RLS SQL 测试（在 staging 执行）。

## 7. 风险
| 风险 | 缓解 |
| --- | --- |
| 生产库与 `schema.sql` 不一致 | 先只读 `list_tables`/导出 schema 比对（需你授权），再写 migration |
| 路由组移动破坏 typedRoutes/深链 | URL 不变 + 路由存在性测试 + Web/Expo Go 手测 |
| NativeTabs 对路由组支持差异 | 预留 Hub 回退方案 |
| 健康数据共享语义 | 不在 LifeOS 中改动；单独迁移需你决定 |
| 无原生开发者账号 → 后台推送 | Web Push(PWA) 优先；接受 iOS PWA 限制 |
| 无 Docker 无法本地跑 RLS 测试 | 独立 staging Supabase 项目 |
| 回滚 | 前端：git revert + EAS 回退上一次部署；DB：新表纯增量，down 脚本只删新对象 |

## 8. 需要你决定的问题
1. iPhone 长期以 **PWA** 还是**原生 App（需 Apple Developer $99/年）**为主？决定 Sprint 4 推送路线。
2. 健康/饮食数据：保持全家共享，还是计划改为每人私有？
3. 是否同意 Sprint 0 加入 AI 路由鉴权 + CI？SLSA 模板是否删除？
4. 是否可以新建 staging Supabase 项目；是否允许我对生产库做**只读** schema 检查？
5. 是否保留“必须登录+家庭”的现状（我建议保留，不新增访客模式）。

## 验证
- Sprint 0：`npm test`、`npx tsc --noEmit`、`npm run lint` 全部记录；CI 在 PR 上跑绿。
- Sprint 1：上述三项 + 新路由测试；`npx expo start --web` 用 Playwright 在 390px 与 1440px 宽度截图验证底部 Tab / 侧边栏；逐一打开 `/inventory /recipes /recommend /planner /insights /profile /account /widgets /preferences` 确认可达；Expo Go 上验证原生 Tab 与烹饪通知跳转 `/recipes`。
- 每个 Sprint 独立提交、推送到指定分支，等待你确认后再进行下一阶段。

## 10. 执行记录（2026-11-01）
- **生产库只读检查：已完成（项目恢复后，仅 SELECT）。**
  - 结构与 `migrations/20261101000000_baseline.sql` 一致：4 张表、全部启用 RLS，6 条策略，2 个 private 与 10 个 public SECURITY DEFINER 函数，函数只授权给 `authenticated`，`household_snapshots` 已加入 realtime。没有 migration 历史（`list_migrations` 为空），与“手动执行 schema.sql”一致。
  - 实际数据：1 个用户、1 个家庭、1 份快照（payload 约 1.3KB），0 个邀请。说明线上几乎只有测试数据，LifeOS 迁移和健康数据拆分的数据风险都很低。
  - 基线之外的对象：`public.rls_auto_enable()` + 事件触发器 `ensure_rls`，是 Supabase 自动为 public 新表开启 RLS 的机制，无害，保留。
  - 小问题：`authenticated` 还有 Supabase 默认的 `TRUNCATE/TRIGGER/REFERENCES` 表权限（`schema.sql` 只授予了 SELECT，没有回收其他权限）。PostgREST 不暴露 TRUNCATE，目前无法通过 API 利用；会在第一个 LifeOS migration 中一并 `revoke`。
- **防暂停：** 新增 `.github/workflows/supabase-keepalive.yml`，每 3 天用 publishable key 请求一次 REST API（匿名无表权限，不返回数据）。需在 GitHub 仓库 Secrets 中配置 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`。
- **AI 接口登录校验：已完成。** `src/services/ai-auth-server.ts` 的 `rejectUnauthenticated()` 用 Supabase `auth.getUser(token)` 校验调用者；两个 `/ai/*` 路由在调用 OpenAI 前先检查；客户端经 `src/services/ai-auth-client.ts` 自动携带当前会话 token。未登录或 token 无效 → 401。行内文本录入在 AI 失败时仍会回退到本地解析。
  - 验证：`npm test`（25/25）、`tsc`、`lint` 通过；对 `expo export --platform web` 产物直接调用两个路由的 `POST`，无 token / 无效 token 均返回 401。有效 token 的成功路径需在项目恢复后实测。
