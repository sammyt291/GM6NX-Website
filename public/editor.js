const editor = document.getElementById('editor');
const siteMap = document.getElementById('siteMap');
const newPageBtn = document.getElementById('newPageBtn');
const savePageBtn = document.getElementById('savePageBtn');
const fontSelect = document.getElementById('fontSelect');
const sizeSelect = document.getElementById('sizeSelect');
const colorPicker = document.getElementById('colorPicker');
const resetFormatBtn = document.getElementById('resetFormatBtn');
const imageInput = document.getElementById('imageInput');
const addGroupBtn = document.getElementById('addGroupBtn');
const addTextWidget = document.getElementById('addTextWidget');
const addImageWidget = document.getElementById('addImageWidget');
const addHtmlWidget = document.getElementById('addHtmlWidget');
const groupControls = document.getElementById('groupControls');
const groupRowsInput = document.getElementById('groupRowsInput');
const groupColsInput = document.getElementById('groupColsInput');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');

let pages = [];
let navItems = [];
let currentSlug = null;
let selectedGroup = null;
let draggingCell = null;
let dropTarget = null;
let dropPosition = null;
let toastTimeout = null;
const defaultTextColor = '#f5f7ff';
let activeColor = colorPicker?.value || defaultTextColor;

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
  navItems = data.items || [];
  pages = flattenPages(navItems);
  renderSiteMap();
  const nextSlug = pages.find((page) => page.slug === currentSlug)?.slug || pages[0]?.slug;
  if (nextSlug) {
    currentSlug = nextSlug;
    await loadPage(currentSlug);
  }
}

