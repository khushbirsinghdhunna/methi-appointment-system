import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

dotenv.config();

// ==========================================
// Process Handlers
// ==========================================
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

// ==========================================
// MongoDB Connection (Serverless-Safe)
// ==========================================
let isConnected = false;
async function connectDB() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    return;
  }
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/methi-clinic';
  await mongoose.connect(MONGODB_URI);
  isConnected = true;
  console.log('✅ Connected to MongoDB');
}

connectDB().catch(err => console.error('❌ MongoDB connection error:', err));

// ==========================================
// Express Setup
// ==========================================
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await connectDB();
    } catch (err) {
      console.error('Database connection error:', err);
    }
  }
  next();
});
app.use(express.static(path.join(process.cwd(), 'public')));


// ==========================================
// Mongoose Schemas & Models
// ==========================================

const waAppointmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  doctor: String,
  patientName: String,
  patientPhone: String,
  date: String,
  time: String,
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'rescheduled', 'cancelled', 'completed'], 
    default: 'pending' 
  },
  source: { type: String, default: 'website' },
  notes: String,
  whatsappChatId: String,
}, { timestamps: true });

const WAAppointmentModel = mongoose.model('waappointment', waAppointmentSchema);

const availabilitySchema = new mongoose.Schema({
  day: String,
  startTime: String,
  endTime: String,
  active: Boolean
});

const AvailabilityModel = mongoose.model('Availability', availabilitySchema);

const blockedDateSchema = new mongoose.Schema({
  date: String,
  reason: String
});

const BlockedDateModel = mongoose.model('BlockedDate', blockedDateSchema);

// ==========================================
// Seed Default Availability
// ==========================================
const seedAvailability = async () => {
  try {
    const count = await AvailabilityModel.countDocuments();
    if (count === 0) {
      const defaultSlots = [
        { day: 'monday', startTime: '10:00', endTime: '13:00', active: true },
        { day: 'monday', startTime: '17:00', endTime: '20:00', active: true },
        { day: 'tuesday', startTime: '10:00', endTime: '14:00', active: true },
        { day: 'tuesday', startTime: '16:30', endTime: '19:30', active: true },
        { day: 'wednesday', startTime: '17:00', endTime: '20:00', active: true },
        { day: 'thursday', startTime: '10:00', endTime: '13:00', active: true },
        { day: 'thursday', startTime: '17:00', endTime: '20:00', active: true },
        { day: 'friday', startTime: '10:00', endTime: '14:00', active: true },
        { day: 'friday', startTime: '16:30', endTime: '19:00', active: true },
        { day: 'saturday', startTime: '10:00', endTime: '13:00', active: true },
      ];
      await AvailabilityModel.insertMany(defaultSlots);
      console.log('✅ Seeded default availability');
    }
  } catch (err) {
    console.error('❌ Error seeding availability:', err);
  }
};
seedAvailability();

// ==========================================
// Helpers
// ==========================================
function generateSlots(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let current = sh * 60 + sm;
  const end = eh * 60 + em;
  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    slots.push(`${h12}:${m.toString().padStart(2, '0')} ${period}`);
    current += 10;
  }
  return slots;
}

const META_WA_TOKEN = process.env.META_WA_TOKEN;
const META_WA_PHONE_ID = process.env.META_WA_PHONE_ID;
const META_WA_VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN;

async function sendMetaWhatsAppMessage(to: string, payload: any) {
  const token = process.env.META_WA_TOKEN || META_WA_TOKEN;
  const phoneId = process.env.META_WA_PHONE_ID || META_WA_PHONE_ID;
  if (!token || !phoneId) {
    console.error('WhatsApp API credentials missing');
    return;
  }
  try {
    const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        ...payload
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Error sending WA message:', data);
    }
    return data;
  } catch (err) {
    console.error('Fetch error sending WA message:', err);
  }
}


// ==========================================
// Auth Middleware & Routes
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin123').trim();

