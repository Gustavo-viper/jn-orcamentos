import { sql } from 'bun';
import { extname, resolve, sep } from 'node:path';



const staticRoot = resolve(import.meta.dir, 'dist');
const staticMimeTypes = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2'
};
const serveFrontend = async (req, url) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); }
  catch { return new Response('Bad request', { status: 400 }); }
  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html';
  let filePath = resolve(staticRoot, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) return new Response('Not found', { status: 404 });
  let file = Bun.file(filePath);
  if (!(await file.exists())) {
    filePath = resolve(staticRoot, 'index.html');
    file = Bun.file(filePath);
  }
  if (!(await file.exists())) return new Response('App assets are unavailable', { status: 503 });
  const extension = extname(filePath).toLowerCase();
  const noCache = ['index.html', 'sw.js', 'manifest.webmanifest'].includes(relativePath);
  const headers = {
    'content-type': staticMimeTypes[extension] || 'application/octet-stream',
    'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin'
  };
  return new Response(req.method === 'HEAD' ? null : file, { status: 200, headers });
};

const num = value => { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; };
const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
const J = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','x-content-type-options':'nosniff'}});

// J&N shared accounts and offline-first sync routes.
// This block is inserted into the existing Railway Bun Function; the previous
// quote portal routes remain available alongside these new authenticated routes.
await sql`CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username IN ('Jefersson','Giovane')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique ON app_users (lower(email)) WHERE email IS NOT NULL`;
await sql`CREATE TABLE IF NOT EXISTS app_email_verifications (
  user_id INT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0
)`;
await sql`CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
await sql`CREATE TABLE IF NOT EXISTS app_sync_records (
  resource TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES app_users(id),
  PRIMARY KEY(resource, record_id)
)`;
await sql`CREATE INDEX IF NOT EXISTS app_sync_records_live_updated_idx ON app_sync_records(updated_at DESC) WHERE is_deleted=false`;

const syncResources = new Set(['clients','products','services','quotes','workOrders','finance','activities','settings']);
const syncResourceName = resource => resource==='work_orders'?'workOrders':resource;
const digestToken = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2,'0')).join('');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const isValidEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const maskEmail = value => { const [local,domain] = value.split('@'); return `${local.slice(0,Math.min(2,local.length))}***@${domain}`; };
const generateEmailCode = () => { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return String(bytes[0] % 100000000).padStart(8,'0'); };
const verificationDigest = async (userId,email,code) => {
  const secret = String(Bun.env.EMAIL_VERIFICATION_SECRET || '');
  if (!secret) throw new Error('EMAIL_VERIFICATION_SECRET_MISSING');
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${userId}:${email}:${code}`));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
};
const constantTimeEqual = (left,right) => { if (left.length !== right.length) return false; let diff = 0; for (let i=0;i<left.length;i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; };
const sendVerificationEmail = async (email,code) => {
  const endpoint = String(Bun.env.EMAIL_WEBHOOK_URL || '').trim();
  const secret = String(Bun.env.EMAIL_WEBHOOK_SECRET || '');
  if (!endpoint || !secret) throw new Error('EMAIL_SENDER_NOT_CONFIGURED');
  let parsed;
  try { parsed = new URL(endpoint); }
  catch { throw new Error('EMAIL_WEBHOOK_INVALID_URL'); }
  if (parsed.protocol !== 'https:') throw new Error('EMAIL_SENDER_REQUIRES_HTTPS');
  let response;
  try {
    response = await fetch(parsed,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret,to:email,code}),signal:AbortSignal.timeout(20000)});
  } catch {
    throw new Error('EMAIL_WEBHOOK_UNREACHABLE');
  }
  const responseText = await response.text().catch(()=> '');
  let result = null;
  try { result = JSON.parse(responseText); }
  catch {
    const sample = responseText.slice(0,6000).toLowerCase();
    if (sample.includes('accounts.google.com') || /sign in|choose an account|login required/i.test(sample)) throw new Error('EMAIL_WEBHOOK_LOGIN_REQUIRED');
    if (/script function not found.{0,60}dopost|function not found.{0,60}dopost/i.test(sample)) throw new Error('EMAIL_WEBHOOK_DOPOST_NOT_FOUND');
    if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) throw new Error('EMAIL_WEBHOOK_HTML_RESPONSE');
    throw new Error('EMAIL_WEBHOOK_INVALID_RESPONSE');
  }
  if (!response.ok) throw new Error('EMAIL_WEBHOOK_HTTP_STATUS');
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('EMAIL_WEBHOOK_UNEXPECTED_JSON');
  if (result.ok !== true) {
    const reason = String(result.error || '');
    const knownReasons = {
      unauthorized: 'EMAIL_WEBHOOK_SECRET_MISMATCH',
      sender_mismatch: 'EMAIL_WEBHOOK_SENDER_MISMATCH',
      invalid_request: 'EMAIL_WEBHOOK_INVALID_REQUEST',
      delivery_failed: 'EMAIL_WEBHOOK_DELIVERY_FAILED',
    };
    throw new Error(knownReasons[reason] || 'EMAIL_WEBHOOK_REJECTED');
  }
};
const emailDeliveryMessage = error => {
  const issue = String(error?.message || 'EMAIL_WEBHOOK_REJECTED');
  console.error('Account confirmation email failed:', issue);
  const messages = {
    EMAIL_SENDER_NOT_CONFIGURED: 'O envio de e-mail ainda não está configurado no Railway.',
    EMAIL_SENDER_REQUIRES_HTTPS: 'A URL do Apps Script precisa usar HTTPS.',
    EMAIL_WEBHOOK_INVALID_URL: 'A URL do Apps Script configurada no Railway é inválida.',
    EMAIL_WEBHOOK_UNREACHABLE: 'Não foi possível conectar ao Apps Script. Confira a implantação e a URL terminada em /exec.',
    EMAIL_WEBHOOK_HTTP_STATUS: 'O Apps Script recusou a chamada. Confira se a implantação está publicada para acesso externo.',
    EMAIL_WEBHOOK_LOGIN_REQUIRED: 'A implantação do Apps Script exige login. Reimplante como App da Web, execute como você e defina o acesso como qualquer pessoa.',
    EMAIL_WEBHOOK_DOPOST_NOT_FOUND: 'A implantação do Apps Script não tem a função doPost. Salve o Code.gs e publique uma nova versão do App da Web.',
    EMAIL_WEBHOOK_HTML_RESPONSE: 'O Google retornou uma página em vez da confirmação. Configure o App da Web para acesso de qualquer pessoa e use a URL /exec da versão atual.',
    EMAIL_WEBHOOK_INVALID_RESPONSE: 'O Apps Script não retornou JSON. Salve o Code.gs e publique uma nova versão do App da Web com acesso de qualquer pessoa.',
    EMAIL_WEBHOOK_UNEXPECTED_JSON: 'A implantação respondeu em JSON, mas não é a versão atual do script. Publique uma nova versão do App da Web.',
    EMAIL_WEBHOOK_SECRET_MISMATCH: 'A chave de integração não confere: EMAIL_WEBHOOK_SECRET no Railway deve ser igual a JNG_APP_SHARED_SECRET nas propriedades do Apps Script.',
    EMAIL_WEBHOOK_SENDER_MISMATCH: 'A conta remetente do Apps Script não confere com EXPECTED_SENDER_EMAIL ou a implantação foi publicada por outra conta.',
    EMAIL_WEBHOOK_INVALID_REQUEST: 'O Apps Script recebeu dados de confirmação inválidos.',
    EMAIL_WEBHOOK_DELIVERY_FAILED: 'O Apps Script recebeu a solicitação, mas o Google Mail não enviou. Verifique a autorização do MailApp e o limite de envio.',
    EMAIL_WEBHOOK_REJECTED: 'O Apps Script não aceitou o envio. Confira as configurações de segredo e remetente.',
  };
  return messages[issue] || messages.EMAIL_WEBHOOK_REJECTED;
};
const authUser = async (req) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const rows = await sql`SELECT u.id,u.username FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=${await digestToken(token)} AND s.expires_at>now()`;
  return rows[0] || null;
};
const portalMoney = (value) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const portalDate = (value) => { const date=new Date(value); return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('pt-BR'); };
const portalHtml = (quote,settings,client,token) => {
  const items=Array.isArray(quote.items)?quote.items:[];
  const rawTotals=items.map(item=>item.fixedRate?num(item.laborTotal):(num(item.materialsCost)+num(item.laborTotal))*(1+num(quote.marginPercent)/100));
  const rawSum=rawTotals.reduce((sum,value)=>sum+value,0), subtotal=num(quote.priceBeforeDiscount)||rawSum;
  const discountShare=subtotal>0?num(quote.discountAmount)/subtotal:0;
  const totals=rawTotals.map(value=>Math.round((value*(1-discountShare)+Number.EPSILON)*100)/100);
  if(totals.length){const last=totals.length-1;totals[last]=Math.round((totals[last]+num(quote.total)-totals.reduce((sum,value)=>sum+value,0)+Number.EPSILON)*100)/100;}
  const lines=items.map((item,index)=>{
    const quantity=num(item.measureValue), total=totals[index]||0;
    const unit=item.measureType==='area'?'m²':String(item.unitLabel||'ml').toLocaleLowerCase('pt-BR')==='m'?'ml':String(item.unitLabel||'ml');
    const unitPrice=item.quotedUnitPrice!==undefined?num(item.quotedUnitPrice):(quantity>0?total/quantity:0);
    return `<tr><td>${esc(item.roomName||'—')}</td><td>${esc(item.serviceName||'Serviço')}</td><td class="num">${esc(new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(quantity))}</td><td>${esc(unit)}</td><td class="num">${portalMoney(unitPrice)}</td><td class="num"><b>${portalMoney(total)}</b></td></tr>`;
  }).join('');
  const approved=quote.status==='aprovado', declined=quote.status==='recusado', canAct=quote.status==='pendente';
  const state=approved?'Orçamento aprovado':declined?'Orçamento recusado':quote.status==='expirado'?'Orçamento expirado':'Aguardando sua aprovação';
  const companyName=esc(settings.name||'J&N Decorações em Gesso'), clientName=esc(quote.clientName||client?.name||'Cliente');
  const firstName=esc(String(quote.clientName||client?.name||'').split(' ')[0]);
  const publicPhone=String(settings.whatsapp||'').replace(/\D/g,'');
  const tokenJson=JSON.stringify(token);
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Orçamento #${esc(quote.number)} — ${companyName}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f6f2ec;color:#28231e;font:15px Arial,sans-serif}.wrap{max-width:900px;margin:32px auto;padding:0 16px}.sheet{background:#fff;border:1px solid #e8dfd5;border-radius:18px;overflow:hidden;box-shadow:0 10px 35px #3a27150f}.head{padding:28px 32px;background:#211e1b;color:white;display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-size:22px;font-weight:800}.brand small{display:block;color:#d1b58f;font-size:11px;letter-spacing:2px;margin-top:4px}.number{color:#e9d3b5;font-weight:700}.body{padding:28px 32px}.intro{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:22px}.muted{color:#7c7167;font-size:13px}.status{background:#fff1d6;color:#785117;border-radius:20px;padding:8px 13px;font-size:12px;font-weight:700;white-space:nowrap}.status.ok{background:#e5f4e9;color:#25633b}.status.no{background:#fce8e8;color:#9b3030}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:11px 9px;border-bottom:1px solid #eee8e2;text-align:left}th{background:#f8f5f1;color:#72665a;text-transform:uppercase;font-size:10px;letter-spacing:.06em}.num{text-align:right;white-space:nowrap}.total{margin:22px 0 0 auto;max-width:330px;background:#f6eee3;border-radius:14px;padding:18px}.total span{display:block;color:#776958;font-size:12px}.total b{display:block;font-size:28px;margin-top:5px}.details{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail{background:#f8f6f3;border-radius:12px;padding:14px}.detail b{display:block;margin-bottom:5px}.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:26px}.btn{border:0;border-radius:10px;padding:13px 20px;font-weight:700;font-size:14px;cursor:pointer}.approve{background:#286b42;color:#fff}.reject{background:#f1ece7;color:#493c31}.print{background:#ede3d5;color:#493c31}.btn:disabled{opacity:.6}.notice{padding:12px;background:#f3f8f3;color:#286b42;border-radius:10px;text-align:center;margin-top:18px}.foot{text-align:center;color:#84796e;font-size:12px;padding:18px;border-top:1px solid #eee8e2}.terms{margin-top:20px;color:#6e645b;font-size:13px;line-height:1.5}@media(max-width:640px){.wrap{margin:0;padding:0}.sheet{border-radius:0}.head,.body{padding:22px 16px}.intro{display:block}.status{display:inline-block;margin-top:12px}table{font-size:11px}th,td{padding:8px 5px}.details{grid-template-columns:1fr}.total{max-width:none}.brand{font-size:18px}}@media print{body{background:#fff}.wrap{margin:0;max-width:none;padding:0}.sheet{border:0;box-shadow:none}.head{background:#211e1b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions,.foot .private{display:none!important}.body{padding:20px}}
    </style></head><body><main class="wrap"><article class="sheet"><header class="head"><div class="brand">${companyName}<small>ORÇAMENTO DE SERVIÇOS</small></div><div class="number">Nº ${esc(quote.number)}</div></header><section class="body"><div class="intro"><div><p class="muted">Olá, ${firstName}!</p><h1 style="font-size:25px;margin:6px 0 8px">Seu orçamento</h1><div class="muted">Cliente: <b style="color:#28231e">${clientName}</b><br>Emitido em ${portalDate(quote.createdAt)} · Válido até ${portalDate(quote.validUntil)}</div></div><span id="status" class="status ${approved?'ok':declined?'no':''}">${state}</span></div><div style="overflow-x:auto"><table><thead><tr><th>Local</th><th>Serviço</th><th class="num">Qtd.</th><th>Un.</th><th class="num">Valor unit.</th><th class="num">Total</th></tr></thead><tbody>${lines||'<tr><td colspan="6">Itens do orçamento</td></tr>'}</tbody></table></div><div class="total"><span>Valor total do orçamento</span><b>${portalMoney(quote.total)}</b></div>${quote.notes?`<div class="detail" style="margin-top:18px"><b>Observações</b>${esc(quote.notes)}</div>`:''}<div class="details"><div class="detail"><b>Pagamento</b>${quote.downPaymentPercent?`${num(quote.downPaymentPercent)}% de sinal (${portalMoney(num(quote.total)*num(quote.downPaymentPercent)/100)}) e restante na conclusão.`:'Conforme condições combinadas.'}</div><div class="detail"><b>Validade</b>Até ${portalDate(quote.validUntil)}</div></div>${quote.paymentTerms?`<p class="terms"><b>Condições:</b> ${esc(quote.paymentTerms)}</p>`:''}<div id="actions" class="actions">${canAct?'<button id="approve" class="btn approve" onclick="respond(\'approve\')">Aprovar orçamento</button><button id="reject" class="btn reject" onclick="respond(\'reject\')">Recusar</button>':''}<button class="btn print" onclick="window.print()">Salvar PDF / Imprimir</button></div><p id="notice" class="notice" hidden></p></section><footer class="foot">${companyName}${settings.whatsapp?` · ${esc(settings.whatsapp)}`:''}${settings.email?` · ${esc(settings.email)}`:''}</footer></article></main><script>const token=${tokenJson};async function respond(action){const text=action==='approve'?'Confirma a aprovação deste orçamento?':'Confirma que deseja recusar este orçamento?';if(!window.confirm(text))return;const buttons=[document.getElementById('approve'),document.getElementById('reject')].filter(Boolean);buttons.forEach(button=>button.disabled=true);try{const response=await fetch('/api/public-portal/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível atualizar o orçamento.');document.getElementById('status').textContent=action==='approve'?'Orçamento aprovado':'Orçamento recusado';document.getElementById('status').className='status '+(action==='approve'?'ok':'no');document.getElementById('actions').querySelectorAll('button').forEach(button=>{if(button.id!=='')button.remove()});const notice=document.getElementById('notice');notice.hidden=false;notice.textContent=action==='approve'?'Agradecemos! A equipe da empresa entrará em contato para combinar os próximos passos.':'Sua resposta foi registrada. Se desejar conversar sobre a proposta, entre em contato com a empresa.';}catch(error){alert(error.message||'Falha de conexão. Tente novamente.');buttons.forEach(button=>button.disabled=false);}}</script></body></html>`,{status:200,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
};
const publicPortalNotFound = () => new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orçamento indisponível</title><body style="margin:0;padding:40px;font:16px Arial;background:#f6f2ec;color:#28231e;text-align:center"><h1>Orçamento não encontrado</h1><p>Confira se o link está completo ou peça à empresa para enviá-lo novamente.</p></body></html>`,{status:404,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});

