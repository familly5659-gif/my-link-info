import { categories } from './categories.js';

const $ = selector => document.querySelector(selector);
const samples = [
  ['거품이 잘 나는 데일리 수세미', '주방에서 자주 쓰는 수세미, 쓰임에 맞게 골라보세요.', '주방', '수세미', '쿠팡', '🧽'],
  ['매일 손이 가는 유리 머그컵', '가볍고 깔끔해서 매일 쓰기 좋은 컵이에요.', '주방', '식기·컵', '쿠팡', '☕'],
  ['틈새까지 깔끔하게, 청소 브러시', '손이 잘 닿지 않는 틈새를 정리할 때 유용해요.', '청소', '청소용품', '토스쇼핑', '🪥'],
  ['빨래를 나누어 담는 세탁망', '작은 옷부터 차곡차곡, 세탁할 때 함께 챙겨요.', '청소', '세탁용품', '쿠팡', '🧺'],
  ['가방에 쏙 들어가는 미니 보조배터리', '외출할 때 가볍게 챙기기 좋은 작은 친구.', '디지털', '충전·배터리', '쿠팡', '🔋'],
  ['작은 물건을 모으는 수납 바구니', '자주 쓰는 것들을 한곳에 깔끔하게 모아두세요.', '생활·수납', '수납·정리', '쿠팡', '📦'],
  ['산뜻하게 시작하는 데일리 파우치', '가방을 바꿀 때도 작은 소지품을 한 번에.', '패션·뷰티', '패션잡화', '토스쇼핑', '👝'],
  ['책상 위 작은 쉼표, 무선 조명', '좋아하는 공간의 분위기를 바꿔주는 작은 조명.', '라이프', '조명', '토스쇼핑', '💡'],
].map((item, index) => ({ id: `demo-${index}`, title: item[0], summary: item[1], category: item[2], subcategory: item[3], platform: item[4], symbol: item[5], demo: true }));

let links = [];
let key = sessionStorage.getItem('moa-key') || '';
let editId = null;
let activeCategory = '';
let activeSubcategory = '';
let selected = new Set();
let deleting = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const source = () => links.length ? links : samples;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청에 실패했어요.');
  return result;
}

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}

function visibleLinks() {
  const query = $('#search').value.trim().toLowerCase();
  return source().filter(link => (!activeCategory || link.category === activeCategory)
    && (!activeSubcategory || link.subcategory === activeSubcategory)
    && `${link.title} ${link.summary} ${link.category} ${link.subcategory}`.toLowerCase().includes(query));
}

function renderCategories() {
  const items = source();
  const button = (label, value, count, current, attr) => `<button type="button" class="category-chip${value === current ? ' active' : ''}" ${attr}="${escape(value)}" aria-pressed="${value === current}">${escape(label)} <span>${count}</span></button>`;
  $('#main-categories').innerHTML = button('전체', '', items.length, activeCategory, 'data-main')
    + Object.keys(categories).map(name => button(name, name, items.filter(link => link.category === name).length, activeCategory, 'data-main')).join('');
  $('#subcategories').hidden = !activeCategory;
  if (activeCategory) {
    const group = items.filter(link => link.category === activeCategory);
    $('#subcategories').innerHTML = button('전체', '', group.length, activeSubcategory, 'data-sub')
      + categories[activeCategory].map(name => button(name, name, group.filter(link => link.subcategory === name).length, activeSubcategory, 'data-sub')).join('');
  } else $('#subcategories').innerHTML = '';
}

function syncSelection() {
  const visible = visibleLinks().filter(link => !link.demo);
  const ids = new Set(visible.map(link => link.id));
  selected = new Set([...selected].filter(id => ids.has(id)));
  $('#selected-count').textContent = `${selected.size}개 선택`;
  $('#bulk-delete').disabled = deleting || !selected.size;
  $('#bulk-delete').textContent = deleting ? '삭제 중…' : '선택 삭제';
  $('#select-all').checked = !!visible.length && selected.size === visible.length;
  $('#select-all').indeterminate = selected.size > 0 && selected.size < visible.length;
  $('#select-all').disabled = deleting || !visible.length;
  document.querySelectorAll('[data-select]').forEach(input => {
    input.checked = selected.has(Number(input.dataset.select));
    input.disabled = deleting;
    input.closest('.card').classList.toggle('selected', input.checked);
  });
}

