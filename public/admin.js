const adminTableBody = document.querySelector('#adminTable tbody');
const addAdminForm = document.getElementById('addAdminForm');
const logoutBtn = document.getElementById('logoutBtn');

async function ensureSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/';
  }
}

async function loadAdmins() {
  const res = await fetch('/api/admins');
  if (!res.ok) return;
  const data = await res.json();
  adminTableBody.innerHTML = '';
  data.users.forEach((user) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = user.username;

    const passwordCell = document.createElement('td');
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'New password';
    passwordCell.appendChild(passwordInput);

    const actionCell = document.createElement('td');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'secondary';
    saveBtn.textContent = 'Update';
    saveBtn.addEventListener('click', async () => {
      if (!passwordInput.value) return;
      await fetch(`/api/admins/${user.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });
      passwordInput.value = '';
      alert('Password updated.');
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${user.username}?`)) return;
      await fetch(`/api/admins/${user.username}`, { method: 'DELETE' });
      loadAdmins();
    });

    actionCell.appendChild(saveBtn);
    actionCell.appendChild(deleteBtn);

    row.appendChild(nameCell);
    row.appendChild(passwordCell);
    row.appendChild(actionCell);
    adminTableBody.appendChild(row);
  });
}

addAdminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(addAdminForm);
  const payload = Object.fromEntries(formData.entries());
  const res = await fetch('/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert('Failed to add admin.');
    return;
  }
  addAdminForm.reset();
  loadAdmins();
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

(async function init() {
  await ensureSession();
  await loadAdmins();
})();
