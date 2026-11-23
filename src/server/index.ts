import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createQr,
  incomeTrend,
  logout,
  pollQr,
  portfolio,
  sessionStatus,
} from "./gateway";

declare const APP_HTML: string;
declare const APP_ICON: string;

const server = new McpServer({
  name: "codex-fund-helper",
  version: "0.1.8",
  icons: [{ src: APP_ICON, mimeType: "image/png", sizes: ["128x128"] }],
});
const resourceUri = "ui://codex-fund-helper/dashboard/v2.html";

registerAppResource(server, "fund-dashboard", resourceUri, {}, async () => ({
  contents: [
    { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: APP_HTML },
  ],
}));
const legacyUri = "ui://codex-fund-helper/dashboard";
registerAppResource(
  server,
  "fund-dashboard-legacy",
  legacyUri,
  {},
  async () => ({
    contents: [
      { uri: legacyUri, mimeType: RESOURCE_MIME_TYPE, text: APP_HTML },
    ],
  }),
);

registerAppTool(
  server,
  "open_fund_dashboard",
  {
    title: "基金助手",
    description: "打开基金助手面板以查看用户自己的基金持仓和指数。",
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri },
      "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
    },
  },
  async () => ({ content: [{ type: "text", text: "已打开基金助手。" }] }),
);

const appOnly = { ui: { resourceUri, visibility: ["app" as const] } };

function action(
  name: string,
  description: string,
  run: () => Promise<object>,
  readOnlyHint: boolean,
) {
  registerAppTool(
    server,
    name,
    {
      description,
      inputSchema: {},
      _meta: appOnly,
      annotations: { readOnlyHint },
    },
    async () => respond(run),
  );
}

async function respond(run: () => Promise<object>) {
  try {
    return { content: [], structuredContent: { ...(await run()) } };
  } catch (error) {
    return {
      content: [],
      structuredContent: {
        error: error instanceof Error ? error.message : "基金助手请求失败。",
      },
    };
  }
}

action("fund_session", "读取本地会话是否已登录。", sessionStatus, true);
action("fund_create_qr", "生成养基宝登录二维码。", createQr, false);
action("fund_portfolio", "读取当前已登录用户的基金持仓。", portfolio, true);
action("fund_logout", "退出基金助手的本地会话。", logout, false);

registerAppTool(
  server,
  "fund_income_trend",
  {
    description: "获取汇总或单账户的当日分时收益率。",
    inputSchema: { accountId: z.number().int().positive().nullable() },
    annotations: { readOnlyHint: true },
    _meta: appOnly,
  },
  async ({ accountId }: { accountId: number | null }) =>
    respond(() => incomeTrend(accountId)),
);

registerAppTool(
  server,
  "fund_poll_qr",
  {
    description: "轮询当前二维码并在扫码完成后保存本地会话。",
    inputSchema: { id: z.string().regex(/^[\w-]{1,128}$/) },
    annotations: { readOnlyHint: false },
    _meta: appOnly,
  },
  async ({ id }: { id: string }) => respond(() => pollQr(id)),
);

await server.connect(new StdioServerTransport());
