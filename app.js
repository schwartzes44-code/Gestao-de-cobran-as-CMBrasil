const $=id=>document.getElementById(id);
const DBKEY='cmbrasil_cobrancas_v01';
let state=JSON.parse(localStorage.getItem(DBKEY)||'{"clients":{},"summary":null,"lastImport":null}');
let currentId=null, deferredPrompt=null;

if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').hidden=true}};

function save(){localStorage.setItem(DBKEY,JSON.stringify(state));render()}
function brl(v){return Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}
function isoFromBR(s){if(!s)return'';let [d,m,y]=s.split('/');if(y.length===2)y='20'+y;return `${y}-${m}-${d}`}
function localDate(s){if(!s)return'—';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function todayISO(add=0){let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+add);return d.toISOString().slice(0,10)}
function statusOf(c){if(c.paid)return'pago';if(!c.promiseDate)return'sem';if(c.promiseDate===todayISO())return'hoje';if(c.promiseDate===todayISO(1))return'amanha';if(c.promiseDate<todayISO())return'vencidas';return'futura'}
function oldestDays(c){return Math.max(0,...(c.installments||[]).map(x=>x.daysLate||0))}
function totalK(c){return (c.installments||[]).reduce((s,x)=>s+(x.valorK||0),0)}
function normalizePhone(s){return (s||'').replace(/\D/g,'')}

function render(){
 const arr=Object.values(state.clients).filter(c=>!c.paid);
 $('sClientes').textContent=arr.length;
 $('sHoje').textContent=arr.filter(c=>statusOf(c)==='hoje').length;
 $('sAmanha').textContent=arr.filter(c=>statusOf(c)==='amanha').length;
 $('sVencidas').textContent=arr.filter(c=>statusOf(c)==='vencidas').length;
 $('lastImport').textContent=state.lastImport?`Última importação: ${new Date(state.lastImport).toLocaleString('pt-BR')}`:'Nenhum PDF importado.';
 const s=state.summary||{};$('sumDocs').textContent=s.documents??'—';$('sumClients').textContent=s.clients??'—';$('sumValorK').textContent=s.valorK!=null?brl(s.valorK):'—';$('sumReceber').textContent=s.valorReceber!=null?brl(s.valorReceber):'—';
 const q=$('search').value.trim().toLowerCase(),f=$('filter').value;
 let filtered=arr.filter(c=>!q||[c.name,c.city,c.cpf,c.code].join(' ').toLowerCase().includes(q));
 if(f!=='todos')filtered=filtered.filter(c=>statusOf(c)===f);
 filtered.sort((a,b)=>{const rank={vencidas:0,hoje:1,amanha:2,futura:3,sem:4};return (rank[statusOf(a)]-rank[statusOf(b)])||oldestDays(b)-oldestDays(a)});
 $('clientList').innerHTML=filtered.length?filtered.map(c=>clientCard(c)).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
 document.querySelectorAll('.client').forEach(el=>el.onclick=()=>openClient(el.dataset.id));
}
function clientCard(c){const st=statusOf(c), lab={hoje:'Previsão hoje',amanha:'Previsão amanhã',vencidas:'Previsão vencida',sem:'Sem previsão',futura:`Prev. ${localDate(c.promiseDate)}`}[st]||st;const cls=st==='vencidas'?'alert':(st==='hoje'||st==='amanha')?'warn':'';return `<div class="client" data-id="${c.id}"><div><h3>${c.name}</h3><p>${c.city||'Cidade não informada'} • ${c.agent||'Agente não identificado'}</p><div class="chips"><span class="chip ${cls}">${lab}</span><span class="chip">${(c.installments||[]).length} parcela(s)</span><span class="chip">${oldestDays(c)} dias</span></div></div><div class="money">${brl(totalK(c))}<small>Valor K em atraso</small></div></div>`}

