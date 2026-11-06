export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Falha de rede (sem internet / servidor inacessível). */
export class NetworkError extends Error {
  constructor() {
    super('Sem conexão com o servidor.');
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: { 'X-JN-Client': '1', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw res.status >= 502 ? new NetworkError() : new ApiError(res.status, 'Resposta inválida do servidor.');
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new NetworkError();
    throw new ApiError(res.status, (data as { error?: string })?.error ?? `Erro ${res.status}`);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Erro inesperado.';
}
