const API_BASE = '/api';
const CLINIC_BRAND = 'DR METHI ENT CARE AND SKIN TALKS';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('login-btn');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const tabAppointments = document.getElementById('tab-appointments');
const tabAvailability = document.getElementById('tab-availability');
const tabBlocked = document.getElementById('tab-blocked');
const panelAppointments = document.getElementById('panel-appointments');
const panelAvailability = document.getElementById('panel-availability');
const panelBlocked = document.getElementById('panel-blocked');

const appointmentsList = document.getElementById('appointments-list');
const filterDate = document.getElementById('filter-date');
const newApptBtn = document.getElementById('new-appt-btn');

const newApptModal = document.getElementById('new-appointment-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalSubmit = document.getElementById('modal-submit');
const modalName = document.getElementById('modal-name');
const modalPhone = document.getElementById('modal-phone');
const modalDate = document.getElementById('modal-date');
const modalTime = document.getElementById('modal-time');

const availabilityList = document.getElementById('availability-list');
const saveAvailabilityBtn = document.getElementById('save-availability-btn');

const blockDateForm = document.getElementById('block-date-form');
const blockDateInput = document.getElementById('block-date-input');
const blockReasonInput = document.getElementById('block-reason-input');
const blockedList = document.getElementById('blocked-list');

const toastContainer = document.getElementById('toast-container');

// State
let autoRefreshInterval = null;

// --- Utility Functions ---

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-red-100 border-red-400 text-red-800';
  
  toast.className = `px-4 py-3 rounded shadow-md border ${bgColor} transition-opacity duration-300`;
  toast.textContent = message;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toastContainer.contains(toast)) {
        toastContainer.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function getAuthHeaders() {
  const token = localStorage.getItem('adminToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
}

// --- Auth Functions ---

async function login() {
  const password = loginPassword.value;
  if (!password) return;

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('adminToken', data.token);
      loginError.classList.add('hidden');
      loginPassword.value = '';
      showDashboard();
    } else {
      loginError.textContent = 'Invalid password';
      loginError.classList.remove('hidden');
    }
  } catch (error) {
    loginError.textContent = 'Login failed. Try again.';
    loginError.classList.remove('hidden');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  showLoginScreen();
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
}

function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    showDashboard();
  } else {
    showLoginScreen();
  }
}

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  loadAppointments(filterDate.value);
  startAutoRefresh();
}

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

function handleUnauthorized(res) {
  if (res.status === 401) {
    logout();
    showToast('Session expired. Please login again.', 'error');
    throw new Error('Unauthorized');
  }
}

// --- Tab Navigation ---

function switchTab(tab) {
  // Reset all
  [tabAppointments, tabAvailability, tabBlocked].forEach(t => {
    t.className = 'whitespace-nowrap py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 font-medium text-sm transition-colors';
  });
  [panelAppointments, panelAvailability, panelBlocked].forEach(p => p.classList.add('hidden'));

  // Set active
  if (tab === 'appointments') {
    tabAppointments.className = 'whitespace-nowrap py-4 px-1 border-b-2 border-accent text-primary font-medium text-sm transition-colors';
    panelAppointments.classList.remove('hidden');
    loadAppointments(filterDate.value);
  } else if (tab === 'availability') {
    tabAvailability.className = 'whitespace-nowrap py-4 px-1 border-b-2 border-accent text-primary font-medium text-sm transition-colors';
    panelAvailability.classList.remove('hidden');
    loadAvailability();
  } else if (tab === 'blocked') {
    tabBlocked.className = 'whitespace-nowrap py-4 px-1 border-b-2 border-accent text-primary font-medium text-sm transition-colors';
    panelBlocked.classList.remove('hidden');
    loadBlockedDates();
  }
}

// --- Appointments ---

async function loadAppointments(dateStr = '') {
  try {
    let url = `${API_BASE}/appointments`;
    if (dateStr) url += `?date=${dateStr}`;
    
    const res = await fetch(url, { headers: getAuthHeaders() });
    handleUnauthorized(res);
    
    let appointments = await res.json();
    
    // Sort by date desc, then time
    appointments.sort((a, b) => {
      if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
      return a.time.localeCompare(b.time);
    });
    
    renderAppointments(appointments);
  } catch (error) {
    if (error.message !== 'Unauthorized') {
      console.error('Failed to load appointments:', error);
      appointmentsList.innerHTML = '<div class="p-8 text-center text-red-500">Error loading appointments</div>';
    }
  }
}

