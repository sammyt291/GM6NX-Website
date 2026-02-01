const navLinks = document.getElementById('navLinks');
const pageTitle = document.getElementById('pageTitle');
const pageContent = document.getElementById('pageContent');
const authBtn = document.getElementById('authBtn');
const editNavBtn = document.getElementById('editNavBtn');
const navModal = document.getElementById('navModal');
const navList = document.getElementById('navList');
const addNavItem = document.getElementById('addNavItem');
const addNavDivider = document.getElementById('addNavDivider');
const saveNav = document.getElementById('saveNav');
const closeNavModal = document.getElementById('closeNavModal');
const loginModal = document.getElementById('loginModal');
const closeLoginModal = document.getElementById('closeLoginModal');
const loginForm = document.getElementById('loginForm');
const editorLink = document.getElementById('editorLink');
const adminLink = document.getElementById('adminLink');

let sessionUser = null;
let navItems = [];

async function fetchSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  sessionUser = data.user;
  renderAuth();
}

function renderAuth() {
  if (sessionUser) {
    authBtn.textContent = 'Logout';
    editNavBtn.hidden = false;
    editorLink.hidden = false;
    adminLink.hidden = false;
  } else {
    authBtn.textContent = 'Login';
    editNavBtn.hidden = true;
    editorLink.hidden = true;
    adminLink.hidden = true;
  }
}

async function fetchNav() {
  const res = await fetch('/api/nav');
  const data = await res.json();
  navItems = data.items || [];
  renderNav();
}

function createNavItem(item) {
  if (item.type === 'divider') {
    const divider = document.createElement('div');
    divider.className = 'nav-divider';
    return divider;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-item';
  const link = document.createElement('a');
  link.textContent = item.title;
  link.href = `#${item.slug}`;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    loadPage(item.slug, item.title);
  });
  wrapper.appendChild(link);
  if (item.children && item.children.length) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    item.children.forEach((child) => {
      const childLink = document.createElement('a');
      childLink.textContent = child.title;
      childLink.href = `#${child.slug}`;
      childLink.addEventListener('click', (event) => {
        event.preventDefault();
        loadPage(child.slug, child.title);
      });
      dropdown.appendChild(childLink);
    });
    wrapper.appendChild(dropdown);
  }
  return wrapper;
}

function renderNav() {
  navLinks.innerHTML = '';
  navItems.forEach((item) => {
    navLinks.appendChild(createNavItem(item));
  });
}

async function loadPage(slug, fallbackTitle) {
  try {
    const res = await fetch(`/api/pages/${slug}`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    pageTitle.textContent = data.page.title || fallbackTitle || 'GM6NX';
    pageContent.innerHTML = data.page.content || '<p>Empty page.</p>';
    prepareHtmlWidgetsForView(pageContent);
    normalizeContentImages(pageContent);
    disableGroupEditing();
  } catch {
    pageTitle.textContent = fallbackTitle || 'GM6NX';
    pageContent.innerHTML = '<p>Unable to load page content.</p>';
  }
}

function disableGroupEditing() {
  const groups = pageContent.querySelectorAll('.grid-group');
  groups.forEach((group) => {
    group.removeAttribute('contenteditable');
    group.querySelectorAll('[contenteditable]').forEach((node) => {
      node.removeAttribute('contenteditable');
    });
    group.querySelectorAll('[draggable]').forEach((node) => {
      node.removeAttribute('draggable');
    });
  });
}

function createImageBlock(image) {
  const block = document.createElement('div');
  block.className = 'image-block';
  block.appendChild(image);
  return block;
}

function normalizeContentImages(container) {
  const images = Array.from(container.querySelectorAll('img'));
  images.forEach((img) => {
    if (img.closest('.html-widget')) return;
    img.removeAttribute('draggable');
    const inlineContext = img.closest(
      'p, span, a, strong, em, b, i, u, small, sup, sub, mark, code, s, del, ins, label'
    );
    if (inlineContext) return;
    if (!img.closest('.image-block')) {
      const block = createImageBlock(img);
      img.replaceWith(block);
      block.removeAttribute('draggable');
    }
  });
}

function prepareHtmlWidgetsForView(container) {
  const widgets = Array.from(container.querySelectorAll('.html-widget'));
  widgets.forEach((widget) => {
    const source = widget.querySelector('.html-source');
    let preview = widget.querySelector('.html-preview');
    const value = source ? source.value || source.textContent || '' : preview?.innerHTML || '';
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'html-preview';
      widget.appendChild(preview);
    }
    preview.innerHTML = value;
    if (source) {
      source.remove();
    }
    widget.classList.add('read-only');
  });
}

function openModal(modal) {
  modal.style.display = 'flex';
}

function closeModal(modal) {
  modal.style.display = 'none';
}

