// Keep the browser entry self-contained: older running servers only know /app.js.
export const APP_VERSION = '0.2.2';

export const categories = {
  '주방': ['수세미', '주방세제', '조리도구', '식기·컵', '주방수납', '기타'],
  '청소': ['청소용품', '세탁용품', '욕실청소', '청소기·기기', '기타'],
  '생활·수납': ['수납·정리', '생활잡화', '인테리어', '기타'],
  '디지털': ['충전·배터리', '음향기기', '모바일·PC', '기타'],
  '패션·뷰티': ['패션잡화', '의류', '뷰티', '기타'],
  '라이프': ['조명', '식품', '취미·여가', '기타'],
};

export function normalizeCategory(category, subcategory = '기타') {
  const main = category === '살림·주방' ? '주방' : category;
  if (!Object.hasOwn(categories, main) || !categories[main].includes(subcategory)) return null;
  return { category: main, subcategory };
}

function initializeApp() {
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
let serverCompatible = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const source = () => links.length ? links : samples;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...options.headers } });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('상품 관리 서버에 연결하지 못했습니다. 서버가 실행 중인지 확인해 주세요.');
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
  $('#admin-help').hidden = !key || !serverCompatible;
  $('#bulk-toolbar').hidden = !key || !links.length || !serverCompatible;
  $('#cards').innerHTML = visible.map((link, index) => `<article class="card">
    ${link.demo ? '<div class="product-row">' : `<a class="product-row" href="${escape(link.url)}" target="_blank" rel="sponsored noopener noreferrer" aria-label="${escape(link.title)} 상품 보기">`}
      <div class="thumb" data-tone="${index % 6 + 1}">${link.image ? `<img src="${escape(/\.(cdninstagram|fbcdn|coupangcdn)\.(com|net)(\/|$)/.test(link.image) ? `/thumbnail/${link.id}` : link.image)}" loading="lazy" alt="${escape(link.title)}" referrerpolicy="no-referrer">` : `<span class="${link.demo ? 'thumb-mark' : 'image-fallback'}">${link.demo ? link.symbol : 'eco.log94'}</span>`}</div>
      <div class="card-body"><h2>${escape(link.title)}</h2><p>${escape(link.summary) || '상품 링크를 확인해 보세요.'}</p><span class="platform">${link.demo ? '예시 · ' : ''}${escape(link.category)} › ${escape(link.subcategory)} · ${escape(link.platform)}</span></div>
      ${link.demo ? '' : '<span class="row-arrow" aria-hidden="true">›</span>'}
    ${link.demo ? '</div>' : '</a>'}
    ${key && serverCompatible && !link.demo ? `<div class="card-controls"><label class="select-product"><input type="checkbox" data-select="${link.id}" aria-label="${escape(link.title)} 선택"> 선택</label><button data-edit="${link.id}">상품 수정</button><button data-delete="${link.id}">삭제</button></div>` : ''}
  </article>`).join('');
  document.querySelectorAll('.thumb img').forEach(img => img.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'image-fallback';
    fallback.textContent = 'eco.log94';
    img.replaceWith(fallback);
  }));
  syncSelection();
}

function adminState() {
  $('#add').hidden = !key || !serverCompatible;
  $('#logout').hidden = !key;
  $('#manage').hidden = !!key;
  render();
}

