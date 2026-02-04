const editorElement = document.getElementById('editor');
const siteMap = document.getElementById('siteMap');
const newPageBtn = document.getElementById('newPageBtn');
const savePageBtn = document.getElementById('savePageBtn');
const imageInput = document.getElementById('imageInput');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');
const imageSizePanel = document.getElementById('imageSizePanel');
const imageWidthSelect = document.getElementById('imageWidthSelect');
const imageHeightSelect = document.getElementById('imageHeightSelect');
const imagePositionSelect = document.getElementById('imagePositionSelect');

let pages = [];
let navItems = [];
let currentSlug = null;
let toastTimeout = null;
let trumbowygInstance = null;
let selectedImage = null;
let clipboardImageHtml = null;
let dragState = null;
let tightAnchorCounter = 0;

const tightAnchorSelector = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, div';

const fontFamilies = ['Arial', 'Georgia', 'Times New Roman', 'Verdana'];

function initEditor() {
  if (!editorElement || !window.jQuery) return;
  trumbowygInstance = window.jQuery(editorElement);
  trumbowygInstance.trumbowyg({
    btns: [
      ['strong', 'em', 'underline'],
      ['justifyLeft', 'justifyCenter', 'justifyRight'],
      ['foreColor', 'backColor'],
      ['fontfamily'],
      ['insertImage'],
      ['removeformat'],
      ['viewHTML'],
    ],
    plugins: {
      fontfamily: {
        fontList: fontFamilies,
      },
    },
    autogrow: true,
    removeformatPasted: true,
    semantic: true,
  });
}

function syncImageSizePanel() {
  if (!selectedImage || !imageWidthSelect || !imageHeightSelect || !imagePositionSelect) return;
  const widthValue = selectedImage.style.width;
  const heightValue = selectedImage.style.height;
  imageWidthSelect.value = imageWidthSelect.querySelector(`option[value="${widthValue}"]`)
    ? widthValue
    : 'auto';
  imageHeightSelect.value = imageHeightSelect.querySelector(`option[value="${heightValue}"]`)
    ? heightValue
    : 'auto';
  imagePositionSelect.value = selectedImage.classList.contains('image-tight') ? 'tight' : 'inline';
}

function updateImageSizePanel() {
  if (!imageSizePanel) return;
  const shouldShow = !!selectedImage;
  imageSizePanel.classList.toggle('is-visible', shouldShow);
  imageSizePanel.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  if (shouldShow) {
    syncImageSizePanel();
  }
}

function setSelectedImage(image) {
  selectedImage = image;
  updateImageSizePanel();
}

function applyImageSizeChange(axis, value) {
  if (!selectedImage) return;
  if (value === 'auto') {
    selectedImage.style.removeProperty(axis);
    return;
  }
  selectedImage.style[axis] = value;
}

function getImageOffsetInEditor(image) {
  if (!editorElement || !image) return { left: 0, top: 0 };
  const editorRect = editorElement.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  return {
    left: imageRect.left - editorRect.left + editorElement.scrollLeft,
    top: imageRect.top - editorRect.top + editorElement.scrollTop,
  };
}

function ensureTightAnchorId(anchor) {
  if (!anchor) return null;
  if (!anchor.dataset.tightAnchorId) {
    tightAnchorCounter += 1;
    anchor.dataset.tightAnchorId = `tight-anchor-${Date.now()}-${tightAnchorCounter}`;
  }
  return anchor.dataset.tightAnchorId;
}

function getAnchorForImage(image) {
  if (!image || !editorElement) return editorElement;
  const anchor = image.closest(tightAnchorSelector);
  return anchor && editorElement.contains(anchor) ? anchor : editorElement;
}

function getAnchorFromPoint(event) {
  if (!editorElement || !event) return editorElement;
  let anchor = null;
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (range?.startContainer) {
    const node = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
    anchor = node?.closest?.(tightAnchorSelector);
  }
  if (!anchor) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    anchor = element?.closest?.(tightAnchorSelector);
  }
  if (!anchor || !editorElement.contains(anchor)) {
    return editorElement;
  }
  return anchor;
}

