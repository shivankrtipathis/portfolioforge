"use client";

import React from "react";
import { Plus, FolderOpen, Copy, Trash2 } from "lucide-react";
import { Card, SectionTitle, classNames } from "@/components/ui";
import { ScenarioSummary } from "@/lib/db";
import { fmtCurrency, fmtMultiple, fmtPct } from "@/lib/format";

export default function Scenarios({
  scenarios,
  activeId,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
}: {
  scenarios: ScenarioSummary[];
  activeId: number | null;
  onOpen: (id: number) => void;
  onNew: () => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle title="Funds & Scenarios" desc="Compare construction scenarios side by side. All data is saved to the local database." />
        <button onClick={onNew} className="btn-primary">
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          New Fund
        </button>
      </div>

      {/* Comparison table */}
      <Card title="Comparison">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="th">Scenario</th>
                <th className="th text-right">Fund Size</th>
                <th className="th text-right">Gross MOIC</th>
                <th className="th text-right">Net IRR</th>
                <th className="th text-right">Last Updated</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr
                  key={s.id}
                  className={classNames("border-b border-slate-50 hover:bg-slate-50/60", s.id === activeId && "bg-brand-50/40")}
                >
                  <td className="td">
                    <button onClick={() => onOpen(s.id)} className="text-left">
                      <div className="font-medium text-slate-800 hover:text-brand-600">{s.name}</div>
                      {s.description && <div className="text-xs text-slate-400 line-clamp-1">{s.description}</div>}
                    </button>
                  </td>
                  <td className="td num text-right">{fmtCurrency(s.fundSize)}</td>
                  <td className="td num text-right font-semibold text-emerald-600">{fmtMultiple(s.grossMOIC)}</td>
                  <td className="td num text-right font-semibold text-violet-600">{fmtPct(s.netIRR)}</td>
                  <td className="td num text-right text-slate-400">{new Date(s.updatedAt).toLocaleDateString()}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onOpen(s.id)} className="btn-ghost !px-2 !py-1 text-xs">
                        <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Open
                      </button>
                      <button onClick={() => onDuplicate(s.id)} className="btn-ghost !px-2 !py-1 text-xs">
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Duplicate
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${s.name}"? This cannot be undone.`)) onDelete(s.id);
                        }}
                        className="btn-ghost !px-2 !py-1 text-xs text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={classNames(
              "card px-4 py-4 text-left transition hover:shadow-pop",
              s.id === activeId && "ring-2 ring-brand-500/40"
            )}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-slate-800">{s.name}</h3>
              {s.id === activeId && <span className="pill bg-brand-50 text-brand-600">Active</span>}
            </div>
            <p className="mt-1 line-clamp-2 h-8 text-xs text-slate-500">{s.description || "No description."}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
              <CardStat label="Size" value={fmtCurrency(s.fundSize)} />
              <CardStat label="MOIC" value={fmtMultiple(s.grossMOIC)} />
              <CardStat label="Net IRR" value={fmtPct(s.netIRR)} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="num text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
