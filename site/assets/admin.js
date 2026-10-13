(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf='';
const statusText={active:'可访问',pending:'待批准',disabled:'已停用'};
const date=s=>new Date(s).toLocaleString('zh-CN',{hour12:false});
function message(text){$('#admin-message').textContent=text;}
async function api(path,method='GET',body){
  const response=await window.gpFetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(response.status===401){window.gpShow('login');throw Error('请重新登录');}
  const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'操作未成功，请重试。');return data;
}
async function load(){
  try{
    const session=await api('/api/session');if(session.role!=='admin'){window.gpShow('catalog');return;}
    csrf=session.csrf;$('#admin-name').textContent=session.username;
    const [users,invites,audit]=await Promise.all([api('/api/admin/users'),api('/api/admin/invites'),api('/api/admin/audit')]);
    $('#members').innerHTML=users.users.map(u=>`<div class="member-row"><div class="member-details"><strong>${esc(u.label)}</strong><small>${esc(u.username)} · ${u.role==='admin'?'管理员':'成员'}</small></div><span class="member-status ${esc(u.status)}">${statusText[u.status]}</span>${u.role==='admin'?'':`<button class="small-button ${u.status==='active'?'danger':''}" data-user="${u.id}" data-status="${u.status==='active'?'disabled':'active'}">${u.status==='active'?'取消访问':u.status==='pending'?'批准访问':'恢复访问'}</button>`}</div>`).join('');
    $('#invites').innerHTML=invites.invites.length?invites.invites.map(i=>`<div class="invite-item"><div>${esc(i.label)}<small>${i.cancelled?'已取消':i.used_by?'已使用':Date.parse(i.expires_at)<Date.now()?'已过期':'待接受'} · 截止 ${date(i.expires_at)}</small></div>${!i.used_by&&!i.cancelled&&Date.parse(i.expires_at)>Date.now()?`<button class="small-button danger" data-cancel="${i.id}">取消</button>`:''}</div>`).join(''):'<div class="empty">还没有邀请</div>';
    const labels={admin_initialized:'初始化管理员',member_registered:'成员注册待批准',member_active:'批准或恢复成员',member_disabled:'取消成员访问',invite_created:'创建邀请',invite_cancelled:'取消邀请',password_changed:'更新密码',catalog_synced:'同步活动清单'};
    $('#audit').innerHTML=audit.events.map(e=>`<div class="audit-row">${date(e.created_at)} · ${labels[e.action]||esc(e.action)} · 编号 ${esc(e.target)}</div>`).join('');
  }catch(error){message(error.message);}
}
$('#invite-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  try{const data=await api('/api/admin/invites','POST',{label:$('#invite-label').value.trim(),hours:Number($('#invite-hours').value)});$('#invite-url').value=data.url;$('#invite-result').hidden=false;message('邀请已生成。对方注册后，请在成员列表核对并批准。');await load();}
  catch(error){message(error.message);}finally{button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
    if(button.dataset.user){button.disabled=true;await api('/api/admin/users/'+button.dataset.user,'PATCH',{status:button.dataset.status});message(button.dataset.status==='disabled'?'访问已取消，已有登录已撤销。':'已批准访问，成员现在可以登录。');await load();}
    if(button.dataset.cancel){button.disabled=true;await api('/api/admin/invites/'+button.dataset.cancel,'DELETE');message('邀请已取消。');await load();}
    if(button.id==='copy-invite'){try{await navigator.clipboard.writeText($('#invite-url').value);message('已复制邀请链接。');}catch{$('#invite-url').focus();$('#invite-url').select();message('请手动复制上方链接。');}}
    if(button.id==='refresh-members')await load();
    if(button.id==='logout'){await api('/api/auth/logout','POST',{});window.gpForgetSession();window.gpShow('login');}
  }catch(error){message(error.message);}finally{button.disabled=false;}
});
$('#password-form').addEventListener('submit',async event=>{
  event.preventDefault();try{await api('/api/account/password','POST',{current:$('#current-password').value,password:$('#new-password').value});event.target.reset();await load();message('密码已更新，其他设备需要重新登录。');}catch(error){message(error.message);}
});
document.addEventListener('gp-admin',load);

})();
