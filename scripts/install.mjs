import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const desktopCli =
  "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
const cli = existsSync(desktopCli) ? desktopCli : "codex";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(cli, ["plugin", "marketplace", "add", root], { stdio: "inherit" });
execFileSync(cli, ["plugin", "add", "codex-fund-helper@carlosc-fund-tools"], {
  stdio: "inherit",
});
