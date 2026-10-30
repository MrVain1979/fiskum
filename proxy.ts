import { NextResponse, type NextRequest } from "next/server";

// Next decodes route params before the page entrypoint. Reject malformed
// percent encoding there, without rewriting or changing any valid pathname.
export function proxy(request: NextRequest) {
  try {
    decodeURIComponent(request.nextUrl.pathname);
  } catch {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  return NextResponse.next();
}

// Only encoded paths need this check; valid encodings pass through unchanged.
export const config = { matcher: "/(.*%.*)" };
