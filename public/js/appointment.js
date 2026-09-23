const WHATSAPP_NUMBER = '917999542447';
const CLINIC_BRAND = 'DR METHI ENT CARE AND SKIN TALKS';
const DOCTOR_NAME = 'Dr. Vanita Methi';
const API_BASE = '/api';

// State
let selectedDate = null;
let selectedTime = null;
let slots = [];

// DOM Elements
const dateContainer = document.getElementById('date-container');
const slotsLoading = document.getElementById('slots-loading');
const slotsEmpty = document.getElementById('slots-empty');
const slotsGrid = document.getElementById('slots-grid');
const selectionSummary = document.getElementById('selection-summary');
const summaryText = document.getElementById('summary-text');
const patientForm = document.getElementById('patient-form');
const patientNameInput = document.getElementById('patient-name');
const patientPhoneInput = document.getElementById('patient-phone');
const whatsappBtn = document.getElementById('whatsapp-btn');
const toastContainer = document.getElementById('toast-container');
const toastMessage = document.getElementById('toast-message');

document.addEventListener('DOMContentLoaded', () => {
  renderDateCards();
  
  // Event Listeners for inputs
  patientNameInput.addEventListener('input', updateButtonState);
  patientPhoneInput.addEventListener('input', updateButtonState);
  
  whatsappBtn.addEventListener('click', handleSubmit);
});

function getNext14Days() {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  
  return dates;
}

function formatDateISO(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderDateCards() {
  const dates = getNext14Days();
  dateContainer.innerHTML = '';
  
  dates.forEach((dateObj, index) => {
    const isoDate = formatDateISO(dateObj);
    const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('en-IN', { month: 'short' });
    
    const btn = document.createElement('button');
    btn.className = `flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl border snap-start transition-all ${
      index === 0 
        ? 'bg-[#0B1426] text-white border-[#0B1426]' // Selected (Today)
        : 'bg-white text-[#0B1426] border-[#D6D2CC] hover:border-[#C9A96E]' // Unselected
    }`;
    btn.dataset.date = isoDate;
    
    btn.innerHTML = `
      <span class="text-xs font-medium opacity-80">${dayName}</span>
      <span class="text-lg font-bold my-0.5">${dayNum}</span>
      <span class="text-xs font-medium opacity-80">${monthName}</span>
    `;
    
    btn.addEventListener('click', () => {
      // Update UI for selected card
      document.querySelectorAll('#date-container button').forEach(b => {
        b.className = 'flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl border snap-start transition-all bg-white text-[#0B1426] border-[#D6D2CC] hover:border-[#C9A96E]';
      });
      btn.className = 'flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl border snap-start transition-all bg-[#0B1426] text-white border-[#0B1426]';
      
      selectedDate = isoDate;
      selectedTime = null; // Clear time
      
      selectionSummary.classList.add('hidden');
      patientForm.classList.add('hidden');
      updateButtonState();
      
      fetchSlots(selectedDate);
    });
    
    dateContainer.appendChild(btn);
  });
  
  // Auto-select first date (today)
  if (dates.length > 0) {
    selectedDate = formatDateISO(dates[0]);
    fetchSlots(selectedDate);
  }
}

async function fetchSlots(date) {
  slotsLoading.classList.remove('hidden');
  slotsEmpty.classList.add('hidden');
  slotsGrid.classList.add('hidden');
  
  try {
    const response = await fetch(`${API_BASE}/availability/${date}/slots`);
    if (!response.ok) {
      throw new Error('Failed to fetch slots');
    }
    slots = await response.json();
  } catch (error) {
    console.error('Error fetching slots:', error);
    showToast('Failed to load available times. Please try again.', 'error');
    slots = []; // Empty slots fallback
  } finally {
    slotsLoading.classList.add('hidden');
    renderSlots();
  }
}

function parseTime(timeStr) {
  // Simple parser to help group AM/PM
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }
  return `${hours}:${minutes}`;
}

