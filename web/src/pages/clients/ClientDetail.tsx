import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, HardHat, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2, Wallet } from 'lucide-react';
import {
  CLIENT_NOTE_LABEL,
  CLIENT_STATUS_LABEL,
  formatJobNumber,
  formatQuoteNumber,
  type ClientNoteKind,
} from '@jn/shared';
import { deleteRecord, saveRecord, useRecord, useWhere } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtCep, fmtDate, fmtDateTime, fmtDocument, fmtPhone, formatBRL, whatsappLink } from '../../lib/format';
import { FinanceStatusBadge, JobStatusBadge, QuoteStatusBadge } from '../../lib/status';
import { ClientFormModal } from '../../components/ClientForm';
import { ChangeHistory } from '../../components/History';
import { Badge, Button, Card, CardHeader, confirmDialog, EmptyState, KeyValue, LoadingBlock, PageHeader, Select, StatCard, Tabs, Textarea, toast } from '../../components/ui';
import { CLIENT_TONE } from './ClientsList';

export default function ClientDetail() {
  const { id } = useParams();
  const client = useRecord('clients', id);
  const quotes = useWhere('quotes', 'clientId', id);
  const jobs = useWhere('jobs', 'clientId', id);
  const entries = useWhere('financeEntries', 'clientId', id);
  const notes = useWhere('clientNotes', 'clientId', id);
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'quotes' | 'jobs' | 'finance' | 'notes' | 'history'>('quotes');
  const [edit, setEdit] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState<ClientNoteKind>('note');

  const stats = useMemo(() => {
    const q = quotes ?? [];
    const approved = q.filter((x) => x.status === 'approved');
    const contracted = approved.reduce((s, x) => s + x.total, 0);
    const ins = (entries ?? []).filter((e) => e.kind === 'in' && e.status !== 'cancelled');
    const paid = ins.reduce((s, e) => s + e.paidAmount, 0);
    const pending = ins.reduce((s, e) => s + (e.amount - e.paidAmount), 0);
    return { total: q.length, approved: approved.length, refused: q.filter((x) => x.status === 'refused').length, contracted, paid, pending };
  }, [quotes, entries]);

  if (client === undefined) return <LoadingBlock />;
  if (!client || client.deletedAt) return <EmptyState title="Cliente não encontrado" action={<Button onClick={() => navigate('/clientes')}>Voltar</Button>} />;

  const wa = whatsappLink(client.whatsapp || client.phone, `Olá, ${client.name.split(' ')[0]}! Aqui é da J&N Decorações em Gesso.`);
  const address = [client.address && `${client.address}${client.number ? `, ${client.number}` : ''}`, client.complement, client.district, client.city && `${client.city}${client.state ? `/${client.state}` : ''}`, client.cep && `CEP ${fmtCep(client.cep)}`].filter(Boolean).join(' — ');

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Excluir cliente', message: <>Excluir <b>{client.name}</b>? Clientes com orçamentos, obras ou lançamentos não podem ser excluídos — nesse caso, altere a situação para Inativo.</>, danger: true, confirmLabel: 'Excluir' });
    if (!ok) return;
    await deleteRecord('clients', client.id, `Excluir cliente ${client.name}`);
    toast('Exclusão enviada. Se houver vínculos, o servidor recusará e o cliente voltará à lista.');
    navigate('/clientes');
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await saveRecord('clientNotes', uuid(), { clientId: client.id, kind: noteKind, text: noteText.trim(), createdBy: user!.id, createdByName: user!.name }, 'Registrar atendimento');
    setNoteText('');
    toast('Atendimento registrado.');
  };

  const sortedQuotes = [...(quotes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedNotes = [...(notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={
          <Link to="/clientes" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-graphite-800 dark:hover:text-graphite-200">
            <ArrowLeft className="h-4 w-4" /> Clientes
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {client.name}
            <Badge tone={CLIENT_TONE[client.status]}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
          </span>
        }
        subtitle={`Cliente desde ${fmtDate(client.createdAt)}`}
        actions={
          <>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}>
                  WhatsApp
                </Button>
              </a>
            )}
            {can('quotes', 'create') && (
              <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/orcamentos/novo?cliente=${client.id}`)}>
                Novo orçamento
              </Button>
            )}
            {can('clients', 'edit') && (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>
                Editar
              </Button>
            )}
            {can('clients', 'delete') && <Button variant="ghost" size="icon" onClick={remove} aria-label="Excluir cliente"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </>
        }
      />
      {client._syncError && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">Não sincronizado: {client._syncError}. Edite e salve novamente para corrigir.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orçamentos" value={stats.total} hint={`${stats.approved} aprovado(s) · ${stats.refused} recusado(s)`} icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Valor contratado" value={formatBRL(stats.contracted)} icon={<HardHat className="h-4 w-4" />} tone="gold" />
        {can('finance') && <StatCard label="Valores pagos" value={formatBRL(stats.paid)} icon={<Wallet className="h-4 w-4" />} tone="green" />}
        {can('finance') && <StatCard label="Valores pendentes" value={formatBRL(stats.pending)} icon={<Wallet className="h-4 w-4" />} tone="amber" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Informações cadastrais" />
          <dl className="grid gap-4 p-5">
            <KeyValue label="CPF / CNPJ">{client.document && fmtDocument(client.document)}</KeyValue>
            <KeyValue label="Telefone">
              {client.phone && (
                <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${client.phone}`}>
                  <Phone className="h-3.5 w-3.5" /> {fmtPhone(client.phone)}
                </a>
              )}
            </KeyValue>
            <KeyValue label="WhatsApp">{client.whatsapp && fmtPhone(client.whatsapp)}</KeyValue>
            <KeyValue label="E-mail">
              {client.email && (
                <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${client.email}`}>
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </a>
              )}
            </KeyValue>
            <KeyValue label="Endereço">
              {address && (
                <span className="inline-flex gap-1.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {address}
                </span>
              )}
            </KeyValue>
            <KeyValue label="Observações internas">{client.notes && <span className="whitespace-pre-wrap">{client.notes}</span>}</KeyValue>
          </dl>
        </Card>

        <div className="min-w-0">
          <Tabs
            className="mb-3"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'quotes', label: 'Orçamentos', count: quotes?.length },
              { value: 'jobs', label: 'Obras', count: jobs?.length },
              ...(can('finance') ? [{ value: 'finance' as const, label: 'Financeiro', count: entries?.length }] : []),
              { value: 'notes', label: 'Atendimento', count: notes?.length },
              { value: 'history', label: 'Histórico' },
            ]}
          />
          <Card className="overflow-hidden">
            {tab === 'quotes' &&
              (sortedQuotes.length ? (
                <ul className="divide-y divide-graphite-100 dark:divide-white/5">
                  {sortedQuotes.map((q) => (
                    <li key={q.id}>
                      <Link to={`/orcamentos/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-graphite-50 dark:hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{formatQuoteNumber(q.number)} {q.title && <span className="font-normal text-graphite-500">· {q.title}</span>}</div>
                          <div className="text-xs text-graphite-500">{fmtDate(q.issueDate)} · validade {fmtDate(q.validUntil)}</div>
                        </div>
                        <div className="tabular text-right text-sm font-semibold">{formatBRL(q.total)}</div>
                        <QuoteStatusBadge quote={q} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhum orçamento" description="Os orçamentos deste cliente aparecerão aqui." />
              ))}
            {tab === 'jobs' &&
              ((jobs ?? []).length ? (
                <ul className="divide-y divide-graphite-100 dark:divide-white/5">
                  {(jobs ?? []).map((j) => (
                    <li key={j.id}>
                      <Link to={`/obras/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-graphite-50 dark:hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{formatJobNumber(j.number)}</div>
                          <div className="truncate text-xs text-graphite-500">{j.address || j.servicesSummary.split('\n')[0]}</div>
                        </div>
                        <div className="tabular text-sm font-semibold">{formatBRL(j.contractedValue)}</div>
                        <JobStatusBadge status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhuma obra vinculada" />
              ))}
            {tab === 'finance' &&
              ((entries ?? []).length ? (
                <ul className="divide-y divide-graphite-100 dark:divide-white/5">
                  {[...(entries ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{e.description}</div>
                        <div className="text-xs text-graphite-500">Vencimento {fmtDate(e.dueDate)}{e.paidAmount > 0 && ` · pago ${formatBRL(e.paidAmount)}`}</div>
                      </div>
                      <div className={`tabular text-sm font-semibold ${e.kind === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{formatBRL(e.amount)}</div>
                      <FinanceStatusBadge entry={e} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhum lançamento financeiro" />
              ))}
            {tab === 'notes' && (
              <div className="p-4">
                {can('clients', 'edit') && (
                  <div className="mb-5 space-y-2">
                    <div className="flex gap-2">
                      <Select value={noteKind} onChange={(e) => setNoteKind(e.target.value as ClientNoteKind)} className="w-44">
                        {Object.entries(CLIENT_NOTE_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Descreva o atendimento, visita ou combinado com o cliente..." />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={addNote} disabled={!noteText.trim()}>
                        Registrar atendimento
                      </Button>
                    </div>
                  </div>
                )}
                {sortedNotes.length ? (
                  <ol className="space-y-3">
                    {sortedNotes.map((n) => (
                      <li key={n.id} className="rounded-xl bg-graphite-50 p-3 dark:bg-white/[0.03]">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-graphite-500">
                          <Badge tone="blue">{CLIENT_NOTE_LABEL[n.kind]}</Badge>
                          <span>
                            {n.createdByName} · {fmtDateTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-6 text-center text-sm text-graphite-500">Nenhum atendimento registrado.</p>
                )}
              </div>
            )}
            {tab === 'history' && (
              <div className="p-5">
                <ChangeHistory entity="clients" id={client.id} labels={{ name: 'Nome', phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', city: 'Cidade', status: 'Situação', address: 'Endereço', notes: 'Observações' }} />
              </div>
            )}
          </Card>
        </div>
      </div>
      <ClientFormModal open={edit} onClose={() => setEdit(false)} client={client} />
    </div>
  );
}
