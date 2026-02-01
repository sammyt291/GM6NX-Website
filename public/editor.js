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
let draggingLine = null;

const BLOCK_SELECTORS = ['.text-line', '.image-block', '.grid-group', '.html-widget'];

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
  normalizeTextLines(editor);
  editor.querySelectorAll('.grid-cell').forEach((cell) => normalizeTextLines(cell));
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

function insertImage(url, options = {}) {
  const { range = null, referenceNode = null, position = 'after' } = options;
  const img = document.createElement('img');
  img.src = url;
  img.draggable = true;
  const block = createImageBlock(img);
  if (referenceNode) {
    insertBlockAtPosition(editor, block, referenceNode, position);
  } else if (range) {
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

async function uploadImage(file, options = {}) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    alert('Upload failed');
    return;
  }
  const data = await res.json();
  insertImage(data.url, options);
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
    cell.appendChild(createTextLine('Widget'));
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
    cell.appendChild(createTextLine('Content widget'));
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

function updateImageDropMarkerFromEvent(container, event) {
  const { referenceNode, position } = getBlockInsertPosition(container, event);
  clearImageDropMarker();
  dropMarker = createDropMarker();
  if (!referenceNode) {
    container.appendChild(dropMarker);
  } else if (position === 'before') {
    container.insertBefore(dropMarker, referenceNode);
  } else {
    container.insertBefore(dropMarker, referenceNode.nextSibling);
  }
  lastImageDropRange = {
    container: dropMarker.parentNode,
    offset: Array.from(dropMarker.parentNode.childNodes).indexOf(dropMarker),
  };
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
  const lines = Array.from(cell.querySelectorAll(':scope > .text-line'));
  if (lines.length) {
    const fragment = document.createDocumentFragment();
    lines.forEach((line) => fragment.appendChild(line));
    return fragment;
  }
  if (isTextOnlyCell(cell)) {
    return createTextLine(cell.textContent || '');
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

function insertBlockAtPosition(container, content, referenceNode, position) {
  if (!content) return;
  if (!referenceNode) {
    container.appendChild(content);
    return;
  }
  if (position === 'before') {
    container.insertBefore(content, referenceNode);
    return;
  }
  container.insertBefore(content, referenceNode.nextSibling);
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

function createTextLine(text = '') {
  const line = document.createElement('div');
  line.className = 'text-line';
  line.draggable = true;
  if (text) {
    line.textContent = text;
  } else {
    line.appendChild(document.createElement('br'));
  }
  return line;
}

function normalizeTextLineElement(line) {
  if (!line.classList.contains('text-line')) {
    line.classList.add('text-line');
  }
  line.draggable = true;
  const breaks = Array.from(line.querySelectorAll('br'));
  if (!breaks.length) return;
  let current = line;
  breaks.forEach((br) => {
    const newLine = createTextLine('');
    while (br.nextSibling) {
      newLine.appendChild(br.nextSibling);
    }
    br.remove();
    current.after(newLine);
    current = newLine;
  });
  if (!line.textContent && !line.querySelector('br')) {
    line.appendChild(document.createElement('br'));
  }
}

function normalizeTextLines(container) {
  if (!container) return;
  const nodes = Array.from(container.childNodes);
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent.trim()) {
        node.remove();
        return;
      }
      const line = createTextLine();
      line.textContent = node.textContent;
      node.replaceWith(line);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }
    const element = node;
    if (element.matches(BLOCK_SELECTORS.join(','))) {
      if (element.classList.contains('text-line')) {
        normalizeTextLineElement(element);
      }
      return;
    }
    if (element.tagName === 'BR') {
      element.replaceWith(createTextLine(''));
      return;
    }
    const line = createTextLine('');
    while (element.firstChild) {
      line.appendChild(element.firstChild);
    }
    element.replaceWith(line);
    normalizeTextLineElement(line);
  });
}

function getDirectBlockChild(container, element) {
  if (!element) return null;
  let target = element.closest(BLOCK_SELECTORS.join(','));
  while (target && target.parentElement !== container) {
    target = target.parentElement;
  }
  return target && target.parentElement === container ? target : null;
}

function getBlockInsertPosition(container, event) {
  const target = event.target instanceof Element ? getDirectBlockChild(container, event.target) : null;
  if (!target) {
    return { referenceNode: null, position: 'after' };
  }
  const rect = target.getBoundingClientRect();
  const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  return { referenceNode: target, position };
}

function createGridCellWithContent(content) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell';
  cell.contentEditable = true;
  cell.draggable = true;
  if (content) {
    cell.appendChild(content);
  }
  return cell;
}

function setCaretToEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function isCaretAtLineStart(line, range) {
  if (!line || !range || !range.collapsed) return false;
  const testRange = range.cloneRange();
  testRange.selectNodeContents(line);
  testRange.setEnd(range.startContainer, range.startOffset);
  return testRange.toString().length === 0;
}

