"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FundModel,
  FundSettings,
  FeeStructure,
  Waterfall,
  ConstructionStrategy,
  Company,
  Stage,
  MarketAssumption,
} from "@/lib/types";
import { computeModel } from "@/lib/engine";
import { buildDefaultCompanies } from "@/lib/defaults";
import { fmtCurrency, fmtMultiple, fmtPct } from "@/lib/format";
import { useDebounced, classNames } from "@/components/ui";
import {
  LayoutDashboard,
  TrendingUp,
  SlidersHorizontal,
  Briefcase,
  Banknote,
  Layers,
  Plus,
  Download,
  Copy,
  Check,
  Loader2,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { ScenarioSummary } from "@/lib/db";
import { FundCtx } from "@/components/sections/ctx";
import Overview from "@/components/sections/Overview";
import Construction from "@/components/sections/Construction";
import Investments from "@/components/sections/Investments";
import CashFlows from "@/components/sections/CashFlows";
import Returns from "@/components/sections/Returns";
import Scenarios from "@/components/sections/Scenarios";

type SectionKey = "overview" | "construction" | "investments" | "cashflows" | "returns" | "scenarios";

const NAV: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "returns", label: "Returns", icon: TrendingUp },
  // Construction = fund assumptions/strategy knobs, so a sliders metaphor.
  { key: "construction", label: "Construction", icon: SlidersHorizontal },
  // Investments = the portfolio of companies.
  { key: "investments", label: "Investments", icon: Briefcase },
  // Cash Flows = capital calls/distributions (money movement).
  { key: "cashflows", label: "Cash Flows", icon: Banknote },
  // Scenarios = stacked, comparable saved models.
  { key: "scenarios", label: "Scenarios", icon: Layers },
];

function resizeCompanies(existing: Company[], numDeals: number, initialRound: Stage): Company[] {
  const template = buildDefaultCompanies(numDeals, initialRound);
  const byId = new Map(existing.map((c) => [c.id, c]));
  return template.map((t) => {
    const prev = byId.get(t.id);
    if (!prev) return t;
    // Preserve user outcome edits + name; structure is derived in uniform mode.
    return {
      ...t,
      name: prev.name,
      exitRound: prev.exitRound,
      exitValuation: prev.exitValuation,
      exitYears: prev.exitYears ?? null,
      entryOwnershipOverride: prev.entryOwnershipOverride,
      dilutionPerRound: prev.dilutionPerRound,
      initialCheck: prev.isCustom ? prev.initialCheck : t.initialCheck,
      followOnChecks: prev.isCustom ? prev.followOnChecks : t.followOnChecks,
      isCustom: prev.isCustom,
    };
  });
}

