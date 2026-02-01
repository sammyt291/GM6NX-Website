const editor = document.getElementById('editor');
const siteMap = document.getElementById('siteMap');
const newPageBtn = document.getElementById('newPageBtn');
const savePageBtn = document.getElementById('savePageBtn');
const fontSelect = document.getElementById('fontSelect');
const sizeSelect = document.getElementById('sizeSelect');
const colorPicker = document.getElementById('colorPicker');
const resetFormatBtn = document.getElementById('resetFormatBtn');
const formatPainterBtn = document.getElementById('formatPainterBtn');
const imageInput = document.getElementById('imageInput');
const addGroupBtn = document.getElementById('addGroupBtn');
const addContentWidget = document.getElementById('addContentWidget');
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
let draggingImage = null;
let dropTarget = null;
let dropPosition = null;
let dropMarker = null;
let lastImageDropRange = null;
let toastTimeout = null;
let formatMode = false;
let formatTargetRange = null;
const defaultTextColor = '#f5f7ff';
let activeColor = colorPicker?.value || defaultTextColor;
let selectedImageBlock = null;
let groupDropMarker = null;
let groupDropMarkerGroup = null;
let groupDropTarget = null;

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
  normalizeEditorImages(editor);
  initializeHtmlWidgets(editor);
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
  syncHtmlWidgets(editor);
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
  const block = createImageBlock(img);
  if (range) {
    range.insertNode(block);
    range.setStartAfter(block);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(block);
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
  if (type === 'html') {
    cell.contentEditable = false;
    cell.innerHTML = `
      <div class="html-widget">
        <textarea class="html-source" spellcheck="false">&lt;div&gt;Custom HTML&lt;/div&gt;</textarea>
        <div class="html-preview"></div>
      </div>
    `;
    initializeHtmlWidgets(cell);
  } else {
    cell.textContent = 'Content widget';
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
  clearGroupDropMarker();
}

function clearGroupDropMarker() {
  if (groupDropMarker) {
    groupDropMarker.remove();
    groupDropMarker = null;
  }
  groupDropMarkerGroup = null;
  groupDropTarget = null;
}

function createGroupDropMarker() {
  const marker = document.createElement('div');
  marker.className = 'group-drop-marker';
  return marker;
}

function updateGroupDropMarker(group) {
  if (!group) return;
  if (groupDropMarker && groupDropMarkerGroup === group) return;
  clearGroupDropMarker();
  const marker = createGroupDropMarker();
  group.appendChild(marker);
  groupDropMarker = marker;
  groupDropMarkerGroup = group;
  groupDropTarget = group;
}

function clearImageDropMarker() {
  if (dropMarker) {
    dropMarker.remove();
    dropMarker = null;
  }
  lastImageDropRange = null;
}

function createDropMarker() {
  const marker = document.createElement('div');
  marker.className = 'image-drop-marker';
  return marker;
}

function updateImageDropMarker(range) {
  if (!range) return;
  if (isRangeOnDropMarker(range)) return;
  if (lastImageDropRange && range.startContainer === lastImageDropRange.container && range.startOffset === lastImageDropRange.offset) {
    return;
  }
  clearImageDropMarker();
  dropMarker = createDropMarker();
  range.insertNode(dropMarker);
  lastImageDropRange = { container: range.startContainer, offset: range.startOffset };
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

function isTextOnlyCell(cell) {
  if (!cell) return false;
  return !cell.querySelector('img, .image-block, .html-widget');
}

function extractDragContentFromCell(cell) {
  if (!cell) return null;
  const imageBlock = cell.querySelector('.image-block');
  if (imageBlock && cell.childNodes.length === 1) {
    return imageBlock;
  }
  const widget = cell.querySelector('.html-widget');
  if (widget && cell.childNodes.length === 1) {
    return widget;
  }
  if (isTextOnlyCell(cell)) {
    return document.createTextNode(cell.textContent || '');
  }
  const wrapper = document.createElement('div');
  wrapper.contentEditable = true;
  while (cell.firstChild) {
    wrapper.appendChild(cell.firstChild);
  }
  return wrapper;
}

function insertDraggedContentIntoEditor(content, range) {
  if (!content) return;
  if (!range) {
    editor.appendChild(content);
    return;
  }
  const isTextNode = content.nodeType === Node.TEXT_NODE;
  if (!isTextNode && range.startContainer.nodeType === Node.TEXT_NODE) {
    const parent = range.startContainer.parentElement;
    if (parent && editor.contains(parent)) {
      parent.after(content);
      return;
    }
  }
  range.insertNode(content);
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

function isRangeOnDropMarker(range) {
  if (!dropMarker || !range) return false;
  const container = range.startContainer;
  if (container === dropMarker || dropMarker.contains(container)) return true;
  if (container.nodeType === Node.ELEMENT_NODE) {
    const children = Array.from(container.childNodes);
    const markerIndex = children.indexOf(dropMarker);
    if (markerIndex !== -1) {
      return range.startOffset === markerIndex || range.startOffset === markerIndex + 1;
    }
  }
  return false;
}

function setSelectedImageBlock(block) {
  if (selectedImageBlock) {
    selectedImageBlock.classList.remove('is-selected');
  }
  selectedImageBlock = block;
  if (selectedImageBlock) {
    selectedImageBlock.classList.add('is-selected');
  }
}

function applyImageAlignment(command) {
  if (!selectedImageBlock) return false;
  const alignMap = {
    justifyLeft: 'left',
    justifyCenter: 'center',
    justifyRight: 'right',
  };
  const align = alignMap[command];
  if (!align) return false;
  selectedImageBlock.dataset.align = align;
  return true;
}

function buildInlineStyleFromComputedStyles(styles) {
  const rules = [];
  if (styles.color) rules.push(`color: ${styles.color}`);
  if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent') {
    rules.push(`background-color: ${styles.backgroundColor}`);
  }
  if (styles.fontFamily) rules.push(`font-family: ${styles.fontFamily}`);
  if (styles.fontSize) rules.push(`font-size: ${styles.fontSize}`);
  if (styles.fontWeight) rules.push(`font-weight: ${styles.fontWeight}`);
  if (styles.fontStyle) rules.push(`font-style: ${styles.fontStyle}`);
  if (styles.textDecorationLine && styles.textDecorationLine !== 'none') {
    rules.push(`text-decoration-line: ${styles.textDecorationLine}`);
  }
  if (styles.letterSpacing && styles.letterSpacing !== 'normal') {
    rules.push(`letter-spacing: ${styles.letterSpacing}`);
  }
  if (styles.textTransform && styles.textTransform !== 'none') {
    rules.push(`text-transform: ${styles.textTransform}`);
  }
  if (styles.lineHeight && styles.lineHeight !== 'normal') {
    rules.push(`line-height: ${styles.lineHeight}`);
  }
  return rules.join('; ');
}

function applyFormattingToRange(range, styles) {
  if (!range || range.collapsed) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const styleText = buildInlineStyleFromComputedStyles(styles);
  if (!styleText) return;
  const fragment = range.extractContents();
  const span = document.createElement('span');
  span.setAttribute('style', styleText);
  span.appendChild(fragment);
  range.insertNode(span);
  range.setStartAfter(span);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function startFormatPainter() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    showToast('Highlight text to reformat first.');
    return;
  }
  formatTargetRange = range.cloneRange();
  formatMode = true;
  editor.classList.add('format-mode');
  showToast('Click text to copy formatting.');
}

function cancelFormatPainter() {
  formatMode = false;
  formatTargetRange = null;
  editor.classList.remove('format-mode');
}

function getClosestTarget(event, selector) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(selector);
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

function createImageBlock(image) {
  const block = document.createElement('div');
  block.className = 'image-block';
  block.appendChild(image);
  return block;
}

function normalizeEditorImages(container) {
  const images = Array.from(container.querySelectorAll('img'));
  images.forEach((img) => {
    if (img.closest('.html-widget')) return;
    img.draggable = true;
    if (!img.closest('.image-block')) {
      const block = createImageBlock(img);
      img.replaceWith(block);
    }
  });
}

function getHtmlSourceValue(source) {
  return source.value || source.textContent || '';
}

function initializeHtmlWidgets(container) {
  const widgets = Array.from(container.querySelectorAll('.html-widget'));
  widgets.forEach((widget) => {
    if (widget.dataset.ready === 'true') return;
    const source = widget.querySelector('.html-source');
    const preview = widget.querySelector('.html-preview');
    if (!source || !preview) return;
    const value = getHtmlSourceValue(source);
    source.value = value;
    source.textContent = value;
    preview.innerHTML = value;
    source.addEventListener('input', () => {
      preview.innerHTML = source.value;
      source.textContent = source.value;
    });
    widget.dataset.ready = 'true';
  });
}

function syncHtmlWidgets(container) {
  container.querySelectorAll('.html-widget .html-source').forEach((source) => {
    source.textContent = source.value || source.textContent || '';
  });
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
  if (formatMode) {
    event.preventDefault();
    event.stopPropagation();
    const source = getClosestTarget(event, '*');
    if (source && editor.contains(source)) {
      const styles = window.getComputedStyle(source);
      applyFormattingToRange(formatTargetRange, styles);
    }
    cancelFormatPainter();
    return;
  }
  const imageBlock = getClosestTarget(event, '.image-block');
  if (imageBlock && editor.contains(imageBlock)) {
    setSelectedImageBlock(imageBlock);
  } else {
    setSelectedImageBlock(null);
  }
  const group = getClosestTarget(event, '.grid-group');
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
  if (getClosestTarget(event, 'img')) return;
  const cell = getClosestTarget(event, '.grid-cell');
  if (!cell) return;
  draggingCell = cell;
  event.dataTransfer.effectAllowed = 'move';
});

