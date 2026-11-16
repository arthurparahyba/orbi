import type { ApiError } from '@orbi/contracts';

/**
 * Talking to the local runtime. In the browser/dev the Vite proxy serves it on
 * the same origin; inside the packaged Tauri app the page is tauri://localhost,
 * so requests go to the runtime's loopback address.
 */
const inTauri = typeof location !== 'undefined' && (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost');
export const RUNTIME_URL: string = import.meta.env.VITE_RUNTIME_URL ?? (inTauri ? 'http://127.0.0.1:3000' : '');

export const agentUrl = (conversationId: string) => `${RUNTIME_URL}/agents/orbi/${encodeURIComponent(conversationId)}`;
/** Configuration chats (`config:…`) have their own agent in the runtime (agents/configurador.ts). */
export const configAgentUrl = (conversationId: string) => `${RUNTIME_URL}/agents/configurador/${encodeURIComponent(conversationId)}`;
export const CODE_AGENTS_CHAT = 'config:agentes-de-codigo';
export const isConfigChat = (conversationId: string) => conversationId.startsWith('config:');

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RUNTIME_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // The runtime answers every error as ApiError ({ error: { code, message } }).
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as ApiError).error.message ?? text;
    } catch {
      /* not JSON: keep the text */
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

