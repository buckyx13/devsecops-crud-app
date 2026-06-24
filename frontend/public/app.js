/**
 * app.js - Vanilla JS frontend logic.
 * All requests go to a RELATIVE /api path. Nginx (acting as load balancer
 * and reverse proxy in front of the backend service) forwards /api/* to the
 * backend tier. This avoids hardcoding backend hostnames/ports in the
 * frontend, which is important when the backend is horizontally scaled
 * behind the load balancer / k8s Service.
 */
const API_BASE = '/api/items';

const form = document.getElementById('item-form');
const idField = document.getElementById('item-id');
const nameField = document.getElementById('name');
const descField = document.getElementById('description');
const qtyField = document.getElementById('quantity');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const statusMsg = document.getElementById('status-msg');
const tbody = document.getElementById('items-body');

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className = type || '';
  setTimeout(() => { statusMsg.textContent = ''; }, 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchItems() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('Failed to load items');
    const items = await res.json();
    renderItems(items);
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

function renderItems(items) {
  tbody.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.description || '')}</td>
      <td>${escapeHtml(String(item.quantity))}</td>
      <td>
        <button class="edit-btn" data-id="${item.id}">Edit</button>
        <button class="delete-btn" data-id="${item.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: nameField.value.trim(),
    description: descField.value.trim(),
    quantity: Number(qtyField.value),
  };
  const id = idField.value;
  try {
    const res = await fetch(id ? `${API_BASE}/${id}` : API_BASE, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }
    showStatus(id ? 'Item updated' : 'Item created', 'success');
    resetForm();
    fetchItems();
  } catch (err) {
    showStatus(err.message, 'error');
  }
});

tbody.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('delete-btn')) {
    if (!confirm('Delete this item?')) return;
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showStatus('Item deleted', 'success');
      fetchItems();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }

  if (e.target.classList.contains('edit-btn')) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      if (!res.ok) throw new Error('Failed to load item');
      const item = await res.json();
      idField.value = item.id;
      nameField.value = item.name;
      descField.value = item.description || '';
      qtyField.value = item.quantity;
      formTitle.textContent = 'Edit Item';
      submitBtn.textContent = 'Update Item';
      cancelBtn.hidden = false;
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  idField.value = '';
  formTitle.textContent = 'Add Item';
  submitBtn.textContent = 'Add Item';
  cancelBtn.hidden = true;
}

fetchItems();
