const $=id=>document.getElementById(id);
const DBKEY='cmbrasil_cobrancas_v01';
let state=JSON.parse(localStorage.getItem(DBKEY)||'{"clients":{},"summary":null,"lastImport":null}');
let currentId=null, deferredPrompt=null, showAllPriorities=false;
let cloudClients={}, cloudSummary=null, cloudLastImport=null;
const APP_VERSION='1.0.0-alpha.3';
window.CM_APP_BUILD='alpha3-central-write';

function recordKey(agent,code){return `${(agent||'SEM-AGENTE').trim()}::${code}`}
function migrateState(){
  state.clients=state.clients||{};
  state.archived=state.archived||{};
  state.summary=state.summary||null;
  state.lastImport=state.lastImport||null;
  state.summariesByAgent=state.summariesByAgent||{};
  state.lastImportsByAgent=state.lastImportsByAgent||{};

  // v0.2 -> v0.3: passa a usar chave composta AGENTE::CLIENTE.
  const migrateMap=src=>{
    const out={};
    for(const [key,c] of Object.entries(src||{})){
      const agent=(c.agent||'SEM-AGENTE').trim();
      const code=c.code||c.id||key;
      c.id=recordKey(agent,code);
      c.code=code;
      out[c.id]=c;
    }
    return out;
  };
  const needsClientMigration=Object.keys(state.clients).some(k=>!k.includes('::'));
  const needsArchiveMigration=Object.keys(state.archived).some(k=>!k.includes('::'));
  if(needsClientMigration) state.clients=migrateMap(state.clients);
  if(needsArchiveMigration) state.archived=migrateMap(state.archived);

  // Recupera carteiras inteiras que a v0.2 arquivava ao trocar de agente.
  if(!state.schemaVersion || state.schemaVersion<3){
    const activeAgents=new Set(Object.values(state.clients).map(c=>c.agent).filter(Boolean));
    for(const [id,c] of Object.entries({...state.archived})){
      if(c.agent && !activeAgents.has(c.agent) && c.archiveReason==='Ausente no último PDF importado'){
        c.archived=false;
        delete c.archivedAt;
        delete c.archiveReason;
        state.clients[id]=c;
        delete state.archived[id];
      }
    }
    const activeNow=Object.values(state.clients);
    const agents=[...new Set(activeNow.map(c=>c.agent).filter(Boolean))];
    if(state.summary && agents.length===1 && !state.summariesByAgent[agents[0]]) state.summariesByAgent[agents[0]]=state.summary;
    if(state.lastImport && agents.length===1 && !state.lastImportsByAgent[agents[0]]) state.lastImportsByAgent[agents[0]]=state.lastImport;
  }
  state.schemaVersion=Math.max(state.schemaVersion||0,5);
  localStorage.setItem(DBKEY,JSON.stringify(state));
}
migrateState();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js?v=1.0.0a3',{updateViaCache:'none'}).then(reg=>{
    reg.update().catch(()=>{});
    const revealUpdate=()=>{if(reg.waiting)$('updateBtn').hidden=false};
    revealUpdate();
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)$('updateBtn').hidden=false});
    });
    $('updateBtn').onclick=()=>{if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});else location.reload()};
  }).catch(()=>{});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload()}});
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').hidden=true}};

