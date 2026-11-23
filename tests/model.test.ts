import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIncomeTrend,
  buildSnapshot,
  isTradingHours,
  sortFunds,
} from "../src/model.ts";

test("normalizes aggregate and account income lines independently", () => {
  const payload = {
    collect: {
      line_list: [
        { time: "13:00:00", rate: "0.12" },
        { time: "09:30:00", rate: 0 },
        { time: "11:20:00", rate: null },
        { time: "12:15:00", rate: 3 },
      ],
    },
    "42": { line_list: [{ date: "2026-11-23 09:30:00", rate: "-0.27" }] },
  };
  assert.deepEqual(
    buildIncomeTrend(payload, null).points.map(({ time, rate }) => [
      time,
      rate,
    ]),
    [
      ["09:30", 0],
      ["13:00", 0.12],
    ],
  );
  assert.equal(buildIncomeTrend(payload, 42).points[0].rate, -0.27);
  assert.deepEqual(buildIncomeTrend(payload, 99).points, []);
});

test("uses Shanghai market hours and excludes weekends", () => {
  assert.equal(isTradingHours(new Date("2026-11-23T01:30:00Z")), true);
  assert.equal(isTradingHours(new Date("2026-11-23T04:30:00Z")), false);
  assert.equal(isTradingHours(new Date("2026-11-21T02:30:00Z")), false);
});

test("preserves a zero estimate, prefers a current published NAV, and sorts without mutating", () => {
  const snapshot = buildSnapshot(
    {
      assets_collect: "2500",
      account_data: [{ account_id: 1, title: "测试", up: "1", down: "0" }],
    },
    new Map([
      [
        1,
        [
          { code: "first", money: 1000, nv_info: { gszzl: "0", jzzzl: "-1" } },
          {
            code: "second",
            money: 1500,
            nv_info: { gszzl: 1, jzzzl: "2.3", jzrq: "2026-11-23" },
          },
        ],
      ],
    ]),
    {},
    new Date("2026-11-23T02:30:00Z"),
  );
  const funds = snapshot.accounts[0].funds;
  assert.equal(snapshot.assets, 2500);
  assert.equal(snapshot.up, 1);
  assert.equal(funds[0].dayRate, 0);
  assert.equal(funds[1].dayIncome, 34.5);
  assert.equal(sortFunds(funds, "dayRate", true, true)[0].code, "second");
  assert.equal(sortFunds(funds, "dayRate", false, true)[0].code, "first");
  assert.equal(funds[0].code, "first");
});
