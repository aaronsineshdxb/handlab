import { NextResponse } from "next/server";
import { teacherState } from "@/lib/classroom/store";

export const dynamic = "force-dynamic";

/** Teacher roster poll: GET ?code=…&token=… → ClassState. */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const result = teacherState(
    url.searchParams.get("code"),
    url.searchParams.get("token"),
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.state);
}
