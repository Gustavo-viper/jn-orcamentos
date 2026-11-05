# Envio de confirmação pelo Gmail

O app chama este Web App por HTTPS. O script executa como a conta que o publicou e usa `MailApp` para enviar o código. O endpoint fica acessível publicamente, mas só aceita solicitações assinadas pelo segredo compartilhado com a API Railway.

## Configuração única

1. Entre em [script.new](https://script.new) com `forgestudios.contato@gmail.com`.
2. Cole o conteúdo de `Code.gs` no editor e salve.
3. Em **Configurações do projeto → Propriedades do script**, crie:
   - `EXPECTED_SENDER_EMAIL` = `forgestudios.contato@gmail.com`
   - `JNG_APP_SHARED_SECRET` = o mesmo valor que será configurado como `EMAIL_WEBHOOK_SECRET` na API do Railway.
4. Em **Implantar → Nova implantação**, selecione **App da Web**, execute como você e permita acesso de qualquer pessoa. Autorize o envio de e-mails pela conta indicada.
5. Copie a URL do App da Web para a variável `EMAIL_WEBHOOK_URL` do serviço `jn-orcamentos` no Railway.
6. Configure `EMAIL_VERIFICATION_SECRET` na API Railway com um valor aleatório longo. Nunca use a mesma chave do webhook.

Depois de alterar propriedades ou o código, implante uma nova versão do Web App.
