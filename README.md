# 简练独立版

GitHub Pages 托管前端，Supabase 提供邮箱登录、私人记录和照片存储。

- `npm ci`、`npm test`、`npm run build`
- 将 `dist/` 复制到 `docs/` 后提交发布。Pages 使用 main 分支 /docs。
- 仅公开界面源代码和客户端 publishable key。权限由数据库 RLS 和私人照片桶控制。
- 私人备份和照片不存入本仓库。备份导出包含照片，导入后保留原日期。
- AI 教练、食物识别和自动计划尚未接入；手工训练编辑、保存与统计可独立工作。
- 数据迁移与真实账号登录验证完成之前，不视为完整版交付。
