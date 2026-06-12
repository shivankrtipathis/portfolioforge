"use client";

import React from "react";
import { FundCtx } from "./ctx";
import { Card, SectionTitle, MetricCard } from "@/components/ui";
import { MoicByCompanyChart, ValueGrowthChart } from "@/components/charts";
import { fmtCurrency, fmtMultiple, fmtPct } from "@/lib/format";

export default function Returns({ ctx }: { ctx: FundCtx }) {
  const { computed } = ctx;
  const m = computed.metrics;

  const concentration = [
    { label: "All companies", moic: m.grossMOIC },
    { label: "ex. top 1", moic: m.grossMOICExTop1 },
    { label: "ex. top 2", moic: m.grossMOICExTop2 },
    { label: "ex. top 3", moic: m.grossMOICExTop3 },
  ];
  const maxMoic = Math.max(...concentration.map((c) => c.moic), 0.001);

  return (
    <div className="space-y-6">
      <SectionTitle title="Returns & Performance" desc="Gross vs. net returns, value creation over time and concentration sensitivity." />

      {/* Gross vs Net */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Gross Performance" subtitle="Pre-fee, pre-carry (deal-level)">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Gross MOIC" value={fmtMultiple(m.grossMOIC)} accent="green" />
            <MetricCard label="Gross IRR" value={fmtPct(m.grossIRR)} accent="green" />
            <MetricCard label="Total Invested" value={fmtCurrency(m.totalInvested)} />
            <MetricCard label="Total Proceeds" value={fmtCurrency(m.totalProceeds)} />
          </div>
        </Card>
        <Card title="Net Performance" subtitle="To LPs, after fees & carried interest">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Net TVPI" value={fmtMultiple(m.netTVPI)} accent="violet" />
            <MetricCard label="Net IRR" value={fmtPct(m.netIRR)} accent="violet" />
            <MetricCard label="Net DPI" value={fmtMultiple(m.netDPI)} accent="teal" />
            <MetricCard label="Net RVPI" value={fmtMultiple(m.netRVPI)} accent="slate" tip="Residual value to paid-in — unrealized NAV still held." />
          </div>
        </Card>
      </div>

      {/* Value growth + MOIC by company */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Value Creation Over Time" subtitle="Net TVPI & DPI progression">
          <ValueGrowthChart periods={computed.cashFlows} />
        </Card>
        <Card title="Gross MOIC by Company" subtitle="Sorted; colored by outcome band">
          <MoicByCompanyChart companies={computed.companies} />
        </Card>
      </div>

      {/* Sensitivity */}
      <Card title="Concentration Sensitivity" subtitle="How dependent are returns on the top performers?">
        <div className="space-y-3">
          {concentration.map((c) => (
            <div key={c.label} className="flex items-center gap-3">
              <div className="w-28 text-sm text-slate-600">{c.label}</div>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-brand-400 to-brand-600 pr-2"
                  style={{ width: `${Math.max(6, (c.moic / maxMoic) * 100)}%` }}
                >
                  <span className="num text-xs font-semibold text-white">{fmtMultiple(c.moic)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          A steep drop when excluding the top 1–3 companies indicates returns are concentrated in a few outliers —
          typical for early-stage venture, but worth stress-testing against the loss ratio of{" "}
          <span className="font-medium text-slate-700">{fmtPct(m.lossRatioCount)}</span>.
        </p>
      </Card>
    </div>
  );
}
