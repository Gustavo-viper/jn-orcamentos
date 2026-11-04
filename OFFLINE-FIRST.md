# J&N Decorações em Gesso — offline-first com sincronização Railway

## Funcionamento

- O banco compartilhado é PostgreSQL no Railway. O app acessa o banco somente pelo backend autenticado; nenhuma senha do banco vai para o frontend.
- Clientes, serviços, orçamentos, obras, financeiro, atividades e configurações continuam salvos no IndexedDB do dispositivo.
- Cada alteração entra em uma fila local e é enviada quando a conexão com a API volta. O app tenta sincronizar ao recuperar a internet e a cada 30 segundos.
- As atualizações dos outros usuários são buscadas a cada 15 segundos enquanto o app está aberto.
- O link do portal usa a rota pública do Railway, não o endereço local do navegador ou do executável. Assim o cliente pode abrir o orçamento sem instalar o app; aprovações entram no banco e aparecem na próxima sincronização.
- A faixa no topo diferencia uso offline, falha de conexão com o banco, alterações pendentes e sincronização ativa.
- As contas compartilhadas são Jefersson e Giovane. O primeiro cadastro de cada uma exige conexão, senha com ao menos 8 caracteres e o código de ativação configurado no Railway. Depois, a senha e sessão local permitem entrar sem internet neste dispositivo.
- “Esqueci minha senha” permite redefinir a senha online com um código pessoal de recuperação diferente para cada conta. A redefinição encerra as sessões abertas; o usuário precisa entrar novamente.
- Se duas pessoas editarem o mesmo campo ao mesmo tempo, a última atualização recebida pelo servidor prevalece nesse campo; alterações em campos diferentes são combinadas.

## Configuração

`VITE_API_URL` deve apontar para `https://jn-orcamentos-production.up.railway.app/api`. O valor precisa estar definido antes do build do frontend.

`VITE_PUBLIC_PORTAL_URL` deve apontar para `https://jn-orcamentos-production.up.railway.app/portal/public` para que os links enviados aos clientes abram fora do dispositivo que criou o orçamento.

O serviço Railway deve ter `APP_ENROLLMENT_CODE` configurado. Esse segredo é solicitado apenas no cadastro das duas contas e nunca é incluído no build do app.

Para habilitar a recuperação, configure também `JEFERSSON_PASSWORD_RESET_CODE` e `GIOVANE_PASSWORD_RESET_CODE` no serviço Railway. Entregue cada código somente ao titular da conta. Eles não são incluídos no frontend.

## Aplicativo Windows

- Para gerar o instalador x64 no Windows, rode `npm.cmd ci` e depois `npm.cmd run desktop:package`.
- O instalador NSIS aparece em `outputs/windows/JN-Orcamentos-1.0.3-Setup.exe`.
- A janela desktop usa o ícone quadrado derivado da logo oficial e mantém os dados locais no perfil do usuário do Windows.

## Notas de dados

- O primeiro login em um banco sem registros compartilhados envia os dados existentes naquele dispositivo para o banco. Faça esse primeiro acesso pelo dispositivo que contém os dados corretos.
- Os dados antigos das tabelas da versão anterior do Railway não são apagados por esta sincronização; ela usa tabelas próprias `app_users`, `app_sessions` e `app_sync_records`.
- A fila offline fica armazenada no navegador. Apagar os dados do navegador antes da sincronização pode remover alterações ainda pendentes.