function renderSlots() {
  slotsGrid.innerHTML = '';
  
  if (!slots || slots.length === 0) {
    slotsEmpty.classList.remove('hidden');
    return;
  }
  
  slotsEmpty.classList.add('hidden');
  slotsGrid.classList.remove('hidden');
  
  const amSlots = [];
  const pmSlots = [];
  
  slots.forEach(slot => {
    if (slot.time.includes('AM')) {
      amSlots.push(slot);
    } else {
      pmSlots.push(slot);
    }
  });
  
  const createSection = (title, items) => {
    if (items.length === 0) return;
    
    const section = document.createElement('div');
    const heading = document.createElement('h4');
    heading.className = 'text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider';
    heading.textContent = title;
    
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-3 sm:grid-cols-4 gap-2';
    
    items.forEach(slot => {
      const btn = document.createElement('button');
      
      if (!slot.available) {
        // Booked slot
        btn.className = 'py-2 px-1 rounded-lg text-sm font-medium transition-all bg-[#ffdad6]/30 text-[#93000a]/50 line-through cursor-not-allowed border border-transparent';
        btn.disabled = true;
      } else {
        // Available slot
        btn.className = 'py-2 px-1 rounded-lg text-sm font-medium transition-all bg-white border border-[#D6D2CC] text-[#0B1426] hover:bg-[#f0ede8] cursor-pointer time-btn';
        
        btn.addEventListener('click', () => {
          // Deselect others
          document.querySelectorAll('.time-btn').forEach(b => {
             b.className = 'py-2 px-1 rounded-lg text-sm font-medium transition-all bg-white border border-[#D6D2CC] text-[#0B1426] hover:bg-[#f0ede8] cursor-pointer time-btn';
          });
          // Select this
          btn.className = 'py-2 px-1 rounded-lg text-sm font-medium transition-all bg-[#C9A96E] text-white border-[#C9A96E] cursor-pointer time-btn';
          
          selectedTime = slot.time;
          updateSelectionSummary();
        });
      }
      btn.textContent = slot.time;
      grid.appendChild(btn);
    });
    
    section.appendChild(heading);
    section.appendChild(grid);
    slotsGrid.appendChild(section);
  };
  
  createSection('Morning', amSlots);
  createSection('Afternoon/Evening', pmSlots);
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function updateSelectionSummary() {
  if (selectedDate && selectedTime) {
    const formattedDate = formatDate(selectedDate);
    summaryText.textContent = `📅 ${formattedDate} • 🕐 ${selectedTime}`;
    selectionSummary.classList.remove('hidden');
    patientForm.classList.remove('hidden');
    
    // Scroll to form smoothly
    patientForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    updateButtonState();
  }
}

function updateButtonState() {
  const nameVal = patientNameInput.value.trim();
  const phoneVal = patientPhoneInput.value.trim();
  
  if (selectedDate && selectedTime && nameVal && phoneVal) {
    whatsappBtn.disabled = false;
    whatsappBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    whatsappBtn.disabled = true;
    whatsappBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

async function handleSubmit() {
  const name = patientNameInput.value.trim();
  const phone = patientPhoneInput.value.trim();
  
  if (!name || !phone) return;
  
  // Disable button while processing
  const originalText = whatsappBtn.innerHTML;
  whatsappBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2 inline-block align-middle"></div> Processing...';
  whatsappBtn.disabled = true;
  whatsappBtn.classList.add('opacity-80');
  
  try {
    const response = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: selectedDate,
        time: selectedTime,
        patientName: name,
        patientPhone: phone
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to book appointment');
    }
    
    const appointment = await response.json();
    
    showToast('Appointment booked! Redirecting to WhatsApp...', 'success');
    
    const message = [
      `Hello ${CLINIC_BRAND}!`,
      ``,
      `My name is ${name} (Ph: ${phone}).`,
      `I would like to book an appointment.`,
      ``,
      `📅 Date: ${formatDate(selectedDate)}`,
      `🕐 Time: ${selectedTime}`,
      `📋 Ref: ${appointment.id}`,
      ``,
      `Please confirm my appointment. Thank you!`
    ].join('\n');
    
    const link = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    
    // Reset form briefly
    setTimeout(() => {
      window.open(link, '_blank');
      // Re-fetch slots to update state
      fetchSlots(selectedDate);
      
      // reset specific state
      selectedTime = null;
      selectionSummary.classList.add('hidden');
      patientForm.classList.add('hidden');
      patientNameInput.value = '';
      patientPhoneInput.value = '';
      whatsappBtn.innerHTML = originalText;
    }, 1500);

  } catch (error) {
    console.error('Submit error:', error);
    showToast('Failed to book appointment. Please try again.', 'error');
    whatsappBtn.innerHTML = originalText;
    updateButtonState(); // re-enable if valid
  }
}

function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  
  if (type === 'success') {
    toastMessage.className = 'rounded-lg shadow-lg p-4 text-sm font-medium text-center bg-brand-successbg text-brand-success border border-brand-success/20';
  } else {
    toastMessage.className = 'rounded-lg shadow-lg p-4 text-sm font-medium text-center bg-brand-errorbg text-brand-error border border-brand-error/20';
  }
  
  toastContainer.classList.remove('hidden');
  toastContainer.style.opacity = '1';
  
  setTimeout(() => {
    toastContainer.style.opacity = '0';
    setTimeout(() => {
      toastContainer.classList.add('hidden');
    }, 300);
  }, 3000);
}
