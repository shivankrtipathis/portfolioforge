"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { resolveCompanies } from "@/lib/engine";
import { AnnualCashFlow, CashFlowPeriod, Company, CompanyResult, ComputedModel, FundModel, STAGES, Stage } from "@/lib/types";
import { fmtCurrency, fmtMultiple, fmtNumber } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#64748b" };
const GRID = "#eef2f7";

function moneyTick(v: number) {
  return fmtCurrency(v, { compact: true, decimals: 0 });
}

function ChartTip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-semibold text-slate-700">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="num font-medium text-slate-800">{(fmt || moneyTick)(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartDownloadFrame({
  children,
  filename,
  height,
}: {
  children: React.ReactNode;
  filename: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Hover is driven by state rather than a Tailwind group-hover utility, which
  // is more robust (the named group-hover variant was not being generated).
  const [hover, setHover] = useState(false);

  function svgPayload(): { text: string; width: number; height: number } | null {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || Number(svg.getAttribute("width")) || 1000));
    const svgHeight = Math.max(1, Math.round(bounds.height || Number(svg.getAttribute("height")) || height || 400));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(svgHeight));
    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${svgHeight}`);
    return { text: new XMLSerializer().serializeToString(clone), width, height: svgHeight };
  }

  function saveBlob(blob: Blob, ext: "svg" | "png") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSvg() {
    const payload = svgPayload();
    if (!payload) return;
    saveBlob(new Blob([payload.text], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }

  async function downloadPng() {
    const payload = svgPayload();
    if (!payload) return;
    const url = URL.createObjectURL(new Blob([payload.text], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Unable to render chart"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = payload.width * scale;
    canvas.height = payload.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, payload.width, payload.height);
    ctx.drawImage(img, 0, 0, payload.width, payload.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => blob && saveBlob(blob, "png"), "image/png");
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`absolute right-2 top-2 z-20 ${hover ? "flex" : "hidden"} gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-pop`}
      >
        <button type="button" onClick={downloadSvg} className="rounded px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100" title="Download SVG">
          SVG
        </button>
        <button type="button" onClick={downloadPng} className="rounded px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100" title="Download PNG">
          PNG
        </button>
      </div>
      {children}
    </div>
  );
}

// J-curve: cumulative net cash flow to LPs over the fund life.
export function JCurveChart({ periods }: { periods: CashFlowPeriod[] }) {
  const data = periods.map((p) => ({
    label: p.label,
    year: `Y${Math.floor(p.index / 4) + 1}`,
    cum: p.cumulativeNetCashFlow,
  }));
  return (
    <ChartDownloadFrame filename="j-curve" height={260}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="jpos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} interval={3} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickFormatter={moneyTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="cum" name="Cumulative net CF" stroke="#059669" strokeWidth={2} fill="url(#jpos)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}

// Annual capital calls (negative) vs distributions (positive), plus net line.
export function CashFlowBars({ annual }: { annual: AnnualCashFlow[] }) {
  const data = annual.map((a) => ({
    year: `Y${a.year}`,
    calls: a.capitalCalls,
    dists: a.distributions,
    cum: a.cumulativeNetCashFlow,
  }));
  return (
    <ChartDownloadFrame filename="annual-cash-flows" height={280}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickFormatter={moneyTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<ChartTip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Bar dataKey="calls" name="Capital calls" fill="#f43f5e" radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Bar dataKey="dists" name="Distributions" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Line type="monotone" dataKey="cum" name="Cumulative net" stroke="#2438eb" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}

// TVPI / DPI growth over fund life (uses interim NAV).
export function ValueGrowthChart({ periods }: { periods: CashFlowPeriod[] }) {
  let paidIn = 0;
  let dist = 0;
  const data = periods.map((p) => {
    paidIn += Math.max(0, -p.grossContributions);
    dist += p.netDistributions;
    const dpi = paidIn > 0 ? dist / paidIn : 0;
    const tvpi = paidIn > 0 ? (dist + p.navRemaining) / paidIn : 0;
    return { year: `Y${Math.floor(p.index / 4) + 1}`, dpi, tvpi };
  });
  return (
    <ChartDownloadFrame filename="value-creation-over-time" height={260}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="tvpi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} interval={3} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickFormatter={(v) => fmtMultiple(v, 1)} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip fmt={(v: number) => fmtMultiple(v, 2)} />} />
          <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="tvpi" name="Net TVPI" stroke="#6366f1" strokeWidth={2} fill="url(#tvpi)" />
          <Area type="monotone" dataKey="dpi" name="Net DPI" stroke="#0d9488" strokeWidth={2} fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}

interface FlowNode {
  id: string;
  label: string;
  value: number;
  column: number;
  color: string;
}

interface FlowLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

interface LayoutNode extends FlowNode {
  x: number;
  y: number;
  h: number;
  w: number;
  sourceOffset: number;
  targetOffset: number;
}

export function CapitalFlowSankey({ model, computed }: { model: FundModel; computed: ComputedModel }) {
  const flow = useMemo(() => buildCapitalFlow(model, computed), [model, computed]);
  const width = 1000;
  const nodeWidth = 14;
  const top = 70;
  const bottom = 36;
  const xByColumn = [70, 330, 590, 850];
  const columns = [0, 1, 2, 3];
  const colNodes = columns.map((col) => flow.nodes.filter((node) => node.column === col));
  const gapFor = (col: number) => (col === 3 ? 30 : 46);
  const minNodeH = 8;
  // Taller canvas when the busiest column has more nodes, so it never congests.
  const maxCount = Math.max(1, ...colNodes.map((c) => c.length));
  const bodyHeight = Math.max(440, maxCount * 72);
  const height = top + bodyHeight + bottom;
  const maxColumnTotal = Math.max(...colNodes.map((c) => c.reduce((a, node) => a + node.value, 0)), 1);
  // Reserve room for inter-node gaps so the busiest column's bodies + gaps fit.
  const worstGaps = Math.max(...columns.map((col) => Math.max(0, colNodes[col].length - 1) * gapFor(col)));
  const scale = Math.max(1e-6, (bodyHeight - worstGaps) / maxColumnTotal);
  const nodes = new Map<string, LayoutNode>();

  for (const column of columns) {
    const columnNodes = colNodes[column];
    const gap = gapFor(column);
    const heights = columnNodes.map((node) => Math.max(minNodeH, node.value * scale));
    const totalHeight = heights.reduce((a, h) => a + h, 0) + Math.max(0, columnNodes.length - 1) * gap;
    let y = top + Math.max(0, (bodyHeight - totalHeight) / 2);
    columnNodes.forEach((node, index) => {
      const h = heights[index];
      nodes.set(node.id, { ...node, x: xByColumn[column], y, h, w: nodeWidth, sourceOffset: 0, targetOffset: 0 });
      y += h + gap;
    });
  }

  const links = flow.links
    .filter((link) => link.value > 0 && nodes.has(link.source) && nodes.has(link.target))
    .map((link) => {
      const source = nodes.get(link.source)!;
      const target = nodes.get(link.target)!;
      const strokeWidth = Math.max(3, link.value * scale);
      const sourceY = source.y + source.sourceOffset + strokeWidth / 2;
      const targetY = target.y + target.targetOffset + strokeWidth / 2;
      source.sourceOffset += strokeWidth;
      target.targetOffset += strokeWidth;
      return { ...link, source, target, sourceY, targetY, strokeWidth };
    });

  return (
    <ChartDownloadFrame filename="capital-flow-sankey" height={height}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} className="w-full min-w-[820px]">
          <rect width={width} height={height} fill="#ffffff" />
          <text x={850} y={34} className="fill-slate-800 text-[18px] font-semibold">
            Stage
          </text>
          {links.map((link, index) => {
            const sx = link.source.x + link.source.w;
            const tx = link.target.x;
            const mid = sx + (tx - sx) * 0.55;
            return (
              <path
                key={`${link.source.id}-${link.target.id}-${index}`}
                d={`M ${sx} ${link.sourceY} C ${mid} ${link.sourceY}, ${mid} ${link.targetY}, ${tx} ${link.targetY}`}
                fill="none"
                stroke={link.color}
                strokeOpacity={0.38}
                strokeWidth={link.strokeWidth}
                strokeLinecap="butt"
              />
            );
          })}
          {[...nodes.values()].map((node) => (
            <g key={node.id}>
              <rect x={node.x} y={node.y} width={node.w} height={node.h} fill={node.color} />
              <NodeLabel node={node} />
            </g>
          ))}
        </svg>
      </div>
    </ChartDownloadFrame>
  );
}

function NodeLabel({ node }: { node: LayoutNode }) {
  const labelRight = node.column === 3 || node.id === "fees" || node.id === "reserve";
  const x = labelRight ? node.x + node.w + 8 : node.x - 8;
  const y = node.y + node.h / 2 - 4;
  const anchor = labelRight ? "start" : "end";
  return (
    <text x={x} y={y} textAnchor={anchor} className="fill-slate-900 text-[15px]">
      <tspan x={x} dy="0" className="text-[17px]">
        {flowMoney(node.value)}
      </tspan>
      <tspan x={x} dy="18" className="fill-slate-700 text-[12px]">
        {node.label}
      </tspan>
    </text>
  );
}

function buildCapitalFlow(model: FundModel, computed: ComputedModel): { nodes: FlowNode[]; links: FlowLink[] } {
  const sources = resolveCompanies(model);
  const initialByStage = stageMap();
  const followByStage = stageMap();
  const initialTotal = sources.reduce((a, company) => a + Math.max(0, company.initialCheck), 0);

  for (const company of sources) {
    initialByStage.set(company.entryRound, (initialByStage.get(company.entryRound) || 0) + Math.max(0, company.initialCheck));
    addFollowOnStageCapital(company, model, followByStage);
  }

  const followTotal = [...followByStage.values()].reduce((a, v) => a + v, 0);
  // Deployed capital that actually flows to stages — keeps every node equal to the
  // sum of its branches (no overflow / mismatched widths).
  const invested = initialTotal + followTotal;
  const fees = Math.max(0, computed.metrics.totalManagementFees + computed.metrics.totalExpenses);
  const reserve = Math.max(0, computed.metrics.fundSize - invested - fees);
  const fundTotal = invested + fees + reserve;
  const showReserve = reserve > computed.metrics.fundSize * 0.01;
  const stageTotals = stageMap();
  for (const stage of STAGES) {
    stageTotals.set(stage, (initialByStage.get(stage) || 0) + (followByStage.get(stage) || 0));
  }

  // Fees & Reserve are terminal branches off the Fund (column 1), so their links are
  // single-column hops that never cross the Investments / Primary / Follow-on columns.
  const nodes: FlowNode[] = [
    { id: "fund", label: "Fund", value: fundTotal, column: 0, color: "#4c78a8" },
    { id: "investments", label: "Investments", value: invested, column: 1, color: "#f58518" },
    { id: "fees", label: "Fees & Expenses", value: fees, column: 1, color: "#e45756" },
  ];
  if (showReserve) nodes.push({ id: "reserve", label: "Reserve / Uncalled", value: reserve, column: 1, color: "#bab0ab" });
  nodes.push(
    { id: "primary", label: "Primary Investments", value: initialTotal, column: 2, color: "#72b7b2" },
    { id: "follow", label: "Follow-ons", value: followTotal, column: 2, color: "#54a24b" }
  );
  for (const stage of STAGES) {
    const value = stageTotals.get(stage) || 0;
    if (value > 0) nodes.push({ id: `stage:${stage}`, label: prettyStage(stage), value, column: 3, color: stageColor(stage) });
  }

  const links: FlowLink[] = [
    { source: "fund", target: "investments", value: invested, color: "#f58518" },
    { source: "fund", target: "fees", value: fees, color: "#e45756" },
  ];
  if (showReserve) links.push({ source: "fund", target: "reserve", value: reserve, color: "#bab0ab" });
  links.push(
    { source: "investments", target: "primary", value: initialTotal, color: "#72b7b2" },
    { source: "investments", target: "follow", value: followTotal, color: "#54a24b" }
  );
  for (const stage of STAGES) {
    const primary = initialByStage.get(stage) || 0;
    const follow = followByStage.get(stage) || 0;
    if (primary > 0) links.push({ source: "primary", target: `stage:${stage}`, value: primary, color: stageColor(stage) });
    if (follow > 0) links.push({ source: "follow", target: `stage:${stage}`, value: follow, color: stageColor(stage) });
  }

  return { nodes, links };
}

function addFollowOnStageCapital(company: Company, model: FundModel, followByStage: Map<Stage, number>) {
  const entryIdx = STAGES.indexOf(company.entryRound);
  const exitIdx = Math.max(entryIdx, STAGES.indexOf(company.exitRound));
  let ownership =
    company.entryOwnershipOverride != null
      ? company.entryOwnershipOverride
      : marketPost(model, company.entryRound) > 0
      ? company.initialCheck / marketPost(model, company.entryRound)
      : 0;

  for (let r = 1; r <= exitIdx - entryIdx; r++) {
    const stage = STAGES[entryIdx + r];
    const roundSize = marketRoundSize(model, stage);
    const post = marketPost(model, stage);
    const raw = company.followOnChecks[r - 1] ?? 0;
    const amount = raw === -1 ? ownership * roundSize : raw > 0 ? raw : 0;
    if (amount > 0) followByStage.set(stage, (followByStage.get(stage) || 0) + amount);
    if (post > 0) {
      const dilution = company.dilutionPerRound > 0 ? 1 - company.dilutionPerRound : 1 - roundSize / post;
      ownership = ownership * dilution + amount / post;
    }
  }
}

function stageMap(): Map<Stage, number> {
  return new Map(STAGES.map((stage) => [stage, 0]));
}

function marketRoundSize(model: FundModel, stage: Stage): number {
  return model.market.find((m) => m.stage === stage)?.roundSize ?? 0;
}

function marketPost(model: FundModel, stage: Stage): number {
  return model.market.find((m) => m.stage === stage)?.postMoneyValuation ?? 0;
}

function stageColor(stage: Stage): string {
  const colors: Record<Stage, string> = {
    "Pre-Seed": "#edc948",
    Seed: "#b07aa1",
    "Series A": "#ff9da6",
    "Series B": "#4e79a7",
    "Series C": "#f28e2b",
    "Series D": "#76b7b2",
    "Series E": "#59a14f",
    "Series F": "#af7aa1",
    "Series G": "#9c755f",
  };
  return colors[stage];
}

function prettyStage(stage: Stage): string {
  return stage.replace("-", " ");
}

function flowMoney(value: number): string {
  return fmtCurrency(value, { compact: true, decimals: value >= 10_000_000 ? 0 : 1 });
}

const OUTCOME_COLORS: Record<string, string> = {
  "Write-Off": "#f43f5e",
  "Below Cost": "#fb923c",
  "1-5x": "#38bdf8",
  "5-10x": "#a78bfa",
  ">10x": "#10b981",
};

export function OutcomeDonut({ companies }: { companies: CompanyResult[] }) {
  const order = ["Write-Off", "Below Cost", "1-5x", "5-10x", ">10x"];
  const counts = new Map<string, number>();
  for (const c of companies) counts.set(c.outcome, (counts.get(c.outcome) || 0) + 1);
  const data = order.filter((o) => counts.get(o)).map((o) => ({ name: o, value: counts.get(o) || 0 }));
  return (
    <ChartDownloadFrame filename="outcome-distribution" height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={OUTCOME_COLORS[d.name]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip fmt={(v: number) => `${fmtNumber(v)} cos`} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}

// Capital deployed by entry stage.
export function DeploymentChart({
  data,
}: {
  data: { stage: string; capitalDeployed: number; numEntries: number }[];
}) {
  return (
    <ChartDownloadFrame filename="capital-deployed-by-stage" height={240}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="stage" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickFormatter={moneyTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<ChartTip />} />
          <Bar dataKey="capitalDeployed" name="Capital deployed" fill="#2438eb" radius={[3, 3, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}

// Per-company MOIC bars (sorted), colored by outcome.
export function MoicByCompanyChart({ companies }: { companies: CompanyResult[] }) {
  const data = [...companies]
    .filter((c) => c.investedCapital > 0)
    .sort((a, b) => b.moic - a.moic)
    .map((c) => ({ name: c.name, moic: c.moic, outcome: c.outcome }));
  return (
    <ChartDownloadFrame filename="gross-moic-by-company" height={260}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={false} axisLine={{ stroke: GRID }} height={6} />
          <YAxis tick={AXIS} tickFormatter={(v) => fmtMultiple(v, 0)} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip fmt={(v: number) => fmtMultiple(v, 2)} />} />
          <Bar dataKey="moic" name="Gross MOIC" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={OUTCOME_COLORS[d.outcome]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartDownloadFrame>
  );
}
