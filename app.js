const $=id=>document.getElementById(id);
const DBKEY='cmbrasil_cobrancas_v01';
let state=JSON.parse(localStorage.getItem(DBKEY)||'{"clients":{},"summary":null,"lastImport":null}');
let currentId=null, deferredPrompt=null, showAllPriorities=false;
const APP_VERSION='0.6.0';

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
  navigator.serviceWorker.register('./service-worker.js?v=0.6.0',{updateViaCache:'none'}).then(reg=>{
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
function totalK(c){return (c.installments||[]).reduce((s,x)=>s+(x.valorK||0),0)}
function normalizePhone(s){return (s||'').replace(/\D/g,'')}
function activeClients(){return Object.values(state.clients).filter(c=>!c.paid&&!c.archived)}
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
 $('sArquivados').textContent=Object.keys(state.archived||{}).length;
 $('sHoje').textContent=arr.filter(c=>statusOf(c)==='hoje').length;
 $('sAmanha').textContent=arr.filter(c=>statusOf(c)==='amanha').length;
 $('sVencidas').textContent=arr.filter(c=>statusOf(c)==='vencidas').length;
 $('sFuturas').textContent=arr.filter(c=>statusOf(c)==='futura').length;
 renderPriorities(arr);
 $('lastImport').textContent=state.lastImport?`Última atualização pelo PDF: ${new Date(state.lastImport).toLocaleString('pt-BR')}`:'Nenhum PDF importado.';
 const s=state.summary||{};
 $('summaryAgent').textContent=state.lastAgent?` • ${state.lastAgent}`:'';
 $('sumDocs').textContent=s.documents??'—';$('sumClients').textContent=s.clients??'—';$('sumValorK').textContent=s.valorK!=null?brl(s.valorK):'—';$('sumReceber').textContent=s.valorReceber!=null?brl(s.valorReceber):'—';
 const q=$('search').value.trim().toLowerCase(),f=$('filter').value;
 let filtered=arr.filter(c=>!q||[c.name,c.city,c.cpf,c.code,c.agent].join(' ').toLowerCase().includes(q));
 if(f!=='todos')filtered=filtered.filter(c=>statusOf(c)===f);
 filtered.sort((a,b)=>{const rank={vencidas:0,hoje:1,amanha:2,futura:3,sem:4};return (rank[statusOf(a)]-rank[statusOf(b)])||oldestDays(b)-oldestDays(a)});
 $('clientList').innerHTML=filtered.length?filtered.map(c=>clientCard(c)).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
 document.querySelectorAll('.client:not(.archived-client)').forEach(el=>el.onclick=()=>openClient(el.dataset.id));
}
function clientCard(c){const st=statusOf(c), lab={hoje:'Previsão hoje',amanha:'Previsão amanhã',vencidas:'Previsão vencida',sem:'Sem previsão',futura:`Prev. ${localDate(c.promiseDate)}`}[st]||st;const cls=st==='vencidas'?'alert':(st==='hoje'||st==='amanha')?'warn':st==='futura'?'future':'';return `<div class="client" data-id="${c.id}"><div><h3>${c.name}</h3><p>${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'}</p><div class="chips"><span class="chip ${cls}">${lab}</span><span class="chip">${(c.installments||[]).length} parcela(s)</span><span class="chip">${oldestDays(c)} dias</span></div></div><div class="money">${brl(totalK(c))}<small>Valor K em atraso</small></div></div>`}

function getClient(id){return state.clients[id]||state.archived[id]}
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
function openClient(id){
 const c=getClient(id);if(!c)return;currentId=id;
 $('dName').textContent=c.name;$('dMeta').textContent=`${c.code||''} • ${c.cpf||''}`;
 $('detailGrid').innerHTML=`<div><small>Cidade</small>${c.city||'—'}</div><div><small>Agente</small>${c.agent||'—'}</div><div><small>Telefone</small>${c.phone||'—'}</div><div><small>Último pagamento</small>${c.lastPayment||'—'}</div><div><small>Parcelas em atraso</small>${(c.installments||[]).length}</div><div><small>Maior atraso</small>${oldestDays(c)} dias</div><div><small>Valor K</small>${brl(totalK(c))}</div><div><small>Atualizado pelo PDF</small>${c.pdfUpdatedAt?new Date(c.pdfUpdatedAt).toLocaleString('pt-BR'):'—'}</div>`;
 renderInstallments(c);
 $('promiseDate').value=c.promiseDate||'';$('note').value='';
 const ph=normalizePhone(c.whatsapp||c.phone);$('whatsappBtn').href=ph?`https://wa.me/${ph.startsWith('55')?ph:'55'+ph}`:'#';$('phoneBtn').href=ph?`tel:+${ph.startsWith('55')?ph:'55'+ph}`:'#';
 const archived=!!state.archived[id];
 $('saveCollection').disabled=archived;$('markPaid').disabled=archived;$('promiseDate').disabled=archived;$('note').disabled=archived;
 $('clearPromise').disabled=archived||!c.promiseDate;$('clearPromise').hidden=!c.promiseDate;
 renderHistory(c,archived);$('clientDialog').showModal();
}
function renderHistory(c,archived=false){
 const entries=(c.history||[]).map((h,i)=>({h,i})).reverse();
 $('history').innerHTML=entries.length?entries.map(({h,i})=>`<div class="history-item"><div class="history-main"><strong>${h.note||h.type}</strong><br><small>${new Date(h.at).toLocaleString('pt-BR')}${h.promiseDate?' • previsão '+localDate(h.promiseDate):''}</small></div>${archived?'':`<button type="button" class="history-delete" data-history-index="${i}" title="Excluir este registro">Excluir</button>`}</div>`).join(''):'<div class="empty">Sem histórico.</div>';
 document.querySelectorAll('[data-history-index]').forEach(btn=>btn.onclick=()=>deleteHistoryItem(Number(btn.dataset.historyIndex)));
}
function deleteHistoryItem(index){
 const c=state.clients[currentId];if(!c||!c.history||!c.history[index])return;
 if(!confirm('Excluir esta observação do histórico? Esta ação não pode ser desfeita.'))return;
 c.history.splice(index,1);save();openClient(currentId);
}
$('clearPromise').onclick=()=>{
 const c=state.clients[currentId];if(!c||!c.promiseDate)return;
 if(!confirm(`Remover o agendamento de ${localDate(c.promiseDate)} deste cliente?`))return;
 const date=c.promiseDate;c.promiseDate='';
 (c.history||[]).forEach(h=>{if(h.promiseDate===date)h.promiseDate=''});
 save();openClient(currentId);
};
$('saveCollection').onclick=()=>{const c=state.clients[currentId];if(!c)return;const note=$('note').value.trim(),promiseDate=$('promiseDate').value;if(!note&&!promiseDate){alert('Informe uma observação ou uma previsão de pagamento.');return}c.promiseDate=promiseDate;c.history=c.history||[];c.history.push({type:'cobranca',note:note||'Agendamento registrado',promiseDate,at:new Date().toISOString()});save();openClient(currentId)};
$('markPaid').onclick=()=>{const c=state.clients[currentId];if(!c)return;c.paid=true;c.history=c.history||[];c.history.push({type:'pago',note:'Marcado como pago',at:new Date().toISOString()});save();$('clientDialog').close()};

$('search').oninput=render;$('filter').onchange=()=>{showAllPriorities=false;render()};$('agentFilter').onchange=()=>{showAllPriorities=false;render()};$('priorityToggle').onclick=()=>{showAllPriorities=!showAllPriorities;render()};document.querySelectorAll('.stat[data-filter]').forEach(b=>b.onclick=()=>{$('filter').value=b.dataset.filter;render()});

function moneyBR(s){if(!s)return 0;return Number(s.replace(/\./g,'').replace(',','.'))||0}
function field(block,label,nextLabels){const next=nextLabels.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');const re=new RegExp(label+'\\s*:?\\s*([\\s\\S]*?)(?=\\s+(?:'+next+')\\s*:?|$)','i');const m=block.match(re);return m?m[1].replace(/\s+/g,' ').trim():''}
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
   clients.push({id:recordKey(agent,code),code,name,cpf,agent,city,phone,whatsapp:wa,lastPayment,activity,line,address,installments});
 }
 return {summary,clients,agent:globalAgent||clients[0]?.agent||'',reportDate};
}

