const SUPABASE_URL='https://jzpwusukygflatnfuwqo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_IX4WvFc4SciqdtNVsZrodg_DRQ1St-y';

const cmSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

window.CMCloud={client:cmSupabase,ready:false,user:null,profile:null,carteiras:[]};

const byId=id=>document.getElementById(id);

function showAuthMessage(message,isError=false){
  const el=byId('authMessage');
  el.textContent=message||'';
  el.className='auth-message'+(isError?' error':'');
  el.hidden=!message;
}

async function loadCloudAccess(user){
  const {data:profile,error:profileError}=await cmSupabase
    .from('profiles')
    .select('id,nome,perfil,ativo')
    .eq('id',user.id)
    .single();
  if(profileError) throw new Error('Perfil não encontrado no sistema.');
  if(!profile?.ativo) throw new Error('Seu acesso está desativado.');

  const {data:carteiras,error:carteirasError}=await cmSupabase
    .from('carteiras')
    .select('id,codigo,nome_agente,ativa,ultima_atualizacao')
    .eq('ativa',true)
    .order('codigo');
  if(carteirasError) throw new Error('Não foi possível carregar as carteiras permitidas.');

  window.CMCloud.user=user;
  window.CMCloud.profile=profile;
  window.CMCloud.carteiras=carteiras||[];
  window.CMCloud.ready=true;
  return window.CMCloud;
}

function applyCloudIdentity(){
  const cloud=window.CMCloud;
  const gestor=cloud.profile?.perfil==='gestor';
  const codigos=(cloud.carteiras||[]).map(c=>c.codigo);
  document.body.dataset.role=gestor?'gestor':'agente';
  const importStatus=byId('importStatus'); if(importStatus){importStatus.hidden=true;importStatus.textContent='';importStatus.className='notice';}
  byId('userIdentity').textContent=gestor
    ? `${cloud.profile.nome} • Gestor`
    : `${cloud.profile.nome} • ${codigos.join(', ')||'Sem carteira'}`;
  byId('cloudStatus').textContent=gestor
    ? `Base central conectada • Alpha 3 • ${cloud.carteiras.length} carteira(s) cadastrada(s)`
    : `Base central conectada • Alpha 3 • carteira ${codigos.join(', ')||'não vinculada'}`;
  byId('managerImportLabel').hidden=!gestor;
  byId('managerImportLabel').style.display=gestor?'inline-flex':'none';
  byId('localDataPanel').hidden=!gestor;
  byId('localDataPanel').style.display=gestor?'grid':'none';
  byId('agentFilter').disabled=!gestor;
  byId('appShell').hidden=false;
  byId('authGate').hidden=true;
  document.dispatchEvent(new CustomEvent('cmcloudready'));
}

async function enterSession(session){
  if(!session?.user){
    window.CMCloud.ready=false;
    window.CMCloud.user=null;
    window.CMCloud.profile=null;
    window.CMCloud.carteiras=[];
    byId('appShell').hidden=true;
    byId('authGate').hidden=false;
    return;
  }
  try{
    showAuthMessage('Carregando seu acesso...');
    await loadCloudAccess(session.user);
    showAuthMessage('');
    applyCloudIdentity();
  }catch(err){
    await cmSupabase.auth.signOut();
    showAuthMessage(err.message||'Não foi possível validar seu acesso.',true);
  }
}

byId('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=byId('loginEmail').value.trim();
  const password=byId('loginPassword').value;
  const btn=byId('loginBtn');
  btn.disabled=true;
  showAuthMessage('Entrando...');
  const {error}=await cmSupabase.auth.signInWithPassword({email,password});
  if(error) showAuthMessage('E-mail ou senha inválidos.',true);
  btn.disabled=false;
});

byId('logoutBtn').addEventListener('click',async()=>{
  await cmSupabase.auth.signOut();
});

cmSupabase.auth.onAuthStateChange((_event,session)=>{enterSession(session)});
cmSupabase.auth.getSession().then(({data})=>enterSession(data.session));