editor.addEventListener('dragstart', (event) => {
  const image = getClosestTarget(event, 'img');
  if (!image || !editor.contains(image)) return;
  if (image.closest('.html-widget')) return;
  draggingImage = image.closest('.image-block') || image;
  draggingCell = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', '');
});

editor.addEventListener('dragend', () => {
  clearDropIndicator();
  clearImageDropMarker();
  clearGroupDropMarker();
  draggingCell = null;
  draggingImage = null;
});

editor.addEventListener('dragover', (event) => {
  if (draggingImage) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const cell = getClosestTarget(event, '.grid-cell');
    if (!cell) {
      const range = getDropRange(event);
      updateImageDropMarker(range);
    } else {
      clearImageDropMarker();
    }
    return;
  }
  if (event.dataTransfer.types && event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
    return;
  }
  let cell = getClosestTarget(event, '.grid-cell');
  if (cell && draggingCell) {
    event.preventDefault();
    const rect = cell.getBoundingClientRect();
    const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    updateDropIndicator(cell, position);
    clearGroupDropMarker();
  } else if (draggingCell && dropTarget) {
    dropTarget.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    dropTarget = null;
    dropPosition = null;
  }
  const group = getClosestTarget(event, '.grid-group');
  if (group && draggingCell) {
    document.querySelectorAll('.grid-group.drag-target').forEach((activeGroup) => {
      if (activeGroup !== group) activeGroup.classList.remove('drag-target');
    });
    group.classList.add('drag-target');
    if (!cell) {
      event.preventDefault();
      updateGroupDropMarker(group);
    }
  } else {
    clearGroupDropMarker();
  }
});

