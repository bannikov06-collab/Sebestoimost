import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_name TEXT NOT NULL,
      section_name TEXT NOT NULL,
      section_length INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      material_cost REAL NOT NULL,
      labor_cost REAL NOT NULL,
      utility_cost REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_name TEXT NOT NULL,
      scope TEXT NOT NULL,
      element_key TEXT NOT NULL DEFAULT '',
      responsible TEXT NOT NULL,
      previous_responsible TEXT NOT NULL DEFAULT '',
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS assignment_project_idx ON assignment_history(project_name, changed_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      category TEXT NOT NULL,
      project_key TEXT NOT NULL DEFAULT '',
      entity_key TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS workspace_records_lookup_idx ON workspace_records(category, project_key, entity_key, created_at)"),
  ]);

  return drizzle(env.DB, { schema });
}
