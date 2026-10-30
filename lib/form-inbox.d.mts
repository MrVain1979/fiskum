import type { IncomingMessage, ServerResponse } from 'node:http';

export interface FormDefinition {
  title: string;
  /** Email address or the 32-character FormSubmit alias supplied after activation. */
  recipient: string;
  cc?: string;
  successPath: string;
  allowedFields: string[];
  requiredFields: string[];
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
  fetch?: typeof globalThis.fetch;
  /** Defaults to process.env.VERCEL_URL. Only the exact *.vercel.app host is allowed. */
  vercelUrl?: string;
  /** Defaults to VERCEL_PROJECT_PRODUCTION_URL, restricted to an exact HTTPS *.vercel.app host. */
  productionUrl?: string;
  /** Defaults to process.env.NODE_ENV. localhost is allowed outside production only. */
  environment?: string;
}

export const MAX_BODY_BYTES: number;
export function handleFormRequest(request: Request, config: FormInboxConfig, dependencies?: FormInboxDependencies): Promise<Response>;
export function handleNodeFormRequest(req: IncomingMessage & { body?: unknown }, res: ServerResponse, config: FormInboxConfig, dependencies?: FormInboxDependencies): Promise<void>;
