import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      cached: false,
      last_error: null,
      outlook_cached: false,
      outlook_last_error: null,
    },
    { status: 200 },
  );
}
