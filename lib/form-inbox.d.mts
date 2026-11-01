import type { IncomingMessage, ServerResponse } from 'node:http';

export interface FormDefinition {
  title: string;
  /** Email address or the 32-character FormSubmit alias supplied after activation. */
  recipient: string;
  cc?: string;
  successPath: string;
  allowedFields: string[];
  requiredFields: string[];
  /** Exact required values, such as explicit newsletter consent. */
  requiredValues?: Record<string, string>;
  /** False stores only in the private inbox and never prepares email handoff. */
  forwardEmail?: boolean;
  emailField?: string;
  nameFields?: string[];
}

export interface FormInboxConfig {
  projectId: string;
  dataset: string;
  /** Server environment only; never expose as NEXT_PUBLIC_* or VITE_*. */
  token: string;
  siteUrl: string;
  /** Exact additional origins, e.g. https://www.example.no. No paths or wildcards. */
  allowedOrigins?: string[];
  forms: Record<string, FormDefinition>;
}

export interface FormInboxDependencies {
  /** Storage transport only. FormSubmit is posted to by the browser after a durable save. */
  fetch?: typeof globalThis.fetch;
  /** Defaults to process.env.VERCEL_URL. Only the exact *.vercel.app host is allowed. */
  vercelUrl?: string;
  /** Defaults to VERCEL_PROJECT_PRODUCTION_URL, restricted to an exact HTTPS *.vercel.app host. */
  productionUrl?: string;
  /** Defaults to process.env.NODE_ENV. localhost is allowed outside production only. */
  environment?: string;
}

export interface FormSubmitHandoff {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

/** A successful JSON save does not claim that email was sent or delivered. */
export type FormInboxJsonSuccess = {
  success: true;
  delivery: 'handoff_required';
  message: string;
  handoff: FormSubmitHandoff;
} | {
  success: true;
  delivery: 'stored_only';
  message: string;
  replayed: boolean;
};

export const MAX_BODY_BYTES: number;
/** New HTML saves return a native FormSubmit handoff; JSON clients must perform their explicit handoff. */
export function handleFormRequest(request: Request, config: FormInboxConfig, dependencies?: FormInboxDependencies): Promise<Response>;
export function handleNodeFormRequest(req: IncomingMessage & { body?: unknown }, res: ServerResponse, config: FormInboxConfig, dependencies?: FormInboxDependencies): Promise<void>;
