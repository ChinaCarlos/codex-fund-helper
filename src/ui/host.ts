import { App } from "@modelcontextprotocol/ext-apps";
import { asRow } from "../model";

let connection: Promise<App> | undefined;

export function embedded() {
  return window.parent !== window;
}

export async function callHost<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!connection) {
    const app = new App({ name: "基金助手", version: "0.1.0" });
    connection = app
      .connect()
      .then(() => {
        const theme = app.getHostContext()?.theme;
        if (theme) document.documentElement.dataset.theme = theme;
        app.onhostcontextchanged = (context) => {
          if (context.theme)
            document.documentElement.dataset.theme = context.theme;
        };
        return app;
      })
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  }
  const app = await connection;
  const result = await app.callServerTool({ name, arguments: args });
  if (!result.structuredContent || result.isError)
    throw new Error("Codex 未能完成请求，请重试。");
  const data = asRow(result.structuredContent);
  if (typeof data.error === "string") throw new Error(data.error);
  return data as T;
}
