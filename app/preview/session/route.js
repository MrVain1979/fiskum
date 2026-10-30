export const dynamic = "force-dynamic";
const gone = () =>
  new Response("Bruk Live Preview i /studio.", {
    status: 410,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
export const GET = gone;
export const POST = gone;
