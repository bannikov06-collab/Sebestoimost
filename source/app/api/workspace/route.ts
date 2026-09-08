async function bindings() {
  return (await import("cloudflare:workers")).env;
}

async function ensureTable() {
  const runtime = await bindings();
  await runtime.DB.batch([
    runtime.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      category TEXT NOT NULL,
      project_key TEXT NOT NULL DEFAULT '',
      entity_key TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    runtime.DB.prepare("CREATE INDEX IF NOT EXISTS workspace_records_lookup_idx ON workspace_records(category, project_key, entity_key, created_at)"),
  ]);
}

export async function GET(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    const url = new URL(request.url);
    const category = url.searchParams.get("category")?.trim() ?? "";
    const project = url.searchParams.get("project")?.trim() ?? "";
    const clauses: string[] = [];
    const values: string[] = [];
    if (category) { clauses.push("category = ?"); values.push(category); }
    if (project) { clauses.push("project_key = ?"); values.push(project); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const query = runtime.DB.prepare(`SELECT id, category, project_key AS projectKey, entity_key AS entityKey, payload_json AS payloadJson, created_at AS createdAt FROM workspace_records${where} ORDER BY id DESC LIMIT 1000`);
    const result = values.length ? await query.bind(...values).all() : await query.all();
    const records = (result.results as Record<string, unknown>[] ?? []).map((raw: Record<string, unknown>) => {
      let payload: unknown = {};
      try { payload = JSON.parse(String(raw.payloadJson ?? "{}")); } catch { payload = {}; }
      return { id: raw.id, category: raw.category, projectKey: raw.projectKey, entityKey: raw.entityKey, createdAt: raw.createdAt, payload };
    });
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка базы" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    const body = await request.json() as Record<string, unknown>;
    const category = String(body.category ?? "").trim();
    const projectKey = String(body.projectKey ?? "").trim();
    const entityKey = String(body.entityKey ?? "").trim();
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    if (!category) return Response.json({ error: "Не указана категория записи" }, { status: 400 });
    const result = await runtime.DB.prepare("INSERT INTO workspace_records (category, project_key, entity_key, payload_json) VALUES (?, ?, ?, ?) RETURNING id, created_at AS createdAt")
      .bind(category, projectKey, entityKey, JSON.stringify(payload)).first();
    return Response.json({ record: { ...result, category, projectKey, entityKey, payload } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : null;
    if (!Number.isInteger(id) || id <= 0 || !payload) return Response.json({ error: "Укажите запись и данные для обновления" }, { status: 400 });
    const current = await runtime.DB.prepare("SELECT category, project_key AS projectKey, entity_key AS entityKey FROM workspace_records WHERE id = ?").bind(id).first();
    if (!current) return Response.json({ error: "Запись не найдена" }, { status: 404 });
    await runtime.DB.prepare("UPDATE workspace_records SET payload_json = ? WHERE id = ?").bind(JSON.stringify(payload), id).run();
    return Response.json({ record: { id, category: current.category, projectKey: current.projectKey, entityKey: current.entityKey, payload } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (Number.isInteger(id) && id > 0) {
      await runtime.DB.prepare("DELETE FROM workspace_records WHERE id = ?").bind(id).run();
      return Response.json({ deleted: 1 });
    }
    const category = url.searchParams.get("category")?.trim() ?? "";
    const project = url.searchParams.get("project")?.trim() ?? "";
    const entity = url.searchParams.get("entity")?.trim() ?? "";
    if (!category || !entity) return Response.json({ error: "Укажите id либо категорию и объект" }, { status: 400 });
    const statement = project
      ? runtime.DB.prepare("DELETE FROM workspace_records WHERE category = ? AND project_key = ? AND entity_key = ?").bind(category, project, entity)
      : runtime.DB.prepare("DELETE FROM workspace_records WHERE category = ? AND entity_key = ?").bind(category, entity);
    const result = await statement.run();
    return Response.json({ deleted: result.meta?.changes ?? 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка удаления" }, { status: 500 });
  }
}
