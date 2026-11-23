export type Row = Record<string, unknown>;

export type Fund = {
  key: string;
  code: string;
  name: string;
  sector: string;
  balance: number;
  dayIncome: number;
  dayRate: number;
  estimate: number | null;
  holdingIncome: number;
  updated: boolean;
};

export type Account = {
  id: number;
  name: string;
  assets: number;
  income: number;
  rate: number;
  up: number;
  down: number;
  funds: Fund[];
};

export type Snapshot = {
  assets: number;
  income: number;
  rate: number;
  up: number;
  down: number;
  indices: { code: string; name: string; value: string; direction: number }[];
  accounts: Account[];
  updatedAt: string;
  trading: boolean;
};

export type SortKey = "dayRate" | "dayIncome" | "balance";
export type IncomePoint = { minute: number; time: string; rate: number };
export type IncomeTrend = { points: IncomePoint[] };
export type SessionStatus = {
  signedIn: boolean;
  configured: boolean;
  nickname?: string;
};
export type Qr = { id: string; image: string };
export type QrStatus = {
  state: "pending" | "expired" | "signedIn";
};

export function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

function firstNumber(record: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (
      (typeof value === "number" || typeof value === "string") &&
      String(value).trim()
    ) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function buildIncomeTrend(
  data: unknown,
  accountId: number | null,
): IncomeTrend {
  const block = asRow(
    asRow(data)[accountId === null ? "collect" : String(accountId)],
  );
  const byMinute = new Map<number, IncomePoint>();
  for (const row of rows(block.line_list)) {
    const time = /(?:^|[ T])((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d)?$/.exec(
      String(row.time || row.date || ""),
    )?.[1];
    const rate = firstNumber(row, ["rate"]);
    if (!time || rate === null) continue;
    const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    if ((minute >= 570 && minute <= 690) || (minute >= 780 && minute <= 900)) {
      byMinute.set(minute, { minute, time, rate });
    }
  }
  return {
    points: [...byMinute.values()].sort(
      (left, right) => left.minute - right.minute,
    ),
  };
}

const chinaTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date) {
  return new Map(
    chinaTime.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function isTradingHours(date: Date): boolean {
  const time = parts(date);
  const weekday = time.get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes = Number(time.get("hour")) * 60 + Number(time.get("minute"));
  return (minutes >= 570 && minutes < 690) || (minutes >= 810 && minutes < 900);
}

export function buildSnapshot(
  collect: Row,
  fundsByAccount: Map<number, Row[]>,
  indices: Row,
  now = new Date(),
): Snapshot {
  const time = parts(now);
  const today = [time.get("year"), time.get("month"), time.get("day")].join(
    "-",
  );
  const accounts = rows(collect.account_data).map((account) => {
    const id = numberValue(account.account_id);
    const funds = (fundsByAccount.get(id) ?? []).map((fund) => {
      const nav = asRow(fund.nv_info);
      const estimate = firstNumber(nav, ["gszzl", "zsgzzl", "vgszzl"]);
      const published = firstNumber(nav, ["jzzzl", "rzzl"]);
      const date = nav.jzrq ?? nav.zxjzrq ?? nav.true_valuation_date;
      const updated = String(date ?? "").slice(0, 10) === today;
      const dayRate =
        (updated ? (published ?? estimate) : (estimate ?? published)) ?? 0;
      return {
        key: `${id}:${String(fund.id ?? fund.code ?? fund.short_name)}`,
        code: String(fund.code ?? ""),
        name: String(fund.short_name ?? "未命名基金"),
        sector: String(asRow(fund.sector_info).name ?? ""),
        balance: numberValue(fund.hold_sum ?? fund.money),
        holdingIncome: numberValue(fund.hold_earn),
        dayRate,
        estimate,
        dayIncome: Math.round(numberValue(fund.money) * dayRate) / 100,
        updated,
      };
    });
    return {
      id,
      name: String(account.title ?? "未命名账户"),
      assets: numberValue(account.account_assets),
      income: numberValue(account.today_income),
      rate: numberValue(account.today_income_rate),
      up: numberValue(account.up),
      down: numberValue(account.down),
      funds,
    };
  });

  return {
    assets: numberValue(collect.assets_collect),
    income: numberValue(collect.today_income),
    rate: numberValue(collect.today_income_rate),
    up: accounts.reduce((sum, account) => sum + account.up, 0),
    down: accounts.reduce((sum, account) => sum + account.down, 0),
    indices: ["1.000001", "1.000300", "0.399001", "0.399006"].flatMap(
      (code) => {
        if (!indices[code]) return [];
        const index = asRow(indices[code]);
        return [
          {
            code,
            name: String(index.name ?? code),
            value: String(index.v ?? "—"),
            direction: Math.sign(
              numberValue(index.div) || numberValue(index.dir),
            ),
          },
        ];
      },
    ),
    accounts,
    updatedAt: now.toISOString(),
    trading: isTradingHours(now),
  };
}

export function rateForDisplay(fund: Fund, trading: boolean) {
  return trading && !fund.updated
    ? (fund.estimate ?? fund.dayRate)
    : fund.dayRate;
}

export function sortFunds(
  funds: Fund[],
  key: SortKey,
  descending: boolean,
  trading: boolean,
) {
  const read = (fund: Fund) =>
    key === "dayRate" ? rateForDisplay(fund, trading) : fund[key];
  return [...funds].sort(
    (left, right) => (read(right) - read(left)) * (descending ? 1 : -1),
  );
}
