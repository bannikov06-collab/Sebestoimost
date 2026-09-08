import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { calculations } from "../../../db/schema";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(calculations).orderBy(desc(calculations.createdAt), desc(calculations.id)).limit(100);
    return Response.json({ calculations: rows });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ошибка базы" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const p = await request.json() as Record<string, unknown>;
    const projectName = String(p.projectName ?? "").trim();
    if (!projectName) return Response.json({ error: "Укажите проект" }, { status: 400 });
    const values = {
      projectName, sectionName: String(p.sectionName ?? ""), sectionLength: Number(p.sectionLength), quantity: Number(p.quantity),
      materialCost: Number(p.materialCost), laborCost: Number(p.laborCost), utilityCost: Number(p.utilityCost), unitCost: Number(p.unitCost), totalCost: Number(p.totalCost),
    };
    if (Object.entries(values).some(([k,v]) => k !== "projectName" && k !== "sectionName" && !Number.isFinite(v))) return Response.json({ error: "Некорректные данные" }, { status: 400 });
    const db = await getDb();
    const [row] = await db.insert(calculations).values(values).returning();
    return Response.json({ calculation: row }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 500 }); }
}