async function handleImageDrop(event) {
  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) return;
  event.preventDefault();
  const imageFile = files.find((file) => file.type.startsWith('image/'));
  if (!imageFile) return;
  const { referenceNode, position } = getBlockInsertPosition(editor, event);
  await uploadImage(imageFile, { referenceNode, position });
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

editor.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.html-widget')) return;
  const cell = target.closest('.grid-cell');
  if (cell) {
    normalizeTextLines(cell);
    return;
  }
  normalizeTextLines(editor);
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
  draggingLine = null;
  event.dataTransfer.effectAllowed = 'move';
});

editor.addEventListener('dragstart', (event) => {
  const image = getClosestTarget(event, 'img');
  if (!image || !editor.contains(image)) return;
  if (image.closest('.html-widget')) return;
  const cell = image.closest('.grid-cell');
  if (cell) {
    draggingCell = cell;
    draggingImage = null;
    draggingLine = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    return;
  }
  draggingImage = image.closest('.image-block') || image;
  draggingCell = null;
  draggingLine = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', '');
});

editor.addEventListener('dragstart', (event) => {
  const line = getClosestTarget(event, '.text-line');
  if (!line || !editor.contains(line)) return;
  if (line.closest('.grid-cell')) return;
  draggingLine = line;
  draggingCell = null;
  draggingImage = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', '');
});

editor.addEventListener('dragend', () => {
  clearDropIndicator();
  clearImageDropMarker();
  clearGroupDropMarker();
  draggingCell = null;
  draggingImage = null;
  draggingLine = null;
});

editor.addEventListener('dragover', (event) => {
  if (draggingImage || draggingLine) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const cell = getClosestTarget(event, '.grid-cell');
    const group = getClosestTarget(event, '.grid-group');
    if (!cell) {
      if (group) {
        document.querySelectorAll('.grid-group.drag-target').forEach((activeGroup) => {
          if (activeGroup !== group) activeGroup.classList.remove('drag-target');
        });
        group.classList.add('drag-target');
        updateGroupDropMarker(group);
      } else {
        updateImageDropMarkerFromEvent(editor, event);
        document.querySelectorAll('.grid-group.drag-target').forEach((activeGroup) => {
          activeGroup.classList.remove('drag-target');
        });
      }
      if (dropTarget) {
        dropTarget.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
        dropTarget = null;
        dropPosition = null;
      }
    } else {
      clearImageDropMarker();
      const rect = cell.getBoundingClientRect();
      const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      updateDropIndicator(cell, position);
      clearGroupDropMarker();
      if (group) {
        document.querySelectorAll('.grid-group.drag-target').forEach((activeGroup) => {
          if (activeGroup !== group) activeGroup.classList.remove('drag-target');
        });
        group.classList.add('drag-target');
      }
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
    if (cell !== draggingCell) {
      updateDropIndicator(cell, position);
    } else if (dropTarget) {
      dropTarget.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      dropTarget = null;
      dropPosition = null;
    }
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
  if (draggingImage || draggingLine) {
    event.preventDefault();
    const cell = getClosestTarget(event, '.grid-cell');
    const dropGroup = getClosestTarget(event, '.grid-group');
    const content = draggingImage || draggingLine;
    if (dropGroup) {
      const newCell = createGridCellWithContent(content);
      if (cell) {
        const position = dropPosition || 'after';
        if (position === 'before') {
          dropGroup.insertBefore(newCell, cell);
        } else {
          dropGroup.insertBefore(newCell, cell.nextSibling);
        }
      } else {
        dropGroup.appendChild(newCell);
      }
    } else {
      if (dropMarker && dropMarker.parentNode) {
        dropMarker.parentNode.insertBefore(content, dropMarker);
      } else {
        const { referenceNode, position } = getBlockInsertPosition(editor, event);
        if (referenceNode !== content) {
          insertBlockAtPosition(editor, content, referenceNode, position);
        }
      }
    }
    clearImageDropMarker();
    clearDropIndicator();
    clearGroupDropMarker();
    draggingImage = null;
    draggingLine = null;
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
    const extracted = extractDragContentFromCell(draggingCell);
    const { referenceNode, position } = getBlockInsertPosition(editor, event);
    insertBlockAtPosition(editor, extracted, referenceNode, position);
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
  if (event.key === 'Backspace') {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;
    const line = range.startContainer instanceof Element
      ? range.startContainer.closest('.text-line')
      : range.startContainer.parentElement?.closest('.text-line');
    if (!line) return;
    if (!isCaretAtLineStart(line, range)) return;
    const container = line.parentElement;
    if (!container) return;
    const previous = line.previousElementSibling;
    if (previous && previous.classList.contains('text-line')) {
      event.preventDefault();
      while (line.firstChild) {
        previous.appendChild(line.firstChild);
      }
      line.remove();
      setCaretToEnd(previous);
    }
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
  normalizeTextLines(editor);
})();
