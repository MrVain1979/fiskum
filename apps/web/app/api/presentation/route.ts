import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const dm = await draftMode();
  dm.enable();
  const url = new URL("/", req.nextUrl);
  return NextResponse.redirect(url);
}
