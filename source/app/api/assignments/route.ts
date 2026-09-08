import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { assignmentHistory } from "../../../db/schema";

const allowedScopes = new Set(["PO", "KO_ORDER", "KO_ELEMENT", "TO_TECHNOLOGY", "TO_NORMS", "TO_TOOLING"]);

export async function GET(request: Request) {
  try {
    const projectName = new URL(request.url).searchParams.get("project")?.trim() ?? "";
    const db = await getDb();
    const rows = projectName
      ? await db.select().from(assignmentHistory).where(eq(assignmentHistory.projectName, projectName)).orderBy(desc(assignmentHistory.changedAt), desc(assignmentHistory.id)).limit(200)
      : [];
    return Response.json({ assignments: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка базы" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const projectName = String(payload.projectName ?? "").trim();
    const scope = String(payload.scope ?? "").trim();
    const elementKey = String(payload.elementKey ?? "").trim();
    const responsible = String(payload.responsible ?? "").trim();
    if (!projectName || !responsible || !allowedScopes.has(scope)) return Response.json({ error: "Заполните проект, роль и ответственного" }, { status: 400 });
    const db = await getDb();
    const [previous] = await db.select().from(assignmentHistory).where(and(eq(assignmentHistory.projectName, projectName), eq(assignmentHistory.scope, scope), eq(assignmentHistory.elementKey, elementKey))).orderBy(desc(assignmentHistory.changedAt), desc(assignmentHistory.id)).limit(1);
    const [row] = await db.insert(assignmentHistory).values({ projectName, scope, elementKey, responsible, previousResponsible: previous?.responsible ?? "" }).returning();
    return Response.json({ assignment: row }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 500 });
  }
}
