"use client";

import React from "react";
import { FundCtx } from "./ctx";
import { Card, MetricCard, SectionTitle } from "@/components/ui";
import { CapitalFlowSankey, CashFlowBars, DeploymentChart, JCurveChart, OutcomeDonut } from "@/components/charts";
import { fmtCurrency, fmtMultiple, fmtPct, fmtNumber } from "@/lib/format";

export default function Overview({ ctx }: { ctx: FundCtx }) {
  const { model, computed } = ctx;
  const m = computed.metrics;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Fund Overview"
        desc={`${fmtNumber(m.numCompanies)} companies · ${model.construction.initialRound} entry · ${model.settings.fundLifeYears}-year fund`}
      />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <MetricCard label="Fund Size" value={fmtCurrency(m.fundSize)} sub={`${fmtCurrency(m.investableCapital)} investable`} accent="blue" />
        <MetricCard
          label="Total Invested"
          value={fmtCurrency(m.totalInvested)}
          sub={`${fmtPct(m.pctDeployed)} of investable deployed`}
        />
        <MetricCard label="Gross MOIC" value={fmtMultiple(m.grossMOIC)} sub={`${fmtCurrency(m.totalProceeds)} proceeds`} accent="green" />
        <MetricCard label="Gross IRR" value={fmtPct(m.grossIRR)} accent="green" tip="Internal rate of return on gross (pre-fee, pre-carry) deal cash flows." />
        <MetricCard label="Net TVPI" value={fmtMultiple(m.netTVPI)} sub="to LPs, net of fees & carry" accent="violet" />
        <MetricCard label="Net DPI" value={fmtMultiple(m.netDPI)} sub="realized distributions / paid-in" accent="teal" />
        <MetricCard label="Net IRR" value={fmtPct(m.netIRR)} accent="violet" tip="LP internal rate of return after management fees and carried interest." />
        <MetricCard label="Loss Ratio" value={fmtPct(m.lossRatioCount)} sub={`${m.lossCount} write-offs · ${fmtPct(m.lossRatioDollar)} of $`} accent="red" />
      </div>

      <Card title="Capital Flow Sankey" subtitle="Fund commitments through investments, fees, primary checks, follow-ons, and stage allocation">
        <CapitalFlowSankey model={model} computed={computed} />
      </Card>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="J-Curve" subtitle="Cumulative net cash flow to LPs">
          <JCurveChart periods={computed.cashFlows} />
        </Card>
        <Card title="Annual Cash Flows" subtitle="Capital calls vs. distributions (net to LP)">
          <CashFlowBars annual={computed.annualCashFlows} />
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Outcome Distribution" subtitle="Companies by gross MOIC band">
          <OutcomeDonut companies={computed.companies} />
        </Card>
        <Card title="Capital Deployed by Stage" subtitle="Entry-stage allocation">
          <DeploymentChart
            data={computed.stageExposure.map((s) => ({
              stage: s.stage.replace("Series ", ""),
              capitalDeployed: s.capitalDeployed,
              numEntries: s.numEntries,
            }))}
          />
        </Card>
        <Card title="Portfolio Returns Breakdown">
          <div className="space-y-2.5">
            <OutcomeRow label="Write-offs (full loss)" count={m.lossCount} total={m.numCompanies} color="bg-rose-500" />
            <OutcomeRow label="Below cost (<1x)" count={m.belowCostCount} total={m.numCompanies} color="bg-orange-500" />
            <OutcomeRow label="Base hits (1–5x)" count={m.baseHit1to5Count} total={m.numCompanies} color="bg-sky-500" />
            <OutcomeRow label="Strong (5–10x)" count={m.baseHit5to10Count} total={m.numCompanies} color="bg-violet-500" />
            <OutcomeRow label="Outliers (>10x)" count={m.successCount} total={m.numCompanies} color="bg-emerald-500" />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <MiniStat label="Total GP Carry" value={fmtCurrency(m.totalGPCarry)} />
              <MiniStat label="Mgmt Fees (life)" value={fmtCurrency(m.totalManagementFees)} />
              <MiniStat label="LP Paid-In" value={fmtCurrency(m.totalContributionsLP)} />
              <MiniStat label="LP Distributed" value={fmtCurrency(m.totalDistributionsLP)} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function OutcomeRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="num font-medium text-slate-800">
          {count} · {fmtPct(pct, 0)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="num text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
