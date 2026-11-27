# 趣味拼豆工坊 · Pindou

Pindou 是使用 Cocos Creator 3.8.6 构建的数字填色游戏。仓库包含当前 Cocos Creator 工程和 iOS、Google Play 发布工作流。

## 发布

- 推送与 `release/version.json` 中版本号一致的 `v*` 标签，会构建 iOS IPA 并上传 TestFlight，同时构建 Android AAB 并上传 Google Play 内测轨道。
- Play 上传会保留一个 Production 草稿；此流程不会提交 App Store 审核，也不会把 Play 版本发布到正式轨道。
- 每次上传都必须提高 `release/version.json` 中的 `build`，且 tag 必须和 `version` 一致。
- 在 GitHub Actions 手动运行 `release` 并设置 `dry_run=true`，可生成未签名构建产物，不会上传商店。

工作流使用仓库中已配置的 Android 签名、ASC 和 Google Play Actions secrets。签名密钥、密码、证书及服务账号 JSON 不应提交到仓库。
