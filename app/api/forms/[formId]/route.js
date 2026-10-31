import { handleFormRequest } from "../../../../lib/form-inbox.mjs";
import { formInboxConfig } from "../../../../lib/form-inbox-config.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const config = await formInboxConfig();
    const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
    if (!Object.hasOwn(config.forms, id || ""))
      return Response.json(
        { success: false, message: "Dette skjemaet er ikke aktivert." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return await handleFormRequest(request, config);
  } catch {
    console.error("Form inbox configuration unavailable");
    return Response.json(
      {
        success: false,
        message:
          "Meldingen kunne ikke mottas. Prøv igjen senere eller kontakt oss på e-post.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
