import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const d = await draftMode();
  d.enable();

  const url = new URL("/", request.url);
  return NextResponse.redirect(url);
}
