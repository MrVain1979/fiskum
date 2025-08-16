import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  draftMode().enable();
  const url = new URL("/", req.nextUrl);
  return NextResponse.redirect(url);
}