function render() {
  const visible = visibleLinks();
  renderCategories();
  $('#count').textContent = visible.length;
  $('#collection-label').textContent = [activeCategory, activeSubcategory].filter(Boolean).join(' › ') || (links.length ? '전체 상품' : '예시 상품');
  $('#demo-notice').hidden = !!links.length;
  $('#empty').hidden = !!visible.length;
  $('#empty').textContent = $('#search').value.trim() ? '검색 결과가 없어요. 다른 단어로 찾아보세요.' : '아직 이 분류에 등록된 상품이 없어요.';
  $('#admin-help').hidden = !key;
  $('#bulk-toolbar').hidden = !key || !links.length;
  $('#cards').innerHTML = visible.map((link, index) => `<article class="card">
    ${link.demo ? '<div class="product-row">' : `<a class="product-row" href="${escape(link.url)}" target="_blank" rel="sponsored noopener noreferrer" aria-label="${escape(link.title)} 상품 보기">`}
      <div class="thumb" data-tone="${index % 6 + 1}">${link.image ? `<img src="${escape(/\.(cdninstagram|fbcdn|coupangcdn)\.(com|net)(\/|$)/.test(link.image) ? `/thumbnail/${link.id}` : link.image)}" loading="lazy" alt="${escape(link.title)}" referrerpolicy="no-referrer">` : `<span class="${link.demo ? 'thumb-mark' : 'image-fallback'}">${link.demo ? link.symbol : 'moa'}</span>`}</div>
      <div class="card-body"><h2>${escape(link.title)}</h2><p>${escape(link.summary) || '상품 링크를 확인해 보세요.'}</p><span class="platform">${link.demo ? '예시 · ' : ''}${escape(link.category)} › ${escape(link.subcategory)} · ${escape(link.platform)}</span></div>
      ${link.demo ? '' : '<span class="row-arrow" aria-hidden="true">›</span>'}
    ${link.demo ? '</div>' : '</a>'}
    ${key && !link.demo ? `<div class="card-controls"><label class="select-product"><input type="checkbox" data-select="${link.id}" aria-label="${escape(link.title)} 선택"> 선택</label><button data-edit="${link.id}">상품 수정</button><button data-delete="${link.id}">삭제</button></div>` : ''}
  </article>`).join('');
  document.querySelectorAll('.thumb img').forEach(img => img.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'image-fallback';
    fallback.textContent = 'moa';
    img.replaceWith(fallback);
  }));
  syncSelection();
}

function adminState() {
  $('#add').hidden = !key;
  $('#logout').hidden = !key;
  $('#manage').hidden = !!key;
  render();
}

async function refresh() {
  links = await api('/api/links');
  render();
}

function filterChanged() {
  selected.clear();
  render();
}

$('#search').addEventListener('input', filterChanged);
$('#main-categories').onclick = event => {
  const button = event.target.closest('[data-main]');
  if (!button) return;
  activeCategory = button.dataset.main;
  activeSubcategory = '';
  filterChanged();
};
$('#subcategories').onclick = event => {
  const button = event.target.closest('[data-sub]');
  if (!button) return;
  activeSubcategory = button.dataset.sub;
  filterChanged();
};
$('#manage').onclick = () => $('#login-dialog').showModal();
$('#logout').onclick = () => {
  key = '';
  selected.clear();
  sessionStorage.removeItem('moa-key');
  adminState();
  notify('로그아웃했어요.');
};
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
$('#login-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const oldKey = key;
  key = form.elements.key.value.trim();
  try {
    await api('/api/auth', { method: 'POST' });
    sessionStorage.setItem('moa-key', key);
    form.reset();
    form.querySelector('.form-error').textContent = '';
    $('#login-dialog').close();
    adminState();
    notify('상품 수정과 여러 상품 선택·삭제를 할 수 있어요.');
  } catch (error) {
    key = oldKey;
    form.querySelector('.form-error').textContent = error.message;
  }
};