export default function Page() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [model, setModel] = useState<FundModel | null>(null);
  const [name, setName] = useState("");
  const [section, setSection] = useState<SectionKey>("overview");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [exportState, setExportState] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const loadedId = useRef<number | null>(null);

  // ---- data loading ----
  const refreshList = useCallback(async (): Promise<ScenarioSummary[]> => {
    const res = await fetch("/api/scenarios");
    const data = await res.json();
    setScenarios(data.scenarios || []);
    return data.scenarios || [];
  }, []);

  const loadScenario = useCallback(async (id: number) => {
    const res = await fetch(`/api/scenarios/${id}`);
    const data = await res.json();
    if (data.scenario) {
      loadedId.current = id;
      setActiveId(id);
      setModel(data.scenario.model);
      setName(data.scenario.name);
      setSaveState("idle");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const list = await refreshList();
      if (list.length) await loadScenario(list[0].id);
      setLoading(false);
    })();
  }, [refreshList, loadScenario]);

  // ---- compute ----
  const computed = useMemo(() => (model ? computeModel(model) : null), [model]);

  // ---- auto-save (debounced) ----
  const debouncedModel = useDebounced(model, 700);
  const debouncedName = useDebounced(name, 700);
  useEffect(() => {
    if (!activeId || !debouncedModel || loadedId.current !== activeId) return;
    let cancelled = false;
    setSaveState("saving");
    fetch(`/api/scenarios/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: debouncedModel, name: debouncedName }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        if (cancelled) return;
        setSaveState("saved");
        setScenarios((prev) =>
          prev.map((s) =>
            s.id === activeId
              ? {
                  ...s,
                  name: debouncedName,
                  fundSize: debouncedModel.settings.fundSize,
                  grossMOIC: computeModel(debouncedModel).metrics.grossMOIC,
                }
              : s
          )
        );
      })
      .catch(() => !cancelled && setSaveState("error"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedModel, debouncedName, activeId]);

  // ---- patchers ----
  const patchSettings = useCallback(
    (p: Partial<FundSettings>) => setModel((m) => (m ? { ...m, settings: { ...m.settings, ...p } } : m)),
    []
  );
  const patchFees = useCallback(
    (p: Partial<FeeStructure>) => setModel((m) => (m ? { ...m, fees: { ...m.fees, ...p } } : m)),
    []
  );
  const patchWaterfall = useCallback(
    (p: Partial<Waterfall>) => setModel((m) => (m ? { ...m, waterfall: { ...m.waterfall, ...p } } : m)),
    []
  );
  const patchConstruction = useCallback(
    (p: Partial<ConstructionStrategy>) =>
      setModel((m) => {
        if (!m) return m;
        const construction = { ...m.construction, ...p };
        let companies = m.companies;
        // Keep the company roster sized to the strategy in Uniform mode.
        if (
          construction.inputMode === "Uniform" &&
          (p.numDeals != null || p.initialRound != null)
        ) {
          companies = resizeCompanies(m.companies, construction.numDeals, construction.initialRound);
        }
        return { ...m, construction, companies };
      }),
    []
  );
  const setMarketRow = useCallback(
    (stage: Stage, p: Partial<MarketAssumption>) =>
      setModel((m) =>
        m ? { ...m, market: m.market.map((row) => (row.stage === stage ? { ...row, ...p } : row)) } : m
      ),
    []
  );
  const patchCompany = useCallback(
    (id: string, p: Partial<Company>) =>
      setModel((m) => {
        if (!m) return m;
        const patch = p.exitRound != null || p.exitValuation != null ? { ...p, outcomeSource: "Manual" as const } : p;
        const exists = m.companies.some((c) => c.id === id);
        const companies = exists
          ? m.companies.map((c) => (c.id === id ? { ...c, ...patch } : c))
          : [...m.companies, { ...(buildDefaultCompanies(1, m.construction.initialRound)[0]), id, ...patch }];
        return { ...m, companies };
      }),
    []
  );
  const setCompanies = useCallback((cs: Company[]) => setModel((m) => (m ? { ...m, companies: cs } : m)), []);
  const regenerateCompanies = useCallback(
    () =>
      setModel((m) =>
        m ? { ...m, companies: resizeCompanies([], m.construction.numDeals, m.construction.initialRound) } : m
      ),
    []
  );

  // ---- scenario actions ----
  async function newFund() {
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Fund", description: "" }),
    });
    const data = await res.json();
    await refreshList();
    if (data.scenario) await loadScenario(data.scenario.id);
    setSection("construction");
  }
  async function duplicateFund(id: number) {
    const res = await fetch(`/api/scenarios/${id}/duplicate`, { method: "POST" });
    const data = await res.json();
    await refreshList();
    if (data.scenario) await loadScenario(data.scenario.id);
  }
  async function deleteFund(id: number) {
    await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    const list = await refreshList();
    if (activeId === id) {
      if (list.length) await loadScenario(list[0].id);
      else {
        setActiveId(null);
        setModel(null);
      }
    }
  }

  async function downloadExcel() {
    if (!model) return;
    setExportState("exporting");
    try {
      const res = await fetch(`/api/scenarios/${activeId ?? 0}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, model }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "portfolio-construction-svb-model.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 1200);
    } catch {
      setExportState("error");
      window.setTimeout(() => setExportState("idle"), 2000);
    }
  }

  const ctx: FundCtx | null =
    model && computed
      ? {
          model,
          computed,
          patchSettings,
          patchFees,
          patchWaterfall,
          patchConstruction,
          setMarketRow,
          patchCompany,
          setCompanies,
          regenerateCompanies,
        }
      : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900 lg:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full flex-shrink-0 flex-col border-b border-slate-200 bg-white lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-3 lg:py-4">
          {/* Company logo (brand asset, not a UI icon). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="PortfolioForge" className="h-8 w-8" />
          <div>
            <div className="text-sm font-bold leading-tight">PortfolioForge</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Fund Construction</div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 py-2 lg:block lg:overflow-visible">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={classNames(
                  "mb-0.5 flex w-auto shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition lg:w-full",
                  section === n.key ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-between px-4 py-2 lg:mt-2">
          <span className="label">Funds & Scenarios</span>
          <button onClick={newFund} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="New fund">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-2 pb-3 lg:block lg:flex-1 lg:space-y-1 lg:overflow-y-auto lg:pb-4">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => loadScenario(s.id)}
              className={classNames(
                "block w-48 shrink-0 rounded-lg border px-3 py-2 text-left transition lg:w-full",
                s.id === activeId
                  ? "border-brand-200 bg-brand-50/60"
                  : "border-transparent hover:border-slate-200 hover:bg-slate-50"
              )}
            >
              <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
              <div className="num mt-0.5 flex gap-2 text-[11px] text-slate-500">
                <span>{fmtCurrency(s.fundSize)}</span>
                <span>·</span>
                <span>{fmtMultiple(s.grossMOIC)} MOIC</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex flex-col items-start gap-3 border-b border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
          <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-lg font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 md:w-auto"
            />
            <SaveBadge state={saveState} />
          </div>
          {ctx && (
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 md:flex md:w-auto md:items-center md:gap-4">
              <HeaderStat label="Fund Size" value={fmtCurrency(ctx.model.settings.fundSize)} />
              <HeaderStat label="Gross MOIC" value={fmtMultiple(ctx.computed.metrics.grossMOIC)} />
              <HeaderStat label="Net IRR" value={fmtPct(ctx.computed.metrics.netIRR)} />
              <HeaderStat label="Net TVPI" value={fmtMultiple(ctx.computed.metrics.netTVPI)} />
              <button
                onClick={downloadExcel}
                disabled={exportState === "exporting"}
                className="btn-outline disabled:cursor-wait disabled:opacity-60"
                title="Download this fund as an SVB-style Excel workbook"
              >
                {exportState === "exporting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                )}
                {exportState === "exporting"
                  ? "Downloading..."
                  : exportState === "done"
                  ? "Downloaded"
                  : exportState === "error"
                  ? "Export failed"
                  : "Download Excel"}
              </button>
              <button
                onClick={() => activeId && duplicateFund(activeId)}
                className="btn-outline"
                title="Duplicate this fund"
              >
                <Copy className="h-4 w-4" strokeWidth={1.75} />
                Duplicate
              </button>
            </div>
          )}
        </header>

        {/* Section body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {!loading && !ctx && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-slate-500">No funds yet.</p>
              <button onClick={newFund} className="btn-primary">
                Create your first fund
              </button>
            </div>
          )}
          {ctx && section === "overview" && <Overview ctx={ctx} />}
          {ctx && section === "construction" && <Construction ctx={ctx} />}
          {ctx && section === "investments" && <Investments ctx={ctx} />}
          {ctx && section === "cashflows" && <CashFlows ctx={ctx} />}
          {ctx && section === "returns" && <Returns ctx={ctx} />}
          {ctx && (
            <div className={section === "scenarios" ? "block" : "hidden"}>
              <Scenarios
                scenarios={scenarios}
                activeId={activeId}
                onOpen={loadScenario}
                onNew={newFund}
                onDuplicate={duplicateFund}
                onDelete={deleteFund}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left md:text-right">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="num text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  const map = {
    idle: { t: "Saved", c: "text-slate-400", Icon: Check },
    saving: { t: "Saving…", c: "text-amber-500", Icon: Loader2 },
    saved: { t: "All changes saved", c: "text-emerald-600", Icon: Check },
    error: { t: "Save failed", c: "text-rose-600", Icon: CircleAlert },
  }[state];
  const Icon = map.Icon;
  return (
    <span className={classNames("flex items-center gap-1.5 text-xs font-medium", map.c)}>
      <Icon className={classNames("h-3.5 w-3.5", state === "saving" && "animate-spin")} strokeWidth={1.75} />
      {map.t}
    </span>
  );
}
