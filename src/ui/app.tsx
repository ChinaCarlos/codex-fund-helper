import {
  Activity,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LogOut,
  Palette,
  QrCode,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { demoSnapshot } from "../demo";
import {
  type IncomePoint,
  type Qr,
  type QrStatus,
  rateForDisplay,
  type SessionStatus,
  type Snapshot,
  type SortKey,
  sortFunds,
} from "../model";
import { callHost, embedded } from "./host";
import { IncomeChart } from "./income-chart";
import { isPalette, loadPalette, palettes, savePalette } from "./theme";

const currency = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const clock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  timeStyle: "medium",
  hour12: false,
});
const sortOptions: { key: SortKey; label: string }[] = [
  { key: "dayRate", label: "当日涨幅" },
  { key: "dayIncome", label: "当日收益" },
  { key: "balance", label: "持仓余额" },
];

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${currency.format(value)}`;
}

function tone(value: number) {
  return value > 0 ? "gain" : value < 0 ? "loss" : "muted";
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请重试。";
}

export function App() {
  const [palette, setPalette] = useState(loadPalette);
  const [demo, setDemo] = useState(() => !embedded());
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    embedded() ? null : demoSnapshot(),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrState, setQrState] = useState<QrStatus["state"]>("pending");
  const [account, setAccount] = useState<number | null>(null);
  const [sort, setSort] = useState<{
    key: SortKey;
    descending: boolean;
  } | null>(null);
  const [masked, setMasked] = useState(false);
  const [inspection, setInspection] = useState<{
    scope: string;
    point: IncomePoint;
  } | null>(null);
  const refreshing = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    savePalette(palette);
  }, [palette]);

  const readSession = useCallback(async () => {
    setError("");
    try {
      const current = await callHost<SessionStatus>("fund_session");
      setSession(current);
    } catch (error) {
      setError(errorText(error));
    }
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (refreshing.current) return;
      refreshing.current = true;
      const sequence = generation.current;
      if (!silent) setBusy(true);
      setError("");
      try {
        const next = demo
          ? demoSnapshot()
          : await callHost<Snapshot>("fund_portfolio");
        if (sequence === generation.current) setSnapshot(next);
      } catch (error) {
        if (sequence !== generation.current) return;
        if (!demo && errorText(error).includes("登录已失效")) {
          setSnapshot(null);
          setSession((current) => ({
            configured: true,
            ...current,
            signedIn: false,
          }));
        }
        setError(errorText(error));
      } finally {
        refreshing.current = false;
        if (!silent) setBusy(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    if (embedded()) void readSession();
  }, [readSession]);

  useEffect(() => {
    if (demo || !session?.signedIn) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [demo, refresh, session?.signedIn]);

  useEffect(() => {
    if (!qr || demo) return;
    let stopped = false;
    let timer: number | undefined;
    async function poll(id: string) {
      try {
        const result = await callHost<QrStatus>("fund_poll_qr", { id });
        if (stopped) return;
        setQrState(result.state);
        if (result.state === "signedIn") {
          setQr(null);
          await readSession();
        } else if (result.state !== "expired") {
          setError("");
          timer = window.setTimeout(() => void poll(id), 2000);
        }
      } catch (error) {
        if (!stopped) {
          setError(errorText(error));
          timer = window.setTimeout(() => void poll(id), 5000);
        }
      }
    }
    timer = window.setTimeout(() => void poll(qr.id), 2000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [demo, qr, readSession]);

  const generateQr = useCallback(async () => {
    setBusy(true);
    setQr(null);
    setError("");
    try {
      setQr(await callHost<Qr>("fund_create_qr"));
      setQrState("pending");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!demo && session?.configured && !session.signedIn) void generateQr();
  }, [demo, generateQr, session?.configured, session?.signedIn]);

  async function signOut() {
    generation.current += 1;
    setBusy(true);
    try {
      await callHost("fund_logout");
      setSnapshot(null);
      setAccount(null);
      setSort(null);
      setError("");
      setSession((current) => ({
        configured: true,
        ...current,
        signedIn: false,
      }));
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function switchDemo(enabled: boolean) {
    generation.current += 1;
    setDemo(enabled);
    setAccount(null);
    setSort(null);
    setError("");
    setSnapshot(enabled ? demoSnapshot() : null);
  }

  const active = snapshot?.accounts.find((item) => item.id === account);
  const summaryScope = `${demo}:${active?.id ?? "collect"}`;
  const inspected =
    inspection?.scope === summaryScope ? inspection.point : null;
  const inspectIncome = useCallback(
    (point: IncomePoint | null) => {
      setInspection(point ? { scope: summaryScope, point } : null);
    },
    [summaryScope],
  );
  const assets = active?.assets ?? snapshot?.assets ?? 0;
  const income = inspected
    ? (assets * inspected.rate) / 100
    : (active?.income ?? snapshot?.income ?? 0);
  const incomeRate = inspected?.rate ?? active?.rate ?? snapshot?.rate ?? 0;
  const trading = snapshot?.trading ?? false;
  const activeSort = sort ?? {
    key: trading ? "dayRate" : "dayIncome",
    descending: true,
  };
  const funds = sortFunds(
    active?.funds ?? snapshot?.accounts.flatMap((item) => item.funds) ?? [],
    activeSort.key,
    activeSort.descending,
    trading,
  );
  const money = (value: number, showSign = false) =>
    masked ? "••••" : showSign ? signed(value) : currency.format(value);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-7 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="app-icon">
            <Wallet size={21} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">基金助手</h1>
            <p className="muted text-xs">
              {demo ? "示例数据" : session?.nickname || "养基宝持仓"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="theme-picker control">
            <Palette size={15} aria-hidden="true" />
            <span className="sr-only">主题色</span>
            <select
              value={palette}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (isPalette(value)) setPalette(value);
              }}
            >
              {Object.entries(palettes).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {demo && embedded() && (
            <button
              className="control"
              type="button"
              onClick={() => switchDemo(false)}
            >
              切换真实账户
            </button>
          )}
          {snapshot && (
            <>
              <button
                className="icon-button"
                type="button"
                aria-label={masked ? "显示金额" : "隐藏金额"}
                onClick={() => setMasked(!masked)}
              >
                {masked ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              <button
                className="control"
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} /> 刷新
              </button>
            </>
          )}
          {!demo && session?.signedIn && (
            <button
              className="icon-button"
              type="button"
              aria-label="退出登录"
              disabled={busy}
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}

      {!snapshot && !demo && (
        <section className="surface mx-auto flex w-full max-w-md flex-col items-center gap-4 p-6 text-center sm:p-9">
          <div className="app-icon">
            <QrCode size={23} />
          </div>
          <h2 className="text-lg font-semibold">
            {session?.signedIn ? "加载基金持仓" : "微信扫码登录"}
          </h2>
          {session?.signedIn ? (
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {busy ? "正在读取…" : "重新加载"}
            </button>
          ) : (
            <>
              {qr && qrState !== "expired" && (
                <img
                  alt="微信登录二维码"
                  className="rounded-xl bg-white"
                  width={216}
                  height={216}
                  src={qr.image}
                />
              )}
              <p className="muted text-sm" aria-live="polite">
                {qrState === "expired"
                  ? "二维码已失效。"
                  : qr
                    ? "打开微信扫一扫。"
                    : session?.configured
                      ? "生成二维码以连接你的养基宝账户。"
                      : "真实账户需要本地养基宝签名配置。"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {session?.configured ? (
                  <button
                    className="primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void generateQr()}
                  >
                    {busy ? "生成中…" : qr ? "更新二维码" : "生成二维码"}
                  </button>
                ) : (
                  <button
                    className="control"
                    type="button"
                    onClick={() => void readSession()}
                  >
                    检查配置
                  </button>
                )}
                <button
                  className="control"
                  type="button"
                  onClick={() => switchDemo(true)}
                >
                  查看示例数据
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {snapshot && (
        <>
          <section
            className="grid grid-cols-2 gap-2 lg:grid-cols-4"
            aria-label="市场指数"
          >
            {snapshot.indices.map((index) => (
              <div
                className="surface flex items-center justify-between gap-2 px-3 py-3"
                key={index.code}
              >
                <div className="min-w-0">
                  <div className="muted truncate text-xs">{index.name}</div>
                  <div
                    className={`tabular text-base font-semibold ${tone(index.direction)}`}
                  >
                    {index.value}
                  </div>
                </div>
                <span
                  className={tone(index.direction)}
                  role="img"
                  aria-label={
                    index.direction > 0
                      ? "上涨"
                      : index.direction < 0
                        ? "下跌"
                        : "持平"
                  }
                >
                  {index.direction > 0 ? (
                    <ArrowUp size={16} />
                  ) : index.direction < 0 ? (
                    <ArrowDown size={16} />
                  ) : (
                    <Activity size={16} />
                  )}
                </span>
              </div>
            ))}
          </section>

          <section
            className="summary summary-layout grid gap-4 rounded-2xl p-4 sm:p-6"
            aria-label="持仓汇总"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <div className="muted text-xs">总资产 · CNY</div>
                <div className="tabular mt-1 break-all text-[clamp(1.2rem,3.2vw,2rem)] font-bold tracking-tight">
                  {masked ? "••••" : `¥${money(assets)}`}
                </div>
              </div>
              <div aria-live="polite">
                <div className="muted min-h-4 text-xs">
                  {inspected ? `${inspected.time} 当日预估收益` : "当日收益"}
                </div>
                <div
                  className={`tabular mt-1 break-all text-xl font-semibold sm:text-2xl ${tone(income)}`}
                >
                  {money(income, true)}
                </div>
                <p className="muted text-xs">
                  {masked ? "••••" : `${signed(incomeRate)}%`}
                </p>
              </div>
              <div>
                <div className="muted text-xs">涨跌分布</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
                  <span className="gain">涨 {active?.up ?? snapshot.up}</span>
                  <span className="loss">
                    跌 {active?.down ?? snapshot.down}
                  </span>
                </div>
              </div>
            </div>
            <IncomeChart
              key={summaryScope}
              accountId={active?.id ?? null}
              accountName={active?.name ?? "全部账户"}
              demo={demo}
              onInspect={inspectIncome}
            />
          </section>

          <section className="surface overflow-hidden" aria-label="基金持仓">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
              <h2 className="font-semibold">
                基金持仓{" "}
                <span className="muted ml-1 text-sm font-normal">
                  {funds.length} 只
                </span>
              </h2>
              <div className="muted flex flex-wrap items-center gap-2 text-xs">
                {trading && <span className="tag">盘中估值</span>}
                <time dateTime={snapshot.updatedAt}>
                  更新于 {clock.format(new Date(snapshot.updatedAt))}
                </time>
              </div>
            </div>
            <fieldset
              className="line flex flex-wrap gap-2 px-4 pb-3"
              aria-label="账户筛选"
            >
              <button
                className="filter"
                type="button"
                aria-pressed={account === null}
                onClick={() => setAccount(null)}
              >
                全部账户
              </button>
              {snapshot.accounts.map((item) => (
                <button
                  className="filter"
                  type="button"
                  key={item.id}
                  aria-pressed={account === item.id}
                  onClick={() => setAccount(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </fieldset>
            <fieldset
              className="flex flex-wrap items-center gap-1 px-4 py-2"
              aria-label="持仓排序"
            >
              {sortOptions.map(({ key, label }) => (
                <button
                  type="button"
                  className="sort"
                  key={key}
                  aria-pressed={activeSort.key === key}
                  onClick={() =>
                    setSort({
                      key,
                      descending:
                        activeSort.key !== key || !activeSort.descending,
                    })
                  }
                >
                  {key === "dayRate" && trading ? "预估涨幅" : label}
                  {activeSort.key === key &&
                    (activeSort.descending ? " ↓" : " ↑")}
                </button>
              ))}
            </fieldset>
            {funds.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[530px] table-fixed text-sm">
                  <thead className="muted text-xs">
                    <tr>
                      <th className="w-[35%]">基金</th>
                      <th>当日涨幅</th>
                      <th>当日收益</th>
                      <th>持仓余额</th>
                      <th>持有收益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((fund) => {
                      const rate = rateForDisplay(fund, trading);
                      return (
                        <tr key={fund.key}>
                          <th scope="row">
                            <span className="block font-medium">
                              {fund.name}
                            </span>
                            <span className="muted text-xs font-normal">
                              {[fund.code, fund.sector]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </th>
                          <td className={`tabular ${tone(rate)}`}>
                            {signed(rate)}%
                            {fund.updated ||
                            (trading && fund.estimate !== null) ? (
                              <span className="muted block text-[10px]">
                                {fund.updated ? "已更新" : "预估"}
                              </span>
                            ) : null}
                          </td>
                          <td className={`tabular ${tone(fund.dayIncome)}`}>
                            {money(fund.dayIncome, true)}
                          </td>
                          <td className="tabular">{money(fund.balance)}</td>
                          <td className={`tabular ${tone(fund.holdingIncome)}`}>
                            {money(fund.holdingIncome, true)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted p-6 text-center text-sm">
                这个账户暂无持仓。
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