function storeTightAnchorPosition(image, anchor, left, top) {
  if (!image || !editorElement) return;
  const resolvedAnchor = anchor || editorElement;
  const anchorId = ensureTightAnchorId(resolvedAnchor);
  const editorRect = editorElement.getBoundingClientRect();
  const anchorRect = resolvedAnchor.getBoundingClientRect();
  const offsetLeft = left - (anchorRect.left - editorRect.left + editorElement.scrollLeft);
  const offsetTop = top - (anchorRect.top - editorRect.top + editorElement.scrollTop);
  image.dataset.tightAnchorId = anchorId;
  image.dataset.tightOffsetX = `${offsetLeft}`;
  image.dataset.tightOffsetY = `${offsetTop}`;
}

function applyTightAnchorPosition(image) {
  if (!image || !editorElement) return;
  const anchorId = image.dataset.tightAnchorId;
  const anchor = anchorId
    ? editorElement.querySelector(`[data-tight-anchor-id="${anchorId}"]`)
    : null;
  const resolvedAnchor = anchor || getAnchorForImage(image);
  const editorRect = editorElement.getBoundingClientRect();
  const anchorRect = resolvedAnchor.getBoundingClientRect();
  const offsetLeft = Number.parseFloat(image.dataset.tightOffsetX || '0');
  const offsetTop = Number.parseFloat(image.dataset.tightOffsetY || '0');
  const left = anchorRect.left - editorRect.left + editorElement.scrollLeft + offsetLeft;
  const top = anchorRect.top - editorRect.top + editorElement.scrollTop + offsetTop;
  image.style.position = 'absolute';
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
  image.draggable = false;
}

function refreshTightImages() {
  if (!editorElement) return;
  const images = editorElement.querySelectorAll('img.image-tight');
  images.forEach((image) => {
    if (!image.dataset.tightAnchorId) {
      const { left, top } = getImageOffsetInEditor(image);
      storeTightAnchorPosition(image, getAnchorForImage(image), left, top);
    }
    applyTightAnchorPosition(image);
  });
}

function applyImagePositionChange(value) {
  if (!selectedImage) return;
  if (value === 'tight') {
    selectedImage.classList.add('image-tight');
    const { left, top } = getImageOffsetInEditor(selectedImage);
    storeTightAnchorPosition(selectedImage, getAnchorForImage(selectedImage), left, top);
    applyTightAnchorPosition(selectedImage);
    return;
  }
  selectedImage.classList.remove('image-tight');
  selectedImage.removeAttribute('data-tight-anchor-id');
  selectedImage.removeAttribute('data-tight-offset-x');
  selectedImage.removeAttribute('data-tight-offset-y');
  selectedImage.style.removeProperty('position');
  selectedImage.style.removeProperty('left');
  selectedImage.style.removeProperty('top');
  selectedImage.draggable = true;
}

function startTightDrag(event, image) {
  if (!image?.classList.contains('image-tight')) return;
  const { left, top } = getImageOffsetInEditor(image);
  dragState = {
    image,
    startX: event.clientX,
    startY: event.clientY,
    originLeft: left,
    originTop: top,
  };
  image.style.position = 'absolute';
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
  image.draggable = false;
  event.preventDefault();
}

function handleTightDragMove(event) {
  if (!dragState) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  dragState.image.style.left = `${dragState.originLeft + dx}px`;
  dragState.image.style.top = `${dragState.originTop + dy}px`;
}

function stopTightDrag(event) {
  if (dragState?.image?.classList.contains('image-tight')) {
    const anchor = event ? getAnchorFromPoint(event) : getAnchorForImage(dragState.image);
    const left = Number.parseFloat(dragState.image.style.left || '0');
    const top = Number.parseFloat(dragState.image.style.top || '0');
    storeTightAnchorPosition(dragState.image, anchor, left, top);
    applyTightAnchorPosition(dragState.image);
  }
  dragState = null;
}