function renderNavEditor() {
  navList.innerHTML = '';
  navItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'modal-item';

    if (item.type === 'divider') {
      const label = document.createElement('div');
      label.textContent = 'Divider';
      row.appendChild(label);
    } else {
      const titleInput = document.createElement('input');
      titleInput.value = item.title || '';
      titleInput.placeholder = 'Title';
      titleInput.addEventListener('input', (e) => {
        item.title = e.target.value;
      });

      const slugInput = document.createElement('input');
      slugInput.value = item.slug || '';
      slugInput.placeholder = 'Slug';
      slugInput.addEventListener('input', (e) => {
        item.slug = e.target.value;
      });

      const hasDropdown = document.createElement('input');
      hasDropdown.type = 'checkbox';
      hasDropdown.checked = !!item.children?.length;
      hasDropdown.addEventListener('change', (e) => {
        if (e.target.checked) {
          item.children = item.children || [];
          if (!item.children.length) {
            item.children.push({ title: 'New child', slug: `${item.slug || 'child'}-1`, type: 'page' });
          }
        } else {
          item.children = [];
        }
        renderNavEditor();
      });

      const dropdownLabel = document.createElement('label');
      dropdownLabel.style.display = 'flex';
      dropdownLabel.style.alignItems = 'center';
      dropdownLabel.style.gap = '6px';
      dropdownLabel.appendChild(hasDropdown);
      dropdownLabel.appendChild(document.createTextNode('Dropdown'));

      row.appendChild(titleInput);
      row.appendChild(slugInput);
      row.appendChild(dropdownLabel);

      if (item.children?.length) {
        const childList = document.createElement('div');
        childList.style.display = 'grid';
        childList.style.gap = '6px';
        item.children.forEach((child, childIndex) => {
          const childRow = document.createElement('div');
          childRow.style.display = 'flex';
          childRow.style.gap = '6px';
          const childTitle = document.createElement('input');
          childTitle.value = child.title;
          childTitle.placeholder = 'Child title';
          childTitle.addEventListener('input', (e) => {
            child.title = e.target.value;
          });
          const childSlug = document.createElement('input');
          childSlug.value = child.slug;
          childSlug.placeholder = 'Child slug';
          childSlug.addEventListener('input', (e) => {
            child.slug = e.target.value;
          });
          const deleteChild = document.createElement('button');
          deleteChild.className = 'secondary';
          deleteChild.textContent = 'Remove';
          deleteChild.addEventListener('click', () => {
            item.children.splice(childIndex, 1);
            renderNavEditor();
          });
          childRow.appendChild(childTitle);
          childRow.appendChild(childSlug);
          childRow.appendChild(deleteChild);
          childList.appendChild(childRow);
        });
        const addChild = document.createElement('button');
        addChild.className = 'secondary';
        addChild.textContent = 'Add child';
        addChild.addEventListener('click', () => {
          item.children.push({ title: 'New child', slug: `${item.slug || 'child'}-${item.children.length + 1}`, type: 'page' });
          renderNavEditor();
        });
        childList.appendChild(addChild);
        row.appendChild(childList);
      }
    }

    const controls = document.createElement('div');
    controls.style.marginLeft = 'auto';
    controls.style.display = 'flex';
    controls.style.gap = '6px';

    const upBtn = document.createElement('button');
    upBtn.className = 'secondary';
    upBtn.textContent = 'Up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      navItems.splice(index - 1, 0, navItems.splice(index, 1)[0]);
      renderNavEditor();
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'secondary';
    downBtn.textContent = 'Down';
    downBtn.disabled = index === navItems.length - 1;
    downBtn.addEventListener('click', () => {
      navItems.splice(index + 1, 0, navItems.splice(index, 1)[0]);
      renderNavEditor();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      navItems.splice(index, 1);
      renderNavEditor();
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(deleteBtn);

    row.appendChild(controls);
    navList.appendChild(row);
  });
}

async function saveNavItems() {
  await fetch('/api/nav', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: navItems }),
  });
  await fetchNav();
  closeModal(navModal);
}

authBtn.addEventListener('click', async () => {
  if (sessionUser) {
    await fetch('/api/logout', { method: 'POST' });
    sessionUser = null;
    renderAuth();
    return;
  }
  openModal(loginModal);
});

editNavBtn.addEventListener('click', () => {
  renderNavEditor();
  openModal(navModal);
});

closeNavModal.addEventListener('click', () => closeModal(navModal));
closeLoginModal.addEventListener('click', () => closeModal(loginModal));

addNavItem.addEventListener('click', () => {
  navItems.push({ type: 'page', title: 'New page', slug: `page-${navItems.length + 1}`, children: [] });
  renderNavEditor();
});

addNavDivider.addEventListener('click', () => {
  navItems.push({ type: 'divider' });
  renderNavEditor();
});

saveNav.addEventListener('click', saveNavItems);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const data = await res.json();
    sessionUser = data.user;
    renderAuth();
    closeModal(loginModal);
  } else {
    alert('Login failed.');
  }
});

(async function init() {
  await fetchSession();
  await fetchNav();
  const defaultPage = navItems.find((item) => item.type === 'page');
  if (defaultPage) {
    loadPage(defaultPage.slug, defaultPage.title);
  }
})();
