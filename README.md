# 鲜食记 / Fresh Pantry

基于 Expo SDK 54、React Native 和 Expo Router 的厨房库存应用。**私用版：只给我们两个人用**。不用注册账号：打开后选「我是谁」，第一次输入一次「厨房口令」，两台手机就共享同一个厨房。

## 已实现

- SQLite 本地持久化（Web 使用 localStorage 适配器）
- 分类库存、存放位置、独立批次、开封后保质期、单位换算和库存变动历史
- 最近删除恢复、本地完整 JSON 备份与格式校验恢复
- 家庭购物清单、菜谱缺料一键补货，以及买完后转入库存
- 商品条码查询、自然语言批量录入和购物小票拍照识别（支持逐项校对）
- 新增库存后的可爱收纳动画（冷藏开关门、冷冻雪花、速食柜收纳、零食车弹跳和自定义收纳箱）
- 保质期建议、临期排序和 iPhone 本地通知
- 库存列表一键「−1 / 用完」并可撤销；临期食材一键查看能做的菜
- 内置与手动菜谱、动态食材/数量与逐步录入、步骤倒计时、后台本地通知、烹饪进度持久恢复、烹饪时屏幕常亮和完成后自动扣减库存
- 7 天智能菜单、单餐替换、缺料合并加入购物清单
- 库存处置原因、7/30 天节约报告与浪费趋势
- iOS 小组件数据快照、临期/烹饪预览和显示偏好
- 首次打开选择两人中的一个（可随时切换），每台手机输入一次厨房口令，版本化同步和冲突处理
- React 错误边界、本机诊断记录和库存/云同步冲突单元测试

## 启动

```bash
npm install
npx expo start
```

终端出现二维码后，可使用 iPhone 上的 Expo Go 扫码；按 `w` 可启动 Web 预览。

## 配置 Supabase

1. Supabase 后台 **Authentication → Sign In / Providers**：关闭 “Allow new users to sign up”，只保留 Email provider。
2. 新项目先跑 `supabase/schema.sql`；然后打开 `supabase/migrations/20261114000000_private_two_person.sql`，把最底部白名单里的邮箱改成共享账号的邮箱，取消注释，整份执行；再执行 `20261114010000_keep_kitchen_on_user_delete.sql`。已有生产库按 `supabase/README.md` 的流程只执行这两个 migration。
3. **Authentication → Users → Add user**，用同一个邮箱建账号（勾选 Auto Confirm User，密码就是「厨房口令」，用一串够长、你们俩记得住的字符）。不在白名单里的邮箱会被数据库直接拒绝。
4. 复制 `.env.example` 为 `.env`，填 Supabase URL / key、共享账号邮箱，以及两个人的名字。**不要把口令写进 `.env`**。
5. 重启 Expo。两台手机打开后各自选「我是谁」，输入一次厨房口令，就会进入同一个厨房；之后保持登录，不用再输。

> 🔐 厨房口令不会打包进前端代码，只在输入时发给 Supabase 换取登录态。忘了或想换口令：在 Supabase **Authentication → Users** 里改共享账号的密码，下次需要重新登录的手机输入新口令即可。
>
> ⚠️ 在生产库执行 `20261114010000_keep_kitchen_on_user_delete.sql` 之前，**不要在 Authentication → Users 里删除任何账号**：建厨房的账号被删会连带删除整个厨房。执行之后，删账号不会再影响厨房数据。

数据库变更流程见 `supabase/README.md`。没有配置 `.env` 时，app 以纯本地模式运行（方便开发调试）。

## 两人安装到 iPhone 主屏幕

项目包含 PWA manifest、Apple Touch Icon 和独立启动模式，可以在没有 Apple Developer Program 的情况下先作为 Web App 使用。

```bash
npm run web:export
npm run web:serve
npm run web:deploy
```

首次发布需要免费的 Expo 账号。两台 iPhone 分别用 Safari 打开生产网址，点“共享 → 添加到主屏幕”，然后各自选「我是谁」。

PWA 会把库存和未同步改动保留在当前设备，并通过 Supabase 同步。当前未启用 Service Worker，以避免旧版页面被长期缓存；因此首次打开和加载新版本仍需要联网。

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

- `src/app/index.tsx`：打开 App 的默认页（首页暂时下线，目前直接显示库存）
- `src/app/inventory.tsx`：库存
- `src/app/recipes.tsx`：菜谱与烹饪流程
- `src/app/games.tsx`：小游戏（游戏列表在 `src/data/games.ts`）
- `src/app/planner.tsx`：7 天智能菜单（入口在「我的 → 厨房工具」）
- `src/app/insights.tsx`：节约与浪费报告（入口在「我的 → 厨房工具」）
- `src/app/widgets.tsx`：iOS 小组件预览与设置
- `src/app/profile.tsx`：设置、备份入口
- `src/app/account.tsx`：同步状态、冲突处理与切换身份
- `src/constants/members.ts`：两个人的名字和头像
- `src/constants/theme.ts`：颜色、圆角、阴影、标题样式等设计规范
- `src/components/app-tab-bar.tsx`：底部 Tab 栏（入口在这里增删）
- `src/context/`：持久化业务状态
- `src/services/`：SQLite、通知和云同步