const form = $('#link-form');
form.elements.category.innerHTML = Object.keys(categories).map(name => `<option>${escape(name)}</option>`).join('');
function populateSubcategories(value = '기타') {
  const names = categories[form.elements.category.value];
  form.elements.subcategory.innerHTML = names.map(name => `<option>${escape(name)}</option>`).join('');
  form.elements.subcategory.value = names.includes(value) ? value : '기타';
}
form.elements.category.onchange = () => populateSubcategories();
populateSubcategories();

function openEditor(link) {
  editId = link?.id || null;
  form.reset();
  form.querySelector('.form-error').textContent = '';
  $('#meta-status').textContent = '쿠팡·토스쇼핑·Threads 링크를 지원해요. 가져온 정보는 수정할 수 있어요.';
  if (link) {
    for (const field of ['title', 'summary', 'image', 'category', 'url']) form.elements[field].value = link[field];
    populateSubcategories(link.subcategory);
  } else {
    form.elements.category.value = activeCategory || '주방';
    populateSubcategories(activeSubcategory || '기타');
  }
  $('#editor-title').textContent = link ? '상품 수정' : '새 상품 추가';
  $('#editor').showModal();
}
$('#add').onclick = () => openEditor();
$('#fetch-meta').onclick = async () => {
  const button = $('#fetch-meta');
  button.disabled = true;
  $('#meta-status').textContent = '상품 정보를 가져오는 중이에요…';
  try {
    const meta = await api('/api/metadata', { method: 'POST', body: JSON.stringify({ url: form.elements.url.value }) });
    for (const name of ['title', 'summary', 'image']) if (meta[name]) form.elements[name].value = meta[name];
    $('#meta-status').textContent = meta.title ? '정보를 가져왔어요. 내용을 확인하고 저장해 주세요.' : '공개된 상품 정보가 없어요. 아래에서 직접 입력해 주세요.';
  } catch (error) { $('#meta-status').textContent = error.message; }
  finally { button.disabled = false; }
};
form.onsubmit = async event => {
  event.preventDefault();
  const button = $('#save-link');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    await api(editId ? `/api/links/${editId}` : '/api/links', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(values) });
    // Show the saved product even when it was moved to another category.
    activeCategory = values.category;
    activeSubcategory = values.subcategory;
    $('#search').value = '';
    selected.clear();
    await refresh();
    $('#editor').close();
    notify('보관함에 저장했어요.');
  } catch (error) { form.querySelector('.form-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#cards').onclick = async event => {
  const edit = event.target.closest('[data-edit]');
  const del = event.target.closest('[data-delete]');
  if (edit) openEditor(links.find(link => link.id === Number(edit.dataset.edit)));
  if (del && confirm('이 상품을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.')) {
    try {
      await api(`/api/links/${del.dataset.delete}`, { method: 'DELETE' });
      await refresh();
      notify('삭제했어요.');
    } catch (error) { notify(error.message); }
  }
};
$('#cards').onchange = event => {
  if (!event.target.matches('[data-select]')) return;
  const id = Number(event.target.dataset.select);
  if (event.target.checked) selected.add(id); else selected.delete(id);
  syncSelection();
};
$('#select-all').onchange = event => {
  selected = new Set(event.target.checked ? visibleLinks().filter(link => !link.demo).map(link => link.id) : []);
  syncSelection();
};
$('#bulk-delete').onclick = async () => {
  const ids = [...selected];
  if (!ids.length || deleting || !confirm(`선택한 상품 ${ids.length}개를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`)) return;
  deleting = true;
  syncSelection();
  try {
    const result = await api('/api/links/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    selected.clear();
    await refresh();
    notify(`${result.deleted}개 상품을 삭제했어요.`);
  } catch (error) { notify(error.message); }
  finally { deleting = false; syncSelection(); }
};
$('#share').onclick = async () => {
  try {
    if (navigator.share) await navigator.share({ title: '모아 — 나의 취향 보관함', url: location.href });
    else { await navigator.clipboard.writeText(location.href); notify('페이지 주소를 복사했어요.'); }
  } catch (error) { if (error.name !== 'AbortError') notify('브라우저 주소창에서 주소를 복사해 주세요.'); }
};

adminState();
refresh().catch(() => {
  $('#cards').textContent = '보관함을 불러오지 못했어요. 페이지를 새로고침해 주세요.';
  $('#demo-notice').hidden = true;
});
