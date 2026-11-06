# Relatório de testes — J&N Orçamentos

Data: 06/11/2026 · Ambiente: Windows 10, Node.js 26, PostgreSQL via PGlite (mesmo dialeto do PostgreSQL de produção).
Todos os testes usaram bancos **temporários e dados de teste**; nenhum dado real foi criado.

## Resultado geral

| Conjunto | Resultado |
|---|---|
| Testes automatizados de cálculo (`shared`) | **33/33 aprovados** |
| Testes automatizados de integração da API (`server`) | **30/30 aprovados** |
| Checagem de tipos (shared, server, web) | sem erros |
| Build de produção (web + server) e servidor de produção servindo app + API | OK |
| Testes manuais no navegador (desktop, celular, modo escuro) | ver tabela abaixo |

## Os 24 testes obrigatórios

Legenda: **A** = teste automatizado · **N** = verificado no navegador · **⚠** = verificado parcialmente (ver observação)

| # | Teste | Como | Resultado |
|---|---|---|---|
| 1 | Cadastro, edição e consulta de clientes | A + N | OK — validação de CPF inválido exibida; cliente salvo, perfil exibido; edição com mesclagem por campo testada na API |
| 2 | Cadastro e edição de serviços | A + N | OK — serviço com 3 materiais e consumos cadastrado pela tela |
| 3 | Cadastro e movimentação de produtos | A + N | OK — produto com área da placa e estoque inicial; alerta de estoque baixo e custo total do estoque corretos |
| 4 | Área e perímetro | A + N | OK — 4×5 → 20 m² / 18 m; paredes 50,4 m² |
| 5 | Metro linear | A | OK — perímetro 18 m − vão 0,8 m = 17,2 m; metragem manual |
| 6 | Descontos de portas e janelas | A + N | OK — 20 − 1,68 = 18,32 m²; nunca negativo |
| 7 | Cálculo de placas | A + N | OK — ⌈18,32 × 1,1 ÷ 2,16⌉ = 10 placas; divisões exatas não arredondam a mais |
| 8 | Cálculo de materiais | A + N | OK — massa 10,076 kg (fracionável); parafusos 302,28 → 303 (indivisível) |
| 9 | Mão de obra | A + N | OK — 18,32 × R$ 35 = R$ 641,20; preço personalizado |
| 10 | Margem de lucro | A + N | OK — 30% sobre R$ 1.039,78 = R$ 311,93; somente materiais; preço fixo sem margem |
| 11 | Descontos comerciais | A | OK — % e R$; desconto maior que o valor bloqueado no app e **rejeitado no servidor** |
| 12 | Geração de orçamento | A + N | OK — ORC-00001 numerado pelo servidor; servidor recalcula e ignora total forjado |
| 13 | Exportação de PDF | N | OK — PDF gerado com o código do app e renderizado para conferência (cabeçalho, cliente, ambientes, materiais, totais, parcelas, observações, assinaturas, acentuação) |
| 14 | Aprovação pelo portal | A + N | OK — link de 256 bits; portal sem custos internos; aprovação registrou data/hora/IP e o painel atualizou **em tempo real**; segunda resposta bloqueada; orçamento aprovado bloqueado para edição |
| 15 | Geração de ordem de serviço | A + N | OK — OS-00001 com materiais previstos; segunda OS para o mesmo orçamento bloqueada |
| 16 | Movimentação de estoque | A + N | OK — consumo baixa estoque; reenvio não baixa duas vezes; estoque insuficiente bloqueado; negativo só com autorização do administrador |
| 17 | Entradas e saídas | A + N | OK — contas a receber criadas do orçamento sem duplicar; pagamento parcial e total; valor acima do saldo rejeitado; lançamento com pagamento não pode ser excluído |
| 18 | Saldo financeiro | A + N | OK — recebido R$ 675,86, a receber R$ 675,85, saldo e resultado do período corretos |
| 19 | Funcionamento offline | N ⚠ | OK com o app aberto: servidor desligado → indicador "Offline · 1 pendente", cliente criado e exibido normalmente. **Abrir o app do zero sem internet (service worker) não pôde ser verificado** — o navegador embutido usado no teste recusa qualquer service worker (até um script vazio). O `sw.js` é gerado e servido corretamente; verificar no Chrome/Edge/Android após publicar com HTTPS. |
| 20 | Sincronização após retorno da internet | A + N | OK — ao religar o servidor o cliente criado offline subiu automaticamente, sem duplicar |
| 21 | Controle de permissões | A | OK — funcionário não recebe dados financeiros, não exclui/altera sem permissão, não acessa usuários; desativação derruba a sessão; último administrador protegido |
| 22 | Responsividade em celular | N | OK — 375×812: navegação inferior com botão central, cartões em 2 colunas, calculadora com barra de total fixa. Ajustes feitos durante o teste: colunas da calculadora e das telas de detalhe em notebooks de 1024 px |
| 23 | Persistência após atualizar a página | N | OK — a simulação não finalizada da calculadora foi oferecida para recuperação após recarregar e recuperada integralmente |
| 24 | Recuperação após falha de conexão | A + N | OK — fila persistente com reenvio automático (espera crescente); operações idempotentes; operações rejeitadas ficam visíveis com "tentar novamente"/"descartar" |

## Outros itens verificados

- Configuração inicial (primeiro administrador) só funciona uma vez; login rejeita senha errada; cookie de sessão `HttpOnly`.
- Proteção CSRF (escritas sem o cabeçalho do app são recusadas).
- Pull incremental paginado; exclusão lógica propagada; dados vazios não sobrescrevem dados completos.
- Backup manual; restauração exige digitar `RESTAURAR`, cria backup de segurança e não duplica nem apaga registros.
- Modo escuro e gráficos do painel com dados reais.

## Problemas encontrados e corrigidos durante os testes

1. Colunas da calculadora e das telas de detalhe apertadas em telas de 1024 px → resumo lateral só a partir de 1280 px; abaixo disso, barra de total fixa.
2. "Calculadora" e "Orçamentos" destacados juntos no menu → corrigido.
3. Eixos de gráficos de contagem mostrando frações (0,25) → somente inteiros.
4. Cabeçalho HSTS sendo enviado em HTTP local → enviado só com HTTPS.
5. Script de tema inline bloqueado pela política de segurança (CSP) → movido para arquivo.

## Pendências conhecidas

- Validar a instalação do PWA e a abertura offline (service worker) num navegador comum após publicar com HTTPS.
- Recomenda-se um teste em aparelhos reais (Android e iPhone) e com o PostgreSQL definitivo antes do uso diário.