async function extractPDF(file){
 if(!window.pdfjsLib) throw new Error('Biblioteca de leitura de PDF não carregada. Abra o app com internet uma vez para armazená-la offline.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
 const data=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data}).promise;let full='';
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),tc=await page.getTextContent();let line='';for(const item of tc.items){line+=item.str+(item.hasEOL?'\n':' ')}full+=line+'\n'}return full;
}
$('pdfInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const box=$('importStatus');box.hidden=false;box.className='notice';box.textContent='Lendo PDF...';try{const text=await extractPDF(file),parsed=parsePDFText(text);if(!parsed.clients.length)throw new Error('Nenhum cliente foi reconhecido neste PDF.');
 const agent=parsed.agent||parsed.clients[0]?.agent;if(!agent)throw new Error('Não foi possível identificar o Agente de Crédito deste PDF.');
 const now=new Date().toISOString(), incoming=new Set(parsed.clients.map(c=>c.id)); let preserved=0,archivedNow=0,reactivated=0;
 // v0.3: só arquiva quem saiu da carteira DO MESMO AGENTE.
 for(const [id,old] of Object.entries({...state.clients})){
   if(old.agent===agent && !incoming.has(id)){
     old.archived=true; old.archivedAt=now; old.archiveReason=`Ausente no último PDF do agente ${agent}`;
     state.archived[id]=old; delete state.clients[id]; archivedNow++;
   }
 }
 for(const c of parsed.clients){
   const old=state.clients[c.id]||state.archived[c.id];
   if(old){c.history=old.history||[];c.promiseDate=old.promiseDate||'';c.paid=!!old.paid;preserved++;if(state.archived[c.id]){delete state.archived[c.id];reactivated++}}
   else{c.history=[];c.promiseDate='';c.paid=false}
   c.archived=false;c.pdfUpdatedAt=now;c.reportDate=parsed.reportDate||c.reportDate||old?.reportDate||'';state.clients[c.id]=c;
 }
 state.summary=parsed.summary;state.lastImport=now;state.lastAgent=agent;state.summariesByAgent[agent]=parsed.summary;state.lastImportsByAgent[agent]=now;save();
 const docs=parsed.clients.reduce((s,c)=>s+c.installments.length,0);const ok=(!parsed.summary.clients||parsed.summary.clients===parsed.clients.length)&&(!parsed.summary.documents||parsed.summary.documents===docs);
 const totalActive=activeClients().length, agentCount=agentsAvailable().length;
 box.className='notice '+(ok?'ok':'bad');box.textContent=ok?`Importação conferida: ${agent} — ${parsed.clients.length} clientes e ${docs} documentos. Histórico preservado em ${preserved} cliente(s). ${archivedNow?archivedNow+' cliente(s) do '+agent+' arquivado(s). ':''}${reactivated?reactivated+' cliente(s) reativado(s). ':''}Consolidado: ${totalActive} clientes em ${agentCount} carteira(s).`:`Importação concluída, mas a conferência do Resumo Geral apresentou divergência. Revise antes de usar.`;
 }catch(err){box.className='notice bad';box.textContent='Erro: '+err.message}finally{e.target.value=''}};