// Insert these branches at the beginning of the existing route's try block.

const route = async req => {
  const u = new URL(req.url);
  if (req.method === 'GET' && u.pathname === '/health') return new Response('ok',{headers:{'cache-control':'no-store'}});
  try {
    if (req.method === 'OPTIONS' && u.pathname.startsWith('/api/')) return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'86400'}});
if(u.pathname.startsWith('/portal/public/')){
  const match=u.pathname.match(/^\/portal\/public\/([0-9a-fA-F]{32})$/);
  if(req.method!=='GET'||!match)return publicPortalNotFound();
  const token=match[1].toUpperCase(),rows=await sql`SELECT record_id,data FROM app_sync_records WHERE resource='quotes' AND is_deleted=false AND upper(data->>'token')=${token} LIMIT 1`;
  if(rows.length&&rows[0].data.status!=='rascunho'){
    const quote=rows[0].data;
    const settingsRows=await sql`SELECT data FROM app_sync_records WHERE resource='settings' AND record_id='company' AND is_deleted=false LIMIT 1`;
    const clientRows=quote.clientId?await sql`SELECT data FROM app_sync_records WHERE resource='clients' AND record_id=${String(quote.clientId)} AND is_deleted=false LIMIT 1`:[];
    return portalHtml(quote,settingsRows[0]?.data||{},clientRows[0]?.data,token);
  }
  // Compatibilidade com orçamentos criados pela versão anterior, que usa quote_meta.
  const legacyRows=await sql`SELECT q.*,qm.discount,qm.margin,qm.valid_until,c.name AS client_name FROM quotes q JOIN quote_meta qm ON qm.quote_id=q.id LEFT JOIN clients c ON c.id=q.client_id WHERE upper(replace(qm.public_token,'-',''))=${token} LIMIT 1`;
  if(!legacyRows.length)return publicPortalNotFound();
  const old=legacyRows[0],quantity=num(old.quantity)||num(old.area)||num(old.perimeter),total=num(old.total),discount=num(old.discount);
  const measureType=old.charge_type==='area'?'area':'linear';
  const legacyQuote={id:String(old.id),number:String(old.id).padStart(4,'0'),clientId:old.client_id,clientName:old.client_name||'Cliente',items:[{roomName:'—',serviceName:old.service||'Serviço',measureValue:quantity,measureType,unitLabel:'ml',quotedUnitPrice:quantity>0?total/quantity:total,fixedRate:true,laborTotal:total}],total,priceBeforeDiscount:total+discount,discountAmount:discount,marginPercent:num(old.margin),status:String(old.status||'PENDENTE').toLowerCase(),createdAt:old.created_at,validUntil:old.valid_until,notes:old.description||''};
  const legacySettings=await sql`SELECT company_name,whatsapp,email FROM settings WHERE id=1`;
  const company=legacySettings[0]||{};
  return portalHtml(legacyQuote,{name:company.company_name,whatsapp:company.whatsapp,email:company.email},null,token);
}
const publicPortalAction=u.pathname.match(/^\/api\/public-portal\/([0-9a-fA-F]{32})$/);
if(publicPortalAction&&req.method==='POST'){
  const token=publicPortalAction[1].toUpperCase(),body=await req.json();
  if(!['approve','reject'].includes(body.action))return J({error:'Ação inválida.'},400);
  const legacyMatch=await sql`SELECT q.id FROM quotes q JOIN quote_meta qm ON qm.quote_id=q.id WHERE upper(replace(qm.public_token,'-',''))=${token} LIMIT 1`;
  if(legacyMatch.length){
    let legacyOutcome={status:404,error:'Orçamento não encontrado.'};
    await sql.begin(async tx=>{
      const rows=await tx`SELECT q.* FROM quotes q JOIN quote_meta qm ON qm.quote_id=q.id WHERE upper(replace(qm.public_token,'-',''))=${token} LIMIT 1 FOR UPDATE OF q`;
      if(!rows.length)return;
      const quote=rows[0],status=String(quote.status||'').toUpperCase();
      if(status==='APROVADO'&&body.action==='approve'){legacyOutcome={status:200,ok:true,already:true};return;}
      if(status!=='PENDENTE'){legacyOutcome={status:409,error:'Este orçamento não está mais aguardando resposta.'};return;}
      if(body.action==='reject'){
        await tx`UPDATE quotes SET status='RECUSADO' WHERE id=${quote.id}`;
        legacyOutcome={status:200,ok:true,statusQuote:'recusado'};return;
      }
      const items=await tx`SELECT * FROM quote_items WHERE quote_id=${quote.id}`;
      for(const item of items){
        const products=await tx`SELECT * FROM products WHERE id=${item.product_id}`;
        if(!products.length||num(products[0].stock)<num(item.quantity)){legacyOutcome={status:409,error:'Estoque insuficiente para '+(products[0]?.name||'material')+'.'};return;}
      }
      for(const item of items){
        const products=await tx`SELECT * FROM products WHERE id=${item.product_id}`;
        await tx`UPDATE products SET stock=stock-${num(item.quantity)} WHERE id=${item.product_id}`;
        await tx`INSERT INTO stock_movements(product_id,kind,quantity,cost,reason,quote_id) VALUES(${item.product_id},'SAIDA',${num(item.quantity)},${num(products[0].cost)},${'Aprovação pelo portal — orçamento #'+quote.id},${quote.id})`;
      }
      await tx`UPDATE quotes SET status='APROVADO' WHERE id=${quote.id}`;
      await tx`INSERT INTO work_orders(quote_id,client_id,status) VALUES(${quote.id},${quote.client_id},'ABERTA') ON CONFLICT(quote_id) DO NOTHING`;
      await tx`INSERT INTO finance_entries(type,description,amount,category,status,quote_id) VALUES('ENTRADA',${'Orçamento #'+quote.id},${num(quote.total)},'Venda','PENDENTE',${quote.id}) ON CONFLICT DO NOTHING`;
      legacyOutcome={status:200,ok:true,statusQuote:'aprovado'};
    });
    return J(legacyOutcome,legacyOutcome.status);
  }
  let outcome={status:404,error:'Orçamento não encontrado.'};
  await sql.begin(async tx=>{
    const rows=await tx`SELECT record_id,data FROM app_sync_records WHERE resource='quotes' AND is_deleted=false AND upper(data->>'token')=${token} LIMIT 1 FOR UPDATE`;
    if(!rows.length)return;
    const quote=rows[0].data;
    if(quote.status==='aprovado'&&body.action==='approve'){outcome={status:200,ok:true,already:true};return;}
    if(quote.status!=='pendente'){outcome={status:409,error:'Este orçamento não está mais aguardando resposta.'};return;}
    if(body.action==='reject'){
      const updated={...quote,status:'recusado'};
      await tx`UPDATE app_sync_records SET data=${JSON.stringify(updated)}::jsonb,updated_at=now(),updated_by=NULL WHERE resource='quotes' AND record_id=${rows[0].record_id}`;
      const activity={id:crypto.randomUUID(),message:`${quote.clientName} recusou o orçamento #${quote.number}`,date:new Date().toISOString(),type:'quote'};
      await tx`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES('activities',${activity.id},${JSON.stringify(activity)}::jsonb,false,NULL)`;
      outcome={status:200,ok:true,statusQuote:'recusado'};return;
    }
    const now=new Date(),dateAfter=days=>new Date(now.getTime()+days*86400000).toISOString();
    const existing=await tx`SELECT data FROM app_sync_records WHERE resource='workOrders' AND is_deleted=false AND data->>'quoteId'=${String(quote.id)} LIMIT 1`;
    let workOrder=existing[0]?.data;
    if(!workOrder){
      const numberRows=await tx`SELECT data->>'number' AS number FROM app_sync_records WHERE resource='workOrders' AND is_deleted=false`;
      const clientRows=await tx`SELECT data FROM app_sync_records WHERE resource='clients' AND record_id=${String(quote.clientId)} AND is_deleted=false LIMIT 1`;
      const max=numberRows.reduce((current,row)=>{const value=parseInt(String(row.number||'').replace(/\D/g,''),10);return Number.isFinite(value)?Math.max(current,value):current;},0);
      const client=clientRows[0]?.data;
      const address=client?[client.address,client.number,client.district,`${client.city||''}${client.state?'/'+client.state:''}`].filter(Boolean).join(', '):'—';
      const materials=new Map();
      for(const item of (quote.items||[]))for(const material of (item.materials||[])){const key=String(material.productId||material.productName);const current=materials.get(key);materials.set(key,{productName:material.productName,quantity:num(current?.quantity)+num(material.quantity),unit:material.unit||current?.unit||'un'});}
      const id=crypto.randomUUID(),createdAt=now.toISOString(),notes=`Gerada automaticamente a partir do orçamento #${quote.number}.`;
      workOrder={id,number:`OS-${String(max+1).padStart(4,'0')}`,quoteId:quote.id,quoteNumber:quote.number,clientId:quote.clientId,clientName:quote.clientName,address,serviceName:(quote.items||[]).map(item=>item.serviceName).join(', '),team:'A definir',startDate:dateAfter(3),expectedEnd:dateAfter(10),status:'aguardando',materials:[...materials.values()],notes,timeline:[{id:crypto.randomUUID(),date:createdAt,title:'OS criada — aguardando início',status:'aguardando',description:notes}],total:num(quote.total),createdAt};
      await tx`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES('workOrders',${id},${JSON.stringify(workOrder)}::jsonb,false,NULL)`;
      const deposit=num(quote.total)*num(quote.downPaymentPercent)/100,remaining=num(quote.total)-deposit;
      const entries=[{description:`Sinal ${num(quote.downPaymentPercent)}% — Orçamento #${quote.number}`,amount:deposit,dueDate:dateAfter(2)},{description:`Restante ${100-num(quote.downPaymentPercent)}% — Orçamento #${quote.number}`,amount:remaining,dueDate:dateAfter(12)}];
      for(const entry of entries){const finance={id:crypto.randomUUID(),description:entry.description,clientId:quote.clientId,clientName:quote.clientName,type:'entrada',category:'servico',amount:entry.amount,dueDate:entry.dueDate,status:'pendente',quoteId:quote.id,workOrderId:id};await tx`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES('finance',${finance.id},${JSON.stringify(finance)}::jsonb,false,NULL)`;}
    }
    const approvedAt=now.toISOString(),updated={...quote,status:'aprovado',approvedAt};
    await tx`UPDATE app_sync_records SET data=${JSON.stringify(updated)}::jsonb,updated_at=now(),updated_by=NULL WHERE resource='quotes' AND record_id=${rows[0].record_id}`;
    const activity={id:crypto.randomUUID(),message:`${quote.clientName} aprovou o orçamento #${quote.number}`,date:approvedAt,type:'quote'};
    await tx`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES('activities',${activity.id},${JSON.stringify(activity)}::jsonb,false,NULL)`;
    outcome={status:200,ok:true,statusQuote:'aprovado',workOrderNumber:workOrder.number};
  });
  return J(outcome,outcome.status);
}
if (req.method === 'OPTIONS' && u.pathname.startsWith('/api/')) return new Response(null, {status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'86400'}});
if (u.pathname === '/api/auth/register' && req.method === 'POST') {
  const b=await req.json(), username=['Jefersson','Giovane'].find(n=>n.toLowerCase()===String(b.name||'').trim().toLowerCase());
  const email=normalizeEmail(b.email);
  if (!username || !isValidEmail(email) || typeof b.password!=='string' || b.password.length<8 || b.password.length>128) return J({error:'Informe a conta, um e-mail válido e uma senha de 8 a 128 caracteres.'},400);
  if (!Bun.env.EMAIL_WEBHOOK_URL || !Bun.env.EMAIL_WEBHOOK_SECRET || !Bun.env.EMAIL_VERIFICATION_SECRET) return J({error:'A confirmação por e-mail ainda não está configurada no servidor.'},503);
  const expectedCode=String(Bun.env.APP_ENROLLMENT_CODE||'').replace(/[\s-]/g,'').toUpperCase();
  const suppliedCode=String(b.enrollmentCode||'').replace(/[\s-]/g,'').toUpperCase();
  if (!expectedCode || suppliedCode !== expectedCode) return J({error:'Código de ativação inválido.'},403);
  const existing=await sql`SELECT id,email_verified_at FROM app_users WHERE username=${username}`;
  if (existing[0]?.email_verified_at) return J({error:'Esta conta já foi confirmada. Entre ou use a opção de recuperar senha.'},409);
  if (existing.length) {
    const recent=await sql`SELECT sent_at > now()-interval '60 seconds' AS limited FROM app_email_verifications WHERE user_id=${existing[0].id}`;
    if (recent[0]?.limited) return J({error:'Aguarde um minuto antes de pedir outro código.'},429);
  }
  try {
    const passwordHash=await Bun.password.hash(b.password);
    const account=existing.length
      ? await sql`UPDATE app_users SET email=${email},password_hash=${passwordHash} WHERE id=${existing[0].id} RETURNING id,username`
      : await sql`INSERT INTO app_users(username,password_hash,email) VALUES(${username},${passwordHash},${email}) RETURNING id,username`;
    const code=generateEmailCode(), userId=account[0].id;
    const codeHash=await verificationDigest(userId,email,code);
    await sql`INSERT INTO app_email_verifications(user_id,email,code_hash,expires_at,sent_at,attempts) VALUES(${userId},${email},${codeHash},now()+interval '10 minutes',now(),0) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=now(),attempts=0`;
    try { await sendVerificationEmail(email,code); }
    catch (error) { const message=emailDeliveryMessage(error); await sql`DELETE FROM app_email_verifications WHERE user_id=${userId}`; return J({error:message},503); }
    return J({ok:true,emailMasked:maskEmail(email)},202);
  } catch (error) {
    if (String(error?.code)==='23505') return J({error:'Este e-mail já está associado a outra conta.'},409);
    return J({error:'Não foi possível iniciar a confirmação da conta.'},500);
  }
}
if (u.pathname === '/api/auth/resend-verification' && req.method === 'POST') {
  const b=await req.json(), username=['Jefersson','Giovane'].find(n=>n.toLowerCase()===String(b.name||'').trim().toLowerCase());
  if (!username) return J({ok:true});
  const rows=await sql`SELECT id,email FROM app_users WHERE username=${username} AND email_verified_at IS NULL LIMIT 1`;
  if (!rows.length || !rows[0].email) return J({ok:true});
  const userId=rows[0].id,email=normalizeEmail(rows[0].email);
  const recent=await sql`SELECT sent_at > now()-interval '60 seconds' AS limited FROM app_email_verifications WHERE user_id=${userId}`;
  if (recent[0]?.limited) return J({error:'Aguarde um minuto antes de pedir outro código.'},429);
  const code=generateEmailCode(), codeHash=await verificationDigest(userId,email,code);
  await sql`INSERT INTO app_email_verifications(user_id,email,code_hash,expires_at,sent_at,attempts) VALUES(${userId},${email},${codeHash},now()+interval '10 minutes',now(),0) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=now(),attempts=0`;
  try { await sendVerificationEmail(email,code); }
  catch (error) { const message=emailDeliveryMessage(error); await sql`DELETE FROM app_email_verifications WHERE user_id=${userId}`; return J({error:message},503); }
  return J({ok:true,emailMasked:maskEmail(email)});
}
if (u.pathname === '/api/auth/verify-email' && req.method === 'POST') {
  const b=await req.json(), email=normalizeEmail(b.email), code=String(b.code||'').trim();
  if (!isValidEmail(email) || !/^\d{8}$/.test(code)) return J({error:'Informe o e-mail e o código de 8 dígitos.'},400);
  const token=crypto.randomUUID()+crypto.randomUUID();
  const result=await sql.begin(async tx=>{
    const rows=await tx`SELECT v.user_id,v.email,v.code_hash,v.expires_at,v.attempts,u.username FROM app_email_verifications v JOIN app_users u ON u.id=v.user_id WHERE lower(v.email)=${email} FOR UPDATE OF v`;
    if (!rows.length) return {error:'Código inválido ou expirado.',status:400};
    const row=rows[0];
    if (new Date(row.expires_at).getTime()<=Date.now()) { await tx`DELETE FROM app_email_verifications WHERE user_id=${row.user_id}`; return {error:'Código expirado. Peça um novo código.',status:400}; }
    if (Number(row.attempts)>=8) { await tx`DELETE FROM app_email_verifications WHERE user_id=${row.user_id}`; return {error:'Muitas tentativas. Peça um novo código.',status:429}; }
    const supplied=await verificationDigest(row.user_id,email,code);
    if (!constantTimeEqual(supplied,String(row.code_hash))) { await tx`UPDATE app_email_verifications SET attempts=attempts+1 WHERE user_id=${row.user_id}`; return {error:'Código de confirmação incorreto.',status:400}; }
    await tx`UPDATE app_users SET email_verified_at=now() WHERE id=${row.user_id}`;
    await tx`DELETE FROM app_email_verifications WHERE user_id=${row.user_id}`;
    await tx`INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(${await digestToken(token)},${row.user_id},now()+interval '90 days')`;
    return {user:row.username};
  });
  if (!result.user) return J({error:result.error},result.status);
  return J({user:result.user,token});
}
if (u.pathname === '/api/auth/reset-password' && req.method === 'POST') {
  const b=await req.json(), username=['Jefersson','Giovane'].find(n=>n.toLowerCase()===String(b.name||'').trim().toLowerCase());
  if (!username || typeof b.password!=='string' || b.password.length<8) return J({error:'Informe a conta e uma nova senha com pelo menos 8 caracteres.'},400);
  const recoveryVariable=username==='Jefersson'?'JEFERSSON_PASSWORD_RESET_CODE':'GIOVANE_PASSWORD_RESET_CODE';
  const expectedCode=Bun.env[recoveryVariable];
  if (!expectedCode || typeof b.recoveryCode!=='string' || b.recoveryCode!==expectedCode) return J({error:'Código de recuperação inválido.'},403);
  const account=await sql`SELECT id FROM app_users WHERE username=${username}`;
  if (!account.length) return J({error:`A conta de ${username} ainda não foi criada.`},404);
  const passwordHash=await Bun.password.hash(b.password);
  await sql`UPDATE app_users SET password_hash=${passwordHash} WHERE id=${account[0].id}`;
  await sql`DELETE FROM app_sessions WHERE user_id=${account[0].id}`;
  return J({ok:true});
}
if (u.pathname === '/api/auth/login' && req.method === 'POST') {
  const b=await req.json(), username=['Jefersson','Giovane'].find(n=>n.toLowerCase()===String(b.name||'').trim().toLowerCase());
  const rows=username?await sql`SELECT id,username,password_hash,email_verified_at FROM app_users WHERE username=${username}`:[];
  if (!rows.length || typeof b.password!=='string' || !await Bun.password.verify(b.password,rows[0].password_hash)) return J({error:'Usuário ou senha incorretos.'},401);
  if (rows[0].email && !rows[0].email_verified_at) return J({error:'Confirme o e-mail cadastrado antes de entrar.'},403);
  const token=crypto.randomUUID()+crypto.randomUUID();
  await sql`INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(${await digestToken(token)},${rows[0].id},now()+interval '90 days')`;
  return J({user:rows[0].username,token});
}
if (u.pathname === '/api/auth/me' && req.method === 'GET') {
  const user=await authUser(req); return user?J({user:user.username}):J({error:'Sessão inválida ou expirada.'},401);
}
if (u.pathname === '/api/auth/logout' && req.method === 'POST') {
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if (token) await sql`DELETE FROM app_sessions WHERE token_hash=${await digestToken(token)}`;
  return J({ok:true});
}
if (u.pathname === '/api/sync/state' && req.method === 'GET') {
  const user=await authUser(req); if(!user)return J({error:'Sessão inválida ou expirada.'},401);
  const rows=await sql`SELECT resource,record_id,data,updated_at FROM app_sync_records WHERE is_deleted=false ORDER BY updated_at`;
  const state=Object.fromEntries([...syncResources].map(resource=>[resource,[]])); for(const row of rows){state[row.resource].push({id:row.record_id,data:row.data,updatedAt:row.updated_at})}
  return J(state);
}
if (u.pathname === '/api/sync/bootstrap' && req.method === 'POST') {
  const user=await authUser(req); if(!user)return J({error:'Sessão inválida ou expirada.'},401);
  const b=await req.json(), records=Array.isArray(b.records)?b.records:[];
  if(records.length>10000 || records.some(r=>!syncResources.has(syncResourceName(String(r.resource))) || !String(r.id||'') || !r.data || typeof r.data!=='object' || Array.isArray(r.data))) return J({error:'Carga inicial inválida.'},400);
  const inserted=await sql.begin(async tx=>{
    let count=0;
    for(const record of records){
      const rows=await tx`INSERT INTO app_sync_records(resource,record_id,data,updated_by) VALUES(${syncResourceName(String(record.resource))},${String(record.id)},${JSON.stringify(record.data)}::jsonb,${user.id}) ON CONFLICT(resource,record_id) DO NOTHING RETURNING record_id`;
      count+=rows.length;
    }
    return count;
  });
  return J({ok:true,inserted});
}

