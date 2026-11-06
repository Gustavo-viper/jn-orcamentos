/**
 * Barramento de eventos em memória: avisa os clientes conectados (SSE)
 * que há alterações novas para sincronizar.
 */
import type { Response } from 'express';

const clients = new Set<Response>();

export function addListener(res: Response) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

let pending: NodeJS.Timeout | null = null;
/** Notifica (com pequeno agrupamento) que dados mudaram. */
export function notifyChange() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    for (const res of clients) {
      try {
        res.write(`event: change\ndata: ${Date.now()}\n\n`);
      } catch {
        clients.delete(res);
      }
    }
  }, 150);
}

setInterval(() => {
  for (const res of clients) {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}, 25_000).unref();

export const listenerCount = () => clients.size;
