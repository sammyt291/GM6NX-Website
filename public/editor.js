const editorElement = document.getElementById('editor');
const siteMap = document.getElementById('siteMap');
const newPageBtn = document.getElementById('newPageBtn');
const savePageBtn = document.getElementById('savePageBtn');
const imageInput = document.getElementById('imageInput');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');

let pages = [];
let navItems = [];
let currentSlug = null;
let toastTimeout = null;
let trumbowygInstance = null;

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
  await ensureSession();
  await loadPages();
})();