function insertHtmlAtCursor(html) {
  if (!html) return;
  editorElement?.focus();
  if (document.queryCommandSupported?.('insertHTML')) {
    document.execCommand('insertHTML', false, html);
    return;
  }
  if (trumbowygInstance) {
    trumbowygInstance.trumbowyg('execCmd', { cmd: 'insertHTML', param: html });
    return;
  }
  editorElement?.insertAdjacentHTML('beforeend', html);
}

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
  if (trumbowygInstance) {
    trumbowygInstance.trumbowyg('html', data.page.content || '');
  }
  currentSlug = slug;
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
  if (!currentSlug || !trumbowygInstance) return;
  const res = await fetch(`/api/pages/${currentSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: trumbowygInstance.trumbowyg('html') }),
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

function insertImage(url) {
  if (!trumbowygInstance) return;
  trumbowygInstance.trumbowyg('execCmd', { cmd: 'insertImage', param: url });
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    showToast('Upload failed. Try again.');
    return;
  }
  const data = await res.json();
  insertImage(data.url);
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

function handleImageDrop(event) {
  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) return;
  const imageFile = files.find((file) => file.type.startsWith('image/'));
  if (!imageFile) return;
  event.preventDefault();
  uploadImage(imageFile);
}

function handleEditorClick(event) {
  const image = event.target.closest('img');
  if (image && editorElement.contains(image)) {
    setSelectedImage(image);
    return;
  }
  const resizeHandle = event.target.closest('.trumbowyg-resize-handle');
  const resizeCanvas = event.target.closest('canvas[id^="trumbowyg-resizimg-"]');
  if (!resizeHandle && !resizeCanvas) {
    setSelectedImage(null);
  }
}

function handleEditorCopyCut(event) {
  if (!selectedImage) return;
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed && !selection.containsNode(selectedImage, true)) return;
  const html = selectedImage.outerHTML;
  clipboardImageHtml = html;
  event.preventDefault();
  event.clipboardData?.setData('text/html', html);
  event.clipboardData?.setData('text/plain', selectedImage.src || '');
  if (event.type === 'cut') {
    selectedImage.remove();
    setSelectedImage(null);
  }
}

async function handleEditorPaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const items = Array.from(clipboard.items || []);
  const imageItem = items.find((item) => item.type.startsWith('image/'));
  if (imageItem) {
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      await uploadImage(file);
    }
    return;
  }
  const html = clipboard.getData('text/html');
  if (html && html.includes('<img')) {
    event.preventDefault();
    insertHtmlAtCursor(html);
    return;
  }
  if (clipboardImageHtml) {
    event.preventDefault();
    insertHtmlAtCursor(clipboardImageHtml);
  }
}

function initImageSizeControls() {
  if (imageWidthSelect) {
    imageWidthSelect.addEventListener('change', (event) => {
      applyImageSizeChange('width', event.target.value);
    });
  }
  if (imageHeightSelect) {
    imageHeightSelect.addEventListener('change', (event) => {
      applyImageSizeChange('height', event.target.value);
    });
  }
  if (imagePositionSelect) {
    imagePositionSelect.addEventListener('change', (event) => {
      applyImagePositionChange(event.target.value);
    });
  }
  if (editorElement) {
    editorElement.addEventListener('click', handleEditorClick);
    editorElement.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.trumbowyg-resize-handle')) return;
      const image = event.target.closest('img');
      if (image && editorElement.contains(image)) {
        setSelectedImage(image);
        startTightDrag(event, image);
      }
    });
    editorElement.addEventListener('dragstart', (event) => {
      const image = event.target.closest('img.image-tight');
      if (image && editorElement.contains(image)) {
        event.preventDefault();
      }
    });
    editorElement.addEventListener('copy', handleEditorCopyCut);
    editorElement.addEventListener('cut', handleEditorCopyCut);
    editorElement.addEventListener('paste', handleEditorPaste);
    editorElement.addEventListener('input', () => refreshTightImages());
    const observer = new MutationObserver(() => {
      updateImageSizePanel();
      refreshTightImages();
    });
    observer.observe(editorElement, { childList: true, subtree: true });
  }
  document.addEventListener('pointermove', handleTightDragMove);
  document.addEventListener('pointerup', stopTightDrag);
  window.addEventListener('resize', () => refreshTightImages());
}

newPageBtn.addEventListener('click', () => createPageAt(navItems, navItems.length - 1));
savePageBtn.addEventListener('click', savePage);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadImage(file);
    imageInput.value = '';
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

editorElement.addEventListener('drop', handleImageDrop);
editorElement.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types && event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
  }
});

(async function init() {
  initEditor();
  initImageSizeControls();
  await ensureSession();
  await loadPages();
})();
