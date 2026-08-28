# 开发 / 发布说明（RELEASE.md）

## 这个仓库是什么

`@shizhanyu13/dsh-waom` 是一个 **DSH (DeepSeek Harness) 插件** 的独立发布仓库。它是从 DSH monorepo 摘出来的 **发布载体**：

- `src/` —— 插件源码（从 DSH monorepo 同步而来）
- `lib/` —— **预构建** ESM bundle + `.d.ts`（消费者直接使用；在 DSH monorepo 里构建后提交）
- `.github/workflows/publish.yml` —— 通过 npm OIDC trusted publishing 自动发布
- `tests/` —— 单测（依赖 DSH monorepo 的测试编排包）

## 为什么不能在本地独立构建 / 跑完整测试

`src` 里对 `@deepseek-ai/*` 的引用大多是 **type-only import**（`Context`、`Agent`、`SessionId` 等）。但：

- `lib/` 的内联 bundle 里含从 DSH monorepo 的 `vendor/cosmokit` 打进来的源码，standalone 里没有这些源文件。
- `tests/*.spec.ts` 依赖 `@deepseek-ai/cordis-plugin-loader` 等测试编排包，它们又连带一整棵 `@deepseek-ai/*` rc peer 树（`dsh-scope`、`dsh-session`、`dsh-code-runtime`、`dsh-user-approval`、`node-addon-require-builtin`…），standalone 无法完整解析。

所以 **standalone 里不能重建 `lib/` bundle，也跑不齐 load-path 测试**。`lib/` 必须从 DSH monorepo 构建后提交进本仓库。

## 本地验证（standalone 可用）

```sh
npm install --legacy-peer-deps   # 不用会触发 npm arborist peer 解析 bug
npm run typecheck                # 对 src 做类型检查（可靠；已补 dsh-session 类型依赖）
```

## 升级发版 SOP

1. 在 **DSH monorepo** 里改插件逻辑（`src/`）。
2. 在 DSH monorepo 里构建，得到 `lib/` 的 bundle 与 `.d.ts`。
3. 把 `src/` 与 `lib/` **同步**到这个 standalone 仓库。
4. 本地 `npm run typecheck` 验证 src。
5. 更新 `CHANGELOG.md`、`README.md`（若配置/行为变化）。
6. `npm version patch|minor|major`（bump version，并同步 CHANGELOG）。
7. `git add` + commit，`git tag vX.Y.Z`，`git push origin vX.Y.Z --tags`。
8. GitHub Actions `publish.yml` 触发：`npm install --legacy-peer-deps` → `npm run typecheck` 门禁 → 幂等 `npm publish`（OIDC）→ 上架 registry。
9. `npm view @shizhanyu13/dsh-waom@vX.Y.Z` 确认上架、`repository.url` 正确。

## 注意

- **不要在 standalone 里 `npm run build` 或改 `lib/`** —— 那会破坏与已发布版本的一致性。
- 发布用已入库的 `lib/`，这是本仓库的唯一职责。