async function refresh() {
  links = (await api('/api/links')).map(link => ({ ...link, category: link.category === '살림·주방' ? '주방' : link.category, subcategory: link.subcategory || '기타' }));
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
let photoAttempt = 0;
let photoController = null;
let uploadingPhoto = false;
let savingProduct = false;
function updateEditorButtons() {
  $('#save-link').disabled = uploadingPhoto || savingProduct;
  $('#image-file').disabled = savingProduct;
  form.elements.image.readOnly = savingProduct;
  $('#remove-image').disabled = savingProduct;
  $('#fetch-meta').disabled = uploadingPhoto || savingProduct || !!metadataController;
}
function cancelPhoto() {
  photoAttempt++;
  photoController?.abort();
  photoController = null;
  uploadingPhoto = false;
  updateEditorButtons();
}
function showImagePreview() {
  const value = form.elements.image.value.trim();
  const localPhoto = /^\/uploads\/[a-f0-9]{64}\.webp$/.test(value);
  let safe = localPhoto;
  $('#image-url-label').hidden = localPhoto;
  try { const url = new URL(value); safe = url.protocol === 'https:' && !url.username && !url.password; } catch {}
  $('#image-preview').hidden = !safe;
  if (safe) $('#preview-image').src = value;
  else $('#preview-image').removeAttribute('src');
}
$('#preview-image').onerror = () => {
  $('#image-preview').hidden = true;
  $('#image-url-label').hidden = false;
  $('#upload-status').textContent = '썸네일 미리보기를 불러오지 못했어요. 사진 파일을 선택하거나 이미지 주소를 확인해 주세요.';
};
form.elements.image.addEventListener('input', () => {
  cancelPhoto();
  $('#image-file').value = '';
  $('#upload-status').textContent = '입력한 이미지 주소를 썸네일로 사용합니다.';
  showImagePreview();
});
$('#remove-image').onclick = () => {
  cancelPhoto();
  form.elements.image.value = '';
  $('#image-file').value = '';
  $('#upload-status').textContent = '썸네일을 해제했어요. 상품을 저장하면 적용됩니다.';
  showImagePreview();
};
$('#image-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  cancelPhoto();
  cancelMetadata();
  if (!file.size || file.size > 10 * 1024 * 1024) {
    $('#upload-status').textContent = '빈 파일은 사용할 수 없으며, 사진 크기는 최대 10MB입니다.';
    event.target.value = '';
    return;
  }
  if (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    $('#upload-status').textContent = 'JPEG·PNG·WebP 사진을 선택해 주세요. HEIC 사진은 JPEG 등으로 변환한 뒤 선택하세요.';
    event.target.value = '';
    return;
  }
  const attempt = photoAttempt;
  photoController = new AbortController();
  uploadingPhoto = true;
  updateEditorButtons();
  $('#upload-status').textContent = '사진을 업로드하고 있어요. 완료 후 상품을 저장해 주세요.';
  try {
    const result = await api('/api/uploads', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file, signal: photoController.signal });
    if (attempt !== photoAttempt || !$('#editor').open) return;
    form.elements.image.value = result.image;
    showImagePreview();
    $('#upload-status').textContent = '사진이 준비됐어요. 아래의 저장 버튼을 누르면 상품 썸네일로 적용됩니다.';
  } catch (error) {
    if (attempt === photoAttempt && error.name !== 'AbortError') $('#upload-status').textContent = error.message;
  } finally {
    if (attempt === photoAttempt) {
      uploadingPhoto = false;
      photoController = null;
      updateEditorButtons();
    }
  }
};
form.elements.category.innerHTML = Object.keys(categories).map(name => `<option>${escape(name)}</option>`).join('');
function populateSubcategories(value = '기타') {
  const names = categories[form.elements.category.value];
  form.elements.subcategory.innerHTML = names.map(name => `<option>${escape(name)}</option>`).join('');
  form.elements.subcategory.value = names.includes(value) ? value : '기타';
}
form.elements.category.onchange = () => populateSubcategories();
populateSubcategories();

let metadataAttempt = 0;
let metadataController = null;
function cancelMetadata() {
  metadataAttempt++;
  metadataController?.abort();
  metadataController = null;
  updateEditorButtons();
  $('#fetch-meta').textContent = '↗ 링크에서 상품 정보 가져오기';
}
$('#editor').addEventListener('close', () => { cancelMetadata(); cancelPhoto(); });
form.elements.url.addEventListener('input', () => {
  cancelMetadata();
  $('#meta-status').textContent = '링크가 변경됐어요. 상품 정보를 다시 가져올 수 있습니다.';
});

