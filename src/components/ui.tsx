"use client";

import React, { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPct, parseNumber } from "@/lib/format";

export function classNames(...xs: (string | false | undefined | null)[]): string {
  return xs.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  title,
  subtitle,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={classNames("card", className)}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={title ? "p-4" : ""}>{children}</div>
    </div>
  );
}

export function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

export function MetricCard({
  label,
  value,
  sub,
  accent = "slate",
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "slate" | "green" | "red" | "blue" | "violet" | "amber" | "teal";
  tip?: string;
}) {
  const accentMap: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-600",
    red: "text-rose-600",
    blue: "text-brand-600",
    violet: "text-violet-600",
    amber: "text-amber-600",
    teal: "text-teal-600",
  };
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="label">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={classNames("num mt-1 text-2xl font-semibold tracking-tight", accentMap[accent])}>
        {value}
      </div>
      {sub && <div className="num mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex align-middle"
      title={text}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <CircleHelp
        tabIndex={0}
        aria-label={text}
        strokeWidth={1.75}
        className="h-3.5 w-3.5 cursor-help text-slate-400 outline-none transition hover:text-slate-600 focus:text-brand-600"
      />
      <span
        className={classNames(
          "pointer-events-none absolute left-1/2 top-5 z-50 w-64 -translate-x-1/2 rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-pop transition",
          open ? "opacity-100" : "opacity-0"
        )}
      >
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

type Kind = "currency" | "number" | "percent" | "decimal";

function display(value: number, kind: Kind): string {
  if (kind === "currency") return fmtCurrency(value, { compact: false });
  if (kind === "percent") return (value * 100).toFixed(2).replace(/\.00$/, "");
  if (kind === "decimal") return String(value);
  return fmtNumber(value);
}

export function NumInput({
  value,
  onChange,
  kind = "number",
  className,
  align = "right",
  min,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  kind?: Kind;
  className?: string;
  align?: "left" | "right";
  min?: number;
  step?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");

  const shown = focused ? raw : display(value, kind);

  return (
    <div className={classNames("relative", className)}>
      {kind === "currency" && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
          $
        </span>
      )}
      <input
        className={classNames(
          "input-base num",
          kind === "currency" && "pl-5",
          kind === "percent" && "pr-6",
          align === "right" ? "text-right" : "text-left"
        )}
        value={shown}
        inputMode="decimal"
        onFocus={() => {
          setFocused(true);
          setRaw(kind === "percent" ? String(+(value * 100).toFixed(4)) : String(value));
        }}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          setFocused(false);
          let n = parseNumber(raw);
          if (kind === "percent") n = n / 100;
          if (min != null && n < min) n = min;
          onChange(n);
        }}
        step={step}
      />
      {kind === "percent" && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
          %
        </span>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  tip,
  className,
}: {
  label: string;
  children: React.ReactNode;
  tip?: string;
  className?: string;
}) {
  return (
    <label className={classNames("block", className)}>
      <div className="mb-1 flex items-center gap-1">
        <span className="label">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      {children}
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      className={classNames("input-base", className)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[] | { value: T; label: string }[];
  className?: string;
}) {
  const opts =
    typeof options[0] === "string"
      ? (options as T[]).map((o) => ({ value: o, label: o }))
      : (options as { value: T; label: string }[]);
  return (
    <select
      className={classNames("input-base cursor-pointer pr-7", className)}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={classNames(
            "rounded-md px-3 py-1 text-sm font-medium transition",
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OutcomePill({ outcome }: { outcome: string }) {
  const map: Record<string, string> = {
    "Write-Off": "bg-rose-50 text-rose-700",
    "Below Cost": "bg-orange-50 text-orange-700",
    "1-5x": "bg-sky-50 text-sky-700",
    "5-10x": "bg-violet-50 text-violet-700",
    ">10x": "bg-emerald-50 text-emerald-700",
  };
  return <span className={classNames("pill", map[outcome] || "bg-slate-100 text-slate-600")}>{outcome}</span>;
}

/** Debounce a value (used for auto-save). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