const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/admin/login', (req, res): void => {
  const { password } = req.body;
  if (!password || password.trim() !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// ==========================================
// WhatsApp API Routes
// ==========================================
app.get('/api/whatsapp/diag', (req, res) => {
  res.json({
    hasToken: !!META_WA_TOKEN,
    tokenPrefix: META_WA_TOKEN ? META_WA_TOKEN.substring(0, 10) + '...' : null,
    phoneId: META_WA_PHONE_ID
  });
});

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === META_WA_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    console.log('[Meta WA Webhook] Incoming body:', JSON.stringify(req.body));
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      console.log('[Meta WA Webhook] No message in payload (status update).');
      return res.status(200).send('EVENT_RECEIVED');
    }


    const from = message.from;
    console.log(`[Meta WA Webhook] Message from: ${from}, type: ${message.type}`);


    if (message.type === 'interactive') {
      const interactive = message.interactive;
      let buttonId = '';
      let title = '';

      if (interactive.type === 'button_reply') {
        buttonId = interactive.button_reply.id;
        title = interactive.button_reply.title;
      } else if (interactive.type === 'list_reply') {
        buttonId = interactive.list_reply.id;
        title = interactive.list_reply.title;
      }

      if (buttonId.startsWith('slot_')) {
        const time = title;
        const date = new Date().toISOString().split('T')[0];
        
        const appId = `A${Date.now().toString().slice(-6)}`;
        await WAAppointmentModel.create({
          id: appId,
          patientPhone: from,
          date: date,
          time: time,
          status: 'confirmed',
          source: 'whatsapp',
          whatsappChatId: from
        });

        await sendMetaWhatsAppMessage(from, {
          type: 'text',
          text: { body: `🎉 *Your Appointment is CONFIRMED!*\n\n👨‍⚕️ *Doctor:* Dr. Vanita Methi\n📅 *Date:* Today (${date})\n🕐 *Time:* ${time}\n📋 *Ref ID:* #${appId}\n\n📍 *Clinic:* DR METHI ENT CARE AND SKIN TALKS` }
        });
      }
    } else if (message.type === 'text') {
      const todayDate = new Date();
      const dateStr = todayDate.toISOString().split('T')[0];
      const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      const blocked = await BlockedDateModel.findOne({ date: dateStr });
      if (blocked) {
        await sendMetaWhatsAppMessage(from, {
          type: 'text',
          text: { body: `Sorry, we are closed today. Reason: ${blocked.reason}` }
        });
        return res.status(200).send('EVENT_RECEIVED');
      }

      const availabilities = await AvailabilityModel.find({ day: dayName, active: true });
      let allSlots: string[] = [];
      for (const av of availabilities) {
        if (av.startTime && av.endTime) {
          allSlots.push(...generateSlots(av.startTime, av.endTime));
        }
      }

      if (allSlots.length === 0) {
        allSlots = [
          "5:00 PM", "5:10 PM", "5:20 PM", "5:30 PM", 
          "5:40 PM", "5:50 PM", "6:00 PM", "6:10 PM"
        ];
      }

      const existingApps = await WAAppointmentModel.find({ date: dateStr, status: { $ne: 'cancelled' } });
      const bookedTimes = new Set(existingApps.map(a => a.time));
      
      const availableSlots = allSlots.filter(slot => !bookedTimes.has(slot));

      if (availableSlots.length === 0) {
        await sendMetaWhatsAppMessage(from, {
          type: 'text',
          text: { body: `Sorry, there are no available slots for today.` }
        });
        return res.status(200).send('EVENT_RECEIVED');
      }

      const topSlots = availableSlots.slice(0, 3);
      
      const buttons = topSlots.map((slot) => ({
        type: 'reply',
        reply: {
          id: `slot_${slot.replace(/[:\s]/g, '').toLowerCase()}`,
          title: slot
        }
      }));

      await sendMetaWhatsAppMessage(from, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: 'Welcome to DR METHI CLINIC! 👋 Please select an available time slot for today:'
          },
          action: {
            buttons: buttons
          }
        }
      });
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  } finally {
    if (!res.headersSent) {
      res.status(200).send('EVENT_RECEIVED');
    }
  }
});


