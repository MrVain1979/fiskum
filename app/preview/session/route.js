import { createClient } from "next-sanity";
import { createPreviewSessionHandlers } from "../../../lib/preview-session.mjs";
import { validateStudioPreviewSecret } from "../../../lib/sanity-preview-secret.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const handlers = createPreviewSessionHandlers({
  verifySecret(config, secret, origin) {
    const client = createClient({ ...config, apiVersion: "2025-02-19", useCdn: false, perspective: "raw" });
    return validateStudioPreviewSecret(client, secret, origin);
  },
});

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
