(()=>{
  'use strict';
  const $=s=>document.querySelector(s);
  let accessToken='',user=null;
  const config=window.GP_CONFIG||{};
  const endpoint=config.endpoint||'';
  if(window.self!==window.top){document.body.textContent='请在独立窗口打开游报。';return;}
  const fragment=new URLSearchParams(location.hash.slice(1));
  const invitation=fragment.get('join')||'',handoff=fragment.get('handoff')||'',setupKey=fragment.get('setup')||'';
  if(invitation||handoff||setupKey)history.replaceState(null,'',location.pathname);
  window.gpHasSession=()=>Boolean(accessToken&&user);
  window.gpForgetSession=()=>{
    accessToken='';user=null;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    for(const id of ['detail-content','info-content','members','invites','audit']){const node=document.getElementById(id);if(node)node.replaceChildren();}
    document.dispatchEvent(new Event('gp-logout'));
  };
  window.gpShow=page=>{
    if(['catalog','admin'].includes(page)&&!window.gpHasSession())page='login';
    if(page==='admin'&&user?.role!=='admin')page='catalog';
    for(const name of ['login','join','setup','admin','catalog'])$('#'+name+'-view').hidden=name!==page;
    if(page==='admin')document.dispatchEvent(new Event('gp-admin'));
    if(page==='catalog')document.dispatchEvent(new Event('gp-authenticated'));
    window.scrollTo({top:0,behavior:'instant'});
  };
  window.gpFetch=async(path,options={})=>{
    if(!endpoint.startsWith('https://')||!path.startsWith('/api/'))throw Error('后台地址尚未配置。');
    const headers=new Headers(options.headers||{});if(accessToken)headers.set('Authorization','Bearer '+accessToken);
    const response=await fetch(endpoint+path.slice(4),{...options,headers,cache:'no-store',credentials:'omit'});
    if(response.ok&&['/api/auth/login','/api/auth/setup','/api/auth/exchange','/api/account/password'].includes(path)){
      const data=await response.clone().json();if(data.access_token){accessToken=data.access_token;user=data.user;}
    }
    if(response.status===401&&!['/api/auth/login','/api/auth/exchange','/api/auth/setup'].includes(path)){window.gpForgetSession();window.gpShow('login');}
    return response;
  };
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-view]');if(!control)return;event.preventDefault();window.gpShow(control.dataset.view);
  });
  for(const mode of ['login','join','setup']){
    const form=$('#'+mode+'-form'),message=$('#'+mode+'-message');
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;message.textContent='正在处理…';
      try{
        const password=$('#'+mode+'-password').value,confirm=$('#'+mode+'-confirm-password');
        if(confirm&&confirm.value!==password)throw Error('两次输入的密码不一致。');
        const body={username:$('#'+mode+'-username').value.trim(),password};
        if(mode==='join')body.invite=invitation;
        if(mode==='setup')body.key=$('#setup-setup-key').value.trim();
        const response=await window.gpFetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();
        if(!response.ok)throw Error(data.detail||'操作未成功，请重试。');
        $('#'+mode+'-password').value='';if(confirm)confirm.value='';
        if(mode==='join'){form.hidden=true;message.textContent=data.message;}
        else window.gpShow(user.role==='admin'?'admin':'catalog');
      }catch(error){message.textContent=error.message||'暂时无法连接，请稍后重试。';}
      finally{button.disabled=false;}
    });
  }
  if(invitation)window.gpShow('join');
  else if(setupKey){$('#setup-setup-key').value=setupKey;window.gpShow('setup');}
  else window.gpShow('login');
  if(handoff){
    $('#login-message').textContent='正在验证管理员入口…';
    window.gpFetch('/api/auth/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:handoff})}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.detail);$('#login-message').textContent='';window.gpShow(user.role==='admin'?'admin':'catalog');}).catch(error=>{$('#login-message').textContent=error.message||'入口已过期，请从本机重新打开。';});
  }
  if(!endpoint)$('#login-message').textContent='邀请站尚未完成部署，活动数据仍保持私有。';
})();
