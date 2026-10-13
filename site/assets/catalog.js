'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const KEY = 'gamepulse-v1';
const palette = [
  {bg:'#e7ebda',ink:'#64734b',line:'#cad3b4',glyph:'✦'},
  {bg:'#f3e5d5',ink:'#b9784f',line:'#dfc5a4',glyph:'◈'},
  {bg:'#dfe8e8',ink:'#5d8086',line:'#bdd0d2',glyph:'⌘'},
  {bg:'#e8e3ef',ink:'#877199',line:'#d0c4dd',glyph:'✧'},
  {bg:'#e7ebdd',ink:'#75865a',line:'#c8d2b4',glyph:'♜'},
  {bg:'#f1e4dd',ink:'#b67b67',line:'#dfc4b8',glyph:'✳'}
];
const seed = [];
const platforms = ['全部平台','WeGame','微信游戏','QQ游戏','应用宝','TapTap','Epic Games'];
const rewards = ['全部奖励','游戏道具','皮肤外观','礼包福利','免费游戏','实物周边'];
const symbols = {'全部平台':'▦','WeGame':'W','微信游戏':'◉','QQ游戏':'Q','应用宝':'▣','TapTap':'T','Epic Games':'E'};
const state = {platform:'全部平台',reward:'全部奖励',tab:'all',query:'',sort:'recommended',hideDone:false,limit:24,view:location.hash==='#saved'?'saved':'discover'};
let personal = {saved:[],progress:{},reports:[],catalog:null};
let activities = [];
let sharedCatalog = null;
let catalogRevision = null;
let catalogLoading = true;
let catalogError = false;
let catalogFetching = false;
let currentId = null;
let toastTimer;
function escapeHtml(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function readPersonal() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)||'null');
    if (saved && typeof saved==='object') {
      personal.saved=Array.isArray(saved.saved)?saved.saved.filter(x=>typeof x==='string'):[];
      personal.progress=saved.progress && typeof saved.progress==='object' && !Array.isArray(saved.progress)?Object.fromEntries(Object.entries(saved.progress).filter(([,v])=>['todo','doing','done'].includes(v))):{};
      personal.reports=Array.isArray(saved.reports)?saved.reports.slice(-500):[];
      if (Array.isArray(saved.catalog) && saved.catalog.length) {personal.catalog=validateCatalog(saved.catalog);activities=personal.catalog;}
    }
  } catch {toast('浏览器数据暂不可用，仍可浏览；请尝试导入备份。');}
}
function persist() {try {localStorage.setItem(KEY,JSON.stringify(personal));return true;}catch{toast('浏览器无法保存数据，本次记录仅在当前页面有效。');return false;}}
function dayEnd(s) {return s?new Date(s+'T23:59:59+08:00').getTime():NaN;}
function dayStart(s) {return s?new Date(s+'T00:00:00+08:00').getTime():NaN;}
function endTimestamp(a){return a.endsAt?Date.parse(a.endsAt):dayEnd(a.end);}
function startTimestamp(a){return a.startsAt?Date.parse(a.startsAt):dayStart(a.start);}
function getStatus(a) {if(!a.end||a.dateQuality==='uncertain')return 'unknown';const now=Date.now();if(endTimestamp(a)<now)return 'ended';if(startTimestamp(a)>now)return 'upcoming';if(endTimestamp(a)-now<=3*86400000)return 'soon';return 'live';}
function timeLabel(a) {const s=getStatus(a);if(s==='unknown')return '时间待核实';if(s==='ended')return '已结束';if(s==='upcoming')return '即将开始';const days=Math.ceil((endTimestamp(a)-Date.now())/86400000);return days<=3?`剩余 ${days} 天`:'进行中';}
function dateShort(d){return d?d.slice(5).replace('-','.'): '待核实';}
function progress(a){const v=Object.hasOwn(personal.progress,a.id)?personal.progress[a.id]:'todo';return {value:v,text:{todo:'未参与',doing:'参与中',done:'已完成'}[v]};}
function heartSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';}
function artStyle(a){const p=palette[a.art%palette.length]||palette[0];return `--card-bg:${p.bg};--card-ink:${p.ink};--card-line:${p.line}`;}
function renderFilters(){
  const allPlatforms=['全部平台',...new Set(activities.map(a=>a.platform))];
  const allRewards=['全部奖励',...new Set(activities.map(a=>a.rewardType))];
  $('#platform-filters').innerHTML=allPlatforms.map((p,i)=>`<button class="filter-option ${state.platform===p?'active':''}" data-platform="${escapeHtml(p)}" aria-pressed="${state.platform===p}"><span class="filter-symbol">${escapeHtml(symbols[p]||'◈')}</span>${escapeHtml(p)}<small>${i===0?activities.length:activities.filter(a=>a.platform===p).length}</small></button>`).join('');
  $('#reward-filters').innerHTML=allRewards.map(p=>`<button class="filter-option ${state.reward===p?'active':''}" data-reward="${escapeHtml(p)}" aria-pressed="${state.reward===p}">${escapeHtml(p)}</button>`).join('');
}
function filtered(){
  let list=activities.filter(a=>{
    const s=getStatus(a);
    return (state.view!=='saved'||personal.saved.includes(a.id))&&(state.platform==='全部平台'||a.platform===state.platform)&&(state.reward==='全部奖励'||a.rewardType===state.reward)&&(!state.query||[a.game,a.title,a.reward,a.platform,a.condition].join(' ').toLowerCase().includes(state.query.toLowerCase()))&&(!state.hideDone||progress(a).value!=='done')&&(state.tab==='all'||(state.tab==='live'&&['live','soon'].includes(s))||(state.tab==='soon'&&s==='soon')||(state.tab==='ended'&&s==='ended')||(state.tab==='unknown'&&s==='unknown'));
  });
  const rank={live:0,soon:0,upcoming:1,unknown:2,ended:3};
  list.sort((a,b)=>state.sort==='ending'?(endTimestamp(a)||Infinity)-(endTimestamp(b)||Infinity):state.sort==='newest'?(startTimestamp(b)||0)-(startTimestamp(a)||0):rank[getStatus(a)]-rank[getStatus(b)]||Number(a.rewardType==='奖励待核实')-Number(b.rewardType==='奖励待核实')||String(b.observedAt||'').localeCompare(String(a.observedAt||'')));
  if(state.sort!=='recommended')return list;
  const result=[];
  for(let r=0;r<4;r++){const groups=new Map();for(const a of list){if(rank[getStatus(a)]!==r)continue;if(!groups.has(a.platform))groups.set(a.platform,[]);groups.get(a.platform).push(a);}let offset=0;while(true){let added=false;for(const rows of groups.values())if(rows[offset]){result.push(rows[offset]);added=true;}if(!added)break;offset++;}}
  return result;
}
function render(){
  renderFilters();
  const validSaved=activities.filter(a=>personal.saved.includes(a.id)).length;
  $('#saved-count').textContent=validSaved;$('#stat-saved').textContent=validSaved;
  $('#stat-all').textContent=activities.length;$('#stat-soon').textContent=activities.filter(a=>getStatus(a)==='soon').length;$('#stat-platform').textContent=new Set(activities.map(a=>a.platform)).size;
  $('#hero').hidden=state.view==='saved';
  $('#nav-discover').classList.toggle('active',state.view==='discover');$('#nav-saved').classList.toggle('active',state.view==='saved');
  $('#list-title').innerHTML=state.view==='saved'?'我的活动收藏<span class="orange-text">.</span>':'发现值得玩的活动<span class="orange-text">.</span>';
  $('#list-note').textContent=state.view==='saved'?'给心动的活动，留一个位置':'每一次参与，都有所收获';
  const published=sharedCatalog?.publishedAt?new Date(sharedCatalog.publishedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'等待首次同步';
  $('#data-notice p').innerHTML=personal.catalog?`<strong>本机导入清单</strong> ${activities.length} 条，仅当前浏览器可见。返回共享清单可查看监控最新数据。`:`<strong>受邀成员共享</strong> ${catalogLoading?'正在加载监控清单…':catalogError?'暂时无法连接，保留已加载的清单。':`最近同步 ${escapeHtml(published)}（北京时间）`} · 收录不代表奖励或资格已确认。`;
  const list=filtered();
  $('#result-count').textContent=`${list.length} 个活动`;
  $('#activity-grid').innerHTML=list.slice(0,state.limit).map(a=>{
    const p=palette[a.art%palette.length]||palette[0],saved=personal.saved.includes(a.id),s=getStatus(a),pr=progress(a);
    return `<article class="activity-card" style="${artStyle(a)}"><div class="card-art"><div class="card-art-name"><small>${a.demo?'ACTIVITY PREVIEW':'ACTIVITY DISCOVERY'}</small>${escapeHtml(a.game)}</div><span class="art-glyph" aria-hidden="true">${p.glyph}</span><span class="card-demo">${a.demo?'示例':a.shared?'监控收录':'导入'}</span></div><div class="card-body"><div class="card-meta"><span class="platform-tag">${escapeHtml(a.platform)}</span><span>${escapeHtml(a.rewardType)}</span><span class="time-badge ${s==='soon'?'urgent':s==='ended'?'ended':''}">${timeLabel(a)}</span></div><button class="card-title" data-detail="${escapeHtml(a.id)}">${escapeHtml(a.title)}</button><div class="card-reward"><span aria-hidden="true">♧</span>${escapeHtml(a.reward)}</div><div class="card-info"><span>◷ ${dateShort(a.start)} — ${dateShort(a.end)}</span><span>${escapeHtml(a.condition)}</span></div><div class="card-bottom"><span class="card-status ${pr.value==='done'?'done':''}">${pr.value==='done'?'✓':'○'} ${pr.text}</span><button class="card-detail" data-detail="${escapeHtml(a.id)}">查看详情 <span aria-hidden="true">↗</span></button><button class="heart-btn ${saved?'saved':''}" data-save="${escapeHtml(a.id)}" aria-label="${saved?'取消收藏':'收藏'}${escapeHtml(a.title)}" aria-pressed="${saved}">${heartSvg()}</button></div></div></article>`;
  }).join('');
  $('#empty-state').hidden=list.length>0;$('#results-foot').hidden=!list.length;
  $('#load-more').hidden=list.length<=state.limit;$('#results-foot').textContent=`已显示 ${Math.min(state.limit,list.length)} / ${list.length} 条活动 · 以官方公告为准`;
  const noSaved=state.view==='saved'&&!validSaved;
  $('#empty-description').textContent=catalogLoading&&!personal.catalog?'正在读取受邀成员共享清单…':catalogError&&!activities.length?'暂时无法读取活动，点击下方按钮重试。':noSaved?'还没有收藏？发现喜欢的活动，点击卡片上的爱心。':'试试其他关键词，或调整筛选条件。';
  $('#empty-action').textContent=noSaved?'去发现活动':'清除筛选';
  $$('.tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-pressed',String(b.dataset.tab===state.tab));});
  const chips=[];
  if(state.platform!=='全部平台')chips.push(['platform',state.platform]);if(state.reward!=='全部奖励')chips.push(['reward',state.reward]);if(state.query)chips.push(['query',`搜索：${state.query}`]);if(state.hideDone)chips.push(['hideDone','隐藏已完成']);
  $('#active-filters').innerHTML=chips.map(([key,label])=>`<button class="filter-chip" data-clear="${key}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('');
}
function reset(){Object.assign(state,{platform:'全部平台',reward:'全部奖励',tab:'all',query:'',hideDone:false,limit:24,sort:'recommended'});$('#search').value='';$('#sort').value='recommended';$('#hide-done').checked=false;render();}
function toggleSave(id){const exists=personal.saved.includes(id);personal.saved=exists?personal.saved.filter(x=>x!==id):[...personal.saved,id];const stored=persist();render();if($('#detail-dialog').open)showDetail(id,false);if(stored)toast(exists?'已取消收藏':'已加入我的收藏，保存在当前浏览器');}
function showDetail(id,open=true){
  const a=activities.find(a=>a.id===id);if(!a)return;currentId=id;const saved=personal.saved.includes(id),pr=progress(a);
  $('#detail-content').innerHTML=`<div class="detail-hero" style="${artStyle(a)}"><button class="dialog-close" aria-label="关闭活动详情" data-close>×</button><div class="card-art-name"><small>${a.demo?'ACTIVITY PREVIEW · 示例活动':a.shared?'MONITOR DISCOVERY · 监控收录':'IMPORTED ACTIVITY · 导入活动'}</small>${escapeHtml(a.game)}</div><span class="art-glyph" aria-hidden="true">${(palette[a.art%palette.length]||palette[0]).glyph}</span></div><div class="detail-main"><div class="card-meta"><span class="platform-tag">${escapeHtml(a.platform)}</span><span>${escapeHtml(a.rewardType)}</span><span>${timeLabel(a)}</span></div><h2>${escapeHtml(a.title)}</h2><div class="card-reward">♧ ${escapeHtml(a.reward)}</div><div class="detail-dates"><span>开始 ${escapeHtml(a.startsAt?new Date(a.startsAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):a.start||'待核实')}</span><span>结束 ${escapeHtml(a.endsAt?new Date(a.endsAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):a.end||'待核实')}（北京时间）</span></div><div class="detail-alert">${a.demo?'示例活动：日期、奖励与条件仅用于功能演示。下方链接通往官方页面，不是本示例的领取入口。':a.shared?'真实监控收录，最近发现：'+escapeHtml(new Date(a.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))+'。页面可访问不代表账号资格、奖励库存或领取成功；请以来源页面为准。':'导入内容未经本站核实。请确认官方活动、参与条件与截止时间后再参与。'}</div><h3>参与条件</h3><p>${escapeHtml(a.condition)}</p><h3>活动说明</h3><p>${escapeHtml(a.description)}</p><h3>参与步骤</h3><ul>${a.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul><div class="detail-actions"><a class="primary-btn" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${a.demo?'访问官方页面':'查看来源页面'} ↗</a><button class="secondary-btn" data-save="${escapeHtml(a.id)}">${saved?'♥ 已收藏':'♡ 收藏活动'}</button><button class="secondary-btn" id="change-progress">${pr.text} · 切换状态</button></div><div class="detail-small-actions"><button class="text-btn" id="add-calendar" ${!a.end?'disabled':''}>下载结束日期日历</button><button class="text-btn" id="report-issue">记录信息问题</button></div></div>`;
  if(open)$('#detail-dialog').showModal();
}
function showInfo(html){$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
function showDataTools(){showInfo(`<span class="section-kicker">YOUR DATA, YOUR WAY</span><h2>活动数据工具</h2><p>收藏、进度、问题记录和导入清单保存在<strong>当前浏览器</strong>。导入不会发布给其他访客；清理浏览器数据可能删除记录，建议导出备份。</p><div class="tools-grid"><button class="tool-row" id="export-personal"><span>↓</span><div><strong>导出我的完整备份</strong><small>收藏、参与进度、清单和问题记录</small></div></button><button class="tool-row" id="import-trigger"><span>↑</span><div><strong>导入活动清单 / 恢复备份</strong><small>JSON 格式 · 仅在当前浏览器生效</small></div></button><button class="tool-row" id="download-template"><span>▤</span><div><strong>下载活动清单模板</strong><small>填写核实后的信息，最多 12000 条</small></div></button><button class="tool-row" id="restore-demo"><span>↺</span><div><strong>返回成员共享清单</strong><small>使用监控更新的共享数据，保留收藏与进度</small></div></button></div>`);}
function download(name,data,type='application/json'){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function validateCatalog(raw){
  if(!Array.isArray(raw)||raw.length<1||raw.length>12000)throw new Error('清单需包含 1 到 12000 条活动。');
  const ids=new Set();
  return raw.map((a,i)=>{
    if(!a||typeof a!=='object')throw new Error(`第 ${i+1} 条活动格式不正确。`);
    const out={};
    for(const field of ['id','game','title','platform','rewardType','reward','condition','description','url']){
      if(typeof a[field]!=='string'||!a[field].trim()||a[field].length>(field==='description'?2000:field==='url'?2000:200))throw new Error(`第 ${i+1} 条缺少 ${field} 或内容过长。`);out[field]=a[field].trim();
    }
    if(ids.has(out.id)||['__proto__','constructor','prototype'].includes(out.id))throw new Error('活动 ID 重复或不合法。');ids.add(out.id);
    for(const f of ['start','end']){out[f]=a[f]||null;if(out[f]!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[f])||!Number.isFinite(dayStart(out[f]))||new Date(out[f]+'T12:00:00Z').toISOString().slice(0,10)!==out[f]))throw new Error(`第 ${i+1} 条日期无效，请使用 YYYY-MM-DD。`);}
    if(out.start&&out.end&&out.end<out.start)throw new Error(`第 ${i+1} 条结束日期早于开始日期。`);
    let url;try{url=new URL(out.url);}catch{throw new Error(`第 ${i+1} 条链接无效。`);}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('来源链接必须是无账号密码的 HTTP(S) 链接。');out.url=url.href;
    if(!Array.isArray(a.steps)||!a.steps.length||a.steps.length>12||a.steps.some(s=>typeof s!=='string'||!s.trim()||s.length>500))throw new Error(`第 ${i+1} 条需要 1 到 12 个有效参与步骤。`);
    out.startsAt=typeof a.startsAt==='string'&&Number.isFinite(Date.parse(a.startsAt))?a.startsAt:null;out.endsAt=typeof a.endsAt==='string'&&Number.isFinite(Date.parse(a.endsAt))?a.endsAt:null;out.observedAt=typeof a.observedAt==='string'?a.observedAt:null;out.timeEvidence=typeof a.timeEvidence==='string'?a.timeEvidence:'';out.dateQuality=a.dateQuality==='uncertain'||!out.end?'uncertain':'known';out.shared=a.shared===true;out.steps=a.steps.map(s=>s.trim());out.demo=a.demo===true;out.featured=a.featured===true;out.art=Number.isInteger(a.art)&&a.art>=0?a.art%palette.length:i%palette.length;return out;
  });
}
function calendar(a){
  if(!a?.end){toast('此活动没有可靠截止日期，无法生成日历。');return;}
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const dt=a.end.replace(/-/g,''),next=new Date(a.end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const nextDay=next.toISOString().slice(0,10).replace(/-/g,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GamePulse//Activity Calendar//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${encodeURIComponent(a.id)}@gamepulse.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${dt}`,`DTEND;VALUE=DATE:${nextDay}`,`SUMMARY:${esc((a.demo?'[示例] ':'')+a.title+' · 结束')}`,`DESCRIPTION:${esc((a.demo?'这是示例活动，不是真实活动提醒。\n':'')+a.description+'\n来源：'+a.url)}`,'END:VEVENT','END:VCALENDAR'];
  // Fold at UTF-8 byte boundaries for calendar clients.
  const enc=new TextEncoder();const folded=lines.flatMap(line=>{const result=[];let part='',bytes=0;for(const ch of line){const len=enc.encode(ch).length;if(bytes+len>73){result.push(part);part=' ';bytes=1;}part+=ch;bytes+=len;}result.push(part);return result;});
  download('游报-活动结束日.ics',folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8');toast(a.demo?'已下载示例日历，请勿当作真实活动提醒':'已下载日历，可导入手机或电脑日历');
}
function issueForm(){const a=activities.find(a=>a.id===currentId);if(!a)return;showInfo(`<span class="section-kicker">PERSONAL NOTES</span><h2>记录信息问题</h2><p>${escapeHtml(a.title)}<br>记录仅保存在本机，<strong>不会发送给站长或平台</strong>。可在数据工具中导出备份。</p><form id="report-form"><label for="issue-type">问题类型</label><select id="issue-type"><option>活动已结束</option><option>链接失效</option><option>奖励或条件不符</option><option>其他问题</option></select><label for="issue-note">补充说明（选填）</label><textarea id="issue-note" maxlength="500" placeholder="记下需要核实的地方…"></textarea><button class="primary-btn" type="submit">保存到本机 <span>↗</span></button></form>`);}
function dataAbout(){
  const sourceRows=(sharedCatalog?.sources||[]).map(s=>`<li><strong>${escapeHtml(s.platform)}</strong> · ${s.publishedCount} 条<br>来源更新：${escapeHtml(new Date(s.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))}</li>`).join('');
  showInfo(`<span class="section-kicker">SHARED MONITOR CATALOG</span><h2>来自你的活动监控</h2><p>此清单从活动监控的公开活动字段同步，全站访客看到相同的共享数据。收藏和个人参与进度仍仅保存在各自浏览器。</p><p>网站每分钟检查一次更新。同步组件或电脑停止运行时保留最后一次成功数据；最近发现时间是监控观察时间，不能代表此刻仍可领取。</p><p>不可靠的推断日期已移除，截止时间不明的活动标为“时间待核实”。页面、奖励和资格仍须在官方来源核对。</p><ul>${sourceRows||'<li>尚未获得平台数据。</li>'}</ul>`);
}
async function refreshCatalog(manual=false){
  if(catalogFetching)return;catalogFetching=true;
  try{
    const response=await window.gpFetch('/api/catalog',{cache:'no-store',headers:catalogRevision?{'If-None-Match':catalogRevision}:{},signal:AbortSignal.timeout(20000)});
    if(response.status===401||response.status===403){activities=[];sharedCatalog=null;render();window.gpShow('login');return;}
    if(response.status===304){catalogError=false;if(manual)toast('当前已是最新共享清单');return;}
    if(!response.ok)throw Error('catalog_unavailable');
    const raw=await response.json();
    if(raw.schemaVersion!==2||!Array.isArray(raw.activities))throw Error('invalid_catalog');
    const parsed=raw.activities.length?validateCatalog(raw.activities):[];
    sharedCatalog={...raw,activities:parsed};catalogRevision=response.headers.get('ETag');catalogError=false;
    if(!personal.catalog)activities=parsed;
    if(manual)toast(`已读取 ${parsed.length} 条共享活动`);
  }catch{catalogError=true;if(manual)toast('暂时无法读取更新，保留当前清单。');}
  finally{catalogLoading=false;catalogFetching=false;render();}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
  if(b.dataset.save){toggleSave(b.dataset.save);return;}
  if(b.dataset.detail){showDetail(b.dataset.detail);return;}
  if(b.dataset.platform){state.platform=b.dataset.platform;state.limit=24;render();return;}
  if(b.dataset.reward){state.reward=b.dataset.reward;state.limit=24;render();return;}
  if(b.dataset.tab){state.tab=b.dataset.tab;state.limit=24;render();return;}
  if(b.dataset.clear){const k=b.dataset.clear;state[k]=k==='platform'?'全部平台':k==='reward'?'全部奖励':k==='hideDone'?false:'';$('#search').value=state.query;$('#hide-done').checked=state.hideDone;render();return;}
  switch(b.id){
    case 'reset-filters':reset();break;
    case 'empty-action':if(catalogError&&!activities.length){refreshCatalog();break;}if(state.view==='saved'&&!activities.some(a=>personal.saved.includes(a.id))){location.hash='discover';reset();}else reset();break;
    case 'data-tools':showDataTools();break;
    case 'load-more':state.limit+=24;render();break;
    case 'refresh-catalog':refreshCatalog(true);break;
    case 'about-data':dataAbout();break;
    case 'privacy':showInfo('<span class="section-kicker">DATA & PRIVACY</span><h2>你的记录，由你掌握</h2><p>收藏、参与状态、问题记录与导入的清单保存在当前浏览器，不会自动上传或跨设备同步。清理浏览器数据、使用无痕窗口或更换设备，可能无法找回这些记录。</p><p>你可以在数据工具中导出备份，再在其他浏览器导入。不要在活动清单或问题记录里填写密码、令牌或其他敏感信息。</p><p>官方链接将在新标签页打开，外部平台的数据处理以各平台说明为准。本网站无需注册，不采集账号密码。</p>');break;
    case 'change-progress':{const a=activities.find(a=>a.id===currentId);const next={todo:'doing',doing:'done',done:'todo'}[progress(a).value];personal.progress[currentId]=next;const stored=persist();render();showDetail(currentId,false);if(stored)toast(`已标记：${progress(a).text}`);break;}
    case 'add-calendar':calendar(activities.find(a=>a.id===currentId));break;
    case 'report-issue':issueForm();break;
    case 'export-personal':download('游报-我的备份.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),...personal},null,2));toast('备份已导出');break;
    case 'download-template':download('游报-活动清单模板.json',JSON.stringify({activities:[{id:'your-activity-id',game:'游戏名称',title:'核实后的活动名称',platform:'游戏平台',rewardType:'奖励待核实',reward:'以官方活动页为准',start:null,end:null,condition:'以官方规则为准',description:'填写核实后的活动说明',url:'https://www.wegame.com.cn/',steps:['阅读并核对官方活动规则'],demo:false,art:0}]},null,2));toast('模板已下载，请替换示例内容并核实来源');break;
    case 'import-trigger':$('#import-file').click();break;
    case 'restore-demo':if(personal.catalog&&!confirm('返回成员共享清单将替换本机导入清单，建议先导出备份。继续吗？'))break;personal.catalog=null;activities=sharedCatalog?.activities||[];persist();reset();$('#info-dialog').close();toast('已返回受邀成员共享清单');break;
  }
});
document.addEventListener('submit',e=>{if(e.target.id!=='report-form')return;e.preventDefault();personal.reports.push({activityId:currentId,type:$('#issue-type').value,note:$('#issue-note').value.trim(),createdAt:new Date().toISOString()});personal.reports=personal.reports.slice(-500);const stored=persist();$('#info-dialog').close();if(stored)toast('问题已记在本机，未发送给站长');});
$('#search').addEventListener('input',e=>{state.query=e.target.value.trim().slice(0,200);state.limit=24;render();});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
$('#hide-done').addEventListener('change',e=>{state.hideDone=e.target.checked;render();});
window.addEventListener('hashchange',()=>{const view=location.hash==='#saved'?'saved':location.hash==='#discover'?'discover':null;if(view){state.view=view;reset();if(view==='saved')$('#activity-section').scrollIntoView({behavior:'smooth'});}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#search').focus();}});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('#import-file').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try {
    if(f.size>8*1024*1024)throw new Error('文件过大，请选择 8 MB 以内的 JSON 文件。');
    const raw=JSON.parse(await f.text());
    let catalog;let nextPersonal;
    if(raw&&raw.version===1&&Array.isArray(raw.saved)){
      catalog=raw.catalog===null?null:validateCatalog(raw.catalog);
      const ids=raw.saved.filter(id=>typeof id==='string'&&id.length<=200).slice(0,1000);
      const nextProgress=raw.progress&&typeof raw.progress==='object'&&!Array.isArray(raw.progress)?Object.fromEntries(Object.entries(raw.progress).filter(([id,v])=>id.length<=200&&!['__proto__','constructor','prototype'].includes(id)&&['todo','doing','done'].includes(v))):{};
      const reports=Array.isArray(raw.reports)?raw.reports.slice(-500).filter(r=>r&&typeof r.activityId==='string'&&typeof r.type==='string'&&typeof r.note==='string'&&r.note.length<=500).map(r=>({activityId:r.activityId.slice(0,200),type:r.type.slice(0,200),note:r.note,createdAt:typeof r.createdAt==='string'?r.createdAt.slice(0,50):''})):[];
      nextPersonal={saved:ids,progress:nextProgress,reports,catalog};
    }else{catalog=validateCatalog(Array.isArray(raw)?raw:raw?.activities);nextPersonal={...personal,catalog};}
    if(!confirm('导入将替换当前浏览器的活动清单；恢复备份还会替换收藏与进度。仅本机生效，建议先导出备份。继续吗？'))return;
    personal=nextPersonal;activities=catalog||sharedCatalog?.activities||[];const stored=persist();reset();$('#info-dialog').close();if(stored)toast(`已导入 ${activities.length} 条活动，仅当前浏览器可见`);
  }catch(err){toast(err instanceof SyntaxError?'文件不是有效的 JSON。':err.message||'导入失败，请检查文件。');}
  finally{e.target.value='';}
});
readPersonal();$('#year').textContent=new Date().getFullYear();render();
setInterval(()=>{if(!document.hidden&&window.gpHasSession())refreshCatalog();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.gpHasSession())refreshCatalog();});

let memberCsrf='';
async function loadMember(){try{const response=await window.gpFetch('/api/session',{cache:'no-store'});if(!response.ok){window.gpShow('login');return;}const user=await response.json();memberCsrf=user.csrf;document.querySelector('#member-label').textContent='受邀成员 · '+user.username;document.querySelector('#invite-admin').hidden=user.role!=='admin';}catch{toast('暂时无法读取登录状态。');}}
document.querySelector('#logout-member').addEventListener('click',async()=>{try{const r=await window.gpFetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok||r.status===401){activities=[];sharedCatalog=null;window.gpForgetSession();window.gpShow('login');}else toast('退出未成功，请重试。');}catch{toast('暂时无法连接，请重试。');}});
document.addEventListener('gp-authenticated',()=>{loadMember();refreshCatalog();});
document.addEventListener('gp-logout',()=>{activities=[];sharedCatalog=null;catalogRevision=null;render();});
