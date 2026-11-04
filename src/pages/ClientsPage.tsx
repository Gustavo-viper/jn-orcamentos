import { ClientFormModal, type ClientFormData } from "@/components/ClientForm";
import { Badge, Button, ConfirmModal, EmptyState, GlassCard, Input, PageHeader, Select, Table, Td, Th, Tooltip, clientStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { Client } from "@/types";
import { openWhatsApp } from "@/utils/whatsapp";
import { Calculator, Eye, MessageCircle, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ClientsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { clients, quotes, createClient, updateClient, deleteClient } = useAppStoreShallow((state) => ({ clients: state.clients, quotes: state.quotes, createClient: state.createClient, updateClient: state.updateClient, deleteClient: state.deleteClient }));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | undefined>();
  const [del, setDel] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("novo")) { setEditing(undefined); setFormOpen(true); }
  }, [params]);

  const list = useMemo(
    () => clients.filter((c) => (status === "todos" || c.status === status) && (c.name.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()))),
    [clients, search, status]
  );

  const submit = async (d: ClientFormData) => {
    setBusy(true);
    try {
      if (editing) { await updateClient(editing.id, d); toast.success("Cliente atualizado"); }
      else {
        const c = await createClient(d);
        toast.success("Cliente cadastrado", c.name);
        if (params.get("voltar") === "calculadora") { navigate(`/calculadora?cliente=${c.id}`); return; }
      }
      setFormOpen(false);
      setParams({});
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${clients.length} clientes cadastrados`} actions={<Button variant="gold" icon={Plus} onClick={() => { setEditing(undefined); setFormOpen(true); }}>Novo cliente</Button>} />

      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Buscar por nome, cidade ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos</option><option value="ativo">Ativos</option><option value="prospecto">Prospectos</option><option value="inativo">Inativos</option>
          </Select>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado." description="Cadastre seu primeiro cliente para iniciar os orçamentos." action={<Button variant="gold" icon={Plus} onClick={() => setFormOpen(true)}>+ Novo cliente</Button>} />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {list.map((c) => (
                <div key={c.id} className="glass-subtle rounded-2xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-main">{c.name}</p>
                      <p className="text-xs text-muted">{c.whatsapp} · {c.city}/{c.state}</p>
                    </div>
                    <Badge tone={clientStatusMeta[c.status].tone} dot>{clientStatusMeta[c.status].label}</Badge>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/clientes/${c.id}`)}>Ver</Button>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/calculadora?cliente=${c.id}`)}>Orçamento</Button>
                    <Button size="sm" variant="whatsapp" onClick={() => openWhatsApp(c.whatsapp, `Olá, ${c.name.split(" ")[0]}! Aqui é da J & N Decorações em Gesso.`)}>WhatsApp</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block">
              <Table>
                <thead><tr><Th>Nome</Th><Th>Telefone</Th><Th>WhatsApp</Th><Th>E-mail</Th><Th>Cidade</Th><Th>Orçam.</Th><Th>Status</Th><Th className="text-right">Ações</Th></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                      <Td>
                        <button className="flex items-center gap-3 cursor-pointer text-left" onClick={() => navigate(`/clientes/${c.id}`)}>
                          <div className="coffee-gradient h-9 w-9 rounded-xl text-white text-xs font-bold flex items-center justify-center shrink-0">{c.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</div>
                          <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.document}</p></div>
                        </button>
                      </Td>
                      <Td className="text-muted">{c.phone}</Td>
                      <Td>{c.whatsapp}</Td>
                      <Td className="text-muted">{c.email}</Td>
                      <Td className="text-muted">{c.city}/{c.state}</Td>
                      <Td>{quotes.filter((q) => q.clientId === c.id).length}</Td>
                      <Td><Badge tone={clientStatusMeta[c.status].tone} dot>{clientStatusMeta[c.status].label}</Badge></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Tooltip label="Visualizar"><Button size="sm" variant="ghost" onClick={() => navigate(`/clientes/${c.id}`)}><Eye className="h-4 w-4" /></Button></Tooltip>
                          <Tooltip label="Editar"><Button size="sm" variant="ghost" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button></Tooltip>
                          <Tooltip label="Novo orçamento"><Button size="sm" variant="ghost" onClick={() => navigate(`/calculadora?cliente=${c.id}`)}><Calculator className="h-4 w-4 text-champagne-600" /></Button></Tooltip>
                          <Tooltip label="WhatsApp"><Button size="sm" variant="ghost" onClick={() => openWhatsApp(c.whatsapp, `Olá, ${c.name.split(" ")[0]}! Aqui é da J & N Decorações em Gesso.`)}><MessageCircle className="h-4 w-4 text-emerald-600" /></Button></Tooltip>
                          <Tooltip label="Excluir"><Button size="sm" variant="ghost" onClick={() => setDel(c)}><Trash2 className="h-4 w-4 text-red-500" /></Button></Tooltip>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </GlassCard>

      <ClientFormModal open={formOpen} onClose={() => { setFormOpen(false); setParams({}); }} onSubmit={submit} initial={editing} loading={busy} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Excluir" title={`Excluir ${del?.name}?`} description="Os orçamentos vinculados serão mantidos no histórico."
        onConfirm={async () => { await deleteClient(del!.id); setDel(null); toast.success("Cliente excluído"); }} />
    </div>
  );
}

