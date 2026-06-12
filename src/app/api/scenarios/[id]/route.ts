import { NextRequest, NextResponse } from "next/server";
import { getScenario, updateScenario, deleteScenario } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const rec = getScenario(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ scenario: rec });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    const body = await req.json();
    const rec = updateScenario(id, {
      name: body.name,
      description: body.description,
      model: body.model,
    });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ scenario: rec });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const ok = deleteScenario(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
