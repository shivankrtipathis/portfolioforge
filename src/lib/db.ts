// Database layer — persistence via Node's built-in SQLite (node:sqlite).
// Zero native dependencies. Scenarios store the full FundModel as JSON; the
// table also keeps denormalized headline columns (fund size, MOIC) so the
// scenario list can be queried/sorted without parsing every blob.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { FundModel, ScenarioRecord } from "./types";
import { buildDefaultModel } from "./defaults";
import { computeModel } from "./engine";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "portfolio.db");

// Reuse the connection across Next.js hot reloads in dev.
const g = globalThis as unknown as { __pcDb?: DatabaseSync };

function getDb(): DatabaseSync {
  if (g.__pcDb) return g.__pcDb;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
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
  g.__pcDb = db;
  ensureSeed(db);
  return db;
}

function headline(model: FundModel): { fundSize: number; grossMOIC: number; netIRR: number } {
  try {
    const c = computeModel(model);
    return { fundSize: model.settings.fundSize, grossMOIC: c.metrics.grossMOIC, netIRR: c.metrics.netIRR };
  } catch {
    return { fundSize: model.settings.fundSize, grossMOIC: 0, netIRR: 0 };
  }
}

function ensureSeed(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM scenarios").get() as { n: number };
  if (row.n > 0) return;
  const model = buildDefaultModel();
  const h = headline(model);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scenarios (name, description, model_json, fund_size, gross_moic, net_irr, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "3iP Fund II — Base Case",
    "50-company pre-seed/seed fund. Seeded from the 3iP Fund II construction model.",
    JSON.stringify(model),
    h.fundSize,
    h.grossMOIC,
    isFinite(h.netIRR) ? h.netIRR : 0,
    now,
    now
  );
}

interface Row {
  id: number;
  name: string;
  description: string;
  model_json: string;
  fund_size: number;
  gross_moic: number;
  net_irr: number;
  created_at: string;
  updated_at: string;
}

function toRecord(r: Row): ScenarioRecord {
  return {
    id: r.id,
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

export function listScenarios(): ScenarioSummary[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, description, fund_size, gross_moic, net_irr, created_at, updated_at FROM scenarios ORDER BY updated_at DESC")
    .all() as Omit<Row, "model_json">[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    fundSize: r.fund_size,
    grossMOIC: r.gross_moic,
    netIRR: r.net_irr,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getScenario(id: number): ScenarioRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(id) as Row | undefined;
  return row ? toRecord(row) : null;
}

export function createScenario(name: string, description: string, model: FundModel): ScenarioRecord {
  const db = getDb();
  const h = headline(model);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO scenarios (name, description, model_json, fund_size, gross_moic, net_irr, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, description, JSON.stringify(model), h.fundSize, h.grossMOIC, isFinite(h.netIRR) ? h.netIRR : 0, now, now);
  return getScenario(Number(info.lastInsertRowid))!;
}

export function updateScenario(
  id: number,
  fields: { name?: string; description?: string; model?: FundModel }
): ScenarioRecord | null {
  const db = getDb();
  const existing = getScenario(id);
  if (!existing) return null;
  const name = fields.name ?? existing.name;
  const description = fields.description ?? existing.description;
  const model = fields.model ?? existing.model;
  const h = headline(model);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE scenarios SET name = ?, description = ?, model_json = ?, fund_size = ?, gross_moic = ?, net_irr = ?, updated_at = ? WHERE id = ?`
  ).run(name, description, JSON.stringify(model), h.fundSize, h.grossMOIC, isFinite(h.netIRR) ? h.netIRR : 0, now, id);
  return getScenario(id);
}

export function deleteScenario(id: number): boolean {
  const db = getDb();
  const info = db.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
  return info.changes > 0;
}

export function duplicateScenario(id: number, newName?: string): ScenarioRecord | null {
  const existing = getScenario(id);
  if (!existing) return null;
  return createScenario(newName ?? `${existing.name} (copy)`, existing.description, existing.model);
}
