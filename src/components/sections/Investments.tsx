"use client";

import React, { useMemo, useState } from "react";
import { FundCtx } from "./ctx";
import { Card, NumInput, OutcomePill, SectionTitle, SelectField, Segmented, TextField, classNames } from "@/components/ui";
import { Plus, Minus, Trash2 } from "lucide-react";
import { STAGES, Stage, Company, InputMode } from "@/lib/types";
import { fmtCurrency, fmtMultiple, fmtPct } from "@/lib/format";

export default function Investments({ ctx }: { ctx: FundCtx }) {
  const { model, computed } = ctx;
  const custom = model.construction.inputMode === "Custom";
  const [filter, setFilter] = useState("");

  const srcById = useMemo(() => new Map(model.companies.map((c) => [c.id, c])), [model.companies]);
  const m = computed.metrics;

  const rows = computed.companies.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  function addCompany() {
    const n = model.companies.length + 1;
    const newC: Company = {
      id: `c${Date.now()}`,
      name: `Company ${n}`,
      entryRound: model.construction.initialRound,
      entryDateOffsetMonths: n,
      entryDate: null,
      initialCheck: model.construction.initialCheckSize,
      followOnChecks: [],
      exitRound: STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(model.construction.initialRound) + 1)],
      exitValuation: 0,
      exitYears: null,
      entryOwnershipOverride: null,
      dilutionPerRound: 0,
      isCustom: true,
    };
    ctx.setCompanies([...model.companies, newC]);
  }

  function removeCompany(id: string) {
    ctx.setCompanies(model.companies.filter((c) => c.id !== id));
  }

  function setFollowOns(company: Company, count: number) {
    const next = [0, 0, 0, 0];
    for (let i = 0; i < count; i++) {
      const existing = company.followOnChecks[i];
      next[i] =
        existing && existing !== 0
          ? existing
          : model.construction.followOnStrategy === "Pro-Rata"
          ? -1
          : model.construction.followOnFixedChecks[i] ?? 0;
    }
    ctx.patchCompany(company.id, { followOnChecks: next, isCustom: true });
  }

  function setFollowOnCheck(company: Company, index: number, value: number) {
    const next = [...company.followOnChecks];
    while (next.length <= index) next.push(0);
    next[index] = value;
    ctx.patchCompany(company.id, { followOnChecks: next, isCustom: true });
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Schedule of Investments" desc="Per-company entry, ownership, exit and returns. Edit exit assumptions to shape the portfolio." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Companies" value={String(m.numCompanies)} />
        <Stat label="Total Invested" value={fmtCurrency(m.totalInvested)} />
        <Stat label="Total Proceeds" value={fmtCurrency(m.totalProceeds)} />
        <Stat label="Gross MOIC" value={fmtMultiple(m.grossMOIC)} accent />
        <Stat label="Avg Entry Own." value={fmtPct(avgEntry(computed.companies))} />
      </div>

      <Card
        title="Companies"
        right={
          <div className="flex items-center gap-3">
            <TextField value={filter} onChange={setFilter} placeholder="Search…" className="!w-44 !py-1" />
            <Segmented<InputMode>
              value={model.construction.inputMode}
              onChange={(v) => ctx.patchConstruction({ inputMode: v })}
              options={[
                { value: "Uniform", label: "Uniform" },
                { value: "Custom", label: "Custom" },
              ]}
            />
            {custom && (
              <button onClick={addCompany} className="btn-primary !py-1">
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                Add
              </button>
            )}
          </div>
        }
      >
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[1460px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200">
                <th className="th sticky left-0 z-30 bg-white shadow-[1px_0_0_#e2e8f0]">Company</th>
                <th className="th">Entry Round</th>
                <th className="th text-right">Entry Date</th>
                <th className="th text-right">Own. @ Entry</th>
                <th className="th text-right">Invested</th>
                {custom && <th className="th">Follow-Ons</th>}
                <th className="th">Exit Round</th>
                <th className="th text-right">Years to Exit</th>
                <th className="th text-right">Exit Valuation</th>
                <th className="th text-right">Own. @ Exit</th>
                <th className="th text-right">Proceeds</th>
                <th className="th text-right">MOIC</th>
                <th className="th">Outcome</th>
                {custom && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((cr) => {
                const src = srcById.get(cr.id);
                return (
                  <tr key={cr.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="td sticky left-0 z-20 bg-white shadow-[1px_0_0_#e2e8f0]">
                      <TextField
                        value={src?.name ?? cr.name}
                        onChange={(v) => ctx.patchCompany(cr.id, { name: v })}
                        className="!w-36 !py-1 !px-2"
                      />
                    </td>
                    <td className="td">
                      {custom ? (
                        <SelectField<Stage>
                          value={src?.entryRound ?? cr.entryRound}
                          onChange={(v) => ctx.patchCompany(cr.id, { entryRound: v })}
                          options={STAGES}
                          className="!w-28 !py-1"
                        />
                      ) : (
                        <span className="text-slate-700">{cr.entryRound}</span>
                      )}
                    </td>
                    <td className="td num text-right text-slate-500">
                      {custom ? (
                        <input
                          type="date"
                          className="input-base num !w-[136px] !py-1 !px-2 text-xs"
                          value={src?.entryDate ?? cr.entryDate}
                          onChange={(e) => ctx.patchCompany(cr.id, { entryDate: e.target.value })}
                        />
                      ) : (
                        cr.entryDate
                      )}
                    </td>
                    <td className="td num text-right">{fmtPct(cr.ownershipAtEntry)}</td>
                    <td className="td num text-right">
                      {custom ? (
                        <NumInput
                          kind="currency"
                          value={src?.initialCheck ?? 0}
                          onChange={(v) => ctx.patchCompany(cr.id, { initialCheck: v, isCustom: true })}
                          className="!w-28"
                        />
                      ) : (
                        fmtCurrency(cr.investedCapital)
                      )}
                    </td>
                    {custom && (
                      <td className="td">
                        {src && (
                          <FollowOnEditor
                            company={src}
                            fixedChecks={model.construction.followOnFixedChecks}
                            onCountChange={(count) => setFollowOns(src, count)}
                            onCheckChange={(index, value) => setFollowOnCheck(src, index, value)}
                          />
                        )}
                      </td>
                    )}
                    <td className="td">
                      <SelectField<Stage>
                        value={src?.exitRound ?? cr.exitRound}
                        onChange={(v) => ctx.patchCompany(cr.id, { exitRound: v })}
                        options={STAGES}
                        className="!w-28 !py-1"
                      />
                    </td>
                    <td className="td">
                      <NumInput
                        kind="decimal"
                        value={src?.exitYears ?? yearsToExit(cr.entryDate, cr.exitDate)}
                        onChange={(v) => ctx.patchCompany(cr.id, { exitYears: v > 0 ? v : null })}
                        className="!w-20"
                      />
                    </td>
                    <td className="td">
                      <NumInput
                        kind="currency"
                        value={src?.exitValuation ?? 0}
                        onChange={(v) => ctx.patchCompany(cr.id, { exitValuation: v })}
                        className="!w-32"
                      />
                    </td>
                    <td className="td num text-right">{cr.proceeds > 0 ? fmtPct(cr.ownershipAtExit) : "—"}</td>
                    <td className="td num text-right font-medium">{fmtCurrency(cr.proceeds)}</td>
                    <td className={classNames("td num text-right font-semibold", cr.moic >= 1 ? "text-emerald-600" : cr.moic > 0 ? "text-orange-600" : "text-rose-500")}>
                      {cr.investedCapital > 0 ? fmtMultiple(cr.moic) : "—"}
                    </td>
                    <td className="td">
                      <OutcomePill outcome={cr.outcome} />
                    </td>
                    {custom && (
                      <td className="td">
                        <button
                          onClick={() => removeCompany(cr.id)}
                          className="inline-flex text-slate-300 hover:text-rose-500"
                          title="Remove company"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="td sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Total</td>
                <td className="td" colSpan={3}></td>
                <td className="td num text-right">{fmtCurrency(m.totalInvested)}</td>
                {custom && <td className="td"></td>}
                <td className="td" colSpan={4}></td>
                <td className="td num text-right">{fmtCurrency(m.totalProceeds)}</td>
                <td className="td num text-right text-emerald-700">{fmtMultiple(m.grossMOIC)}</td>
                <td className="td" colSpan={custom ? 2 : 1}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FollowOnEditor({
  company,
  fixedChecks,
  onCountChange,
  onCheckChange,
}: {
  company: Company;
  fixedChecks: readonly number[];
  onCountChange: (count: number) => void;
  onCheckChange: (index: number, value: number) => void;
}) {
  const count = activeFollowOnCount(company.followOnChecks);

  return (
    <div className="w-64 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="num text-xs font-medium text-slate-500">{count} follow-ons</span>
        <div className="inline-flex rounded-md border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(0, count - 1))}
            className="inline-flex h-6 w-7 items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            disabled={count === 0}
            title="Remove follow-on"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onCountChange(Math.min(4, count + 1))}
            className="inline-flex h-6 w-7 items-center justify-center border-l border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            disabled={count === 4}
            title="Add follow-on"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {count > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: count }, (_, i) => {
            const value = company.followOnChecks[i] ?? 0;
            return value === -1 ? (
              <button
                key={i}
                type="button"
                onClick={() => onCheckChange(i, fixedChecks[i] ?? 0)}
                className="h-8 rounded-md border border-brand-200 bg-brand-50 px-2 text-xs font-medium text-brand-700"
                title="Pro-rata follow-on. Click to switch to a fixed amount."
              >
                F{i + 1}: Pro-rata
              </button>
            ) : (
              <label key={i} className="block">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  F{i + 1}
                </span>
                <NumInput
                  kind="currency"
                  value={value}
                  onChange={(v) => onCheckChange(i, v)}
                  className="!w-28"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function activeFollowOnCount(checks: number[]): number {
  for (let i = Math.min(checks.length, 4) - 1; i >= 0; i--) {
    if ((checks[i] ?? 0) !== 0) return i + 1;
  }
  return 0;
}

function avgEntry(companies: { ownershipAtEntry: number }[]): number {
  if (!companies.length) return 0;
  return companies.reduce((a, c) => a + c.ownershipAtEntry, 0) / companies.length;
}

function yearsToExit(entryDate: string, exitDate: string): number {
  const entry = new Date(entryDate).getTime();
  const exit = new Date(exitDate).getTime();
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit <= entry) return 0;
  return +((exit - entry) / (365 * 24 * 60 * 60 * 1000)).toFixed(1);
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={"num text-lg font-semibold " + (accent ? "text-emerald-600" : "text-slate-800")}>{value}</div>
    </div>
  );
}
