"use client";

import React, { useEffect, useState } from "react";
import { FundCtx } from "./ctx";
import { Card, Field, NumInput, SectionTitle, SelectField, Segmented, InfoTip } from "@/components/ui";
import { STAGES, Stage, FollowOnStrategy, InputMode, Company } from "@/lib/types";
import { generateAllocatedCompanies, StageAllocationRow } from "@/lib/engine";
import { fmtCurrency, fmtPct } from "@/lib/format";

function deriveAllocation(companies: Company[], defaultCheck: number): StageAllocationRow[] {
  return STAGES.map((stage) => {
    const inStage = companies.filter((c) => c.entryRound === stage);
    return { stage, count: inStage.length, check: inStage[0]?.initialCheck ?? defaultCheck };
  });
}

function evenCallSchedule(years: number): number[] {
  const n = Math.max(1, Math.round(years));
  return Array.from({ length: n }, () => 1 / n);
}

export default function Construction({ ctx }: { ctx: FundCtx }) {
  const { model, computed } = ctx;
  const c = model.construction;
  const s = model.settings;
  const f = model.fees;
  const w = model.waterfall;
  const m = computed.metrics;

  // Semi-custom stage allocation (used in Custom mode). Seeded from the current roster.
  const [alloc, setAlloc] = useState<StageAllocationRow[]>(() =>
    deriveAllocation(model.companies, c.initialCheckSize)
  );
  // Re-sync the staging allocation when the saved roster changes (e.g. switching
  // scenarios, or after Apply). Typing in the inputs doesn't change the roster, so
  // in-progress edits are never clobbered.
  const rosterSig = model.companies.map((cc) => `${cc.entryRound}:${cc.initialCheck}`).join(",");
  useEffect(() => {
    setAlloc(deriveAllocation(model.companies, c.initialCheckSize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterSig]);
  const allocTotalCount = alloc.reduce((a, r) => a + r.count, 0);
  const allocTotalCapital = alloc.reduce((a, r) => a + r.count * r.check, 0);
  function setAllocRow(stage: Stage, p: Partial<StageAllocationRow>) {
    setAlloc((prev) => prev.map((r) => (r.stage === stage ? { ...r, ...p } : r)));
  }
  function applyAllocation() {
    const generated = generateAllocatedCompanies(model, alloc, model.companies);
    ctx.setCompanies(generated);
    ctx.patchConstruction({ inputMode: "Custom", numDeals: generated.length });
  }
  const capitalCallSchedule = s.capitalCallSchedule?.length
    ? s.capitalCallSchedule
    : evenCallSchedule(s.investmentPeriodYears);
  const capitalCallPct = capitalCallSchedule.reduce((a, v) => a + v, 0);
  const capitalCallDollars = capitalCallPct * m.investableCapital;
  const capitalCallCount = capitalCallSchedule.filter((v) => v > 0).length;
  function setCapitalCallYears(years: number) {
    ctx.patchSettings({ capitalCallSchedule: evenCallSchedule(years) });
  }
  function setCapitalCallPct(index: number, pct: number) {
    ctx.patchSettings({
      capitalCallSchedule: capitalCallSchedule.map((v, i) => (i === index ? Math.max(0, pct) : v)),
    });
  }

  const plannedInitial = c.numDeals * c.initialCheckSize;
  const reserveDollars = c.reservePct * (m.fundSize - m.totalManagementFees - m.totalExpenses);

  return (
    <div className="space-y-6">
      <SectionTitle title="Portfolio Construction" desc="Define fund parameters, strategy, fees and market assumptions. Everything recalculates instantly." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left column: setup + strategy */}
        <div className="space-y-5 xl:col-span-2">
          <Card title="Fund Characteristics">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Fund Size">
                <NumInput kind="currency" value={s.fundSize} onChange={(v) => ctx.patchSettings({ fundSize: v })} />
              </Field>
              <Field label="Inception Date">
                <input
                  type="date"
                  className="input-base"
                  value={s.inceptionDate}
                  onChange={(e) => ctx.patchSettings({ inceptionDate: e.target.value })}
                />
              </Field>
              <Field label="Fund Life (yrs)">
                <NumInput value={s.fundLifeYears} onChange={(v) => ctx.patchSettings({ fundLifeYears: v })} min={1} />
              </Field>
              <Field label="Investment Period (yrs)">
                <NumInput
                  value={s.investmentPeriodYears}
                  onChange={(v) => ctx.patchSettings({ investmentPeriodYears: v })}
                  min={1}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Construction Strategy"
            right={
              <Segmented<InputMode>
                value={c.inputMode}
                onChange={(v) => ctx.patchConstruction({ inputMode: v })}
                options={[
                  { value: "Uniform", label: "Uniform" },
                  { value: "Custom", label: "Custom" },
                ]}
              />
            }
          >
            {c.inputMode === "Custom" && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Custom mode: edit each company individually in the <strong>Investments</strong> tab. The strategy
                inputs below seed new companies but per-company overrides take precedence.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="# of Initial Deals" tip="Number of new (initial) investments the fund makes.">
                <NumInput value={c.numDeals} onChange={(v) => ctx.patchConstruction({ numDeals: Math.round(v) })} min={1} />
              </Field>
              <Field label="Initial Check Size">
                <NumInput kind="currency" value={c.initialCheckSize} onChange={(v) => ctx.patchConstruction({ initialCheckSize: v })} />
              </Field>
              <Field label="Entry Round">
                <SelectField<Stage>
                  value={c.initialRound}
                  onChange={(v) => ctx.patchConstruction({ initialRound: v })}
                  options={STAGES}
                />
              </Field>
              <Field label="Initial Checks / Month" tip="Pacing of initial checks; spaces deployment over the investment period.">
                <NumInput kind="decimal" value={c.initialChecksPerMonth} onChange={(v) => ctx.patchConstruction({ initialChecksPerMonth: v })} min={0.1} />
              </Field>
              <Field label="Years Between Rounds">
                <NumInput kind="decimal" value={c.yearsBetweenRounds} onChange={(v) => ctx.patchConstruction({ yearsBetweenRounds: v })} min={0.25} />
              </Field>
              <Field label="Reserve Ratio" tip="Share of investable capital earmarked for follow-on rounds.">
                <NumInput kind="percent" value={c.reservePct} onChange={(v) => ctx.patchConstruction({ reservePct: v })} />
              </Field>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Follow-On Strategy</h4>
                <InfoTip text="Follow-ons go to the strongest (earliest-ranked) deals first. Each tier corresponds to the next financing round after entry." />
                <div className="ml-auto">
                  <Segmented<FollowOnStrategy>
                    value={c.followOnStrategy}
                    onChange={(v) => ctx.patchConstruction({ followOnStrategy: v })}
                    options={[
                      { value: "Pro-Rata", label: "Pro-Rata" },
                      { value: "Fixed Amount", label: "Fixed $" },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-600">Round +{i + 1}</div>
                    <Field label="# Deals">
                      <NumInput
                        value={c.followOnCounts[i]}
                        onChange={(v) => {
                          const arr = [...c.followOnCounts] as [number, number, number, number];
                          arr[i] = Math.round(v);
                          ctx.patchConstruction({ followOnCounts: arr });
                        }}
                        min={0}
                      />
                    </Field>
                    {c.followOnStrategy === "Fixed Amount" && (
                      <Field label="Check" className="mt-2">
                        <NumInput
                          kind="currency"
                          value={c.followOnFixedChecks[i]}
                          onChange={(v) => {
                            const arr = [...c.followOnFixedChecks] as [number, number, number, number];
                            arr[i] = v;
                            ctx.patchConstruction({ followOnFixedChecks: arr });
                          }}
                        />
                      </Field>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {c.inputMode === "Custom" && (
            <Card
              title="Semi-Custom: Stage Allocation"
              subtitle="Allocate companies across entry stages in cohorts (uniform within each stage). Apply to generate the roster, then fine-tune any company — including dates — in the Investments tab."
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="th">Entry Stage</th>
                      <th className="th text-right"># Companies</th>
                      <th className="th text-right">Initial Check</th>
                      <th className="th text-right">Entry Own.</th>
                      <th className="th text-right">Cohort Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alloc.map((row) => {
                      const mkt = model.market.find((mm) => mm.stage === row.stage);
                      const own = mkt && mkt.postMoneyValuation > 0 ? row.check / mkt.postMoneyValuation : 0;
                      return (
                        <tr key={row.stage} className="border-b border-slate-50 hover:bg-slate-50/60">
                          <td className="td font-medium text-slate-800">{row.stage}</td>
                          <td className="td">
                            <NumInput value={row.count} onChange={(v) => setAllocRow(row.stage, { count: Math.max(0, Math.round(v)) })} min={0} />
                          </td>
                          <td className="td">
                            <NumInput kind="currency" value={row.check} onChange={(v) => setAllocRow(row.stage, { check: v })} />
                          </td>
                          <td className="td num text-right text-slate-500">{row.count > 0 ? fmtPct(own) : "—"}</td>
                          <td className="td num text-right text-slate-600">{row.count > 0 ? fmtCurrency(row.count * row.check) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-sm text-slate-600">
                  <span className="num font-semibold text-slate-900">{allocTotalCount}</span> companies ·{" "}
                  <span className="num font-semibold text-slate-900">{fmtCurrency(allocTotalCapital)}</span> initial capital
                </div>
                <button onClick={applyAllocation} disabled={allocTotalCount === 0} className="btn-primary">
                  Apply Allocation
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Applying replaces the company roster (names and dates are preserved; outcomes are refreshed from each cohort's graduation rates). Follow-on tiers above still apply to the strongest deals across all cohorts.
              </p>
            </Card>
          )}

          <Card title="Market Assumptions" subtitle="Median round sizes & post-money valuations drive ownership and dilution.">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Stage</th>
                    <th className="th text-right">Round Size</th>
                    <th className="th text-right">Post-$ Valuation</th>
                    <th className="th text-right">Implied Dilution</th>
                    <th className="th text-right">Graduation Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {model.market.map((row) => {
                    const dilution = row.postMoneyValuation > 0 ? row.roundSize / row.postMoneyValuation : 0;
                    return (
                      <tr key={row.stage} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="td font-medium text-slate-800">{row.stage}</td>
                        <td className="td">
                          <NumInput kind="currency" value={row.roundSize} onChange={(v) => ctx.setMarketRow(row.stage, { roundSize: v })} />
                        </td>
                        <td className="td">
                          <NumInput kind="currency" value={row.postMoneyValuation} onChange={(v) => ctx.setMarketRow(row.stage, { postMoneyValuation: v })} />
                        </td>
                        <td className="td num text-right text-slate-500">{fmtPct(dilution)}</td>
                        <td className="td">
                          <NumInput kind="percent" value={row.graduationRate} onChange={(v) => ctx.setMarketRow(row.stage, { graduationRate: v })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column: fees, waterfall, capital summary */}
        <div className="space-y-5">
          <Card title="Capital Deployment" subtitle="Live summary">
            <dl className="space-y-2 text-sm">
              <SummaryRow label="Fund size" value={fmtCurrency(m.fundSize)} />
              <SummaryRow label="Mgmt fees (life)" value={`– ${fmtCurrency(m.totalManagementFees)}`} muted />
              <SummaryRow label="Fund expenses" value={`– ${fmtCurrency(m.totalExpenses)}`} muted />
              <SummaryRow label="Investable capital" value={fmtCurrency(m.investableCapital)} strong />
              <div className="my-2 border-t border-slate-100" />
              <SummaryRow label="Planned initial checks" value={fmtCurrency(plannedInitial)} />
              <SummaryRow label="Reserves (follow-on)" value={fmtCurrency(reserveDollars)} />
              <SummaryRow label="Actual deployed" value={fmtCurrency(m.totalInvested)} strong />
              <SummaryRow
                label="% of investable"
                value={fmtPct(m.pctDeployed)}
                badge={m.pctDeployed > 1.05 ? "over" : m.pctDeployed < 0.85 ? "under" : "ok"}
              />
              <div className="my-2 border-t border-slate-100" />
              <SummaryRow label="Max w/ recycling" value={fmtCurrency(m.maxCapitalWithRecycling)} muted />
            </dl>
          </Card>

          <Card title="Capital Calls" subtitle="Investment capital pacing">
            <div className="space-y-4">
              <Field
                label="# Investment Calls"
                tip="Number of annual investment-capital calls. These percentages apply to investable capital only; management fees and expenses are called separately through the fund life."
              >
                <NumInput value={capitalCallSchedule.length} onChange={setCapitalCallYears} min={1} />
              </Field>
              <div className="space-y-2">
                {capitalCallSchedule.map((pct, i) => (
                  <div key={i} className="grid grid-cols-[64px_1fr_88px] items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Year {i + 1}</span>
                    <NumInput kind="percent" value={pct} onChange={(v) => setCapitalCallPct(i, v)} />
                    <span className="num text-right text-xs text-slate-500">
                      {fmtCurrency(pct * m.investableCapital)}
                    </span>
                  </div>
                ))}
              </div>
              <dl className="border-t border-slate-100 pt-3 text-sm">
                <SummaryRow label="Active investment calls" value={`${capitalCallCount} annual`} />
                <SummaryRow label="Scheduled investment calls" value={`${fmtPct(capitalCallPct)} · ${fmtCurrency(capitalCallDollars)}`} strong />
                <SummaryRow label="Mgmt fees + expenses" value={fmtCurrency(m.totalManagementFees + m.totalExpenses)} muted />
              </dl>
              <p className="text-xs leading-snug text-slate-400">
                Example: a 20% call means 20% of investable capital, not 20% of total fund size. Fees and expenses continue separately even after investment calls are complete.
              </p>
            </div>
          </Card>

          <Card title="Fees & Expenses">
            <div className="space-y-4">
              <Field label="Management Fee (annual)" tip="Annual fee on committed capital during the investment period.">
                <NumInput kind="percent" value={f.managementFeePct} onChange={(v) => ctx.patchFees({ managementFeePct: v })} />
              </Field>
              <Field label="Step-Down per Quarter" tip="After the investment period, the annual management fee rate is reduced by this amount each quarter until it reaches the management fee floor. Fees continue even after investment capital calls are complete.">
                <NumInput kind="percent" value={f.stepDownPerQuarter} onChange={(v) => ctx.patchFees({ stepDownPerQuarter: v })} />
              </Field>
              <Field label="Management Fee Floor">
                <NumInput kind="percent" value={f.managementFeeFloorPct} onChange={(v) => ctx.patchFees({ managementFeeFloorPct: v })} />
              </Field>
              <Field label="Annual Fund Expenses (% of size)">
                <NumInput kind="percent" value={f.annualExpensesPct} onChange={(v) => ctx.patchFees({ annualExpensesPct: v })} />
              </Field>
              <Field label="Recycling Allowance (% of size)" tip="Early distributions that can be recycled into new investments.">
                <NumInput kind="percent" value={f.recyclingPct} onChange={(v) => ctx.patchFees({ recyclingPct: v })} />
              </Field>
            </div>
          </Card>

          <Card title="Carry & Waterfall">
            <div className="space-y-4">
              <Field label="Preferred Return / Hurdle (IRR)">
                <NumInput kind="percent" value={w.hurdleRate} onChange={(v) => ctx.patchWaterfall({ hurdleRate: v })} />
              </Field>
              <Field label="Carried Interest">
                <NumInput kind="percent" value={w.carriedInterestPct} onChange={(v) => ctx.patchWaterfall({ carriedInterestPct: v })} />
              </Field>
              <Field label="GP Catch-Up" tip="Catch-up rate applied after LPs receive their preferred return (100% = full catch-up).">
                <NumInput kind="percent" value={w.gpCatchupPct} onChange={(v) => ctx.patchWaterfall({ gpCatchupPct: v })} />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  strong,
  badge,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  badge?: "ok" | "over" | "under";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-slate-400" : "text-slate-600"}>{label}</dt>
      <dd className="flex items-center gap-2">
        {badge && (
          <span
            className={
              "pill " +
              (badge === "over"
                ? "bg-rose-50 text-rose-600"
                : badge === "under"
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600")
            }
          >
            {badge === "over" ? "Over-allocated" : badge === "under" ? "Under-allocated" : "On target"}
          </span>
        )}
        <span className={"num " + (strong ? "font-semibold text-slate-900" : muted ? "text-slate-400" : "text-slate-700")}>
          {value}
        </span>
      </dd>
    </div>
  );
}