function openClient(id){const c=state.clients[id];if(!c)return;currentId=id;$('dName').textContent=c.name;$('dMeta').textContent=`${c.code||''} • ${c.cpf||''}`;$('detailGrid').innerHTML=`<div><small>Cidade</small>${c.city||'—'}</div><div><small>Telefone</small>${c.phone||'—'}</div><div><small>Último pagamento</small>${c.lastPayment||'—'}</div><div><small>Parcelas em atraso</small>${(c.installments||[]).length}</div><div><small>Maior atraso</small>${oldestDays(c)} dias</div><div><small>Valor K</small>${brl(totalK(c))}</div>`;$('promiseDate').value=c.promiseDate||'';$('note').value='';const ph=normalizePhone(c.whatsapp||c.phone);$('whatsappBtn').href=ph?`https://wa.me/${ph.startsWith('55')?ph:'55'+ph}`:'#';$('phoneBtn').href=ph?`tel:+${ph.startsWith('55')?ph:'55'+ph}`:'#';renderHistory(c);$('clientDialog').showModal()}
function renderHistory(c){$('history').innerHTML=(c.history||[]).slice().reverse().map(h=>`<div class="history-item"><strong>${h.note||h.type}</strong><br><small>${new Date(h.at).toLocaleString('pt-BR')}${h.promiseDate?' • previsão '+localDate(h.promiseDate):''}</small></div>`).join('')||'<div class="empty">Sem histórico.</div>'}
$('saveCollection').onclick=()=>{const c=state.clients[currentId];if(!c)return;const note=$('note').value.trim(),promiseDate=$('promiseDate').value;c.promiseDate=promiseDate;c.history=c.history||[];c.history.push({type:'cobranca',note:note||'Cobrança registrada',promiseDate,at:new Date().toISOString()});save();openClient(currentId)};
$('markPaid').onclick=()=>{const c=state.clients[currentId];if(!c)return;c.paid=true;c.history=c.history||[];c.history.push({type:'pago',note:'Marcado como pago',at:new Date().toISOString()});save();$('clientDialog').close()};

$('search').oninput=render;$('filter').onchange=render;document.querySelectorAll('.stat').forEach(b=>b.onclick=()=>{$('filter').value=b.dataset.filter;render()});

