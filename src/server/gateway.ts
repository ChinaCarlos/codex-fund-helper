import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";
import {
  asRow,
  buildIncomeTrend,
  buildSnapshot,
  numberValue,
  type Row,
  rows,
} from "../model";

const directory = join(homedir(), ".config", "codex-fund-helper");
const sessionPath = join(directory, "session.json");
const origin = "https://browser-plug-api.yangjibao.com";
const qrRequests = new Map<string, number>();
const qrTimeout = 240_000;

type Session = { token: string; nickname: string };

class SessionExpired extends Error {
  constructor() {
    super("登录已失效，请重新扫码。");
  }
}

async function readLocal(path: string): Promise<Row> {
  try {
    return asRow(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("无法读取基金助手的本地配置或登录状态。");
  }
}

async function signingKey() {
  const config = await readLocal(join(directory, "config.json"));
  return typeof config.apiSecret === "string" ? config.apiSecret.trim() : "";
}

async function readSession(): Promise<Session | null> {
  const session = await readLocal(sessionPath);
  return typeof session.token === "string" && session.token
    ? { token: session.token, nickname: String(session.nickname ?? "") }
    : null;
}

async function saveSession(session: Session) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `session-${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(session), {
      mode: 0o600,
      flag: "wx",
    });
    await chmod(temporary, 0o600);
    await rename(temporary, sessionPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function request(
  secret: string,
  path: string,
  token = "",
  query?: Record<string, string> | [string, string][],
) {
  if (!secret) throw new Error("尚未配置养基宝接口，请先添加本地签名密钥。");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("md5")
    .update(path + token + timestamp + secret)
    .digest("hex");
  const url = new URL(path, origin);
  if (query) url.search = new URLSearchParams(query).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        "Request-Time": timestamp,
        "Request-Sign": signature,
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
  } catch {
    throw new Error("无法连接养基宝，请稍后重试。");
  }
  if (response.status === 401) throw new SessionExpired();
  if (response.status === 429)
    throw new Error("养基宝请求过于频繁，请稍后再试。");
  if (!response.ok) throw new Error(`养基宝接口返回 HTTP ${response.status}。`);
  const body = asRow(await response.json().catch(() => null));
  if (
    Number(body.code) === 401 ||
    (token && /token|登录|授权/i.test(String(body.message ?? "")))
  ) {
    throw new SessionExpired();
  }
  if (Number(body.code) !== 200)
    throw new Error("养基宝接口拒绝了请求，请检查签名配置。");
  return body.data;
}

export async function sessionStatus() {
  const [secret, session] = await Promise.all([signingKey(), readSession()]);
  return {
    configured: Boolean(secret),
    signedIn: Boolean(secret && session),
    nickname: session?.nickname,
  };
}

export async function createQr() {
  const value = asRow(await request(await signingKey(), "/qr_code"));
  const id = String(value.id ?? "");
  const url = String(value.url ?? "");
  if (
    !/^[\w-]{1,128}$/.test(id) ||
    !/^https?:\/\//i.test(url) ||
    url.length > 2048
  ) {
    throw new Error("养基宝没有返回有效二维码。");
  }
  for (const [key, expiry] of qrRequests) {
    if (expiry <= Date.now()) qrRequests.delete(key);
  }
  qrRequests.set(id, Date.now() + qrTimeout);
  return { id, image: await QRCode.toDataURL(url, { width: 240, margin: 2 }) };
}

export async function pollQr(id: string) {
  const expiry = qrRequests.get(id);
  if (!expiry || expiry <= Date.now()) {
    qrRequests.delete(id);
    return { state: "expired" };
  }
  const value = asRow(
    await request(
      await signingKey(),
      `/qr_code_state/${encodeURIComponent(id)}`,
    ),
  );
  switch (String(value.state)) {
    case "2":
      if (typeof value.token !== "string" || !value.token) {
        throw new Error("扫码成功但未收到登录凭据，请刷新二维码。");
      }
      await saveSession({
        token: value.token,
        nickname: String(value.nickname ?? ""),
      });
      qrRequests.delete(id);
      return { state: "signedIn" };
    case "3":
      qrRequests.delete(id);
      return { state: "expired" };
    default:
      return { state: "pending" };
  }
}

export async function logout() {
  qrRequests.clear();
  await rm(sessionPath, { force: true });
  return { signedIn: false };
}

export async function incomeTrend(accountId: number | null) {
  const session = await readSession();
  if (!session) throw new SessionExpired();
  const query: [string, string][] = [
    ["date_type", "day"],
    accountId === null
      ? ["collect", "true"]
      : ["account_ids[]", String(accountId)],
  ];
  const data = await request(
    await signingKey(),
    "/income_line_data",
    session.token,
    query,
  );
  return buildIncomeTrend(data, accountId);
}

let pendingSnapshot: ReturnType<typeof loadSnapshot> | undefined;

export function portfolio() {
  if (!pendingSnapshot) {
    pendingSnapshot = loadSnapshot().finally(() => {
      pendingSnapshot = undefined;
    });
  }
  return pendingSnapshot;
}

async function loadSnapshot() {
  const session = await readSession();
  if (!session) throw new SessionExpired();
  const secret = await signingKey();
  try {
    const [collectValue, indexValue] = await Promise.all([
      request(secret, "/account_collect", session.token),
      request(secret, "/index_data", session.token),
    ]);
    const collect = asRow(collectValue);
    const funds = new Map<number, Row[]>();
    for (const account of rows(collect.account_data)) {
      const id = numberValue(account.account_id);
      funds.set(
        id,
        rows(
          await request(secret, "/fund_hold", session.token, {
            account_id: String(id),
          }),
        ),
      );
    }
    return buildSnapshot(collect, funds, asRow(indexValue));
  } catch (error) {
    if (
      error instanceof SessionExpired &&
      (await readSession())?.token === session.token
    )
      await logout();
    throw error;
  }
}