function renderAppointments(appointments) {
  if (appointments.length === 0) {
    appointmentsList.innerHTML = '<div class="p-8 text-center text-gray-500">No appointments found.</div>';
    return;
  }

  appointmentsList.innerHTML = '';
  appointments.forEach(appt => {
    const card = document.createElement('div');
    card.className = 'p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center';
    
    // Status badges
    let statusClass = 'bg-gray-100 text-gray-800';
    let statusText = appt.status;
    if (appt.status === 'pending') { statusClass = 'bg-yellow-100 text-yellow-800'; statusText = '⏳ Pending'; }
    else if (appt.status === 'confirmed') { statusClass = 'bg-green-100 text-green-800'; statusText = '✅ Confirmed'; }
    else if (appt.status === 'cancelled') { statusClass = 'bg-red-100 text-red-800'; statusText = '❌ Cancelled'; }
    else if (appt.status === 'completed') { statusClass = 'bg-blue-100 text-blue-800'; statusText = '✔️ Completed'; }

    // Source badges
    let sourceClass = 'bg-gray-50 text-gray-700';
    let sourceText = appt.source || 'Manual';
    if (appt.source === 'website') { sourceClass = 'bg-blue-50 text-blue-700'; sourceText = '🌐 Website'; }
    else if (appt.source === 'whatsapp') { sourceClass = 'bg-green-50 text-green-700'; sourceText = '💬 WhatsApp'; }

    // WhatsApp link formatting
    const cleanPhone = (appt.patientPhone || '').replace(/\D/g, '');
    const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const confirmationMessage = encodeURIComponent(`Hello ${appt.patientName}, this is from ${CLINIC_BRAND}. Your appointment on ${appt.date} at ${appt.time} is confirmed. Thank you!`);

    let actionsHtml = '';
    if (appt.status === 'pending') {
      actionsHtml = `
        <button onclick="updateAppointmentStatus('${appt.id || appt._id}', 'confirmed')" class="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700">✅ Confirm</button>
        <button onclick="updateAppointmentStatus('${appt.id || appt._id}', 'cancelled')" class="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700">❌ Cancel</button>
      `;
    } else if (appt.status === 'confirmed') {
      actionsHtml = `
        <button onclick="updateAppointmentStatus('${appt.id || appt._id}', 'completed')" class="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700">✔️ Complete</button>
        <button onclick="updateAppointmentStatus('${appt.id || appt._id}', 'cancelled')" class="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700">❌ Cancel</button>
      `;
    }

    card.innerHTML = `
      <div class="space-y-1 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="font-bold text-lg text-primary">${appt.patientName}</h3>
          <span class="px-2 py-0.5 rounded text-xs font-medium ${sourceClass}">${sourceText}</span>
        </div>
        <p class="text-sm text-gray-600">📞 ${appt.patientPhone}</p>
        <p class="text-sm font-medium text-gray-800">🗓️ ${formatDate(appt.date)} at ⏰ ${appt.time}</p>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span class="px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}">${statusText}</span>
        <div class="flex gap-2">
          ${actionsHtml}
          ${finalPhone ? `<a href="https://wa.me/${finalPhone}?text=${confirmationMessage}" target="_blank" class="px-3 py-1 bg-green-500 text-white text-xs font-medium rounded hover:bg-green-600 flex items-center gap-1">💬 Chat</a>` : ''}
        </div>
      </div>
    `;
    appointmentsList.appendChild(card);
  });
}

