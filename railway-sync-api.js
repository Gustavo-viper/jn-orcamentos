// J&N shared accounts and offline-first sync routes.
// This block is inserted into the existing Railway Bun Function; the previous
// quote portal routes remain available alongside these new authenticated routes.
await sql`CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username IN ('Jefersson','Giovane')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

const syncResources = new Set(['clients','products','services','quotes','workOrders','finance','activities','settings']);
const digestToken = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2,'0')).join('');
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
  if (!username || typeof b.password!=='string' || b.password.length<8) return J({error:'Informe Jefersson ou Giovane e uma senha com pelo menos 8 caracteres.'},400);
  const expectedCode=String(Bun.env.APP_ENROLLMENT_CODE||'').replace(/[\s-]/g,'').toUpperCase();
  const suppliedCode=String(b.enrollmentCode||'').replace(/[\s-]/g,'').toUpperCase();
  if (!expectedCode || suppliedCode !== expectedCode) return J({error:'Código de ativação inválido.'},403);
  const existing=await sql`SELECT id FROM app_users WHERE username=${username}`;
  if (existing.length) return J({error:`A conta de ${username} já foi criada.`},409);
  const passwordHash=await Bun.password.hash(b.password);
  const created=await sql`INSERT INTO app_users(username,password_hash) VALUES(${username},${passwordHash}) RETURNING id,username`;
  const token=crypto.randomUUID()+crypto.randomUUID();
  await sql`INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(${await digestToken(token)},${created[0].id},now()+interval '90 days')`;
  return J({user:created[0].username,token},201);
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
  const rows=username?await sql`SELECT id,username,password_hash FROM app_users WHERE username=${username}`:[];
  if (!rows.length || typeof b.password!=='string' || !await Bun.password.verify(b.password,rows[0].password_hash)) return J({error:'Usuário ou senha incorretos.'},401);
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
  if(records.length>10000 || records.some(r=>!syncResources.has(String(r.resource)) || !String(r.id||'') || !r.data || typeof r.data!=='object')) return J({error:'Carga inicial inválida.'},400);
  const inserted=await sql.begin(async tx=>{
    const gate=await tx`SELECT NOT EXISTS(SELECT 1 FROM app_sync_records) AS empty`;
    if(!gate[0]?.empty)return 0;
    let count=0;
    for(const record of records){
      const rows=await tx`INSERT INTO app_sync_records(resource,record_id,data,updated_by) VALUES(${record.resource},${String(record.id)},${JSON.stringify(record.data)}::jsonb,${user.id}) ON CONFLICT(resource,record_id) DO NOTHING RETURNING record_id`;
      count+=rows.length;
    }
    return count;
  });
  return J({ok:true,inserted});
}
if (u.pathname === '/api/sync/records' && req.method === 'POST') {
  const user=await authUser(req); if(!user)return J({error:'Sessão inválida ou expirada.'},401);
  const b=await req.json(), resource=String(b.resource||''), recordId=String(b.recordId||'');
  if(!syncResources.has(resource) || !recordId || recordId.length>200 || !['create','update','remove'].includes(b.operation)) return J({error:'Alteração inválida.'},400);
  const payload=b.payload && typeof b.payload==='object' && !Array.isArray(b.payload) ? b.payload : {};
  if(b.operation==='remove') await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},'{}'::jsonb,true,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET is_deleted=true,updated_at=now(),updated_by=${user.id}`;
  else if(b.operation==='update') await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=app_sync_records.data||EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
  else await sql`INSERT INTO app_sync_records(resource,record_id,data,is_deleted,updated_by) VALUES(${resource},${recordId},${JSON.stringify(payload)}::jsonb,false,${user.id}) ON CONFLICT(resource,record_id) DO UPDATE SET data=EXCLUDED.data,is_deleted=false,updated_at=now(),updated_by=${user.id}`;
  return J({ok:true});
}

