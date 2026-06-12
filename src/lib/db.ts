// Database layer — persistence via libSQL / Turso.
//
// Works in two modes from the same code:
//   • Production (Vercel): set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) and it
//     talks to a remote Turso database over HTTP using the pure-JS web client
//     (no native deps, safe on serverless / read-only filesystems).
//   • Local dev: with no env vars it falls back to a local libSQL file at
//     ./data/portfolio.db (SQLite-compatible, so existing local data is kept).
//
// Scenarios store the full FundModel as JSON plus denormalized headline columns
// (fund size, gross MOIC, net IRR) so the list can be queried without parsing
// every blob.

import type { Client, Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { FundModel, ScenarioRecord } from "./types";
import { buildDefaultModel } from "./defaults";
import { computeModel } from "./engine";

// Reuse the connection + init across hot reloads / warm serverless invocations.
const g = globalThis as unknown as {
  __pcClient?: Promise<Client>;
  __pcReady?: Promise<void>;
};

function getClient(): Promise<Client> {
  if (g.__pcClient) return g.__pcClient;
  g.__pcClient = (async () => {
    const url = process.env.TURSO_DATABASE_URL;
    if (url) {
      // Remote Turso — fetch-based web client, no native bindings.
      const { createClient } = await import("@libsql/client/web");
      return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    }
    // Local dev fallback: a libSQL file on disk.
    const { createClient } = await import("@libsql/client");
    const dir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return createClient({ url: `file:${path.join(dir, "portfolio.db")}` });
  })();
  return g.__pcClient;
}

async function ready(): Promise<void> {
  if (g.__pcReady) return g.__pcReady;
  const p = (async () => {
    const db = await getClient();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        model_json TEXT NOT NULL,
        fund_size REAL NOT NULL DEFAULT 0,
        gross_moic REAL NOT NULL DEFAULT 0,
        net_irr REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await ensureSeed(db);
  })();
  g.__pcReady = p;
  try {
    await p;
  } catch (e) {
    // Don't cache a failed init — allow the next request to retry.
    g.__pcReady = undefined;
    throw e;
  }
}

function headline(model: FundModel): { fundSize: number; grossMOIC: number; netIRR: number } {
  try {
    const c = computeModel(model);
    return { fundSize: model.settings.fundSize, grossMOIC: c.metrics.grossMOIC, netIRR: c.metrics.netIRR };
  } catch {
    return { fundSize: model.settings.fundSize, grossMOIC: 0, netIRR: 0 };
  }
}

async function ensureSeed(db: Client) {
  const res = await db.execute("SELECT COUNT(*) AS n FROM scenarios");
  const n = Number((res.rows[0] as Row & { n: number }).n);
  if (n > 0) return;
  const model = buildDefaultModel();
  const h = headline(model);
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO scenarios (name, description, model_json, fund_size, gross_moic, net_irr, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "3iP Fund II — Base Case",
      "50-company pre-seed/seed fund. Seeded from the 3iP Fund II construction model.",
      JSON.stringify(model),
      h.fundSize,
      h.grossMOIC,
      isFinite(h.netIRR) ? h.netIRR : 0,
      now,
      now,
    ],
  });
}

interface DbRow {
  id: number | bigint;
  name: string;
  description: string;
  model_json: string;
  fund_size: number;
  gross_moic: number;
  net_irr: number;
  created_at: string;
  updated_at: string;
}

function toRecord(r: DbRow): ScenarioRecord {
  return {
    id: Number(r.id),
    name: r.name,
    description: r.description,
    model: JSON.parse(r.model_json) as FundModel,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface ScenarioSummary {
  id: number;
  name: string;
  description: string;
  fundSize: number;
  grossMOIC: number;
  netIRR: number;
  createdAt: string;
  updatedAt: string;
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  await ready();
  const db = await getClient();
  const res = await db.execute(
    "SELECT id, name, description, fund_size, gross_moic, net_irr, created_at, updated_at FROM scenarios ORDER BY updated_at DESC"
  );
  return (res.rows as unknown as DbRow[]).map((r) => ({
    id: Number(r.id),
    name: r.name,
    description: r.description,
    fundSize: r.fund_size,
    grossMOIC: r.gross_moic,
    netIRR: r.net_irr,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getScenario(id: number): Promise<ScenarioRecord | null> {
  await ready();
  const db = await getClient();
  const res = await db.execute({ sql: "SELECT * FROM scenarios WHERE id = ?", args: [id] });
  const row = res.rows[0] as unknown as DbRow | undefined;
  return row ? toRecord(row) : null;
}

export async function createScenario(name: string, description: string, model: FundModel): Promise<ScenarioRecord> {
  await ready();
  const db = await getClient();
  const h = headline(model);
  const now = new Date().toISOString();
  const res = await db.execute({
    sql: `INSERT INTO scenarios (name, description, model_json, fund_size, gross_moic, net_irr, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [name, description, JSON.stringify(model), h.fundSize, h.grossMOIC, isFinite(h.netIRR) ? h.netIRR : 0, now, now],
  });
  const id = Number(res.lastInsertRowid);
  return (await getScenario(id))!;
}

export async function updateScenario(
  id: number,
  fields: { name?: string; description?: string; model?: FundModel }
): Promise<ScenarioRecord | null> {
  const existing = await getScenario(id);
  if (!existing) return null;
  const db = await getClient();
  const name = fields.name ?? existing.name;
  const description = fields.description ?? existing.description;
  const model = fields.model ?? existing.model;
  const h = headline(model);
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE scenarios SET name = ?, description = ?, model_json = ?, fund_size = ?, gross_moic = ?, net_irr = ?, updated_at = ? WHERE id = ?`,
    args: [name, description, JSON.stringify(model), h.fundSize, h.grossMOIC, isFinite(h.netIRR) ? h.netIRR : 0, now, id],
  });
  return getScenario(id);
}

export async function deleteScenario(id: number): Promise<boolean> {
  await ready();
  const db = await getClient();
  const res = await db.execute({ sql: "DELETE FROM scenarios WHERE id = ?", args: [id] });
  return res.rowsAffected > 0;
}

export async function duplicateScenario(id: number, newName?: string): Promise<ScenarioRecord | null> {
  const existing = await getScenario(id);
  if (!existing) return null;
  return createScenario(newName ?? `${existing.name} (copy)`, existing.description, existing.model);
}
