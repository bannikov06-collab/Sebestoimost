import { DOCUMENT_CATEGORIES, isDocumentCategory } from "../../lib/documentCategories";

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

export async function POST(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    if (!runtime.BUCKET) return Response.json({ error: "Хранилище документов не подключено" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    const projectKey = String(form.get("projectKey") ?? "").trim();
    const docType = String(form.get("docType") ?? "").trim();
    const category = String(form.get("category") ?? "document").trim();
    const snapshot = String(form.get("snapshot") ?? "{}");
    if (!(file instanceof File) || !projectKey || !docType) return Response.json({ error: "Укажите проект, тип документа и файл" }, { status: 400 });
    const key = `projects/${encodeURIComponent(projectKey)}/${docType}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]+/g, "_")}`;
    await runtime.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    let captured: unknown = {};
    try { captured = JSON.parse(snapshot); } catch { captured = {}; }
    const payload = { fileName: file.name, size: file.size, contentType: file.type, storageKey: key, docType, snapshot: captured };
    if (!isDocumentCategory(category)) return Response.json({ error: "Некорректная категория документа" }, { status: 400 });
    const row = await runtime.DB.prepare("INSERT INTO workspace_records (category, project_key, entity_key, payload_json) VALUES (?, ?, ?, ?) RETURNING id, created_at AS createdAt")
      .bind(category, projectKey, docType, JSON.stringify(payload)).first();
    return Response.json({ record: { ...row, category, projectKey, entityKey: docType, payload } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка загрузки" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const runtime = await bindings();
    if (!runtime.BUCKET) return new Response("Хранилище не подключено", { status: 503 });
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!key.startsWith("projects/")) return new Response("Некорректный ключ", { status: 400 });
    const object = await runtime.BUCKET.get(key);
    if (!object) return new Response("Файл не найден", { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "content-disposition": "attachment" } });
  } catch {
    return new Response("Ошибка чтения документа", { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureTable();
    const runtime = await bindings();
    if (!runtime.BUCKET) return Response.json({ error: "Хранилище документов не подключено" }, { status: 503 });
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const category = url.searchParams.get("category")?.trim() ?? "";
    const projectKey = url.searchParams.get("project")?.trim() ?? "";
    const docType = url.searchParams.get("docType")?.trim() ?? "";
    let result;
    if (Number.isInteger(id) && id > 0) {
      const placeholders = DOCUMENT_CATEGORIES.map(() => "?").join(",");
      result = await runtime.DB.prepare(`SELECT id, payload_json AS payloadJson FROM workspace_records WHERE id = ? AND category IN (${placeholders})`).bind(id, ...DOCUMENT_CATEGORIES).all();
    } else if (category && projectKey && docType) {
      result = await runtime.DB.prepare("SELECT id, payload_json AS payloadJson FROM workspace_records WHERE category = ? AND project_key = ? AND entity_key = ?").bind(category, projectKey, docType).all();
    } else {
      return Response.json({ error: "Укажите документ для удаления" }, { status: 400 });
    }
    const records = result.results ?? [];
    for (const record of records) {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(String((record as Record<string, unknown>).payloadJson ?? "{}")); } catch { payload = {}; }
      const storageKey = String(payload.storageKey ?? "");
      if (storageKey.startsWith("projects/")) await runtime.BUCKET.delete(storageKey);
    }
    if (records.length) {
      const ids = (records as Record<string, unknown>[]).map((record) => Number(record.id)).filter((value: number) => Number.isInteger(value));
      await runtime.DB.batch(ids.map((recordId: number) => runtime.DB.prepare("DELETE FROM workspace_records WHERE id = ?").bind(recordId)));
    }
    return Response.json({ deleted: records.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка удаления документа" }, { status: 500 });
  }
}
