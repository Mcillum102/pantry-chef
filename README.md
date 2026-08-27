# 鲜食记 / Fresh Pantry

基于 Expo SDK 54、React Native 和 Expo Router 的多端厨房库存应用。iPhone 是主要体验端，同时支持 Android 和 Web 预览。

## 已实现

- SQLite 本地持久化（Web 使用 localStorage 适配器）
- 首次使用引导、示例/空数据选择，以及按用途解释的权限请求
- 分类库存、存放位置、独立批次、开封后保质期、单位换算和库存变动历史
- 最近删除恢复、本地完整 JSON 备份与格式校验恢复
- “今天”首页汇总临期食材、购物待办、三餐、加餐、饮水量和正在烹饪的步骤
- 家庭购物清单、菜谱缺料一键补货，以及买完后转入库存
- 商品条码查询、自然语言批量录入和购物小票拍照识别（支持逐项校对）
- 新增库存后的可爱收纳动画（冷藏开关门、冷冻雪花、速食柜收纳、零食车弹跳和自定义收纳箱）
- 保质期建议、临期排序和 iPhone 本地通知
- 内置与手动菜谱、动态食材/数量与逐步录入、步骤倒计时、后台本地通知、烹饪进度持久恢复和完成后自动扣减库存
- 三餐、加餐、饮水记录、健康圆环、日期历史、7 天趋势和自定义目标
- 7 天智能菜单、单餐替换、缺料合并加入购物清单
- 库存处置原因、7/30 天节约报告与浪费趋势
- 首页区块隐藏、排序与持久化布局
- iOS 小组件数据快照、临期/饮水/烹饪预览和显示偏好
- 中英文切换
- Supabase 账号注册、密码/验证码登录、密码重置、账号注销、创建或加入家庭、管理员移交、成员移除、版本化同步和冲突处理
- 过敏/忌口筛选、可解释的下一餐推荐、数据来源说明与健康免责声明
- React 错误边界、本机诊断记录和库存/云同步冲突单元测试

## 启动

```bash
npm install
npx expo start
```

终端出现二维码后，可使用 iPhone 上的 Expo Go 扫码；按 `w` 可启动 Web 预览。

## 配置 Supabase（可选）

1. 复制 `.env.example` 为 `.env`，填写项目 URL 和 publishable key。
2. 在 Supabase SQL Editor 中运行 `supabase/schema.sql`。
3. 在 Supabase Authentication 中启用 Email provider；把 `http://localhost:8082/**`、`pantrychef://**` 和开发期的 `exp://**` 加入 Redirect URLs。
4. 重启 Expo 开发服务器，在“我的 → 创建账号”中注册，然后创建家庭或使用邀请码加入。

没有配置 Supabase 时，全部本地功能仍然可以正常使用。

## 两人安装到 iPhone 主屏幕

项目包含 PWA manifest、Apple Touch Icon、独立启动模式和 Web 邮箱验证回跳，可以在没有 Apple Developer Program 的情况下先作为家庭 Web App 使用。

```bash
npm run web:export
npm run web:serve
npm run web:deploy
```

首次发布需要免费的 Expo 账号。发布完成后，把生产网址的 `https://<name>.expo.app/**` 加入 Supabase Authentication 的 Redirect URLs。两台 iPhone 分别用 Safari 打开生产网址，点“共享 → 添加到主屏幕”；随后分别注册账号，由一人创建家庭并向另一人的邮箱生成邀请码。

PWA 会把库存和未同步改动保留在当前设备，并通过 Supabase 同步家庭数据。当前未启用 Service Worker，以避免旧版页面被长期缓存；因此首次打开和加载新版本仍需要联网。

## 验证

```bash
npm test
npx tsc --noEmit
npm run lint
```

单元测试覆盖食材别名、质量/容量换算、多批次库存合并，以及多设备同步的过期版本、远端应用和冲突分支。

## 配置 AI 小票/菜谱识别（可选）

在 `.env` 中填写 `OPENAI_API_KEY`，然后重启 Expo 开发服务器。密钥只由 Expo API Route 在服务端读取，不会放入客户端包。没有配置时，自然语言库存录入仍会使用本地解析；小票图片和菜谱图片识别需要 AI 配置。

> Expo Go 可以验证本地烹饪计时通知，也可以预览和配置小组件内容。真正的 iOS 桌面/锁屏小组件需要升级到支持 `expo-widgets` 的 Expo SDK，并在 development build 或 TestFlight 阶段生成原生 Widget Extension。

## 主要源文件

- `src/app/index.tsx`：首页与自定义布局
- `src/app/inventory.tsx`：库存
- `src/app/recipes.tsx`：菜谱与烹饪流程
- `src/app/recommend.tsx`：健康报告
- `src/app/planner.tsx`：7 天智能菜单
- `src/app/insights.tsx`：节约与浪费报告
- `src/app/widgets.tsx`：iOS 小组件预览与设置
- `src/app/profile.tsx`：家庭与设置入口
- `src/app/account.tsx`：账号注册、登录、创建/加入家庭与成员邀请
- `src/context/`：持久化业务状态
- `src/services/`：SQLite、通知和云同步
