"use client";

import React, { useState } from "react";
import { FundCtx } from "./ctx";
import { Card, SectionTitle, Segmented, classNames } from "@/components/ui";
import { fmtCurrency, fmtPct } from "@/lib/format";

function cell(v: number) {
  if (Math.abs(v) < 1) return <span className="text-slate-300">—</span>;
  return <span className={v < 0 ? "text-rose-600" : "text-emerald-700"}>{fmtCurrency(v)}</span>;
}

export default function CashFlows({ ctx }: { ctx: FundCtx }) {
  const { computed } = ctx;
  const [view, setView] = useState<"annual" | "quarterly">("annual");
  const m = computed.metrics;

  const totalGross = computed.cashFlows.reduce((a, p) => a + p.distributions, 0);
  const totalCarry = m.totalGPCarry;
  const totalNetLP = totalGross - totalCarry;
  const returnOfCapital = Math.min(totalNetLP, m.totalContributionsLP);
  const profitToLP = Math.max(0, totalNetLP - returnOfCapital);

  return (
    <div className="space-y-5">
      <SectionTitle title="Cash Flows & Distributions" desc="LP capital calls, distributions, fees and the carry waterfall over the fund life." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="LP Paid-In" value={fmtCurrency(m.totalContributionsLP)} tone="red" />
        <Stat label="LP Distributed (net)" value={fmtCurrency(m.totalDistributionsLP)} tone="green" />
        <Stat label="GP Carried Interest" value={fmtCurrency(m.totalGPCarry)} tone="violet" />
        <Stat label="Mgmt Fees + Expenses" value={fmtCurrency(m.totalManagementFees + m.totalExpenses)} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Distribution Waterfall" subtitle="European waterfall — whole fund" className="lg:col-span-1">
          <div className="space-y-3">
            <WaterRow label="Gross exit proceeds" value={totalGross} />
            <WaterRow label="Return of capital → LP" value={returnOfCapital} indent />
            <WaterRow label="Profit → LP" value={profitToLP} indent />
            <WaterRow label="Carried interest → GP" value={totalCarry} indent accent />
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>LP / GP split of profit</span>
                <span className="num font-medium text-slate-700">
                  {fmtPct(splitLP(profitToLP, totalCarry))} / {fmtPct(1 - splitLP(profitToLP, totalCarry))}
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                <div className="bg-emerald-500" style={{ width: `${splitLP(profitToLP, totalCarry) * 100}%` }} />
                <div className="bg-violet-500" style={{ width: `${(1 - splitLP(profitToLP, totalCarry)) * 100}%` }} />
              </div>
            </div>
            <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Hurdle (pref. return)</dt>
                <dd className="num font-medium">{fmtPct(ctx.model.waterfall.hurdleRate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Carried interest</dt>
                <dd className="num font-medium">{fmtPct(ctx.model.waterfall.carriedInterestPct)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">GP catch-up</dt>
                <dd className="num font-medium">{fmtPct(ctx.model.waterfall.gpCatchupPct)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card
          title="Cash Flow Schedule"
          className="lg:col-span-2"
          right={
            <Segmented<"annual" | "quarterly">
              value={view}
              onChange={setView}
              options={[
                { value: "annual", label: "Annual" },
                { value: "quarterly", label: "Quarterly" },
              ]}
            />
          }
        >
          <div className="-mx-4 max-h-[460px] overflow-auto">
            {view === "annual" ? (
              <table className="w-full min-w-[640px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200">
                    <th className="th">Year</th>
                    <th className="th text-right">Capital Calls</th>
                    <th className="th text-right">Distributions</th>
                    <th className="th text-right">Net Cash Flow</th>
                    <th className="th text-right">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.annualCashFlows.map((a) => (
                    <tr key={a.year} className="border-b border-slate-50">
                      <td className="td font-medium">Year {a.year}</td>
                      <td className="td num text-right">{cell(a.capitalCalls)}</td>
                      <td className="td num text-right">{cell(a.distributions)}</td>
                      <td className="td num text-right">{cell(a.netCashFlow)}</td>
                      <td className="td num text-right font-medium">{cell(a.cumulativeNetCashFlow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[860px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200">
                    <th className="th">Period</th>
                    <th className="th text-right">Mgmt Fees</th>
                    <th className="th text-right">Investments</th>
                    <th className="th text-right">LP Call</th>
                    <th className="th text-right">Distributions</th>
                    <th className="th text-right">GP Carry</th>
                    <th className="th text-right">Net CF</th>
                    <th className="th text-right">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.cashFlows.map((p) => (
                    <tr key={p.index} className="border-b border-slate-50">
                      <td className="td font-medium">{p.label}</td>
                      <td className="td num text-right">{cell(p.managementFees + p.expenses)}</td>
                      <td className="td num text-right">{cell(p.contributions)}</td>
                      <td className="td num text-right">{cell(p.grossContributions)}</td>
                      <td className="td num text-right">{cell(p.distributions)}</td>
                      <td className="td num text-right">{cell(-p.gpCarry)}</td>
                      <td className="td num text-right">{cell(p.netCashFlow)}</td>
                      <td className="td num text-right font-medium">{cell(p.cumulativeNetCashFlow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function splitLP(profitToLP: number, carry: number): number {
  const total = profitToLP + carry;
  return total > 0 ? profitToLP / total : 0;
}

function WaterRow({ label, value, indent, accent }: { label: string; value: number; indent?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={classNames(indent && "pl-4", accent ? "text-violet-600" : "text-slate-600")}>{label}</span>
      <span className={classNames("num font-medium", accent ? "text-violet-600" : "text-slate-800")}>{fmtCurrency(value)}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "red" | "green" | "violet" | "slate" }) {
  const c = { red: "text-rose-600", green: "text-emerald-600", violet: "text-violet-600", slate: "text-slate-800" }[tone];
  return (
    <div className="card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={"num text-lg font-semibold " + c}>{value}</div>
    </div>
  );
}