function renderArchived(){const selected=$('agentFilter').value;const arr=Object.values(state.archived||{}).filter(c=>selected==='todos'||c.agent===selected).sort((a,b)=>(b.archivedAt||'').localeCompare(a.archivedAt||''));$('archivedList').innerHTML=arr.length?arr.map(c=>`<div class="client archived-client" data-id="${c.id}"><div><h3>${c.name}</h3><p>${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'}</p><div class="chips"><span class="chip">Arquivado ${c.archivedAt?new Date(c.archivedAt).toLocaleDateString('pt-BR'):''}</span><span class="chip">${(c.installments||[]).length} parcela(s) no último PDF</span></div></div><div class="money">${brl(totalK(c))}<small>Último Valor K registrado</small></div></div>`).join(''):'<div class="empty">Nenhum cliente arquivado para este filtro.</div>';document.querySelectorAll('.archived-client').forEach(el=>el.onclick=()=>openClient(el.dataset.id))}
$('archivedBtn').onclick=()=>{renderArchived();$('archivedDialog').showModal()};

$('backupBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-gestao-cobrancas-'+todayISO()+'.json';a.click();URL.revokeObjectURL(a.href)};
$('restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.clients)throw 0;state=obj;migrateState();render();alert('Backup restaurado com sucesso.')}catch{alert('Arquivo de backup inválido.')}e.target.value=''};

// Alerta interno ao abrir o app (consolidado de todas as carteiras ativas).
setTimeout(()=>{const arr=activeClients();const hoje=arr.filter(c=>statusOf(c)==='hoje').length,amanha=arr.filter(c=>statusOf(c)==='amanha').length,venc=arr.filter(c=>statusOf(c)==='vencidas').length,fut=arr.filter(c=>statusOf(c)==='futura').length;if(hoje||amanha||venc||fut){$('importStatus').hidden=false;$('importStatus').className='notice';$('importStatus').textContent=`Atenção: ${hoje} previsão(ões) para hoje, ${amanha} para amanhã, ${venc} vencida(s) e ${fut} futura(s) no consolidado.`}},400);
render();