editor.addEventListener('dragleave', (event) => {
  const cell = getClosestTarget(event, '.grid-cell');
  if (cell) {
    cell.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
  const group = getClosestTarget(event, '.grid-group');
  if (group) {
    group.classList.remove('drag-target');
  }
  clearGroupDropMarker();
});

editor.addEventListener('drop', async (event) => {
  if (draggingImage) {
    event.preventDefault();
    const cell = getClosestTarget(event, '.grid-cell');
    if (cell) {
      cell.appendChild(draggingImage);
    } else {
      if (dropMarker && dropMarker.parentNode) {
        dropMarker.parentNode.insertBefore(draggingImage, dropMarker);
      } else {
        const range = getDropRange(event);
        if (range) {
          range.insertNode(draggingImage);
        } else {
          editor.appendChild(draggingImage);
        }
      }
    }
    clearImageDropMarker();
    draggingImage = null;
    return;
  }
  const cell = getClosestTarget(event, '.grid-cell');
  if (cell) {
    cell.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }
  const dropGroup = getClosestTarget(event, '.grid-group');
  if (draggingCell && dropGroup) {
    event.preventDefault();
    if (cell && draggingCell !== cell) {
      if (dropPosition === 'before') {
        dropGroup.insertBefore(draggingCell, cell);
      } else {
        const referenceNode = cell.nextSibling;
        dropGroup.insertBefore(draggingCell, referenceNode);
      }
    } else if (groupDropTarget === dropGroup) {
      dropGroup.appendChild(draggingCell);
    }
    clearDropIndicator();
    clearGroupDropMarker();
    draggingCell = null;
    return;
  }
  if (draggingCell && !dropGroup) {
    event.preventDefault();
    const range = getDropRange(event);
    const extracted = extractDragContentFromCell(draggingCell);
    insertDraggedContentIntoEditor(extracted, range);
    draggingCell.remove();
    clearDropIndicator();
    clearGroupDropMarker();
    draggingCell = null;
    return;
  }
  await handleImageDrop(event);
  clearDropIndicator();
  clearGroupDropMarker();
  draggingCell = null;
});

newPageBtn.addEventListener('click', () => createPageAt(navItems, navItems.length - 1));
savePageBtn.addEventListener('click', savePage);

fontSelect.addEventListener('change', (event) => execCommand('fontName', event.target.value));
sizeSelect.addEventListener('change', (event) => execCommand('fontSize', event.target.value));
colorPicker.addEventListener('change', (event) => setActiveColor(event.target.value));
resetFormatBtn.addEventListener('click', () => execCommand('removeFormat'));
formatPainterBtn.addEventListener('click', startFormatPainter);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadImage(file);
    imageInput.value = '';
  }
});

addGroupBtn.addEventListener('click', () => createGroup(1, 1));
addContentWidget.addEventListener('click', () => addWidget('content'));
addHtmlWidget.addEventListener('click', () => addWidget('html'));
groupRowsInput.addEventListener('change', updateGroupDimensions);
groupColsInput.addEventListener('change', updateGroupDimensions);

window.addEventListener('resize', positionGroupControls);
editor.addEventListener('scroll', positionGroupControls);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && formatMode) {
    cancelFormatPainter();
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

document.querySelectorAll('[data-command]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const command = btn.dataset.command;
    if (applyImageAlignment(command)) return;
    execCommand(command);
  });
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
