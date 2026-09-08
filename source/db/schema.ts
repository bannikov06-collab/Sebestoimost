import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const calculations = sqliteTable("calculations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectName: text("project_name").notNull(),
  sectionName: text("section_name").notNull(),
  sectionLength: integer("section_length").notNull(),
  quantity: integer("quantity").notNull(),
  materialCost: real("material_cost").notNull(),
  laborCost: real("labor_cost").notNull(),
  utilityCost: real("utility_cost").notNull(),
  unitCost: real("unit_cost").notNull(),
  totalCost: real("total_cost").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assignmentHistory = sqliteTable("assignment_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectName: text("project_name").notNull(),
  scope: text("scope").notNull(),
  elementKey: text("element_key").notNull().default(""),
  responsible: text("responsible").notNull(),
  previousResponsible: text("previous_responsible").notNull().default(""),
  changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workspaceRecords = sqliteTable("workspace_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  projectKey: text("project_key").notNull().default(""),
  entityKey: text("entity_key").notNull().default(""),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
