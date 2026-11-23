import type { Account, Fund, Snapshot } from "./model";

const fund = (
  code: string,
  name: string,
  sector: string,
  balance: number,
  dayRate: number,
  holdingIncome: number,
): Fund => ({
  key: code,
  code,
  name,
  sector,
  balance,
  dayRate,
  holdingIncome,
  estimate: dayRate,
  dayIncome: Math.round(balance * dayRate) / 100,
  updated: false,
});

const accounts: Account[] = [
  {
    id: 1,
    name: "支付宝",
    assets: 64500,
    income: 405.02,
    rate: 0.63,
    up: 2,
    down: 1,
    funds: [
      fund("000051", "华夏沪深300ETF联接A", "宽基", 28000, 0.86, 1842.6),
      fund("012414", "招商中证白酒指数C", "消费", 18500, -0.42, -690.3),
      fund(
        "013171",
        "华夏中证科创创业50ETF联接A",
        "科技",
        18000,
        1.344,
        1286.25,
      ),
    ],
  },
  {
    id: 2,
    name: "且慢",
    assets: 36920,
    income: 218.96,
    rate: 0.59,
    up: 1,
    down: 1,
    funds: [
      fund("005827", "易方达蓝筹精选混合", "主动权益", 21000, 1.27, 793.1),
      fund(
        "006327",
        "易方达中证海外中国互联网50ETF联接A",
        "海外权益",
        15920,
        -0.3,
        -178.9,
      ),
    ],
  },
];

export function demoSnapshot(): Snapshot {
  return {
    assets: 101420,
    income: 623.98,
    rate: 0.615,
    up: 3,
    down: 2,
    accounts,
    indices: [
      { code: "1.000001", name: "上证指数", value: "3,386.74", direction: 1 },
      { code: "1.000300", name: "沪深300", value: "3,925.14", direction: 1 },
      { code: "0.399001", name: "深证成指", value: "10,246.13", direction: -1 },
      { code: "0.399006", name: "创业板指", value: "2,066.61", direction: 1 },
    ],
    updatedAt: new Date().toISOString(),
    trading: true,
  };
}
