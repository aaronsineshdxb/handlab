import { NextResponse } from "next/server";
import { joinSession } from "@/lib/classroom/store";

export const dynamic = "force-dynamic";

/** Student joins: POST { code, studentId, name } → { studentId, name, lesson }. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const result = joinSession(b.code, b.studentId, b.name);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({
    studentId: result.student.id,
    name: result.student.name,
    lesson: result.session.lesson,
  });
}