function moneyBR(s){if(!s)return 0;return Number(s.replace(/\./g,'').replace(',','.'))||0}
function field(block,label,nextLabels){const next=nextLabels.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');const re=new RegExp(label+'\\s*:?\\s*([\\s\\S]*?)(?=\\s+(?:'+next+')\\s*:?|$)','i');const m=block.match(re);return m?m[1].replace(/\s+/g,' ').trim():''}
function parsePDFText(text){
 text=text.replace(/\r/g,'');
 const summary={};let m;
 m=text.match(/Quantidade de Documentos\s+(\d+)/i);if(m)summary.documents=+m[1];
 m=text.match(/Quantidade de Clientes\s+(\d+)/i);if(m)summary.clients=+m[1];
 m=text.match(/Valor K\s+([\d.]+,\d{2})/i);if(m)summary.valorK=moneyBR(m[1]);
 m=text.match(/Valor Receber\s+([\d.]+,\d{2})/i);if(m)summary.valorReceber=moneyBR(m[1]);
 const clients=[]; const starts=[...text.matchAll(/Cliente:\s*(\d+)\s*-\s*/g)];
 for(let i=0;i<starts.length;i++){
   const start=starts[i].index,end=i+1<starts.length?starts[i+1].index:(text.indexOf('Resumo Geral',start)>start?text.indexOf('Resumo Geral',start):text.length);
   const block=text.slice(start,end); const head=block.match(/Cliente:\s*(\d+)\s*-\s*([\s\S]*?)\s+CPF:\s*([\d.\-]+)/i); if(!head)continue;
   const code=head[1],name=head[2].replace(/\s+/g,' ').trim(),cpf=head[3];
   const agentMatch=text.slice(Math.max(0,start-500),start).match(/Agente de Crédito:\s*([^\n]+)/gi);let agent='';if(agentMatch){agent=agentMatch[agentMatch.length-1].replace(/Agente de Crédito:\s*/i,'').trim()}
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
   while((r=rowRe.exec(block))){const rest=r[3], monies=[...rest.matchAll(/[\d.]+,\d{2}/g)].map(x=>moneyBR(x[0]));const before=rest.slice(0,rest.search(/[\d.]+,\d{2}/)).trim().split(/\s+/);const nums=before.map(x=>/^\d+$/.test(x)?+x:null).filter(x=>x!=null);const days=nums.length?nums[nums.length-1]:0;installments.push({parcel:r[1],due:isoFromBR(r[2]),daysLate:days,valorK:monies[0]||0,valorReceber:monies[1]||0,saldo:monies[monies.length-1]||0})}
   clients.push({id:code,code,name,cpf,agent,city,phone,whatsapp:wa,lastPayment,activity,line,address,installments});
 }
 return {summary,clients};
}

async function extractPDF(file){
 if(!window.pdfjsLib) throw new Error('Biblioteca de leitura de PDF não carregada. Abra o app com internet uma vez para armazená-la offline.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
 const data=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data}).promise;let full='';
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),tc=await page.getTextContent();let line='';for(const item of tc.items){line+=item.str+(item.hasEOL?'\n':' ')}full+=line+'\n'}return full;
}
$('pdfInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const box=$('importStatus');box.hidden=false;box.className='notice';box.textContent='Lendo PDF...';try{const text=await extractPDF(file),parsed=parsePDFText(text);if(!parsed.clients.length)throw new Error('Nenhum cliente foi reconhecido neste PDF.');let preserved=0;for(const c of parsed.clients){const old=state.clients[c.id];if(old){c.history=old.history||[];c.promiseDate=old.promiseDate||'';c.paid=false;preserved++}else{c.history=[];c.promiseDate='';c.paid=false}state.clients[c.id]=c}
 // clientes ausentes no PDF ficam arquivados, sem apagar histórico
 Object.values(state.clients).forEach(c=>{if(!parsed.clients.some(n=>n.id===c.id)&&!c.paid)c.archived=true});parsed.clients.forEach(c=>state.clients[c.id].archived=false);
 state.summary=parsed.summary;state.lastImport=new Date().toISOString();save();const ok=(!parsed.summary.clients||parsed.summary.clients===parsed.clients.length)&&(!parsed.summary.documents||parsed.summary.documents===parsed.clients.reduce((s,c)=>s+c.installments.length,0));box.className='notice '+(ok?'ok':'bad');box.textContent=ok?`Importação conferida: ${parsed.clients.length} clientes e ${parsed.clients.reduce((s,c)=>s+c.installments.length,0)} documentos. Histórico preservado em ${preserved} cliente(s).`:`Importação concluída, mas a conferência do Resumo Geral apresentou divergência. Revise antes de usar.`}catch(err){box.className='notice bad';box.textContent='Erro: '+err.message}finally{e.target.value=''}};

$('backupBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-gestao-cobrancas-'+todayISO()+'.json';a.click();URL.revokeObjectURL(a.href)};
$('restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.clients)throw 0;state=obj;save();alert('Backup restaurado com sucesso.')}catch{alert('Arquivo de backup inválido.')}e.target.value=''};

// Alerta interno ao abrir o app
setTimeout(()=>{const arr=Object.values(state.clients).filter(c=>!c.paid&&!c.archived);const hoje=arr.filter(c=>statusOf(c)==='hoje').length,amanha=arr.filter(c=>statusOf(c)==='amanha').length,venc=arr.filter(c=>statusOf(c)==='vencidas').length;if(hoje||amanha||venc){$('importStatus').hidden=false;$('importStatus').className='notice';$('importStatus').textContent=`Atenção: ${hoje} previsão(ões) para hoje, ${amanha} para amanhã e ${venc} vencida(s).`}},400);
render();
