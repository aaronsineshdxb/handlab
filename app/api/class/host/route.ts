import { NextResponse } from "next/server";
import { isLesson } from "@/lib/lessons/validation";
import { hostSession } from "@/lib/classroom/store";

// Classroom sessions live on the server's filesystem (see lib/classroom/
// store.ts), so route handlers must never be statically optimized.
export const dynamic = "force-dynamic";

/** Validated lessons are far smaller; this only stops a giant raw body from
 *  being parsed before validation. Other routes take small fixed-shape
 *  bodies, so they rely on their field-level validation instead. */
const MAX_BODY_BYTES = 2_000_000;

/** Teacher hosts a class: POST { lesson } → { code, token }. The token is
 *  kept server-side in the session file and client-side on the teacher
 *  machine only; it gates the state/close endpoints. */
export async function POST(req: Request): Promise<NextResponse> {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "lesson JSON too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  let lesson = null;
  if (
    body &&
    typeof body === "object" &&
    "lesson" in body &&
    body.lesson !== null
  ) {
    if (!isLesson(body.lesson)) {
      return NextResponse.json(
        { error: "assigned lesson JSON failed validation" },
        { status: 400 },
      );
    }
    lesson = body.lesson;
  }
  const result = hostSession(lesson);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result, { status: 201 });
}
