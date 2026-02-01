const editor = document.getElementById('editor');
const pageSelect = document.getElementById('pageSelect');
const newPageBtn = document.getElementById('newPageBtn');
const savePageBtn = document.getElementById('savePageBtn');
const fontSelect = document.getElementById('fontSelect');
const sizeSelect = document.getElementById('sizeSelect');
const colorPicker = document.getElementById('colorPicker');
const imageInput = document.getElementById('imageInput');
const addGroupBtn = document.getElementById('addGroupBtn');
const addRowBtn = document.getElementById('addRowBtn');
const addColBtn = document.getElementById('addColBtn');
const addTextWidget = document.getElementById('addTextWidget');
const addImageWidget = document.getElementById('addImageWidget');
const addHtmlWidget = document.getElementById('addHtmlWidget');
const logoutBtn = document.getElementById('logoutBtn');

let pages = [];
let currentSlug = null;
let selectedGroup = null;

async function ensureSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/';
  }
}

async function loadPages() {
  const res = await fetch('/api/nav');
  const data = await res.json();
  pages = flattenPages(data.items || []);
  pageSelect.innerHTML = '';
  pages.forEach((page) => {
    const option = document.createElement('option');
    option.value = page.slug;
    option.textContent = page.title;
    pageSelect.appendChild(option);
  });
  if (pages.length) {
    currentSlug = pages[0].slug;
    pageSelect.value = currentSlug;
    await loadPage(currentSlug);
  }
}

function flattenPages(items) {
  const result = [];
  items.forEach((item) => {
    if (item.type === 'page') {
      result.push(item);
      if (item.children?.length) {
        item.children.forEach((child) => result.push(child));
      }
    }
  });
  return result;
}

async function loadPage(slug) {
  const res = await fetch(`/api/pages/${slug}`);
  if (!res.ok) return;
  const data = await res.json();
  editor.innerHTML = data.page.content || '';
  currentSlug = slug;
}

function execCommand(command, value = null) {
  document.execCommand(command, false, value);
  editor.focus();
}

async function savePage() {
  if (!currentSlug) return;
  await fetch(`/api/pages/${currentSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.innerHTML }),
  });
  alert('Saved!');
}

async function createPage() {
  const title = prompt('Page title');
  if (!title) return;
  const slug = prompt('Page slug', title.toLowerCase().replace(/\s+/g, '-'));
  if (!slug) return;
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, slug, content: '' }),
  });
  if (!res.ok) {
    alert('Could not create page.');
    return;
  }
  await loadPages();
  pageSelect.value = slug;
  await loadPage(slug);
}

function insertImage(url) {
  const img = document.createElement('img');
  img.src = url;
  img.draggable = true;
  editor.appendChild(img);
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    alert('Upload failed');
    return;
  }
  const data = await res.json();
  insertImage(data.url);
}

function createGroup(rows = 1, cols = 1) {
  const group = document.createElement('div');
  group.className = 'grid-group';
  group.dataset.rows = rows;
  group.dataset.cols = cols;
  updateGroupGrid(group);
  for (let i = 0; i < rows * cols; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.contentEditable = true;
    cell.textContent = 'Widget';
    group.appendChild(cell);
  }
  editor.appendChild(group);
}

function updateGroupGrid(group) {
  const rows = Number(group.dataset.rows || 1);
  const cols = Number(group.dataset.cols || 1);
  group.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  group.style.gridTemplateRows = `repeat(${rows}, minmax(80px, auto))`;
}

function setSelectedGroup(target) {
  selectedGroup = target;
}

function addGroupRow() {
  if (!selectedGroup) return;
  const rows = Number(selectedGroup.dataset.rows || 1) + 1;
  selectedGroup.dataset.rows = rows;
  updateGroupGrid(selectedGroup);
  const cols = Number(selectedGroup.dataset.cols || 1);
  for (let i = 0; i < cols; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.contentEditable = true;
    cell.textContent = 'Widget';
    selectedGroup.appendChild(cell);
  }
}

function addGroupCol() {
  if (!selectedGroup) return;
  const cols = Number(selectedGroup.dataset.cols || 1) + 1;
  selectedGroup.dataset.cols = cols;
  updateGroupGrid(selectedGroup);
  const rows = Number(selectedGroup.dataset.rows || 1);
  for (let i = 0; i < rows; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.contentEditable = true;
    cell.textContent = 'Widget';
    selectedGroup.appendChild(cell);
  }
}

function addWidget(type) {
  if (!selectedGroup) return;
  const cell = document.createElement('div');
  cell.className = 'grid-cell';
  if (type === 'image') {
    cell.innerHTML = '<p>Image widget (upload into cell)</p>';
  } else if (type === 'html') {
    cell.innerHTML = '<code>&lt;div&gt;Custom HTML&lt;/div&gt;</code>';
  } else {
    cell.textContent = 'Text widget';
  }
  cell.contentEditable = true;
  selectedGroup.appendChild(cell);
}

editor.addEventListener('click', (event) => {
  const group = event.target.closest('.grid-group');
  if (group) {
    setSelectedGroup(group);
  }
});

pageSelect.addEventListener('change', (event) => loadPage(event.target.value));
newPageBtn.addEventListener('click', createPage);
savePageBtn.addEventListener('click', savePage);

fontSelect.addEventListener('change', (event) => execCommand('fontName', event.target.value));
sizeSelect.addEventListener('change', (event) => execCommand('fontSize', event.target.value));
colorPicker.addEventListener('change', (event) => execCommand('foreColor', event.target.value));

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadImage(file);
    imageInput.value = '';
  }
});

addGroupBtn.addEventListener('click', () => createGroup(1, 1));
addRowBtn.addEventListener('click', addGroupRow);
addColBtn.addEventListener('click', addGroupCol);
addTextWidget.addEventListener('click', () => addWidget('text'));
addImageWidget.addEventListener('click', () => addWidget('image'));
addHtmlWidget.addEventListener('click', () => addWidget('html'));

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

document.querySelectorAll('[data-command]').forEach((btn) => {
  btn.addEventListener('click', () => execCommand(btn.dataset.command));
});

(async function init() {
  await ensureSession();
  await loadPages();
})();
