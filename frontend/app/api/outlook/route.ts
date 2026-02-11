import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "outlook.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}
