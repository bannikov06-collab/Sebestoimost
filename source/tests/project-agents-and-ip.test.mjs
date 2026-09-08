import assert from "node:assert/strict";
import test from "node:test";
import { detectIpExecution, executionBlockReason, runReadOnlyProjectAgents } from "../app/lib/projectAgents.ts";

const completeRow = {
  rowNumber: "1",
  article: "KLM-S-20-Al-55-4-V3-FE",
  item: "Прямая секция",
  quantity: 1,
  unit: "шт",
  drawingNumber: "132.20.FE.001.000",
  version: "V3",
};

test("explicit 55 article is classified as IP55", () => {
  assert.equal(detectIpExecution(completeRow.article), "IP55");
  assert.equal(executionBlockReason("IP55"), "");
});

test("explicit 68 article is classified as IP68 and blocked", () => {
  assert.equal(detectIpExecution("KLM-S-25-Al-68-4-V3-FE"), "IP68");
  assert.match(executionBlockReason("IP68"), /заблокирован/i);
});

test("conflicting IP55 and IP68 markings are blocked", () => {
  assert.equal(detectIpExecution("KLM-S-20-Al-55-4-V3-FE", "исполнение IP68"), "conflict");
  assert.match(executionBlockReason("conflict"), /конфликт/i);
});

test("unknown execution never falls back to IP55", () => {
  assert.equal(detectIpExecution("КША 140х12х1000"), "unknown");
  assert.match(executionBlockReason("unknown"), /не распознано/i);
});

test("IP68 makes the read-only project audit blocked", () => {
  const report = runReadOnlyProjectAgents([{ ...completeRow, article: "KLM-S-20-Al-68-4-V3-FE" }], {}, "2026-08-24T00:00:00.000Z");
  assert.equal(report.mode, "read-only");
  assert.equal(report.status, "blocked");
  assert.ok(report.summary.blockers > 0);
});

test("complete explicit IP55 row passes without mutation", () => {
  const row = structuredClone(completeRow);
  const report = runReadOnlyProjectAgents([row], {}, "2026-08-24T00:00:00.000Z");
  assert.equal(report.status, "passed");
  assert.deepEqual(row, completeRow);
  assert.equal(report.agents.length, 4);
  assert.ok(report.agents.every((agent) => agent.mode === "read-only"));
});