function openEditor(link) {
  cancelMetadata();
  cancelPhoto();
  editId = link?.id || null;
  form.reset();
  form.querySelector('.form-error').textContent = '';
  $('#meta-status').textContent = '판매처가 자동 수집을 허용한 정보만 가져옵니다. 실패해도 아래에서 직접 입력해 저장할 수 있어요.';
  if (link) {
    for (const field of ['title', 'summary', 'image', 'category', 'url']) form.elements[field].value = link[field];
    populateSubcategories(link.subcategory);
  } else {
    form.elements.category.value = activeCategory || '주방';
    populateSubcategories(activeSubcategory || '기타');
  }
  $('#upload-status').textContent = '직접 찍은 JPEG·PNG·WebP 사진을 선택하세요. 최대 10MB까지 지원합니다.';
  showImagePreview();
  $('#editor-title').textContent = link ? '상품 수정' : '새 상품 추가';
  $('#editor').showModal();
}
$('#add').onclick = () => openEditor();
$('#fetch-meta').onclick = async () => {
  const input = form.elements.url;
  if (!input.value.trim() || !input.checkValidity()) {
    $('#meta-status').textContent = '상품 또는 Threads HTTPS 링크를 먼저 입력해 주세요.';
    input.focus();
    return;
  }
  cancelMetadata();
  const attempt = metadataAttempt;
  const url = input.value.trim();
  metadataController = new AbortController();
  const button = $('#fetch-meta');
  button.disabled = true;
  button.textContent = '상품 정보를 가져오는 중…';
  $('#meta-status').textContent = '판매처에 공개된 상품 정보를 확인하고 있어요. 최대 10초 정도 걸릴 수 있습니다.';
  try {
    const meta = await api('/api/metadata', { method: 'POST', signal: metadataController.signal, body: JSON.stringify({ url }) });
    if (attempt !== metadataAttempt || !$('#editor').open || input.value.trim() !== url) return;
    const fields = ['title', 'summary', 'image'].filter(name => typeof meta[name] === 'string' && meta[name].trim());
    if (!fields.length) {
      $('#meta-status').textContent = '가져올 수 있는 공개 상품 정보가 없어요. 상품 정보를 직접 입력해 주세요.';
      return;
    }
    const previous = fields.some(name => form.elements[name].value.trim() && form.elements[name].value !== meta[name]);
    if (previous && !confirm('현재 입력한 상품 정보를 가져온 정보로 바꿀까요? 취소하면 기존 내용은 유지됩니다.')) {
      $('#meta-status').textContent = '기존에 입력한 정보를 유지했어요. 필요한 내용만 직접 수정할 수 있습니다.';
      return;
    }
    for (const name of fields) form.elements[name].value = meta[name];
    showImagePreview();
    const labels = { title: '상품명', summary: '설명', image: '썸네일' };
    const missing = Object.keys(labels).filter(name => !fields.includes(name));
    $('#meta-status').textContent = missing.length
      ? `일부 정보를 가져왔어요. ${missing.map(name => labels[name]).join('·')}은 공개 정보가 없어 직접 입력해 주세요. 기존에 입력한 값은 유지됩니다.`
      : '상품명·설명·썸네일 주소를 가져왔어요. 내 리뷰에 맞게 수정한 뒤 저장해 주세요.';
  } catch (error) {
    if (attempt === metadataAttempt && error.name !== 'AbortError') $('#meta-status').textContent = error.message;
  } finally {
    if (attempt === metadataAttempt) {
      metadataController = null;
      updateEditorButtons();
      button.textContent = '↗ 링크에서 상품 정보 가져오기';
    }
  }
};
form.onsubmit = async event => {
  event.preventDefault();
  if (uploadingPhoto || savingProduct) return;
  cancelMetadata();
  savingProduct = true;
  updateEditorButtons();
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
  finally { savingProduct = false; updateEditorButtons(); }
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
    if (navigator.share) await navigator.share({ title: 'eco.log94', text: 'eco.log94가 고른 상품과 리뷰', url: location.href });
    else { await navigator.clipboard.writeText(location.href); notify('페이지 주소를 복사했어요.'); }
  } catch (error) { if (error.name !== 'AbortError') notify('브라우저 주소창에서 주소를 복사해 주세요.'); }
};

async function checkServer() {
  try {
    const status = await api('/api/status');
    serverCompatible = status.version === APP_VERSION;
    $('#runtime-notice').hidden = serverCompatible;
    if (!serverCompatible) $('#runtime-notice').textContent = '이전 서버가 실행 중입니다. 서버를 다시 시작한 뒤 이 페이지를 새로고침해 주세요.';
  } catch {
    $('#runtime-notice').hidden = false;
    $('#runtime-notice').textContent = '이전 서버가 실행 중이거나 연결을 확인할 수 없습니다. 서버를 다시 시작한 뒤 이 페이지를 새로고침해 주세요. 저장된 상품은 그대로 유지됩니다.';
  }
  adminState();
}

adminState();
checkServer();
refresh().catch(() => {
  $('#cards').textContent = '보관함을 불러오지 못했어요. 서버 연결을 확인한 뒤 페이지를 새로고침해 주세요.';
  $('#demo-notice').hidden = true;
});
}

if (typeof document !== 'undefined') initializeApp();