if (u.pathname === '/api/sync/records/batch' && req.method === 'POST') {
  const user=await authUser(req); if(!user)return J({error:'Sessão inválida ou expirada.'},401);
  const b=await req.json(),items=Array.isArray(b.items)?b.items:[];
  if(!items.length||items.length>50)return J({error:'Lote de alterações inválido.'},400);
  const processed=[],failed=[];
  for(const item of items){
    const resource=syncResourceName(String(item?.resource||'')),recordId=String(item?.recordId||''),payload=item?.payload;
    if(!String(item?.id||'')||!syncResources.has(resource)){failed.push({id:String(item?.id||''),error:'Registro inválido na fila de sincronização'});continue;}
    try{
      if(item.operation==='replaceAll'){
        if(recordId || !Array.isArray(payload) || payload.length>10000 || payload.some(record=>!record || typeof record!=='object' || Array.isArray(record) || !String(record.id||''))){
          failed.push({id:String(item.id),error:'Substituição de registros inválida'});continue;
        }
        // Legacy replaceAll queues are additive in the shared database; new clients send explicit per-record removals.
        await sql.begin(async tx=>{
          for(const record of payload){
            await tx`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${String(record.id)},${JSON.stringify(record)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
          }
        });
        processed.push(String(item.id));continue;
      }
      if(!recordId||!['create','update','remove'].includes(item.operation)||(['create','update'].includes(item.operation)&&(!payload||typeof payload!=='object'||Array.isArray(payload)))){
        failed.push({id:String(item.id),error:'Registro inválido na fila de sincronização'});continue;
      }
      if(item.operation==='remove')await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},'{}'::jsonb,true,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET is_deleted=true,updated_at=now(),updated_by=${user.id}`;
      else if(item.operation==='update')await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=app_sync_records.data||EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
      else await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
      processed.push(String(item.id));
    }catch(error){failed.push({id:String(item.id),error:String(error?.message||'Falha ao sincronizar')});}
  }
  return J({ok:failed.length===0,processed,failed});
}

if (u.pathname === '/api/sync/records' && req.method === 'POST') {
  const user=await authUser(req); if(!user)return J({error:'Sessão inválida ou expirada.'},401);
  const b=await req.json(), resource=syncResourceName(String(b.resource||'')), recordId=String(b.recordId||'');
  if(!syncResources.has(resource) || !recordId || recordId.length>200 || !['create','update','remove'].includes(b.operation)) return J({error:'Alteração inválida.'},400);
  const payload=b.payload && typeof b.payload==='object' && !Array.isArray(b.payload) ? b.payload : {};
  if(b.operation==='remove') await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},'{}'::jsonb,true,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET is_deleted=true,updated_at=now(),updated_by=${user.id}`;
  else if(b.operation==='update') await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=app_sync_records.data||EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
  else await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
  return J({ok:true});
}


    if (u.pathname !== '/api' && !u.pathname.startsWith('/api/') && u.pathname !== '/portal' && !u.pathname.startsWith('/portal/')) {
      const frontend = await serveFrontend(req, u);
      if (frontend) return frontend;
    }
    return J({error:'Rota não encontrada.'},404);
  } catch (error) {
    console.error('API request failed:',error?.message||error);
    return J({error:'Falha ao processar a solicitação.'},500);
  }
};

Bun.serve({port:Number(Bun.env.PORT||8080),hostname:'0.0.0.0',fetch:route});
