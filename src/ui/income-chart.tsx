import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { IncomePoint, IncomeTrend } from "../model";
import { callHost } from "./host";

const plotStart = 570;
const afternoonStart = 780;
const ticks = [570, 630, 690, 780, 840, 900];
const labels = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00"];

function plotMinute(minute: number) {
  return minute - plotStart - (minute >= afternoonStart ? 76 : 0);
}

function rateLabel(rate: number) {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function sample(accountId: number | null): IncomePoint[] {
  return Array.from({ length: 82 }, (_, index) => {
    const minute = plotStart + index * 3 + (index > 40 ? 87 : 0);
    const rate =
      Math.sin(index * 0.22) * 0.22 +
      index * (accountId === 2 ? -0.008 : accountId === 1 ? 0.013 : 0.008);
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    return { minute, time, rate };
  });
}

function draw(
  canvas: HTMLCanvasElement,
  points: IncomePoint[],
  selected: IncomePoint,
  inspecting: boolean,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = window.devicePixelRatio;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return;

  const palette = getComputedStyle(canvas);
  const color = (name: string) => palette.getPropertyValue(name).trim();
  context.scale(scale, scale);
  context.font = "11px system-ui";
  context.textBaseline = "middle";
  const rates = points.map((point) => point.rate);
  const ceiling = Math.max(0.01, ...rates);
  const floor = Math.min(-0.01, ...rates);
  const axisWidth =
    Math.max(
      context.measureText(rateLabel(ceiling)).width,
      context.measureText(rateLabel(floor)).width,
    ) + 12;
  const chartWidth = width - axisWidth - 12;
  if (chartWidth <= 0) return;
  const chartHeight = height - 42;
  const position = (minute: number) =>
    axisWidth + (chartWidth * plotMinute(minute)) / plotMinute(900);
  const ordinate = (rate: number) =>
    12 + (chartHeight * (ceiling - rate)) / (ceiling - floor);

  for (const rate of [ceiling, 0, floor]) {
    const level = ordinate(rate);
    context.strokeStyle = color("--line");
    context.beginPath();
    context.setLineDash(rate === 0 ? [4, 4] : []);
    context.moveTo(axisWidth, level);
    context.lineTo(width - 12, level);
    context.stroke();
    if (rate !== 0 && Math.abs(level - ordinate(0)) < 14) continue;
    context.textAlign = "right";
    context.fillStyle = color("--muted");
    context.fillText(rateLabel(rate), axisWidth - 7, level);
  }

  context.setLineDash([]);
  context.fillStyle = color("--muted");
  ticks.forEach((minute, index) => {
    if (chartWidth < 330 && (index === 1 || index === 4)) return;
    context.textAlign =
      index === 0 || index === 3
        ? "left"
        : index === 2 || index === 5
          ? "right"
          : "center";
    const offset = index === 2 ? -4 : index === 3 ? 4 : 0;
    context.fillText(labels[index], position(minute) + offset, height - 13);
  });

  context.strokeStyle = color("--brand");
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(position(point.minute), ordinate(point.rate));
    } else {
      context.lineTo(position(point.minute), ordinate(point.rate));
    }
  });
  context.stroke();

  if (inspecting) {
    const selectedX = position(selected.minute);
    context.strokeStyle = color("--muted");
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(selectedX, 12);
    context.lineTo(selectedX, 12 + chartHeight);
    context.stroke();
  }

  context.fillStyle = color("--brand");
  context.beginPath();
  context.arc(
    position(selected.minute),
    ordinate(selected.rate),
    4,
    0,
    Math.PI * 2,
  );
  context.fill();
  return { axisWidth, chartWidth };
}

export function IncomeChart({
  accountId,
  accountName,
  demo,
  onInspect,
}: {
  accountId: number | null;
  accountName: string;
  demo: boolean;
  onInspect: (point: IncomePoint | null) => void;
}) {
  const [points, setPoints] = useState<IncomePoint[] | null>(() =>
    demo ? sample(accountId) : null,
  );
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bounds = useRef<ReturnType<typeof draw>>(undefined);
  const inspectedIndex = hover ?? cursor;
  const index = Math.min(
    inspectedIndex ?? (points?.length ?? 1) - 1,
    (points?.length ?? 1) - 1,
  );
  const selected = points?.[index];
  const inspected = inspectedIndex === null ? null : (selected ?? null);

  useEffect(() => {
    onInspect(inspected);
  }, [inspected, onInspect]);

  function pointAtPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (!bounds.current || !points?.length) return null;
    const { axisWidth, chartWidth } = bounds.current;
    const left = event.currentTarget.getBoundingClientRect().left;
    const minute =
      ((event.clientX - left - axisWidth) / chartWidth) * plotMinute(900);
    let nearest = 0;
    for (let candidate = 1; candidate < points.length; candidate += 1) {
      if (
        Math.abs(plotMinute(points[candidate].minute) - minute) <
        Math.abs(plotMinute(points[nearest].minute) - minute)
      ) {
        nearest = candidate;
      }
    }
    return nearest;
  }

  useEffect(() => {
    if (demo) return;
    let stale = false;
    const refresh = async () => {
      try {
        const result = await callHost<IncomeTrend>("fund_income_trend", {
          accountId,
        });
        if (!stale) {
          setError("");
          setPoints(result.points);
        }
      } catch (error) {
        if (!stale)
          setError(
            error instanceof Error ? error.message : "收益曲线加载失败。",
          );
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [accountId, demo]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !points || !selected) return;
    const render = () => {
      bounds.current = draw(element, points, selected, inspected !== null);
    };
    const resize = new ResizeObserver(render);
    const theme = new MutationObserver(render);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    resize.observe(element);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
    scheme.addEventListener("change", render);
    render();
    return () => {
      resize.disconnect();
      theme.disconnect();
      scheme.removeEventListener("change", render);
    };
  }, [inspected, points, selected]);

  return (
    <section className="summary-chart min-w-0" aria-label="当日收益走势">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">当日收益走势</h2>
          <p className="muted text-xs">{accountName} · 分时收益率</p>
        </div>
        {selected && (
          <span className="tag tabular text-xs">{selected.time}</span>
        )}
      </div>
      {error && (
        <p className="muted mt-3 text-sm" role="status">
          {error}
        </p>
      )}
      {selected && points ? (
        <>
          <canvas
            ref={canvas}
            className="mt-2 block h-36 w-full cursor-crosshair sm:h-44"
            role="img"
            aria-label={`${accountName}当日分时收益率折线图`}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch")
                setHover(pointAtPointer(event));
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "touch")
                setCursor(pointAtPointer(event));
            }}
            onPointerLeave={() => setHover(null)}
          />
          {points.length > 1 && (
            <label className="muted flex items-center gap-3 text-xs">
              查看时点
              <input
                type="range"
                className="trend-slider min-w-0 flex-1"
                min={0}
                max={points.length - 1}
                value={index}
                aria-valuetext={`${selected.time}，${rateLabel(selected.rate)}`}
                onChange={(event) =>
                  setCursor(Number(event.currentTarget.value))
                }
              />
            </label>
          )}
        </>
      ) : (
        !error && (
          <p className="muted py-8 text-center text-sm">
            {points ? "暂无当日分时数据。" : "正在加载收益走势…"}
          </p>
        )
      )}
    </section>
  );
}
