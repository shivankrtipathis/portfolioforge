import { NextRequest, NextResponse } from "next/server";
import { listScenarios, createScenario } from "@/lib/db";
import { buildDefaultModel } from "@/lib/defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ scenarios: listScenarios() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name: string = body.name || "Untitled Fund";
    const description: string = body.description || "";
    const model = body.model || buildDefaultModel();
    const rec = createScenario(name, description, model);
    return NextResponse.json({ scenario: rec }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
