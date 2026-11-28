import { NextResponse } from "next/server";
import { recordProgress } from "@/lib/classroom/store";

export const dynamic = "force-dynamic";

/** Student progress upload: POST { code, studentId, entry }. Best-effort
 *  from the client; still validated fully here. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const result = recordProgress(b.code, b.studentId, b.entry);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true });
}