// ==========================================
// Appointment Endpoints
// ==========================================
app.get('/api/appointments', authMiddleware, async (req, res) => {
  try {
    const appointments = await WAAppointmentModel.find().sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/appointments/:id', async (req, res): Promise<void> => {
  try {
    const appointment = await WAAppointmentModel.findOne({ id: req.params.id });
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/appointments', async (req, res): Promise<void> => {
  const { date, time, patientName, patientPhone } = req.body;
  if (!date || !time) {
    res.status(400).json({ error: 'Date and time are required' });
    return;
  }
  try {
    const id = `A${Date.now().toString().slice(-6)}`;
    const newAppt = await WAAppointmentModel.create({
      id,
      date,
      time,
      patientName,
      patientPhone,
      status: 'pending',
      source: 'website'
    });
    res.status(201).json(newAppt);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/appointments/:id', authMiddleware, async (req, res): Promise<void> => {
  try {
    const { status, patientName, patientPhone, date, time, notes } = req.body;
    const updated = await WAAppointmentModel.findOneAndUpdate(
      { id: req.params.id },
      { $set: { status, patientName, patientPhone, date, time, notes } },
      { new: true }
    );
    if (!updated) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// Availability Endpoints
// ==========================================
app.get('/api/availability', async (req, res) => {
  try {
    const availability = await AvailabilityModel.find();
    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/availability', authMiddleware, async (req, res): Promise<void> => {
  const { availability } = req.body;
  if (!Array.isArray(availability)) {
    res.status(400).json({ error: 'Invalid availability format' });
    return;
  }
  try {
    await AvailabilityModel.deleteMany({});
    const created = await AvailabilityModel.insertMany(availability);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/availability/:date/slots', async (req, res) => {
  try {
    const dateStr = req.params.date; // e.g. '2026-09-24'
    const dateObj = new Date(dateStr);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const blocked = await BlockedDateModel.findOne({ date: dateStr });
    if (blocked) {
      res.json([]);
      return;
    }

    const availabilities = await AvailabilityModel.find({ day: dayName, active: true });
    let allSlots: string[] = [];
    for (const av of availabilities) {
      if (av.startTime && av.endTime) {
        allSlots = allSlots.concat(generateSlots(av.startTime, av.endTime));
      }
    }

    const existingApps = await WAAppointmentModel.find({ date: dateStr, status: { $ne: 'cancelled' } });
    const bookedTimes = new Set(existingApps.map(a => a.time));

    const result = allSlots.map(time => ({
      time,
      available: !bookedTimes.has(time)
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// Blocked Date Endpoints
// ==========================================
app.get('/api/blocked-dates', async (req, res) => {
  try {
    const blockedDates = await BlockedDateModel.find();
    res.json(blockedDates);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/blocked-dates', authMiddleware, async (req, res): Promise<void> => {
  const { date, reason } = req.body;
  if (!date) {
    res.status(400).json({ error: 'Date is required' });
    return;
  }
  try {
    const exists = await BlockedDateModel.findOne({ date });
    if (exists) {
      res.status(409).json({ error: 'Date is already blocked' });
      return;
    }
    const created = await BlockedDateModel.create({ date, reason });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/blocked-dates/:date', authMiddleware, async (req, res): Promise<void> => {
  try {
    const deleted = await BlockedDateModel.findOneAndDelete({ date: req.params.date });
    if (!deleted) {
      res.status(404).json({ error: 'Blocked date not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// Health check & 24/7 Keep-Alive
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Automatic self-ping to prevent free-tier hosting (like Render) from sleeping
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (EXTERNAL_URL) {
  const pingUrl = `${EXTERNAL_URL}/api/health`;
  console.log(`📡 Keep-Alive configured for ${pingUrl} (pings every 10 minutes)`);
  setInterval(async () => {
    try {
      const res = await fetch(pingUrl);
      if (res.ok) {
        console.log(`⏰ [Keep-Alive] Pinged ${pingUrl} at ${new Date().toLocaleTimeString()} - Status OK`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [Keep-Alive] Ping warning:`, err.message);
    }
  }, 10 * 60 * 1000); // 10 minutes
}

// ==========================================
// Catch-all route & Server Start
// ==========================================
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;


