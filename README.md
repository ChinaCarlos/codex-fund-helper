# 基金助手 · Codex Fund Helper

在 Codex 桌面端查看养基宝基金持仓。支持四大指数、账户筛选、当日收益、分时收益率曲线、涨跌家数、余额与持有收益、升降序、金额隐藏、手动与自动刷新。

## 本地开发

需要 Node.js 22.12+、pnpm 10 和 Codex 桌面端。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm install:codex
```

开发预览在 `http://127.0.0.1:4317`，默认显示示例数据。安装后打开本地 Codex 会话，在全局侧边栏或会话面板选「基金助手」。若客户端未刷新目录，重启 Codex。重新构建后，新开的本地会话会读取本机项目的新产物。

## 真实账户

插件使用与 Fund Helper Chrome 插件相同的养基宝接口和签名协议，通过 HTTPS 连接。签名配置位于本机 `~/.config/codex-fund-helper/config.json`，权限为 `0600`，格式为 `{"apiSecret":"签名配置"}`。打开插件后用微信扫二维码。登录状态保存在本地，退出登录会删除会话文件。

当日收益走势图使用 `/income_line_data`。选择账户后会显示对应账户的分时收益率，可拖动滑块查看具体时点。

交易时段按北京时间工作日 9:30–11:30、13:30–15:00 判断，不包含节假日历。收益和估值以数据源为准。示例数据仅用于演示。

## 结构

- `src/ui/` · React 面板、Tailwind CSS 和 Codex MCP App 桥接。
- `src/server/` · 本地 stdio MCP、二维码、持仓和会话。
- `plugins/codex-fund-helper/` · Codex 插件清单及构建产物。
- `scripts/` · 本地打包和安装。
