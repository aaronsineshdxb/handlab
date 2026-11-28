import { NextResponse } from "next/server";
import { closeSession } from "@/lib/classroom/store";

export const dynamic = "force-dynamic";

/** Teacher ends the class: POST { code, token }. Joins and progress posts
 *  are rejected afterwards; the session file remains for records. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const result = closeSession(b.code, b.token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true });
}
