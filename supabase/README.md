# Supabase 数据库变更流程

## 文件
- `schema.sql`：历史上的一次性建库脚本（可重复执行）。保留不动，供新环境从零搭建。
- `migrations/20261101000000_baseline.sql`：`schema.sql` 的基线副本，代表生产库**当前已有**的结构。**不要在生产库重复执行。**
- `migrations/<timestamp>_<name>.sql`：之后的所有增量变更，只新增对象，不修改或删除旧表数据。
- `rollback/<timestamp>_<name>_down.sql`：每个增量 migration 对应的回滚脚本，只删除该 migration 新增的对象。

## 上线一个 migration 的步骤
1. **备份生产库**：在 Supabase Dashboard → Database → Backups 确认最近一次备份，或运行
   `pg_dump "$PRODUCTION_DB_URL" --schema=public --schema=private -Fc -f backup-$(date +%F).dump`。
2. **核对基线**：确认生产库结构与 `migrations/20261101000000_baseline.sql` 一致（只读检查表、函数、RLS 策略）。
3. **先在 staging 执行**：用一个独立的 Supabase 开发项目执行 baseline 和新 migration，跑 RLS 测试和 App 手测。
4. **再在生产执行**：人工确认后，在 SQL Editor 或 `supabase db push` 执行新 migration。
5. **出问题时回滚**：执行对应的 `rollback/*_down.sql`；前端执行 git revert，并用 EAS 回退到上一次部署。

## 原则
- 旧的 `household_snapshots` 同步格式保持不变；LifeOS 新数据放在独立的关系型表中。
- 所有新表都开启 RLS，SELECT / INSERT / UPDATE / DELETE 各自有策略和测试。
- 服务端密钥（service role）只在 Edge Functions 中使用，不能进入客户端。