window.updateAppointmentStatus = async function(id, status) {
  try {
    const res = await fetch(`${API_BASE}/appointments/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    handleUnauthorized(res);
    
    if (res.ok) {
      showToast(`Appointment marked as ${status}`);
      loadAppointments(filterDate.value);
    } else {
      showToast('Failed to update status', 'error');
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') showToast('Error updating status', 'error');
  }
};

// --- New Appointment Modal ---

function openNewAppointmentModal() {
  newApptModal.classList.remove('hidden');
  const today = new Date().toISOString().split('T')[0];
  modalDate.value = today;
  fetchAvailableSlots(today);
}

function closeModal() {
  newApptModal.classList.add('hidden');
  modalName.value = '';
  modalPhone.value = '';
  modalDate.value = '';
  modalTime.innerHTML = '<option value="">Select a date first</option>';
}

async function fetchAvailableSlots(dateStr) {
  if (!dateStr) return;
  try {
    modalTime.innerHTML = '<option value="">Loading slots...</option>';
    const res = await fetch(`${API_BASE}/availability/slots?date=${dateStr}`);
    if (res.ok) {
      const slots = await res.json();
      if (slots.length === 0) {
        modalTime.innerHTML = '<option value="">No slots available</option>';
      } else {
        modalTime.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
      }
    }
  } catch (error) {
    console.error('Error fetching slots:', error);
    modalTime.innerHTML = '<option value="">Error loading slots</option>';
  }
}

modalDate.addEventListener('change', (e) => fetchAvailableSlots(e.target.value));

async function submitNewAppointment() {
  const patientName = modalName.value.trim();
  const patientPhone = modalPhone.value.trim();
  const date = modalDate.value;
  const time = modalTime.value;

  if (!patientName || !patientPhone || !date || !time) {
    showToast('Please fill all fields', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ patientName, patientPhone, date, time })
    });
    
    handleUnauthorized(res);

    if (res.ok) {
      showToast('Appointment created successfully');
      closeModal();
      loadAppointments(filterDate.value);
    } else {
      showToast('Failed to create appointment', 'error');
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') showToast('Error creating appointment', 'error');
  }
}

// --- Availability ---

async function loadAvailability() {
  try {
    const res = await fetch(`${API_BASE}/availability`, { headers: getAuthHeaders() });
    handleUnauthorized(res);
    
    if (res.ok) {
      const { availability } = await res.json();
      renderAvailability(availability);
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') {
      availabilityList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-red-500">Error loading availability</td></tr>';
    }
  }
}

function renderAvailability(availability) {
  availabilityList.innerHTML = '';
  availability.forEach((day, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-100 last:border-0';
    tr.innerHTML = `
      <td class="py-3 font-medium text-primary">${day.day}</td>
      <td class="py-3">
        <input type="checkbox" class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent day-active" data-index="${index}" ${day.isActive ? 'checked' : ''}>
      </td>
      <td class="py-3">
        <input type="time" class="px-2 py-1 border border-border rounded text-sm outline-none focus:border-accent day-start" data-index="${index}" value="${day.startTime || '09:00'}">
      </td>
      <td class="py-3">
        <input type="time" class="px-2 py-1 border border-border rounded text-sm outline-none focus:border-accent day-end" data-index="${index}" value="${day.endTime || '17:00'}">
      </td>
    `;
    availabilityList.appendChild(tr);
  });
}

async function saveAvailability() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const newAvailability = [];
  
  const actives = document.querySelectorAll('.day-active');
  const starts = document.querySelectorAll('.day-start');
  const ends = document.querySelectorAll('.day-end');

  days.forEach((day, i) => {
    newAvailability.push({
      day,
      isActive: actives[i].checked,
      startTime: starts[i].value,
      endTime: ends[i].value
    });
  });

  try {
    const res = await fetch(`${API_BASE}/availability`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ availability: newAvailability })
    });
    
    handleUnauthorized(res);

    if (res.ok) {
      showToast('Availability saved successfully');
    } else {
      showToast('Failed to save availability', 'error');
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') showToast('Error saving availability', 'error');
  }
}

// --- Blocked Dates ---

async function loadBlockedDates() {
  try {
    const res = await fetch(`${API_BASE}/blocked-dates`, { headers: getAuthHeaders() });
    handleUnauthorized(res);
    
    if (res.ok) {
      const blockedDates = await res.json();
      renderBlockedDates(blockedDates);
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') {
      blockedList.innerHTML = '<li class="p-6 text-center text-red-500">Error loading blocked dates</li>';
    }
  }
}

function renderBlockedDates(blockedDates) {
  if (blockedDates.length === 0) {
    blockedList.innerHTML = '<li class="p-6 text-center text-gray-500">No blocked dates found.</li>';
    return;
  }

  blockedList.innerHTML = '';
  // Sort ascending
  blockedDates.sort((a, b) => new Date(a.date) - new Date(b.date));

  blockedDates.forEach(bd => {
    const li = document.createElement('li');
    li.className = 'px-6 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors';
    li.innerHTML = `
      <div>
        <p class="font-medium text-primary">${formatDate(bd.date)}</p>
        ${bd.reason ? `<p class="text-sm text-gray-500">${bd.reason}</p>` : ''}
      </div>
      <button onclick="unblockDate('${bd.date}')" class="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 transition-colors">
        Unblock
      </button>
    `;
    blockedList.appendChild(li);
  });
}

async function blockDate(e) {
  e.preventDefault();
  const date = blockDateInput.value;
  const reason = blockReasonInput.value.trim();

  if (!date) return;

  try {
    const res = await fetch(`${API_BASE}/blocked-dates`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ date, reason })
    });
    
    handleUnauthorized(res);

    if (res.ok) {
      showToast('Date blocked successfully');
      blockDateForm.reset();
      loadBlockedDates();
    } else {
      showToast('Failed to block date', 'error');
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') showToast('Error blocking date', 'error');
  }
}

window.unblockDate = async function(date) {
  if (!confirm(`Are you sure you want to unblock ${formatDate(date)}?`)) return;
  
  try {
    const res = await fetch(`${API_BASE}/blocked-dates/${date}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    handleUnauthorized(res);

    if (res.ok) {
      showToast('Date unblocked successfully');
      loadBlockedDates();
    } else {
      showToast('Failed to unblock date', 'error');
    }
  } catch (error) {
    if (error.message !== 'Unauthorized') showToast('Error unblocking date', 'error');
  }
};

// --- Auto Refresh ---

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    if (!document.hidden && panelAppointments.classList.contains('hidden') === false) {
      loadAppointments(filterDate.value);
    }
  }, 30000);
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
  loginBtn.addEventListener('click', login);
  loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  logoutBtn.addEventListener('click', logout);

  tabAppointments.addEventListener('click', () => switchTab('appointments'));
  tabAvailability.addEventListener('click', () => switchTab('availability'));
  tabBlocked.addEventListener('click', () => switchTab('blocked'));

  newApptBtn.addEventListener('click', openNewAppointmentModal);
  modalCancel.addEventListener('click', closeModal);
  modalSubmit.addEventListener('click', submitNewAppointment);

  filterDate.addEventListener('change', (e) => loadAppointments(e.target.value));

  saveAvailabilityBtn.addEventListener('click', saveAvailability);
  blockDateForm.addEventListener('submit', blockDate);

  // Close modal on backdrop click
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);

  checkAuth();
});
