const $ = s => document.querySelector(s);
const samples = [
  ['매일 손이 가는, 유리 머그컵','따뜻한 커피 한 잔이 더 좋아지는 이유. 가볍고 깔끔해서 매일 쓰기 좋아요.','살림·주방','쿠팡','☕'],
  ['책상 위 작은 쉼표, 무선 조명','눈부심 없이 은은하게. 좋아하는 공간의 분위기를 바꿔주는 작은 조명이에요.','라이프','토스쇼핑','💡'],
  ['가방에 쏙 들어가는 미니 보조배터리','외출할 때 든든한 작은 친구. 무겁지 않아서 가볍게 챙기기 좋아요.','디지털','쿠팡','🔋'],
  ['주방을 정리하는 우드 트레이','자주 쓰는 것들을 한곳에. 정리만 했을 뿐인데 공간이 한결 따뜻해져요.','살림·주방','쿠팡','🪵'],
  ['산뜻하게 시작하는 데일리 파우치','작은 소지품을 차곡차곡. 가방을 바꿀 때도 이것 하나만 챙기면 끝.','패션·뷰티','토스쇼핑','👝'],
  ['몰입이 필요한 순간, 무선 헤드폰','좋아하는 음악과 나만의 시간. 일할 때도 쉬는 날에도 함께해요.','디지털','쿠팡','🎧']
].map((x,i)=>({id:`demo-${i}`,title:x[0],summary:x[1],category:x[2],platform:x[3],symbol:x[4],demo:true}));
let links=[], key=sessionStorage.getItem('moa-key')||'', editId=null;
const escape = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,...options.headers}});
  const result=await response.json(); if(!response.ok)throw new Error(result.error||'요청에 실패했어요.'); return result;
}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,3200)}
function adminState(){ $('#add').hidden=!key;$('#logout').hidden=!key;$('#manage').hidden=!!key;render() }
function render(){
  const query=$('#search').value.trim().toLowerCase();
  const source=links.length?links:samples;
  const visible=source.filter(l=>`${l.title} ${l.summary}`.toLowerCase().includes(query));
  $('#count').textContent=visible.length;$('#collection-label').textContent=links.length?'전체 상품':'예시 상품';$('#demo-notice').hidden=!!links.length;$('#empty').hidden=!!visible.length;
  $('#cards').innerHTML=visible.map((l,i)=>`<article class="card">${l.demo?'<div class="product-row">':`<a class="product-row" href="${escape(l.url)}" target="_blank" rel="sponsored noopener noreferrer" aria-label="${escape(l.title)} 상품 보기">`}<div class="thumb" data-tone="${i%6+1}">${l.image?`<img src="${escape(/\.(cdninstagram|fbcdn|coupangcdn)\.(com|net)(\/|$)/.test(l.image)?`/thumbnail/${l.id}`:l.image)}" loading="lazy" alt="${escape(l.title)}" referrerpolicy="no-referrer">`:`<span class="${l.demo?'thumb-mark':'image-fallback'}">${l.demo?l.symbol:'moa'}</span>`}</div><div class="card-body"><h2>${escape(l.title)}</h2><p>${escape(l.summary)||'상품 링크를 확인해 보세요.'}</p><span class="platform">${l.demo?'예시 · ':''}${escape(l.platform)}</span></div>${l.demo?'':'<span class="row-arrow" aria-hidden="true">›</span>'}${l.demo?'</div>':'</a>'}${key&&!l.demo?`<div class="card-controls"><button data-edit="${l.id}">수정</button><button data-delete="${l.id}">삭제</button></div>`:''}</article>`).join('');
  document.querySelectorAll('.thumb img').forEach(img=>img.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='image-fallback';fallback.textContent='moa';img.replaceWith(fallback)}));
}
async function refresh(){links=await api('/api/links');render()}
$('#search').addEventListener('input',render);
$('#manage').onclick=()=>$('#login-dialog').showModal();
$('#logout').onclick=()=>{key='';sessionStorage.removeItem('moa-key');adminState();notify('로그아웃했어요.')};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#login-form').onsubmit=async e=>{e.preventDefault();const form=e.target;const old=key;key=form.elements.key.value.trim();try{await api('/api/auth',{method:'POST'});sessionStorage.setItem('moa-key',key);form.reset();form.querySelector('.form-error').textContent='';$('#login-dialog').close();adminState();notify('내 보관함을 관리할 수 있어요.')}catch(err){key=old;form.querySelector('.form-error').textContent=err.message}};
function openEditor(link){editId=link?.id||null;const form=$('#link-form');form.reset();form.querySelector('.form-error').textContent='';$('#meta-status').textContent='쿠팡·토스쇼핑·Threads 링크를 지원해요. 가져온 정보는 수정할 수 있어요.';for(const field of ['title','summary','image','category','url'])if(link)form.elements[field].value=link[field];$('#editor-title').textContent=link?'발견 수정하기':'새로운 발견 추가';$('#editor').showModal()}
$('#add').onclick=()=>openEditor();
$('#fetch-meta').onclick=async()=>{const form=$('#link-form'),button=$('#fetch-meta');button.disabled=true;$('#meta-status').textContent='상품 정보를 가져오는 중이에요…';try{const meta=await api('/api/metadata',{method:'POST',body:JSON.stringify({url:form.elements.url.value})});for(const name of ['title','summary','image'])if(meta[name])form.elements[name].value=meta[name];$('#meta-status').textContent=meta.title?'정보를 가져왔어요. 내용을 확인하고 저장해 주세요.':'공개된 상품 정보가 없어요. 아래에서 직접 입력해 주세요.'}catch(err){$('#meta-status').textContent=err.message}finally{button.disabled=false}};
$('#link-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=$('#save-link');button.disabled=true;try{await api(editId?`/api/links/${editId}`:'/api/links',{method:editId?'PUT':'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();$('#editor').close();notify('보관함에 저장했어요.')}catch(err){form.querySelector('.form-error').textContent=err.message}finally{button.disabled=false}};
$('#cards').onclick=async e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openEditor(links.find(l=>l.id===Number(edit.dataset.edit)));if(del&&confirm('이 아이템을 보관함에서 삭제할까요?')){try{await api(`/api/links/${del.dataset.delete}`,{method:'DELETE'});await refresh();notify('삭제했어요.')}catch(err){notify(err.message)}}};
$('#share').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'모아 — 나의 취향 보관함',url:location.href});else{await navigator.clipboard.writeText(location.href);notify('페이지 주소를 복사했어요.')}}catch(err){if(err.name!=='AbortError')notify('브라우저 주소창에서 주소를 복사해 주세요.')}};
adminState();refresh().catch(()=>{ $('#cards').textContent='보관함을 불러오지 못했어요. 페이지를 새로고침해 주세요.';$('#demo-notice').hidden=true });
