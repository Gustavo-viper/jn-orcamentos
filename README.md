# J&N Orçamentos

Sistema de gestão da **J&N Decorações em Gesso**: clientes (CRM), serviços, produtos e estoque,
calculadora de orçamentos, central de orçamentos com PDF, portal do cliente, ordens de serviço,
financeiro, relatórios e configurações. Funciona **offline** (PWA + IndexedDB) e sincroniza
automaticamente quando a conexão volta.

## Sumário

1. [Arquitetura](#arquitetura)
2. [Instalação (uso local)](#instalação-uso-local)
3. [Configuração](#configuração)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Publicação (produção)](#publicação-produção)
6. [Funcionalidades implementadas](#funcionalidades-implementadas)
7. [Regras de cálculo](#regras-de-cálculo)
8. [Sincronização e integridade dos dados](#sincronização-e-integridade-dos-dados)
9. [Backups e restauração](#backups-e-restauração)
10. [Integrações que dependem de credenciais](#integrações-que-dependem-de-credenciais)
11. [Testes](#testes) — relatório completo em [TESTES.md](TESTES.md)

---

## Arquitetura

```
jn-orcamentos/
├── shared/   Regras de negócio comuns (TypeScript): motor de cálculo, tipos, validações (zod), permissões
├── server/   API REST (Node.js + Express 5 + Drizzle ORM + PostgreSQL)
│   ├── src/db/        esquema relacional, conexão, transações serializadas
│   ├── src/services/  autenticação, sincronização, orçamentos, estoque/obras/financeiro, portal, backup
│   ├── src/routes/    rotas REST
│   └── drizzle/       migrações SQL versionadas
└── web/      Frontend React 19 + TypeScript + Tailwind CSS 4 (PWA instalável)
    ├── src/lib/       banco local (IndexedDB/Dexie), motor de sincronização, PDF, exportações
    ├── src/components/ componentes reutilizáveis (UI, layout, gráficos)
    └── src/pages/     telas, carregadas sob demanda
```

| Camada | Tecnologia |
|---|---|
| Interface | React 19, TypeScript, Tailwind CSS 4, lucide-react, Recharts |
| Offline | IndexedDB (Dexie), Service Worker (Workbox / vite-plugin-pwa) |
| API | Node.js 20+, Express 5, REST, eventos em tempo real (SSE) |
| Banco | PostgreSQL (Drizzle ORM). Em uso local sem PostgreSQL: PGlite (PostgreSQL embutido) |
| Documentos | jsPDF + AutoTable (gerados no aparelho, funcionam offline); Excel e CSV |
| Segurança | sessões em cookie httpOnly, senhas com scrypt, proteção CSRF, limites de tentativa, CSP (helmet) |

O **mesmo código de cálculo** (`shared/src/calc.ts`) roda no navegador (resultado instantâneo, inclusive
offline) e no servidor, que **recalcula tudo antes de gravar** usando os preços do banco — valores enviados
pelo navegador nunca são confiados.

## Instalação (uso local)

Requisitos: **Node.js 20 ou superior** (testado com 26). PostgreSQL é opcional para uso local.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Acesse **http://localhost:3001**. No primeiro acesso aparece a tela **Configuração inicial**, onde se cria o
administrador (não existem usuários ou senhas padrão). Em seguida preencha **Configurações → Empresa**.

Sem `DATABASE_URL`, os dados ficam em `server/data/` (PostgreSQL embutido) — **não apague essa pasta**.

### Desenvolvimento

```bash
npm run dev
```

API em `http://localhost:3001` e interface com recarga automática em `http://localhost:5173`.

### Comandos úteis

| Comando | O que faz |
|---|---|
| `npm test` | testes automatizados (cálculos + API) |
| `npm run typecheck` | checagem de tipos dos três pacotes |
| `npm run db:migrate` | aplica migrações pendentes (faz backup antes se já houver dados) |
| `npm run backup` | cria um backup completo em `server/backups/` |
| `npm run create-admin -w server -- "Nome" email@dominio.com "Senha123"` | cria/recupera um administrador pela linha de comando |
| `npm run db:generate` | gera nova migração após alterar `server/src/db/schema.ts` |

## Configuração

Dentro do sistema, em **Configurações**:

- **Empresa**: nome, logotipo (PNG/JPG, redimensionado automaticamente), CPF/CNPJ, telefone, WhatsApp, e-mail, endereço.
- **Orçamentos**: validade padrão, margem padrão, desperdício padrão, margem sobre mão de obra, parcelas (ex.: 50% entrada / 50% conclusão), texto das condições e observações padrão.
- **Aparência**: claro, escuro ou automático; modo compacto.
- **Usuários e permissões** (administrador): criar usuários, perfil administrador/funcionário, matriz de permissões por módulo (visualizar, cadastrar, alterar, excluir), desativar acesso (bloqueio imediato), redefinir senha.
- **Sistema**: status da conexão e da sincronização, última sincronização, alterações pendentes e rejeitadas (tentar de novo/descartar), cópia local dos dados, backups do servidor, exportação completa, restauração não destrutiva, histórico de operações e registros técnicos.

Ordem sugerida para começar: Empresa → Produtos (com área da placa) → Serviços (com materiais e consumo) → Clientes → Orçamentos.

## Variáveis de ambiente

Modelo comentado em [`.env.example`](.env.example). Copie para `server/.env`.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | **sim, em produção** | conexão PostgreSQL. Sem ela usa PGlite em `DATA_DIR` |
| `NODE_ENV` | sim | `production` |
| `PORT` | não | porta HTTP (padrão 3001) |
| `APP_URL` | sim | endereço público (links de redefinição de senha) |
| `COOKIE_SECURE` | não | `true` com HTTPS (padrão em produção) |
| `TRUST_PROXY` | não | `true` atrás de proxy reverso |
| `SESSION_DAYS` | não | validade da sessão (30) |
| `BACKUP_DIR` | recomendado | pasta persistente dos backups |
| `AUTO_BACKUP_HOURS` / `BACKUP_KEEP` | não | frequência e retenção do backup automático |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | não | envio do e-mail de recuperação de senha |

## Publicação (produção)

O servidor Node entrega a API **e** o aplicativo compilado no mesmo endereço (necessário para cookies seguros e PWA).

1. Crie um banco PostgreSQL (Neon, Supabase, Railway, Render, AWS RDS, servidor próprio...).
2. Configure as variáveis de ambiente (acima).
3. Build e inicialização:
   ```bash
   npm ci && npm run build && npm start
   ```
   As migrações são aplicadas automaticamente ao iniciar (com backup prévio se já houver dados).
4. Publique **com HTTPS** (obrigatório para instalar o PWA no celular e para o modo offline). Atrás de Nginx/Caddy, defina `TRUST_PROXY=true`.
5. Garanta disco persistente para `BACKUP_DIR` e copie os backups periodicamente para outro local.
6. Instalação nos aparelhos: abra o endereço no Chrome/Edge (Android/Windows) e use “Instalar aplicativo”; no iPhone, Safari → Compartilhar → “Adicionar à Tela de Início”.

### Deploy no Railway

O arquivo [`railway.json`](railway.json) já define build, inicialização e verificação de saúde (`/api/health`).

1. Em [railway.com](https://railway.com), crie um **projeto novo** (separado do app atual): **New Project → Deploy from GitHub repo**, escolha este repositório e, em **Settings → Source → Branch**, selecione `v2-sistema-completo`.
2. No mesmo projeto: **New → Database → PostgreSQL**.
3. No serviço do app, aba **Variables**, adicione:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `true` |
   | `COOKIE_SECURE` | `true` |
   | `APP_URL` | o endereço público do passo 5 (ex.: `https://jn-orcamentos.up.railway.app`) |
   | `BACKUP_DIR` | `/data/backups` |
   | `SMTP_*` | opcional — e-mail de recuperação de senha |
4. No serviço do app, **Settings → Volumes → Add volume** montado em `/data` (guarda os backups automáticos).
5. **Settings → Networking → Generate Domain** (HTTPS automático) — ou conecte um domínio próprio.
6. Acesse o endereço e crie o administrador na tela de **Configuração inicial**. Faça isso logo após o primeiro deploy: enquanto não houver administrador, qualquer pessoa com o link poderia criá-lo.

Cada `git push` na branch configurada gera um novo deploy automaticamente; as migrações do banco rodam na inicialização, com backup antes.

Observações de operação:
- Escritas são serializadas no banco (`pg_advisory_xact_lock`), então é seguro rodar mais de uma instância. As notificações em tempo real (SSE) são por instância; com várias instâncias, os aparelhos continuam sincronizando a cada 30 s.
- Atualizações de versão do aplicativo trocam apenas os arquivos do app; **dados locais e a fila de sincronização são preservados**. O usuário vê o aviso “Nova versão disponível”.

## Funcionalidades implementadas

**Acesso e segurança** — login por e-mail/senha; configuração inicial do administrador; recuperação de senha por e-mail (link de 1 h); troca de senha; sessões em cookie httpOnly (SameSite, Secure em HTTPS) com revogação; usuários desativados bloqueados imediatamente; perfis administrador/funcionário; permissões por módulo e ação **verificadas no servidor** (dados sem permissão de visualização nem chegam ao aparelho); proteção CSRF; limite de tentativas de login; registro de atividades e histórico de alterações (antes/depois).

**Painel** — 15 indicadores (clientes, ativos, orçamentos por situação, obras, vendido, recebido, a receber, despesas, lucro estimado, saldo); gráficos de vendas por mês, orçamentos por situação, entradas × saídas, desempenho dos serviços, clientes por cidade, evolução do faturamento e obras por situação; atividades recentes; ações rápidas. Tudo calculado a partir dos dados reais e atualizado em tempo real.

**Clientes (CRM)** — cadastro completo com validação de CPF/CNPJ e busca de CEP; pesquisa por nome, telefone, CPF/CNPJ e e-mail; filtros por cidade, estado e situação; ordenação; perfil com orçamentos, obras, valores contratados/pagos/pendentes, histórico de atendimento (ligação, visita, WhatsApp...), observações internas, histórico de alterações; botão de WhatsApp; exclusão bloqueada quando há vínculos.

**Serviços** — m², metro linear (perímetro/largura/comprimento) ou unidade; custo + margem ou preço fixo; preço da mão de obra; materiais e consumo; ativar/desativar; exclusão apenas se nunca usado; histórico de alterações. Serviços ativos alimentam a calculadora.

**Produtos e estoque** — cadastro com categorias, unidade, custo, dimensões, área da placa, estoque mínimo, fornecedor, código; entradas, saídas e ajustes (com motivo); histórico de movimentações; alertas de estoque baixo; custo total do estoque; consumo das obras gera saída automática; **estoque negativo só com autorização do administrador**.

**Calculadora** — cliente cadastrado ou novo sem sair da tela; vários ambientes; teto/piso (L×C) ou paredes (perímetro×altura); descontos de portas/janelas/vãos (com quantidade) sem área negativa; placas com desperdício e arredondamento para cima; demais materiais por consumo; mão de obra com preço personalizado; margem padrão/ajustável (com ou sem mão de obra); preço fixo sem margem; desconto em % ou R$ limitado ao valor; resumo completo; parcelas configuráveis; rascunho, gerar, editar, duplicar; **salvamento automático da simulação no aparelho** com recuperação após atualizar a página ou perder a conexão.

**Orçamentos** — situações rascunho/pendente/aprovado/recusado/expirado (expiração automática); pesquisa por número/cliente; filtros por situação e período; ordenação; detalhes; editar (bloqueado após aprovação/recusa); duplicar; excluir com confirmação e regras; **PDF profissional**; imprimir; compartilhar pelo WhatsApp (no celular compartilha o próprio PDF; no computador abre o WhatsApp com o link do portal).

**Portal do cliente** — link individual com token aleatório de 256 bits (revogável); visualização, valores, serviços, condições, PDF; aprovar/recusar/enviar observações; data, hora, IP e navegador registrados; atualização imediata no painel; não expõe custos, margens ou outros clientes.

**Obras / OS** — geração a partir do orçamento aprovado (uma por orçamento) ou avulsa; número, cliente, endereço, serviços, materiais previstos, equipe, datas, valor; situações aguardando/agendada/em andamento/pausada/concluída/cancelada com transições validadas; linha do tempo (criação, agendamento, início, pausas, retomadas, alterações, observações, consumo, conclusão); consumo real × previsto; conclusão com consumo final; comprovante de conclusão em PDF.

**Financeiro** — entradas e saídas por categoria; pendente/pago/atrasado/cancelado; vínculos com cliente, orçamento e obra; pagamentos totais ou parciais (nada é marcado como pago sem confirmação); contas a receber geradas do orçamento aprovado **sem duplicar** (chave única por parcela); indicadores do período, saldo, vencidos; filtros, pesquisa; exportação PDF/Excel/CSV.

**Relatórios** — vendas, orçamentos, clientes, clientes por cidade, serviços mais vendidos, obras, materiais utilizados, consumo de estoque, entradas, saídas, lucro estimado, contas a receber; períodos hoje/7 dias/30 dias/mês/ano/personalizado/tudo; exportação PDF, Excel e CSV.

**Interface** — azul-marinho, grafite, branco e dourado; modo claro/escuro; menu lateral no computador; navegação inferior com botão central no celular; listas em tabela no computador e em cartões no celular; microanimações; estados de carregamento, mensagens de sucesso/erro e confirmações em operações críticas.

## Regras de cálculo

Implementadas em `shared/src/calc.ts` (valores em centavos; medidas em metros):

- Área = largura × comprimento (paredes: perímetro × altura). Perímetro = 2 × (largura + comprimento).
- Área líquida = máx(0, área − Σ descontos). Em metro linear, cada vão desconta sua largura.
- Placas = ⌈ área necessária × (1 + desperdício%) ÷ área da placa ⌉ (por ambiente).
- Demais materiais = medida × consumo × (1 + desperdício%); produtos indivisíveis arredondam para cima.
- Mão de obra = medida × preço da mão de obra (ou preço personalizado).
- Custo + margem: lucro = custo elegível × margem% (elegível = materiais + mão de obra, ou só materiais).
- Preço fixo: preço = quantidade × preço fixo, sem margem; materiais entram como custo interno.
- Desconto: % (0–100) ou R$ (≤ subtotal). Parcelas somam 100%; a última absorve os centavos.
- Lucro estimado = preço final − custo total.

## Sincronização e integridade dos dados

- Toda alteração é gravada primeiro no IndexedDB e numa **fila persistente**; o app funciona sem internet.
- Cada operação tem **ID único (idempotente)**: reenvios após queda de conexão não duplicam nada.
- O servidor valida e aplica cada operação em **transação**; regras violadas são rejeitadas e o aparelho volta ao estado do servidor (dados criados offline e rejeitados ficam marcados, nunca apagados).
- Recebimento incremental por cursor (`seq`), paginado; o aparelho **mescla registro a registro** — nunca substitui coleções e nunca apaga um registro por ele não ter vindo na resposta; exclusões são lógicas.
- Conflitos: o cliente envia apenas os campos alterados; o servidor aplica **mesclagem por campo** e registra o conflito (Configurações → Sistema → Registros técnicos).
- Dados vazios ou inválidos não sobrescrevem dados completos (validação no servidor e checagem no aparelho).
- Banco local separado por usuário; atualizações do esquema local são aditivas e feitas com **backup prévio**.

## Backups e restauração

- Backup automático diário, antes de cada migração e sob demanda (Configurações → Sistema ou `npm run backup`).
- Exportação completa em JSON (sem hashes de senha) e cópia dos dados do aparelho (inclui pendências).
- **Restauração não destrutiva**: exige digitar `RESTAURAR`, cria backup de segurança e apenas recupera registros ausentes — nada é apagado ou sobrescrito.

## Integrações que dependem de credenciais

| Integração | Situação | O que configurar |
|---|---|---|
| PostgreSQL de produção | preparado | `DATABASE_URL` |
| E-mail de recuperação de senha (SMTP) | preparado | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Serve qualquer provedor SMTP (Gmail com senha de app, Outlook, Zoho, SendGrid, Amazon SES...). Sem isso, o admin redefine senhas pelo painel. |
| HTTPS / domínio | necessário em produção | certificado no provedor de hospedagem ou proxy (Caddy/Let's Encrypt) |
| WhatsApp | sem credenciais | usa links `wa.me` e o compartilhamento nativo do celular. Envio automático pela API oficial (WhatsApp Business Cloud) não foi incluído; exigiria conta Meta Business, número verificado e token. |
| Busca de CEP | sem credenciais | ViaCEP (serviço público), usado só quando há internet |

## Testes

```bash
npm test
```

- `shared/test/calc.test.ts` — 33 testes dos cálculos geométricos e financeiros.
- `server/test/flow.test.ts` — 30 testes de integração da API com PostgreSQL em memória.

Relatório completo, incluindo os testes manuais no navegador, em [TESTES.md](TESTES.md).
