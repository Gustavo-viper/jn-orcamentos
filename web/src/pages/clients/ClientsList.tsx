import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Plus, Users, AlertTriangle } from 'lucide-react';
import { CLIENT_STATUS_LABEL, onlyDigits, type ClientStatus } from '@jn/shared';
import { useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDocument, fmtPhone, normalize, whatsappLink } from '../../lib/format';
import { ClientFormModal } from '../../components/ClientForm';
import { Badge, Button, Card, EmptyState, LoadingBlock, LoadMore, PageHeader, SearchInput, Select, usePaged, type Tone } from '../../components/ui';

export const CLIENT_TONE: Record<ClientStatus, Tone> = { active: 'green', inactive: 'gray', lead: 'blue' };

export default function ClientsList() {
  const clients = useTable('clients');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [params] = useSearchParams();
  const [formOpen, setFormOpen] = useState(() => params.get('novo') === '1');

  const cities = useMemo(() => [...new Set((clients ?? []).map((c) => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [clients]);
  const states = useMemo(() => [...new Set((clients ?? []).map((c) => c.state).filter(Boolean))].sort(), [clients]);

  const filtered = useMemo(() => {
    if (!clients) return undefined;
    const term = normalize(q.trim());
    const digits = onlyDigits(q);
    const list = clients.filter((c) => {
      if (city && c.city !== city) return false;
      if (state && c.state !== state) return false;
      if (status && c.status !== status) return false;
      if (!term) return true;
      return (
        normalize(c.name).includes(term) ||
        normalize(c.email).includes(term) ||
        (digits.length >= 3 && (onlyDigits(c.phone).includes(digits) || onlyDigits(c.whatsapp).includes(digits) || onlyDigits(c.document).includes(digits)))
      );
    });
    list.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
    return list;
  }, [clients, q, city, state, status, sort]);

  const { visible, more, loadMore, total } = usePaged(filtered);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clientes"
        subtitle={clients ? `${clients.length} cadastrado(s) · ${clients.filter((c) => c.status === 'active').length} ativo(s)` : undefined}
        actions={
          can('clients', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              Novo cliente
            </Button>
          )
        }
      />
      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <SearchInput className="col-span-2 md:col-span-2" value={q} onChange={setQ} placeholder="Nome, telefone, CPF/CNPJ ou e-mail" />
          <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filtrar por cidade">
            <option value="">Todas as cidades</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos os estados</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {Object.entries(CLIENT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="name">Nome (A–Z)</option>
          </Select>
        </div>
      </Card>

      {!filtered ? (
        <LoadingBlock />
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={clients?.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={clients?.length ? 'Ajuste a pesquisa ou os filtros.' : 'Cadastre o primeiro cliente para começar a fazer orçamentos.'}
            action={!clients?.length && can('clients', 'create') ? <Button onClick={() => setFormOpen(true)}>Cadastrar cliente</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* desktop */}
          <table className="hidden w-full md:table">
            <thead className="border-b border-graphite-100 bg-graphite-50/60 dark:border-white/5 dark:bg-white/[0.02]">
              <tr>
                <th className="th">Cliente</th>
                <th className="th">Contato</th>
                <th className="th">Cidade</th>
                <th className="th">Cadastro</th>
                <th className="th">Situação</th>
                <th className="th w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
              {visible.map((c) => {
                const wa = whatsappLink(c.whatsapp || c.phone);
                return (
                  <tr key={c.id} className="cursor-pointer transition hover:bg-graphite-50 dark:hover:bg-white/[0.03]" onClick={() => navigate(`/clientes/${c.id}`)}>
                    <td className="td">
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c._syncError && <span title={c._syncError}><AlertTriangle className="h-4 w-4 text-red-500" /></span>}
                      </div>
                      <div className="text-xs text-graphite-500">{c.document ? fmtDocument(c.document) : c.email}</div>
                    </td>
                    <td className="td text-graphite-600 dark:text-graphite-300">{fmtPhone(c.whatsapp || c.phone) || '—'}</td>
                    <td className="td text-graphite-600 dark:text-graphite-300">{c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : '—'}</td>
                    <td className="td text-graphite-500">{fmtDate(c.createdAt)}</td>
                    <td className="td">
                      <Badge tone={CLIENT_TONE[c.status]} dot>
                        {CLIENT_STATUS_LABEL[c.status]}
                      </Badge>
                    </td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-400/10" title="Abrir WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* celular */}
          <ul className="divide-y divide-graphite-100 md:hidden dark:divide-white/5">
            {visible.map((c) => (
              <li key={c.id}>
                <Link to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-graphite-50 dark:active:bg-white/5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-50 text-sm font-semibold text-navy-700 dark:bg-gold-400/10 dark:text-gold-200">{c.name.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="truncate text-xs text-graphite-500">{[fmtPhone(c.whatsapp || c.phone), c.city].filter(Boolean).join(' · ') || 'Sem contato'}</div>
                  </div>
                  <Badge tone={CLIENT_TONE[c.status]}>{CLIENT_STATUS_LABEL[c.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
        </Card>
      )}
      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </div>
  );
}
