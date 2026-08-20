# 鲜食记 / Fresh Pantry

基于 Expo SDK 57、React Native 和 Expo Router 的多端厨房库存应用。iPhone 是主要体验端，同时支持 Android 和 Web 预览。

## 已实现

- SQLite 本地持久化（Web 使用 localStorage 适配器）
- 分类库存、存放位置、批次、单位换算和库存变动历史
- 新增库存后的可爱收纳动画（冷藏开关门、冷冻雪花、速食柜收纳、零食车弹跳和自定义收纳箱）
- 保质期建议、临期排序和 iPhone 本地通知
- 内置与手动菜谱、动态食材/数量与逐步录入、步骤倒计时、烹饪进度跟踪和完成后自动扣减库存
- 三餐、加餐、饮水记录、健康圆环、日期历史、7 天趋势和自定义目标
- 中英文切换
- Supabase 登录、家庭同步和邀请接口框架

## 启动

```bash
npm install
npx expo start
```

终端出现二维码后，可使用 iPhone 上的 Expo Go 扫码；按 `w` 可启动 Web 预览。

## 配置 Supabase（可选）

1. 复制 `.env.example` 为 `.env`，填写项目 URL 和 publishable key。
2. 在 Supabase SQL Editor 中运行 `supabase/schema.sql`。
3. 重启 Expo 开发服务器，在“我的 → 多端云同步”中使用邮箱登录。

没有配置 Supabase 时，全部本地功能仍然可以正常使用。

## 主要源文件

- `src/app/index.tsx`：库存
- `src/app/recipes.tsx`：菜谱与烹饪流程
- `src/app/recommend.tsx`：健康报告
- `src/app/profile.tsx`：家庭与设置
- `src/context/`：持久化业务状态
- `src/services/`：SQLite、通知和云同步
