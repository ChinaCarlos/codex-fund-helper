import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: "./src/ui/main.tsx" } },
  html: { title: "基金助手 · Fund Helper", inject: "body" },
  output: { inlineScripts: true, inlineStyles: true },
  server: { host: "127.0.0.1", port: 4317, strictPort: true },
});
