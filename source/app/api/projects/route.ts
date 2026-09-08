async function bindings() {
  return (await import("cloudflare:workers")).env;
}

async function ensureTable() {
  const runtime = await bindings();
  await runtime.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    category TEXT NOT NULL,
    project_key TEXT NOT NULL DEFAULT '',
    entity_key TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`).run();
}

export async function DELETE(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    const projectKey = new URL(request.url).searchParams.get("project")?.trim() ?? "";
    if (!projectKey) return Response.json({ error: "Не указан проект" }, { status: 400 });
    const result = await runtime.DB.prepare("SELECT id, payload_json AS payloadJson FROM workspace_records WHERE project_key = ? OR (category = 'project' AND entity_key = ?)").bind(projectKey, projectKey).all();
    const records = result.results ?? [];
    if (runtime.BUCKET) {
      for (const record of records) {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(String((record as Record<string, unknown>).payloadJson ?? "{}")); } catch { payload = {}; }
        const storageKey = String(payload.storageKey ?? "");
        if (storageKey.startsWith("projects/")) await runtime.BUCKET.delete(storageKey);
      }
    }
    await runtime.DB.batch([
      runtime.DB.prepare("DELETE FROM workspace_records WHERE project_key = ?").bind(projectKey),
      runtime.DB.prepare("DELETE FROM workspace_records WHERE category = 'project' AND entity_key = ?").bind(projectKey),
    ]);
    return Response.json({ deleted: records.length, projectKey });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка удаления проекта" }, { status: 500 });
  }
}
