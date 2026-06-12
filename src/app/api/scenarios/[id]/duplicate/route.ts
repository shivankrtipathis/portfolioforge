import { NextRequest, NextResponse } from "next/server";
import { duplicateScenario } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const rec = await duplicateScenario(id, body.name);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ scenario: rec }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
