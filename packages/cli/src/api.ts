// Single allowed-host HTTP client. The CLI's only outbound network activity
// is reaching the configured API base. No telemetry, no analytics, no
// secondary hosts. The structural test enforces this by grep-asserting that
// no fetch() / https.request call in CLI source targets any other host.

import { EXIT_NETWORK_ERROR } from './exit-codes.js';

export interface GateResult {
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  firedPatterns?: Array<{
    id?: string;
    name?: string;
    severity?: string;
  }>;
  package?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  exitCode: number;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export async function callGate(
  apiBase: string,
  pkg: string,
  timeoutMs: number,
): Promise<ApiResult<GateResult>> {
  const url = `${apiBase}/api/compliance-gate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ package: pkg }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        exitCode: EXIT_NETWORK_ERROR,
        message: `API responded ${res.status} ${res.statusText}`,
      };
    }
    const data = (await res.json()) as GateResult;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted') || msg.includes('abort')) {
      return {
        ok: false,
        exitCode: EXIT_NETWORK_ERROR,
        message: `Network timeout after ${timeoutMs}ms.`,
      };
    }
    return {
      ok: false,
      exitCode: EXIT_NETWORK_ERROR,
      message: `Network error: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