function flattenPages(items) {
  const result = [];
  items.forEach((item) => {
    if (item.type === 'page') {
      result.push(item);
      if (item.children?.length) {
        result.push(...flattenPages(item.children));
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

function setActiveColor(color) {
  activeColor = color;
  execCommand('foreColor', activeColor);
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimeout) {
    window.clearTimeout(toastTimeout);
  }
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

async function savePage() {
  if (!currentSlug) return;
  const res = await fetch(`/api/pages/${currentSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.innerHTML }),
  });
  if (!res.ok) {
    showToast('Save failed. Try again.');
    return;
  }
  showToast('Page saved.');
}

async function createPageAt(parentItems, insertIndex, asChild = false, initialTitle = '') {
  const title = initialTitle || prompt('Page title');
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
  const newItem = { id: slug, type: 'page', title, slug, children: [] };
  if (asChild) {
    parentItems.children = parentItems.children || [];
    parentItems.children.push(newItem);
  } else if (Array.isArray(parentItems)) {
    parentItems.splice(insertIndex + 1, 0, newItem);
  }
  await saveNavItems();
  await loadPages();
  currentSlug = slug;
  await loadPage(slug);
}

function insertImage(url, range = null) {
  const img = document.createElement('img');
  img.src = url;
  img.draggable = true;
  if (range) {
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(img);
  }
}

async function uploadImage(file, range = null) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    alert('Upload failed');
    return;
  }
  const data = await res.json();
  insertImage(data.url, range);
}

function createGroup(rows = 1, cols = 1) {
  const group = document.createElement('div');
  group.className = 'grid-group';
  group.dataset.rows = rows;
  group.dataset.cols = cols;
  updateGroupGrid(group);
  updateGroupCells(group);
  editor.appendChild(group);
}

function updateGroupGrid(group) {
  const rows = Number(group.dataset.rows || 1);
  const cols = Number(group.dataset.cols || 1);
  group.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  group.style.gridTemplateRows = `repeat(${rows}, minmax(80px, auto))`;
}

function updateGroupCells(group) {
  const rows = Number(group.dataset.rows || 1);
  const cols = Number(group.dataset.cols || 1);
  const targetCount = rows * cols;
  const cells = Array.from(group.querySelectorAll('.grid-cell'));
  if (cells.length > targetCount) {
    cells.slice(targetCount).forEach((cell) => cell.remove());
  }
  for (let i = cells.length; i < targetCount; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.contentEditable = true;
    cell.textContent = 'Widget';
    cell.draggable = true;
    group.appendChild(cell);
  }
}

function setSelectedGroup(target) {
  selectedGroup = target;
  if (selectedGroup) {
    groupRowsInput.value = selectedGroup.dataset.rows || 1;
    groupColsInput.value = selectedGroup.dataset.cols || 1;
    positionGroupControls();
    groupControls.classList.add('visible');
    groupControls.setAttribute('aria-hidden', 'false');
  } else {
    groupControls.classList.remove('visible');
    groupControls.setAttribute('aria-hidden', 'true');
  }
}

function updateGroupDimensions() {
  if (!selectedGroup) return;
  const rows = Math.max(1, Number(groupRowsInput.value || 1));
  const cols = Math.max(1, Number(groupColsInput.value || 1));
  selectedGroup.dataset.rows = rows;
  selectedGroup.dataset.cols = cols;
  updateGroupGrid(selectedGroup);
  updateGroupCells(selectedGroup);
  positionGroupControls();
}

function addWidget(type) {
  if (!selectedGroup) return;
  const cell = document.createElement('div');
  cell.className = 'grid-cell';
  if (type === 'image') {
    cell.innerHTML = '<p>Image widget (upload into cell)</p>';
    cell.contentEditable = true;
  } else if (type === 'html') {
    cell.contentEditable = false;
    cell.innerHTML = `
      <div class="html-widget">
        <textarea class="html-source" spellcheck="false">&lt;div&gt;Custom HTML&lt;/div&gt;</textarea>
        <div class="html-preview"></div>
      </div>
    `;
    const source = cell.querySelector('.html-source');
    const preview = cell.querySelector('.html-preview');
    preview.innerHTML = source.value;
    source.addEventListener('input', () => {
      preview.innerHTML = source.value;
    });
  } else {
    cell.textContent = 'Text widget';
    cell.contentEditable = true;
  }
  cell.draggable = true;
  selectedGroup.appendChild(cell);
}

function clearDropIndicator() {
  if (dropTarget) {
    dropTarget.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    dropTarget = null;
    dropPosition = null;
  }
  document.querySelectorAll('.grid-group.drag-target').forEach((group) => {
    group.classList.remove('drag-target');
  });
}

function updateDropIndicator(cell, position) {
  if (!cell) return;
  if (dropTarget && dropTarget !== cell) {
    dropTarget.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
  dropTarget = cell;
  dropPosition = position;
  cell.classList.add('drag-over');
  if (position === 'before') {
    cell.classList.add('drag-over-before');
    cell.classList.remove('drag-over-after');
  } else {
    cell.classList.add('drag-over-after');
    cell.classList.remove('drag-over-before');
  }
}

function positionGroupControls() {
  if (!selectedGroup) return;
  const wrapper = editor.closest('.editor-wrapper');
  if (!wrapper) return;
  const groupRect = selectedGroup.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const top = groupRect.top - wrapperRect.top;
  const left = groupRect.right - wrapperRect.left + 12;
  groupControls.style.top = `${Math.max(0, top)}px`;
  groupControls.style.left = `${left}px`;
}

function getDropRange(event) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(event.clientX, event.clientY);
  }
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
  }
  return null;
}

async function handleImageDrop(event) {
  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) return;
  event.preventDefault();
  const imageFile = files.find((file) => file.type.startsWith('image/'));
  if (!imageFile) return;
  const range = getDropRange(event);
  await uploadImage(imageFile, range);
}

async function saveNavItems() {
  await fetch('/api/nav', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: navItems }),
  });
}

function renderSiteMap() {
  siteMap.innerHTML = '';
  navItems.forEach((item, index) => {
    siteMap.appendChild(buildSiteMapItem(item, navItems, index));
  });
}

function buildSiteMapItem(item, parentItems, index) {
  if (item.type === 'divider') {
    const wrapper = document.createElement('div');
    wrapper.className = 'site-map-divider-wrapper';
    const divider = document.createElement('div');
    divider.className = 'site-map-divider';
    const actions = createSiteMapActions(parentItems, index);
    wrapper.append(divider, actions);
    return wrapper;
  }

  const container = document.createElement('div');
  container.className = 'site-map-item';
  if (item.slug === currentSlug) {
    container.classList.add('active');
  }
  const title = document.createElement('div');
  title.className = 'site-map-title';
  title.textContent = item.title;
  const actions = createSiteMapActions(parentItems, index, item);
  container.append(title, actions);
  container.addEventListener('click', () => {
    currentSlug = item.slug;
    loadPage(item.slug);
    renderSiteMap();
  });

  if (item.children?.length) {
    const children = document.createElement('div');
    children.className = 'site-map-children';
    item.children.forEach((child, childIndex) => {
      children.appendChild(buildSiteMapItem(child, item.children, childIndex));
    });
    const wrapper = document.createElement('div');
    wrapper.append(container, children);
    return wrapper;
  }

  return container;
}

function createSiteMapActions(parentItems, index, item = null) {
  const actions = document.createElement('div');
  actions.className = 'site-map-actions';
  const addButton = document.createElement('button');
  addButton.className = 'site-map-action';
  addButton.type = 'button';
  addButton.textContent = '+';
  addButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    const addDivider = prompt('Enter a page title or type "divider"');
    if (!addDivider) return;
    if (addDivider.toLowerCase() === 'divider') {
      parentItems.splice(index + 1, 0, { id: `divider-${Date.now()}`, type: 'divider' });
      await saveNavItems();
      renderSiteMap();
      return;
    }
    if (item && confirm('Add as a child page?')) {
      await createPageAt(item, index, true, addDivider);
      return;
    }
    await createPageAt(parentItems, index, false, addDivider);
  });

  const removeButton = document.createElement('button');
  removeButton.className = 'site-map-action';
  removeButton.type = 'button';
  removeButton.textContent = '−';
  removeButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!confirm('Remove this item from the site map?')) return;
    parentItems.splice(index, 1);
    await saveNavItems();
    await loadPages();
  });

  actions.append(addButton, removeButton);
  return actions;
}

editor.addEventListener('click', (event) => {
  const group = event.target.closest('.grid-group');
  if (group) {
    setSelectedGroup(group);
  } else {
    setSelectedGroup(null);
  }
});

editor.addEventListener('focus', () => {
  if (activeColor) {
    execCommand('foreColor', activeColor);
  }
});

editor.addEventListener('dragstart', (event) => {
  const cell = event.target.closest('.grid-cell');
  if (!cell) return;
  draggingCell = cell;
  event.dataTransfer.effectAllowed = 'move';
});

editor.addEventListener('dragend', () => {
  clearDropIndicator();
  draggingCell = null;
});

editor.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types && event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
    return;
  }
  const cell = event.target.closest('.grid-cell');
  if (cell && draggingCell) {
    event.preventDefault();
    const rect = cell.getBoundingClientRect();
    const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    updateDropIndicator(cell, position);
  }
  const group = event.target.closest('.grid-group');
  if (group && draggingCell) {
    document.querySelectorAll('.grid-group.drag-target').forEach((activeGroup) => {
      if (activeGroup !== group) activeGroup.classList.remove('drag-target');
    });
    group.classList.add('drag-target');
  }
});

editor.addEventListener('dragleave', (event) => {
  const cell = event.target.closest('.grid-cell');
  if (cell) {
    cell.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
  const group = event.target.closest('.grid-group');
  if (group) {
    group.classList.remove('drag-target');
  }
});

editor.addEventListener('drop', async (event) => {
  const cell = event.target.closest('.grid-cell');
  if (cell) {
    cell.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
  if (draggingCell && cell && draggingCell !== cell) {
    event.preventDefault();
    const parent = cell.parentElement;
    const draggingParent = draggingCell.parentElement;
    if (parent && parent === draggingParent) {
      if (dropPosition === 'before') {
        parent.insertBefore(draggingCell, cell);
      } else {
        const referenceNode = cell.nextSibling;
        parent.insertBefore(draggingCell, referenceNode);
      }
    }
    clearDropIndicator();
    draggingCell = null;
    return;
  }
  await handleImageDrop(event);
  clearDropIndicator();
  draggingCell = null;
});

newPageBtn.addEventListener('click', () => createPageAt(navItems, navItems.length - 1));
savePageBtn.addEventListener('click', savePage);

fontSelect.addEventListener('change', (event) => execCommand('fontName', event.target.value));
sizeSelect.addEventListener('change', (event) => execCommand('fontSize', event.target.value));
colorPicker.addEventListener('change', (event) => setActiveColor(event.target.value));
resetFormatBtn.addEventListener('click', () => execCommand('removeFormat'));

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadImage(file);
    imageInput.value = '';
  }
});

addGroupBtn.addEventListener('click', () => createGroup(1, 1));
addTextWidget.addEventListener('click', () => addWidget('text'));
addImageWidget.addEventListener('click', () => addWidget('image'));
addHtmlWidget.addEventListener('click', () => addWidget('html'));
groupRowsInput.addEventListener('change', updateGroupDimensions);
groupColsInput.addEventListener('change', updateGroupDimensions);

window.addEventListener('resize', positionGroupControls);
editor.addEventListener('scroll', positionGroupControls);

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

document.querySelectorAll('[data-command]').forEach((btn) => {
  btn.addEventListener('click', () => execCommand(btn.dataset.command));
});

(async function init() {
  document.execCommand('styleWithCSS', false, true);
  if (colorPicker) {
    colorPicker.value = defaultTextColor;
    activeColor = defaultTextColor;
  }
  await ensureSession();
  await loadPages();
  setActiveColor(activeColor);
})();
