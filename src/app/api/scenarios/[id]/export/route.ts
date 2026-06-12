import { NextRequest, NextResponse } from "next/server";
import { getScenario } from "@/lib/db";
import { buildScenarioWorkbook, excelFileName, EXCEL_MIME } from "@/lib/excelExport";
import { FundModel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workbookResponse(name: string, model: FundModel) {
  const workbook = buildScenarioWorkbook(name, model);
  const filename = excelFileName(name);
  return new NextResponse(workbook, {
    headers: {
      "Content-Type": EXCEL_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(workbook.length),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const rec = await getScenario(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return workbookResponse(rec.name, rec.model);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" && body.name.trim() ? body.name : `Scenario ${params.id}`;
    const model = body.model as FundModel;
    if (!model?.settings || !model?.construction || !Array.isArray(model.market)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    return workbookResponse(name, model);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