function save(){localStorage.setItem(DBKEY,JSON.stringify(state));render()}
function brl(v){return Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}
function isoFromBR(s){if(!s)return'';let [d,m,y]=s.split('/');if(y.length===2)y='20'+y;return `${y}-${m}-${d}`}
function localDate(s){if(!s)return'—';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function todayISO(add=0){let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+add);return d.toISOString().slice(0,10)}
function statusOf(c){if(c.paid)return'pago';if(!c.promiseDate)return'sem';if(c.promiseDate===todayISO())return'hoje';if(c.promiseDate===todayISO(1))return'amanha';if(c.promiseDate<todayISO())return'vencidas';return'futura'}
function lastCollectionAt(c){const h=(c.history||[]).filter(x=>x.type==='cobranca'&&x.at);if(!h.length)return null;return h.reduce((max,x)=>!max||x.at>max?x.at:max,null)}
function daysSinceISODateTime(iso){if(!iso)return null;const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;const now=new Date();now.setHours(12,0,0,0);d.setHours(12,0,0,0);return Math.max(0,Math.floor((now-d)/86400000))}
function daysSinceCollection(c){return daysSinceISODateTime(lastCollectionAt(c))}
function priorityInfo(c){const st=statusOf(c),since=daysSinceCollection(c);if(st==='vencidas')return{rank:0,label:'Promessa vencida',cls:'critical',detail:`Prevista para ${localDate(c.promiseDate)}`};if(st==='hoje')return{rank:1,label:'Cobrar hoje',cls:'today',detail:'Pagamento previsto para hoje'};if(since===null)return{rank:2,label:'Sem histórico de cobrança',cls:'stale',detail:`${oldestDays(c)} dias de atraso`};if(since>=5)return{rank:3,label:`Sem ação há ${since} dias`,cls:'stale',detail:'Revisar contato e registrar nova ação'};return null}
function oldestDays(c){return Math.max(0,...(c.installments||[]).map(x=>x.daysLate||0))}
function totalK(c){return c.valorKTotal!=null?Number(c.valorKTotal||0):(c.installments||[]).reduce((s,x)=>s+(x.valorK||0),0)}
function normalizePhone(s){return (s||'').replace(/\D/g,'')}
function activeClients(){
 const cloud=window.CMCloud;
 if(cloud?.ready) return Object.values(cloudClients).filter(c=>!c.paid&&!c.archived);
 return Object.values(state.clients).filter(c=>!c.paid&&!c.archived)
}
function agentsAvailable(){return [...new Set(activeClients().map(c=>c.agent).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}

function syncAgentFilter(){
 const sel=$('agentFilter');
 const prev=sel.value||'todos';
 const agents=agentsAvailable();
 sel.innerHTML='<option value="todos">Todos os agentes</option>'+agents.map(a=>`<option value="${a}">${a}</option>`).join('');
 sel.value=agents.includes(prev)?prev:'todos';
 $('portfolioInfo').textContent=agents.length?`${agents.length} carteira(s) ativa(s): ${agents.join(', ')}`:'Nenhuma carteira importada.';
}
function scopedClients(){
 const agent=$('agentFilter').value;
 return activeClients().filter(c=>agent==='todos'||c.agent===agent);
}

function renderPriorities(arr){
 const items=arr
   .map(c=>({c,info:priorityInfo(c)}))
   .filter(x=>x.info)
   .sort((a,b)=>a.info.rank-b.info.rank || oldestDays(b.c)-oldestDays(a.c) || a.c.name.localeCompare(b.c.name,'pt-BR'));

 const vencidas=arr.filter(c=>statusOf(c)==='vencidas').length;
 const hoje=arr.filter(c=>statusOf(c)==='hoje').length;
 const semAcao=arr.filter(c=>{const since=daysSinceCollection(c);return since===null || since>=5}).length;
 $('pVencidas').textContent=vencidas;
 $('pHoje').textContent=hoje;
 $('pSemAcao').textContent=semAcao;

 const visible=showAllPriorities?items:items.slice(0,10);
 $('priorityList').innerHTML=visible.length?visible.map(({c,info})=>`
   <button type="button" class="priority-item ${info.cls}" data-priority-id="${c.id}">
     <span class="priority-badge">${info.label}</span>
     <span class="priority-name">${c.name}</span>
     <span class="priority-meta">${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'} • ${info.detail}</span>
     <strong>${brl(totalK(c))}</strong>
   </button>`).join(''):'<div class="empty compact">Nenhuma prioridade de cobrança neste filtro.</div>';
 const toggle=$('priorityToggle');
 toggle.hidden=items.length<=10;
 toggle.textContent=showAllPriorities?`Mostrar só 10`:`Ver todas (${items.length})`;
 document.querySelectorAll('[data-priority-id]').forEach(el=>{el.onclick=()=>openClient(el.dataset.priorityId)});
}

function render(){
 syncAgentFilter();
 const arr=scopedClients();
 $('sClientes').textContent=arr.length;
 $('sDocumentos').textContent=arr.reduce((s,c)=>s+(c.installments||[]).length,0);
 $('sValorK').textContent=brl(arr.reduce((s,c)=>s+totalK(c),0));
 $('sArquivados').textContent=window.CMCloud?.ready?0:Object.keys(state.archived||{}).length;
 $('sHoje').textContent=arr.filter(c=>statusOf(c)==='hoje').length;
 $('sAmanha').textContent=arr.filter(c=>statusOf(c)==='amanha').length;
 $('sVencidas').textContent=arr.filter(c=>statusOf(c)==='vencidas').length;
 $('sFuturas').textContent=arr.filter(c=>statusOf(c)==='futura').length;
 renderPriorities(arr);
 $('lastImport').textContent=cloudLastImport?`Última atualização pelo PDF: ${new Date(cloudLastImport).toLocaleString('pt-BR')}`:(state.lastImport?`Última atualização pelo PDF: ${new Date(state.lastImport).toLocaleString('pt-BR')}`:'Nenhum PDF importado.');
 const s=cloudSummary||state.summary||{};
 $('summaryAgent').textContent=window.CMCloud?.ready?'':(state.lastAgent?` • ${state.lastAgent}`:'');
 $('sumDocs').textContent=s.documents??'—';$('sumClients').textContent=s.clients??'—';$('sumValorK').textContent=s.valorK!=null?brl(s.valorK):'—';$('sumReceber').textContent=s.valorReceber!=null?brl(s.valorReceber):'—';
 const q=$('search').value.trim().toLowerCase(),f=$('filter').value;
 let filtered=arr.filter(c=>!q||[c.name,c.city,c.cpf,c.code,c.agent].join(' ').toLowerCase().includes(q));
 if(f!=='todos')filtered=filtered.filter(c=>statusOf(c)===f);
 filtered.sort((a,b)=>{const rank={vencidas:0,hoje:1,amanha:2,futura:3,sem:4};return (rank[statusOf(a)]-rank[statusOf(b)])||oldestDays(b)-oldestDays(a)});
 $('clientList').innerHTML=filtered.length?filtered.map(c=>clientCard(c)).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
 document.querySelectorAll('.client:not(.archived-client)').forEach(el=>el.onclick=()=>openClient(el.dataset.id));
}
function clientCard(c){const st=statusOf(c), lab={hoje:'Previsão hoje',amanha:'Previsão amanhã',vencidas:'Previsão vencida',sem:'Sem previsão',futura:`Prev. ${localDate(c.promiseDate)}`}[st]||st;const cls=st==='vencidas'?'alert':(st==='hoje'||st==='amanha')?'warn':st==='futura'?'future':'';return `<div class="client" data-id="${c.id}"><div><h3>${c.name}</h3><p>${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'}</p><div class="chips"><span class="chip ${cls}">${lab}</span><span class="chip">${(c.installments||[]).length} parcela(s)</span><span class="chip">${oldestDays(c)} dias</span></div></div><div class="money">${brl(totalK(c))}<small>Valor K em atraso</small></div></div>`}

function getClient(id){return cloudClients[id]||state.clients[id]||state.archived[id]}
function reportDateLabel(c){
 if(c.reportDate)return `Valores atualizados conforme relatório de ${localDate(c.reportDate)}`;
 if(c.pdfUpdatedAt)return `Valores conforme PDF importado em ${new Date(c.pdfUpdatedAt).toLocaleDateString('pt-BR')}`;
 return 'Valores conforme o último PDF importado.';
}
function renderInstallments(c){
 const rows=[...(c.installments||[])].sort((a,b)=>(a.due||'').localeCompare(b.due||''));
 $('installmentsReportDate').textContent=reportDateLabel(c);
 $('installmentsBody').innerHTML=rows.length?rows.map(x=>`<tr><td>${localDate(x.due)}</td><td>${brl(x.valorReceber)}</td><td><strong>${brl(x.saldo)}</strong></td></tr>`).join(''):'<tr><td colspan="3" class="installments-empty">Nenhuma parcela em atraso encontrada.</td></tr>';
}
function contactHref(person){
 const ph=normalizePhone(person?.whatsapp||person?.phone||'');
 return ph?`https://wa.me/${ph.startsWith('55')?ph:'55'+ph}`:'';
}
function responsibleCard(title,person){
 if(!person?.name)return '';
 const href=contactHref(person);
 return `<div class="responsible-card"><div><small>${title}</small><strong>${person.name}</strong>${person.cpf?`<span>${person.cpf}</span>`:''}${person.phone?`<span>${person.phone}</span>`:''}</div>${href?`<a class="responsible-whatsapp" href="${href}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div>`;
}
function renderResponsibles(c){
 const r=c.responsibles||{}, cards=[];
 if(r.clientSpouse)cards.push(responsibleCard('Cônjuge do cliente',r.clientSpouse));
 (r.guarantors||[]).forEach((g,i)=>{cards.push(responsibleCard((r.guarantors||[]).length>1?`Avalista ${i+1}`:'Avalista',g));if(g.spouse)cards.push(responsibleCard('Cônjuge do avalista',g.spouse));});
 $('responsiblesSection').hidden=!cards.length;
 $('responsiblesList').innerHTML=cards.join('');
}
function openClient(id){
 const c=getClient(id);if(!c)return;currentId=id;
 $('dName').textContent=c.name;$('dMeta').textContent=`${c.code||''} • ${c.cpf||''}`;
 $('detailGrid').innerHTML=`<div><small>Cidade</small>${c.city||'—'}</div><div><small>Agente</small>${c.agent||'—'}</div><div><small>Telefone</small>${c.phone||'—'}</div><div><small>Último pagamento</small>${c.lastPayment||'—'}</div><div><small>Parcelas em atraso</small>${(c.installments||[]).length}</div><div><small>Maior atraso</small>${oldestDays(c)} dias</div><div><small>Valor K</small>${brl(totalK(c))}</div><div><small>Atualizado pelo PDF</small>${c.pdfUpdatedAt?new Date(c.pdfUpdatedAt).toLocaleString('pt-BR'):'—'}</div>`;
 renderResponsibles(c);
 renderInstallments(c);
 $('promiseDate').value=c.promiseDate||'';$('note').value='';
 const ph=normalizePhone(c.whatsapp||c.phone);$('whatsappBtn').href=ph?`https://wa.me/${ph.startsWith('55')?ph:'55'+ph}`:'#';$('phoneBtn').href=ph?`tel:+${ph.startsWith('55')?ph:'55'+ph}`:'#';
 const archived=window.CMCloud?.ready?false:!!state.archived[id];
 $('saveCollection').disabled=archived;$('markPaid').disabled=archived||!!window.CMCloud?.ready;$('markPaid').title=window.CMCloud?.ready?'Marcação de pago será centralizada na próxima etapa':'';$('promiseDate').disabled=archived;$('note').disabled=archived;
 $('clearPromise').disabled=archived||!c.promiseDate;$('clearPromise').hidden=!c.promiseDate;
 renderHistory(c,archived);$('clientDialog').showModal();
}
function renderHistory(c,archived=false){
 const entries=(c.history||[]).map((h,i)=>({h,i})).reverse();
 $('history').innerHTML=entries.length?entries.map(({h,i})=>`<div class="history-item"><div class="history-main"><strong>${h.note||h.type}</strong><br><small>${new Date(h.at).toLocaleString('pt-BR')}${h.promiseDate?' • previsão '+localDate(h.promiseDate):''}</small></div>${archived?'':`<button type="button" class="history-delete" data-history-index="${i}" title="Excluir este registro">Excluir</button>`}</div>`).join(''):'<div class="empty">Sem histórico.</div>';
 document.querySelectorAll('[data-history-index]').forEach(btn=>btn.onclick=()=>deleteHistoryItem(Number(btn.dataset.historyIndex)));
}
async function reloadCentralAndReopen(){
 const keep=currentId;await loadCentralData();render();if(keep&&cloudClients[keep])openClient(keep);
}
async function deleteHistoryItem(index){
 const c=getClient(currentId);if(!c||!c.history||!c.history[index])return;
 if(!confirm('Excluir esta observação do histórico? Esta ação não pode ser desfeita.'))return;
 if(window.CMCloud?.ready){
   const h=c.history[index];
   if(!h.cloudId){alert('Este registro não possui identificação central.');return}
   const {error}=await window.CMCloud.client.from('cobrancas').delete().eq('id',h.cloudId);
   if(error){alert('Não foi possível excluir: '+error.message);return}
   await reloadCentralAndReopen();return;
 }
 c.history.splice(index,1);save();openClient(currentId);
}
$('clearPromise').onclick=async()=>{
 const c=getClient(currentId);if(!c||!c.promiseDate)return;
 if(!confirm(`Remover o agendamento de ${localDate(c.promiseDate)} deste cliente?`))return;
 if(window.CMCloud?.ready){
   const {error}=await window.CMCloud.client.from('cobrancas').insert({cliente_id:c.cloudId,usuario_id:window.CMCloud.user.id,observacao:'[AGENDAMENTO_REMOVIDO]',previsao_pagamento:null});
   if(error){alert('Não foi possível remover o agendamento: '+error.message);return}
   await reloadCentralAndReopen();return;
 }
 const date=c.promiseDate;c.promiseDate='';(c.history||[]).forEach(h=>{if(h.promiseDate===date)h.promiseDate=''});save();openClient(currentId);
};
$('saveCollection').onclick=async()=>{
 const c=getClient(currentId);if(!c)return;const note=$('note').value.trim(),promiseDate=$('promiseDate').value;
 if(!note&&!promiseDate){alert('Informe uma observação ou uma previsão de pagamento.');return}
 if(window.CMCloud?.ready){
   const {error}=await window.CMCloud.client.from('cobrancas').insert({cliente_id:c.cloudId,usuario_id:window.CMCloud.user.id,observacao:note||'Agendamento registrado',previsao_pagamento:promiseDate||null});
   if(error){alert('Não foi possível salvar a cobrança: '+error.message);return}
   await reloadCentralAndReopen();return;
 }
 c.promiseDate=promiseDate;c.history=c.history||[];c.history.push({type:'cobranca',note:note||'Agendamento registrado',promiseDate,at:new Date().toISOString()});save();openClient(currentId)
};
$('markPaid').onclick=()=>{if(window.CMCloud?.ready){alert('A função “Marcar como pago” será integrada à base central na próxima etapa.');return}const c=state.clients[currentId];if(!c)return;c.paid=true;c.history=c.history||[];c.history.push({type:'pago',note:'Marcado como pago',at:new Date().toISOString()});save();$('clientDialog').close()};

$('search').oninput=render;$('filter').onchange=()=>{showAllPriorities=false;render()};$('agentFilter').onchange=()=>{showAllPriorities=false;render()};$('priorityToggle').onclick=()=>{showAllPriorities=!showAllPriorities;render()};document.querySelectorAll('.stat[data-filter]').forEach(b=>b.onclick=()=>{$('filter').value=b.dataset.filter;render()});

function moneyBR(s){if(!s)return 0;return Number(s.replace(/\./g,'').replace(',','.'))||0}
function field(block,label,nextLabels){const next=nextLabels.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');const re=new RegExp(label+'\\s*:?\\s*([\\s\\S]*?)(?=\\s+(?:'+next+')\\s*:?|$)','i');const m=block.match(re);return m?m[1].replace(/\s+/g,' ').trim():''}
function contactFromText(s){
 const raw=(s||'').replace(/\s+/g,' ').trim();
 const phone=(raw.match(/\(?\d{2}\)?[-\s]?\d{4,5}[-\s]?\d{4}/)||[])[0]||'';
 const whatsapp=(raw.match(/https:\/\/wa\.me\/(\d+)/i)||[])[1]||'';
 return {phone,whatsapp};
}
function parseResponsibleContacts(block){
 const result={clientSpouse:null,guarantors:[]};
 const spouseMatch=block.match(/Nome C[oô]njuge:\s*([\s\S]*?)\s+Fone\(s\):\s*([\s\S]*?)(?=\s+Refer[eê]ncia Pessoal 1:|\s+Meio:|$)/i);
 if(spouseMatch){
   const name=spouseMatch[1].replace(/\s+/g,' ').trim();
   const ct=contactFromText(spouseMatch[2]);
   if(name)result.clientSpouse={name,phone:ct.phone,whatsapp:ct.whatsapp};
 }
 const am=block.match(/Avalistas\s+Nome\s+Fone\(s\)([\s\S]*?)(?=\s+Parcela\s+Vencto|\s+Totais Contrato|$)/i);
 if(!am)return result;
 let sec=am[1];
 // Cabeçalhos de página podem aparecer no meio do cadastro; não encerram o bloco do cliente.
 sec=sec.replace(/ERP Partner Inform[aá]tica[\s\S]*?Agente de Cr[eé]dito:\s*[^\n]+/gi,' ');
 const re=/(\d{3}\.\d{3}\.\d{3}-\d{2})\s+([\s\S]*?)\s+(\(?\d{2}\)?[-\s]?\d{4,5}[-\s]?\d{4})\s+(https:\/\/wa\.me\/\d+)/gi;
 const matches=[...sec.matchAll(re)];
 for(let i=0;i<matches.length;i++){
   const m=matches[i];
   // Linhas "Conjuge ... - CPF telefone" não são novos avalistas.
   const prefix=sec.slice(Math.max(0,m.index-18),m.index);
   if(/Conjuge\s*$/i.test(prefix))continue;
   let name=m[2].replace(/\s+/g,' ').trim();
   if(/^Conjuge\b/i.test(name))continue;
   const g={cpf:m[1],name,phone:m[3],whatsapp:(m[4].match(/wa\.me\/(\d+)/i)||[])[1]||'',spouse:null};
   const tailStart=m.index+m[0].length;
   const tailEnd=i+1<matches.length?matches[i+1].index:sec.length;
   const tail=sec.slice(tailStart,tailEnd);
   const sm=tail.match(/Conjuge\s+([\s\S]*?)\s+-\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+([\s\S]*?)(?=\s+Endere[cç]o:|$)/i);
   if(sm){const ct=contactFromText(sm[3]);g.spouse={name:sm[1].replace(/\s+/g,' ').trim(),cpf:sm[2],phone:ct.phone,whatsapp:ct.whatsapp};}
   result.guarantors.push(g);
 }
 return result;
}
function parsePDFText(text){
 text=text.replace(/\r/g,'');
 const summary={};let m;
 const reportDateBR=(text.match(/Data de emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
 const reportDate=reportDateBR?isoFromBR(reportDateBR):'';
 m=text.match(/Quantidade de Documentos\s+(\d+)/i);if(m)summary.documents=+m[1];
 m=text.match(/Quantidade de Clientes\s+(\d+)/i);if(m)summary.clients=+m[1];
 m=text.match(/Valor K\s+([\d.]+,\d{2})/i);if(m)summary.valorK=moneyBR(m[1]);
 m=text.match(/Valor Receber\s+([\d.]+,\d{2})/i);if(m)summary.valorReceber=moneyBR(m[1]);
 const globalAgent=(text.match(/Agente de Crédito:\s*([^\n]+)/i)||[])[1]?.replace(/\s+/g,' ').trim()||'';
 const clients=[]; const starts=[...text.matchAll(/Cliente:\s*(\d+)\s*-\s*/g)];
 for(let i=0;i<starts.length;i++){
   const start=starts[i].index,end=i+1<starts.length?starts[i+1].index:(text.indexOf('Resumo Geral',start)>start?text.indexOf('Resumo Geral',start):text.length);
   const block=text.slice(start,end); const head=block.match(/Cliente:\s*(\d+)\s*-\s*([\s\S]*?)\s+CPF:\s*([\d.\-]+)/i); if(!head)continue;
   const code=head[1],name=head[2].replace(/\s+/g,' ').trim(),cpf=head[3];
   const before=text.slice(0,start); const agentMatches=[...before.matchAll(/Agente de Crédito:\s*([^\n]+)/gi)]; let agent=globalAgent;
   if(agentMatches.length) agent=agentMatches[agentMatches.length-1][1].replace(/\s+/g,' ').trim();
   const city=field(block,'Cidade',['CEP','Fones']);
   const phoneField=field(block,'Fones',['E-mail','Último Pagamento']);
   const phone=(phoneField.match(/\(?\d{2}\)?[-\s]?\d{4,5}[-\s]?\d{4}/)||[])[0]||'';
   const wa=(block.match(/https:\/\/wa\.me\/(\d+)/i)||[])[1]||'';
   const lastPayment=(block.match(/Último Pagamento:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||'';
   const activity=field(block,'Atividade',['De que','Endereco']);
   const line=field(block,'Linha',['Filial']);
   const address=field(block,'Endereco',['Bairro']);
   const installments=[];
   const rowRe=/(\d{8}-\d{2}-\d{3}\/\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+([^\n]+)/g;let r;
   while((r=rowRe.exec(block))){const rest=r[3], monies=[...rest.matchAll(/[\d.]+,\d{2}/g)].map(x=>moneyBR(x[0]));const beforeMoney=rest.slice(0,rest.search(/[\d.]+,\d{2}/)).trim().split(/\s+/);const nums=beforeMoney.map(x=>/^\d+$/.test(x)?+x:null).filter(x=>x!=null);const days=nums.length?nums[nums.length-1]:0;installments.push({parcel:r[1],due:isoFromBR(r[2]),daysLate:days,valorK:monies[0]||0,valorReceber:monies[1]||0,saldo:monies[monies.length-1]||0})}
   const responsibles=parseResponsibleContacts(block);
   clients.push({id:recordKey(agent,code),code,name,cpf,agent,city,phone,whatsapp:wa,lastPayment,activity,line,address,installments,responsibles});
 }
 return {summary,clients,agent:globalAgent||clients[0]?.agent||'',reportDate};
}

async function extractPDF(file){
 if(!window.pdfjsLib) throw new Error('Biblioteca de leitura de PDF não carregada. Abra o app com internet uma vez para armazená-la offline.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
 const data=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data}).promise;let full='';
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),tc=await page.getTextContent();let line='';for(const item of tc.items){line+=item.str+(item.hasEOL?'\n':' ')}full+=line+'\n'}return full;
}
async function importParsedToCloud(file,parsed){
 const cloud=window.CMCloud;if(cloud.profile?.perfil!=='gestor')throw new Error('Somente o gestor pode importar PDFs.');
 const code=(parsed.agent||parsed.clients[0]?.agent||'').trim();
 const carteira=(cloud.carteiras||[]).find(c=>c.codigo.toUpperCase()===code.toUpperCase());
 if(!carteira)throw new Error(`A carteira ${code||'não identificada'} não está cadastrada na base central.`);
 const now=new Date().toISOString();
 let q=cloud.client.from('clientes').update({ativo:false,atualizado_pdf_em:now}).eq('carteira_id',carteira.id);
 let {error}=await q;if(error)throw error;
 const rows=parsed.clients.map(c=>({carteira_id:carteira.id,codigo:c.code,nome:c.name,cpf_cnpj:c.cpf||null,cidade:c.city||null,telefone:c.whatsapp||c.phone||null,responsaveis:c.responsibles||{},ultimo_pagamento:c.lastPayment?isoFromBR(c.lastPayment):null,parcelas_atraso:(c.installments||[]).length,maior_atraso:oldestDays(c),valor_k:totalK(c),ativo:true,atualizado_pdf_em:now}));
 const up=await cloud.client.from('clientes').upsert(rows,{onConflict:'carteira_id,codigo'}).select('id,codigo');
 if(up.error)throw up.error;
 if((up.data||[]).length!==rows.length)throw new Error(`A base central confirmou apenas ${(up.data||[]).length} de ${rows.length} clientes. A importação foi interrompida para evitar falso sucesso.`);
 const idByCode=Object.fromEntries((up.data||[]).map(x=>[String(x.codigo),x.id]));
 const ids=Object.values(idByCode);
 if(ids.length){const del=await cloud.client.from('parcelas').delete().in('cliente_id',ids);if(del.error)throw del.error;}
 const parcelas=[];
 for(const c of parsed.clients){const cid=idByCode[String(c.code)];for(const x of c.installments||[])parcelas.push({cliente_id:cid,vencimento:x.due,valor_receber:Number(x.valorReceber||0),saldo:Number(x.saldo||0),dias_atraso:Number(x.daysLate||0),atualizado_pdf_em:now})}
 if(parcelas.length){const ins=await cloud.client.from('parcelas').insert(parcelas);if(ins.error)throw ins.error;}
 const docs=parcelas.length;
 const imp=await cloud.client.from('importacoes').insert({carteira_id:carteira.id,usuario_id:cloud.user.id,nome_arquivo:file.name,data_relatorio:parsed.reportDate||null,clientes:parsed.clients.length,documentos:docs,valor_k:Number(parsed.summary?.valorK||parsed.clients.reduce((a,c)=>a+totalK(c),0))});
 if(imp.error)throw imp.error;
 const cu=await cloud.client.from('carteiras').update({ultima_atualizacao:now}).eq('id',carteira.id);if(cu.error)throw cu.error;
 const verify=await cloud.client.from('clientes').select('id',{count:'exact',head:true}).eq('carteira_id',carteira.id).eq('ativo',true);
 if(verify.error)throw verify.error;
 if(Number(verify.count)!==parsed.clients.length)throw new Error(`Verificação central falhou: o PDF possui ${parsed.clients.length} clientes, mas a base retornou ${verify.count??0}.`);
 await loadCentralData();
 return {code,clientes:parsed.clients.length,docs,confirmados:Number(verify.count||0)};
}
$('pdfInput').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;const box=$('importStatus');box.hidden=false;box.className='notice';box.textContent='Lendo PDF e sincronizando com a base central...';
 try{
   const text=await extractPDF(file),parsed=parsePDFText(text);if(!parsed.clients.length)throw new Error('Nenhum cliente foi reconhecido neste PDF.');
   if(window.CMCloud?.ready){const r=await importParsedToCloud(file,parsed);box.className='notice ok';box.textContent=`Base central confirmada: ${r.code} — ${r.confirmados} clientes e ${r.docs} documentos gravados no Supabase. Os agentes vinculados já podem acessar os dados.`;render();}
   else throw new Error('A base central ainda não está conectada.');
 }catch(err){box.className='notice bad';box.textContent='Erro: '+err.message}finally{e.target.value=''}
};

function renderArchived(){const selected=$('agentFilter').value;const arr=Object.values(state.archived||{}).filter(c=>selected==='todos'||c.agent===selected).sort((a,b)=>(b.archivedAt||'').localeCompare(a.archivedAt||''));$('archivedList').innerHTML=arr.length?arr.map(c=>`<div class="client archived-client" data-id="${c.id}"><div><h3>${c.name}</h3><p>${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'}</p><div class="chips"><span class="chip">Arquivado ${c.archivedAt?new Date(c.archivedAt).toLocaleDateString('pt-BR'):''}</span><span class="chip">${(c.installments||[]).length} parcela(s) no último PDF</span></div></div><div class="money">${brl(totalK(c))}<small>Último Valor K registrado</small></div></div>`).join(''):'<div class="empty">Nenhum cliente arquivado para este filtro.</div>';document.querySelectorAll('.archived-client').forEach(el=>el.onclick=()=>openClient(el.dataset.id))}
$('archivedBtn').onclick=()=>{renderArchived();$('archivedDialog').showModal()};

$('backupBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-gestao-cobrancas-'+todayISO()+'.json';a.click();URL.revokeObjectURL(a.href)};
$('restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.clients)throw 0;state=obj;migrateState();render();alert('Backup restaurado com sucesso.')}catch{alert('Arquivo de backup inválido.')}e.target.value=''};

async function loadCentralData(){
 const cloud=window.CMCloud;if(!cloud?.ready)return;
 const {data:clients,error}=await cloud.client.from('clientes').select('id,carteira_id,codigo,nome,cpf_cnpj,cidade,telefone,responsaveis,ultimo_pagamento,parcelas_atraso,maior_atraso,valor_k,ativo,atualizado_pdf_em,parcelas(id,vencimento,valor_receber,saldo,dias_atraso)').eq('ativo',true);
 if(error)throw error;
 const {data:hist,error:herr}=await cloud.client.from('cobrancas').select('id,cliente_id,usuario_id,observacao,previsao_pagamento,created_at').order('created_at',{ascending:true});
 if(herr)throw herr;
 const byClient={};for(const h of hist||[])(byClient[h.cliente_id]??=[]).push(h);
 const carteiraById=Object.fromEntries((cloud.carteiras||[]).map(c=>[c.id,c]));
 const out={};
 for(const row of clients||[]){
   const carteira=carteiraById[row.carteira_id];if(!carteira)continue;
   const hs=byClient[row.id]||[];let promiseDate='';const history=[];
   for(const h of hs){
     if(h.observacao==='[AGENDAMENTO_REMOVIDO]'){promiseDate='';history.push({cloudId:h.id,type:'cobranca',note:'Agendamento removido',promiseDate:'',at:h.created_at});continue}
     if(h.previsao_pagamento)promiseDate=h.previsao_pagamento;
     history.push({cloudId:h.id,type:'cobranca',note:h.observacao||'Cobrança registrada',promiseDate:h.previsao_pagamento||'',at:h.created_at});
   }
   const key=recordKey(carteira.codigo,row.codigo);
   out[key]={id:key,cloudId:row.id,code:row.codigo,name:row.nome,cpf:row.cpf_cnpj||'',agent:carteira.codigo,city:row.cidade||'',phone:row.telefone||'',whatsapp:row.telefone||'',responsibles:row.responsaveis||{},lastPayment:row.ultimo_pagamento?localDate(row.ultimo_pagamento):'',installments:(row.parcelas||[]).map(x=>({cloudId:x.id,due:x.vencimento,daysLate:x.dias_atraso||0,valorReceber:Number(x.valor_receber||0),saldo:Number(x.saldo||0),valorK:0})),valorKTotal:Number(row.valor_k||0),promiseDate,history,paid:false,archived:false,pdfUpdatedAt:row.atualizado_pdf_em||'',reportDate:''};
 }
 cloudClients=out;
 const {data:imports}=await cloud.client.from('importacoes').select('clientes,documentos,valor_k,created_at').order('created_at',{ascending:false}).limit(1);
 cloudLastImport=imports?.[0]?.created_at||null;
 const arr=Object.values(out),docs=arr.reduce((a,c)=>a+(c.installments||[]).length,0),receber=arr.reduce((a,c)=>a+(c.installments||[]).reduce((b,x)=>b+Number(x.valorReceber||0),0),0),vk=arr.reduce((a,c)=>a+totalK(c),0);
 cloudSummary={clients:arr.length,documents:docs,valorK:vk,valorReceber:receber};
}

// Alerta interno ao abrir o app (consolidado de todas as carteiras ativas).
setTimeout(()=>{const arr=activeClients();const hoje=arr.filter(c=>statusOf(c)==='hoje').length,amanha=arr.filter(c=>statusOf(c)==='amanha').length,venc=arr.filter(c=>statusOf(c)==='vencidas').length,fut=arr.filter(c=>statusOf(c)==='futura').length;if(hoje||amanha||venc||fut){$('importStatus').hidden=false;$('importStatus').className='notice';$('importStatus').textContent=`Atenção: ${hoje} previsão(ões) para hoje, ${amanha} para amanhã, ${venc} vencida(s) e ${fut} futura(s) no consolidado.`}},400);
render();
document.addEventListener('cmcloudready',async()=>{try{await loadCentralData();render()}catch(err){$('importStatus').hidden=false;$('importStatus').className='notice bad';$('importStatus').textContent='Erro ao carregar base central: '+err.message}});
