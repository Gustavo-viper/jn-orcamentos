/**
 * Testes de integração da API: banco PostgreSQL (PGlite) em memória, sem dados reais.
 * Cobrem autenticação, permissões, cadastros, cálculo no servidor, portal do cliente,
 * ordens de serviço, estoque, financeiro e as garantias da sincronização.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.PGLITE_MEMORY = 'true';
process.env.NODE_ENV = 'test';
process.env.BACKUP_DIR = `${process.env.TEMP ?? '/tmp'}/jn-test-backups-${Date.now()}`;

let app: Express;
let admin: ReturnType<typeof request.agent>;
const H = { 'X-JN-Client': '1' };
const id = () => randomUUID();
let opSeq = 0;
const op = (o: Record<string, unknown>) => ({ opId: `op-${Date.now()}-${++opSeq}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ...o });

async function pushOps(agent: ReturnType<typeof request.agent>, ops: unknown[]) {
  const r = await agent.post('/api/sync/push').set(H).send({ ops });
  expect(r.status).toBe(200);
  return r.body.results as { ok: boolean; error?: string; duplicate?: boolean; records?: { table: string; record: Record<string, unknown> }[] }[];
}
const rec = (res: { records?: { table: string; record: Record<string, unknown> }[] }, table: string) => res.records?.find((r) => r.table === table)?.record;

const ids = { placa: id(), massa: id(), forro: id(), client: id(), quote: id(), job: id() };

beforeAll(async () => {
  const { migrate } = await import('../src/db/client.js');
  const { ensureSettings } = await import('../src/services/maintenance.js');
  const { createApp } = await import('../src/app.js');
  await migrate();
  await ensureSettings();
  app = createApp();
  admin = request.agent(app);
}, 60_000);

describe('autenticação', () => {
  it('bloqueia páginas internas sem sessão', async () => {
    expect((await request(app).get('/api/sync/pull')).status).toBe(401);
  });
  it('exige cabeçalho anti-CSRF em escritas', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'a', password: 'b' })).status).toBe(403);
  });
  it('configura o primeiro administrador uma única vez', async () => {
    expect((await request(app).get('/api/auth/setup-status')).body.needsSetup).toBe(true);
    const r = await admin.post('/api/auth/setup').set(H).send({ name: 'Admin Teste', email: 'admin@teste.local', password: 'senhaForte1' });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe('admin');
    const again = await request(app).post('/api/auth/setup').set(H).send({ name: 'Xavier', email: 'x@teste.local', password: 'senhaForte1' });
    expect(again.status).toBe(409);
  });
  it('rejeita senha incorreta e aceita a correta', async () => {
    expect((await request(app).post('/api/auth/login').set(H).send({ email: 'admin@teste.local', password: 'errada123' })).status).toBe(401);
    const ok = await request(app).post('/api/auth/login').set(H).send({ email: 'ADMIN@teste.local', password: 'senhaForte1' });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  });
});

describe('cadastros e cálculo no servidor', () => {
  it('cadastra produtos, serviço e cliente', async () => {
    const res = await pushOps(admin, [
      op({ type: 'upsert', table: 'products', id: ids.placa, baseVersion: null, data: { name: 'Placa teste 1,20×1,80', category: 'placas', unit: 'un', unitCost: 3000, plateArea: 2.16, indivisible: true, minStock: 5 } }),
      op({ type: 'upsert', table: 'products', id: ids.massa, baseVersion: null, data: { name: 'Massa teste', category: 'massa', unit: 'kg', unitCost: 500, indivisible: false } }),
      op({ type: 'upsert', table: 'services', id: ids.forro, baseVersion: null, data: { name: 'Forro teste', drywall: true, measurementType: 'm2', laborPrice: 4000, chargeUnit: 'm²', materials: [{ productId: ids.placa, consumption: 1 }, { productId: ids.massa, consumption: 0.5 }] } }),
      op({ type: 'upsert', table: 'clients', id: ids.client, baseVersion: null, data: { name: 'Cliente Teste', document: '529.982.247-25', city: 'Cidade Teste', state: 'SP', whatsapp: '11999990000' } }),
    ]);
    expect(res.map((r) => r.error ?? 'ok')).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(rec(res[2], 'services')!.materials).toHaveLength(2);
  });

  it('valida dados no backend (CPF inválido, placa sem área)', async () => {
    const res = await pushOps(admin, [
      op({ type: 'upsert', table: 'clients', id: id(), baseVersion: null, data: { name: 'Cliente X', document: '111.111.111-11' } }),
      op({ type: 'upsert', table: 'products', id: id(), baseVersion: null, data: { name: 'Placa sem área', category: 'placas', unit: 'un', unitCost: 100 } }),
    ]);
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toMatch(/CPF\/CNPJ/);
    expect(res[1].ok).toBe(false);
  });

  it('recalcula o orçamento no servidor, ignorando valores enviados pelo cliente', async () => {
    const res = await pushOps(admin, [
      op({
        type: 'upsert', table: 'quotes', id: ids.quote, baseVersion: null,
        data: {
          clientId: ids.client, status: 'draft', issueDate: '2026-11-06', validUntil: '2099-12-31', marginPct: 20, marginOnLabor: true,
          discountType: 'none', discountValue: 0, installments: [{ label: 'Entrada', pct: 50 }, { label: 'Conclusão', pct: 50 }],
          environments: [{ id: id(), name: 'Sala', serviceId: ids.forro, width: 4, length: 5, height: 2.8, wastePct: 10, deductions: [{ id: id(), label: 'Porta', width: 0.8, length: 2.1, quantity: 1 }] }],
          total: 1, // valor forjado — deve ser ignorado
        },
      }),
    ]);
    expect(res[0].error).toBeUndefined();
    const q = rec(res[0], 'quotes')!;
    // 18,32 m²: placas ceil(18,32×1,1/2,16)=10 → 300,00; massa 10,076 kg → 50,38; MO 732,80
    const cost = 30000 + 5038 + 73280;
    expect(q.total).toBe(cost + Math.round(cost * 0.2));
    expect(q.number).toBe(1);
    expect((q.environments as unknown[]).length).toBe(1);
  });

  it('não permite desconto maior que o valor ao gerar', async () => {
    const res = await pushOps(admin, [op({ type: 'upsert', table: 'quotes', id: ids.quote, baseVersion: null, data: { status: 'pending', discountType: 'value', discountValue: 999_999_99 } })]);
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toMatch(/desconto/i);
  });

  it('gera o orçamento (pendente)', async () => {
    const res = await pushOps(admin, [op({ type: 'upsert', table: 'quotes', id: ids.quote, baseVersion: null, data: { status: 'pending', discountType: 'pct', discountValue: 5 } })]);
    expect(res[0].error).toBeUndefined();
    expect(rec(res[0], 'quotes')!.status).toBe('pending');
  });
});

describe('sincronização', () => {
  it('operações são idempotentes (reenvio não duplica)', async () => {
    const o = op({ type: 'upsert', table: 'clients', id: id(), baseVersion: null, data: { name: 'Cliente Idempotente' } });
    const a = await pushOps(admin, [o]);
    const b = await pushOps(admin, [o]);
    expect(a[0].ok).toBe(true);
    expect(b[0].duplicate).toBe(true);
    const pull = await admin.get('/api/sync/pull?cursor=0&limit=1000');
    expect(pull.body.changes.filter((c: { record: { name?: string } }) => c.record.name === 'Cliente Idempotente')).toHaveLength(1);
  });

  it('pull é incremental e paginado por cursor', async () => {
    const all = await admin.get('/api/sync/pull?cursor=0&limit=3');
    expect(all.body.changes).toHaveLength(3);
    expect(all.body.hasMore).toBe(true);
    const next = await admin.get(`/api/sync/pull?cursor=${all.body.cursor}&limit=1000`);
    const firstIds = new Set(all.body.changes.map((c: { record: { id: string } }) => c.record.id));
    expect(next.body.changes.some((c: { record: { id: string; seq: number } }) => firstIds.has(c.record.id) && c.record.seq <= all.body.cursor)).toBe(false);
    const end = await admin.get(`/api/sync/pull?cursor=${next.body.cursor}`);
    expect(end.body.changes).toHaveLength(0);
  });

  it('conflito: mescla por campo sem perder alterações de outro usuário', async () => {
    const cid = id();
    await pushOps(admin, [op({ type: 'upsert', table: 'clients', id: cid, baseVersion: null, data: { name: 'Conflito', phone: '1111' } })]);
    // usuário A altera telefone (versão 1 → 2)
    await pushOps(admin, [op({ type: 'upsert', table: 'clients', id: cid, baseVersion: 1, data: { phone: '2222' } })]);
    // usuário B, offline, alterou a cidade baseado na versão 1
    const r = await pushOps(admin, [op({ type: 'upsert', table: 'clients', id: cid, baseVersion: 1, data: { city: 'Nova Cidade' } })]);
    const c = rec(r[0], 'clients')!;
    expect(c.phone).toBe('2222');
    expect(c.city).toBe('Nova Cidade');
    expect(c.version).toBe(3);
  });

  it('dados vazios não sobrescrevem dados completos', async () => {
    const r = await pushOps(admin, [op({ type: 'upsert', table: 'clients', id: ids.client, baseVersion: null, data: { name: '' } })]);
    expect(r[0].ok).toBe(false);
    expect(rec(r[0], 'clients')!.name).toBe('Cliente Teste'); // estado do servidor devolvido para reverter
  });

  it('exclusão é lógica e propagada como marca de exclusão', async () => {
    const cid = id();
    await pushOps(admin, [op({ type: 'upsert', table: 'clients', id: cid, baseVersion: null, data: { name: 'Para excluir' } })]);
    const r = await pushOps(admin, [op({ type: 'delete', table: 'clients', id: cid })]);
    expect(rec(r[0], 'clients')!.deletedAt).toBeTruthy();
  });

  it('não exclui cliente com orçamentos vinculados', async () => {
    const r = await pushOps(admin, [op({ type: 'delete', table: 'clients', id: ids.client })]);
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toMatch(/Inativo/);
  });
});

describe('portal do cliente', () => {
  let token = '';
  it('gera link seguro e exibe somente dados comerciais', async () => {
    token = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('base64url');
    const r = await pushOps(admin, [op({ type: 'command', name: 'quote.portalLink', payload: { quoteId: ids.quote, token } })]);
    expect(r[0].ok).toBe(true);
    const v = await request(app).get(`/api/portal/${token}`);
    expect(v.status).toBe(200);
    expect(v.body.client.name).toBe('Cliente Teste');
    const json = JSON.stringify(v.body);
    expect(json).not.toMatch(/unitCost|totalCost|marginAmount|estimatedProfit|laborCost/);
  });
  it('token inválido não revela nada', async () => {
    expect((await request(app).get(`/api/portal/${'a'.repeat(43)}`)).status).toBe(404);
  });
  it('cliente aprova e o painel é atualizado', async () => {
    const d = await request(app).post(`/api/portal/${token}/decision`).send({ decision: 'approve', name: 'Cliente Teste', message: 'Pode começar' });
    expect(d.status).toBe(200);
    const again = await request(app).post(`/api/portal/${token}/decision`).send({ decision: 'refuse' });
    expect(again.status).toBe(409);
    const pull = await admin.get('/api/sync/pull?cursor=0&limit=1000');
    const q = pull.body.changes.find((c: { table: string; record: { id: string } }) => c.table === 'quotes' && c.record.id === ids.quote).record;
    expect(q.status).toBe('approved');
    expect(q.decidedBy).toMatch(/portal/);
    expect(pull.body.changes.some((c: { table: string; record: { type: string } }) => c.table === 'portalEvents' && c.record.type === 'approved')).toBe(true);
  });
  it('orçamento aprovado fica bloqueado para edição', async () => {
    const r = await pushOps(admin, [op({ type: 'upsert', table: 'quotes', id: ids.quote, baseVersion: null, data: { notes: 'x' } })]);
    expect(r[0].error).toMatch(/Duplique/);
  });
});

describe('financeiro', () => {
  it('cria contas a receber sem duplicar em reprocessamento', async () => {
    const a = await pushOps(admin, [op({ type: 'command', name: 'quote.createReceivables', payload: { quoteId: ids.quote } })]);
    const b = await pushOps(admin, [op({ type: 'command', name: 'quote.createReceivables', payload: { quoteId: ids.quote } })]);
    expect(a[0].records!.filter((r) => r.table === 'financeEntries')).toHaveLength(2);
    expect(b[0].records ?? []).toHaveLength(0);
    const pull = await admin.get('/api/sync/pull?cursor=0&limit=1000');
    const entries = pull.body.changes.filter((c: { table: string }) => c.table === 'financeEntries');
    expect(entries).toHaveLength(2);
    const total = entries.reduce((sum: number, e: { record: { amount: number } }) => sum + e.record.amount, 0);
    const q = pull.body.changes.find((c: { table: string; record: { id: string } }) => c.table === 'quotes' && c.record.id === ids.quote).record;
    expect(total).toBe(q.total);
    expect(entries.every((e: { record: { status: string } }) => e.record.status === 'pending')).toBe(true); // nada recebido sem confirmação
  });

  it('registra pagamento parcial e total, sem ultrapassar o saldo', async () => {
    const entry = id();
    await pushOps(admin, [op({ type: 'upsert', table: 'financeEntries', id: entry, baseVersion: null, data: { kind: 'in', category: 'outros_recebimentos', description: 'Teste', amount: 10000, dueDate: '2026-11-10' } })]);
    const p1 = await pushOps(admin, [op({ type: 'command', name: 'finance.pay', payload: { entryId: entry, paymentId: id(), amount: 4000, paidAt: '2026-11-06' } })]);
    expect(rec(p1[0], 'financeEntries')!.status).toBe('pending');
    const over = await pushOps(admin, [op({ type: 'command', name: 'finance.pay', payload: { entryId: entry, paymentId: id(), amount: 7000, paidAt: '2026-11-06' } })]);
    expect(over[0].ok).toBe(false);
    const p2 = await pushOps(admin, [op({ type: 'command', name: 'finance.pay', payload: { entryId: entry, paymentId: id(), paidAt: '2026-11-07' } })]);
    const e = rec(p2[0], 'financeEntries')!;
    expect(e.status).toBe('paid');
    expect(e.paidAmount).toBe(10000);
    const del = await pushOps(admin, [op({ type: 'delete', table: 'financeEntries', id: entry })]);
    expect(del[0].ok).toBe(false);
  });
});

describe('ordens de serviço e estoque', () => {
  it('gera OS a partir do orçamento aprovado (uma única vez)', async () => {
    const r = await pushOps(admin, [op({ type: 'command', name: 'job.fromQuote', payload: { jobId: ids.job, quoteId: ids.quote, team: 'Equipe A' } })]);
    expect(r[0].error).toBeUndefined();
    const job = rec(r[0], 'jobs')!;
    expect(job.number).toBe(1);
    expect((job.materials as { plannedQty: number }[]).find((m) => m.plannedQty === 10)).toBeTruthy();
    const dup = await pushOps(admin, [op({ type: 'command', name: 'job.fromQuote', payload: { jobId: id(), quoteId: ids.quote } })]);
    expect(dup[0].ok).toBe(false);
  });

  it('não permite estoque negativo sem autorização', async () => {
    await pushOps(admin, [op({ type: 'command', name: 'stock.move', payload: { id: id(), productId: ids.placa, type: 'in', quantity: 8, reason: 'Compra' } })]);
    await pushOps(admin, [op({ type: 'command', name: 'job.setStatus', payload: { jobId: ids.job, status: 'in_progress' } })]);
    const r = await pushOps(admin, [op({ type: 'command', name: 'job.consume', payload: { jobId: ids.job, lines: [{ productId: ids.placa, movementId: id(), quantity: 10 }] } })]);
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toMatch(/insuficiente/);
  });

  it('consumo da obra gera saída de estoque e conclusão registra linha do tempo', async () => {
    const mv = id();
    const c = op({ type: 'command', name: 'job.consume', payload: { jobId: ids.job, lines: [{ productId: ids.placa, movementId: mv, quantity: 6 }] } });
    const r = await pushOps(admin, [c]);
    expect(rec(r[0], 'products')!.quantity).toBe(2);
    await pushOps(admin, [c]); // reenvio não baixa de novo
    const done = await pushOps(admin, [op({ type: 'command', name: 'job.complete', payload: { jobId: ids.job, lines: [{ productId: ids.placa, movementId: id(), quantity: 2 }], note: 'Finalizado' } })]);
    const job = rec(done[0], 'jobs')!;
    expect(job.status).toBe('completed');
    expect(job.completedAt).toBeTruthy();
    expect((job.materials as { productId: string; consumedQty: number }[]).find((m) => m.productId === ids.placa)!.consumedQty).toBe(8);
    const pull = await admin.get('/api/sync/pull?cursor=0&limit=1000');
    const prod = pull.body.changes.find((x: { table: string; record: { id: string } }) => x.table === 'products' && x.record.id === ids.placa).record;
    expect(prod.quantity).toBe(0);
    const types = pull.body.changes.filter((x: { table: string }) => x.table === 'jobEvents').map((x: { record: { type: string } }) => x.record.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'started', 'material', 'completed']));
  });
});

describe('permissões', () => {
  let emp: ReturnType<typeof request.agent>;
  let empId = '';
  it('administrador cadastra funcionário com permissões limitadas', async () => {
    const r = await admin.post('/api/users').set(H).send({ name: 'Funcionário', email: 'func@teste.local', password: 'senhaFunc1', role: 'employee', permissions: { clients: { view: true, create: true }, quotes: { view: true } } });
    expect(r.status).toBe(200);
    empId = r.body.user.id;
    emp = request.agent(app);
    expect((await emp.post('/api/auth/login').set(H).send({ email: 'func@teste.local', password: 'senhaFunc1' })).status).toBe(200);
  });
  it('funcionário não recebe dados financeiros na sincronização', async () => {
    const pull = await emp.get('/api/sync/pull?cursor=0&limit=1000');
    const tables = new Set(pull.body.changes.map((c: { table: string }) => c.table));
    expect(tables.has('financeEntries')).toBe(false);
    expect(tables.has('clients')).toBe(true);
  });
  it('funcionário não pode excluir nem alterar o que não tem permissão', async () => {
    const r = await pushOps(emp, [
      op({ type: 'delete', table: 'clients', id: ids.client }),
      op({ type: 'upsert', table: 'clients', id: ids.client, baseVersion: null, data: { phone: '000' } }),
      op({ type: 'upsert', table: 'clients', id: id(), baseVersion: null, data: { name: 'Novo pelo funcionário' } }),
    ]);
    expect(r.map((x) => x.ok)).toEqual([false, false, true]);
    expect((await emp.get('/api/users')).status).toBe(403);
  });
  it('usuário desativado perde o acesso imediatamente', async () => {
    await admin.patch(`/api/users/${empId}`).set(H).send({ active: false });
    expect((await emp.get('/api/sync/pull')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set(H).send({ email: 'func@teste.local', password: 'senhaFunc1' })).status).toBe(403);
  });
  it('não permite remover o último administrador', async () => {
    const me = await admin.get('/api/auth/me');
    expect((await admin.patch(`/api/users/${me.body.user.id}`).set(H).send({ active: false })).status).toBe(409);
  });
});

describe('cadastro pela tela de login', () => {
  it('exige o código de cadastro e cria administrador', async () => {
    process.env.SIGNUP_CODE = 'codigo-teste-123';
    const st = await request(app).get('/api/auth/setup-status');
    expect(st.body.signupEnabled).toBe(true);
    const wrong = await request(app).post('/api/auth/register').set(H).send({ name: 'Pessoa Teste', email: 'nova@teste.local', password: 'senhaNova1', code: 'errado' });
    expect(wrong.status).toBe(403);
    const ok = request.agent(app);
    const r = await ok.post('/api/auth/register').set(H).send({ name: 'Pessoa Teste', email: 'nova@teste.local', password: 'senhaNova1', code: 'CODIGO-TESTE-123' });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe('admin');
    expect((await ok.get('/api/sync/pull')).status).toBe(200); // já entra logado
    const dup = await request(app).post('/api/auth/register').set(H).send({ name: 'Outra', email: 'NOVA@teste.local', password: 'senhaNova1', code: 'codigo-teste-123' });
    expect(dup.status).toBe(409);
  });
  it('sem código configurado o cadastro fica desativado', async () => {
    delete process.env.SIGNUP_CODE;
    delete process.env.APP_ENROLLMENT_CODE;
    expect((await request(app).get('/api/auth/setup-status')).body.signupEnabled).toBe(false);
    const r = await request(app).post('/api/auth/register').set(H).send({ name: 'Pessoa X', email: 'x2@teste.local', password: 'senhaNova1', code: 'qualquer' });
    expect(r.status).toBe(403);
  });
});

describe('backup', () => {
  it('cria backup e restauração exige confirmação explícita', async () => {
    const b = await admin.post('/api/admin/backups').set(H).send({});
    expect(b.status).toBe(200);
    const no = await admin.post('/api/admin/restore').set(H).send({ backupName: b.body.name, confirm: 'sim' });
    expect(no.status).toBe(400);
    const yes = await admin.post('/api/admin/restore').set(H).send({ backupName: b.body.name, confirm: 'RESTAURAR' });
    expect(yes.status).toBe(200);
    expect(yes.body.safetyBackup).toMatch(/pre-restauracao/);
    // nada foi duplicado nem apagado
    expect(Object.values(yes.body.inserted as Record<string, number>).every((n) => n === 0)).toBe(true);
  });
});
