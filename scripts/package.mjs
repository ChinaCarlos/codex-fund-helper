import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const html = await readFile("dist/index.html", "utf8");
const icon = await readFile("plugins/codex-fund-helper/assets/fund-helper.png");
await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "plugins/codex-fund-helper/dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  define: {
    APP_HTML: JSON.stringify(html),
    APP_ICON: JSON.stringify(
      `data:image/png;base64,${icon.toString("base64")}`,
    ),
  },
});
await writeFile(
  "plugins/codex-fund-helper/.mcp.json",
  `${JSON.stringify(
    {
      mcpServers: {
        "codex-fund-helper": {
          command: process.execPath,
          args: [
            fileURLToPath(
              new URL(
                "../plugins/codex-fund-helper/dist/server.mjs",
                import.meta.url,
              ),
            ),
          ],
        },
      },
    },
    null,
    2,
  )}\n`,
);
