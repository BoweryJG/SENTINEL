import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { nanoid } from 'nanoid';

// Basic in-memory stores (replace with DB later)
const cases = new Map();

// Naive intent classifier (stub — replace with LLM/workflow engine later)
function classifyIntent(text = "") {
  const t = text.toLowerCase();
  if (/(intro|book|meeting|call)/.test(t)) return 'book_intro';
  if (/(coverage|nurse|shift|24|post[- ]?op)/.test(t)) return 'request_coverage';
  if (/(onboard|partnership|partner|white[- ]?label)/.test(t)) return 'onboard_practice';
  if (/(case|patient|surgery|procedure)/.test(t)) return 'create_case';
  return 'route';
}

// Response builders
function buildAssistantResponse(intent) {
  switch (intent) {
    case 'book_intro':
      return {
        intent,
        prompt: 'Great — let’s schedule a 15‑minute intro. Please share your name, practice, email, phone, and 2–3 preferred times (ET).',
        next: {
          type: 'form',
          fields: [
            { id: 'name', label: 'Full name', required: true },
            { id: 'practice', label: 'Practice name', required: true },
            { id: 'email', label: 'Email', required: true },
            { id: 'phone', label: 'Phone', required: true },
            { id: 'times', label: 'Preferred times (ET)', required: true }
          ],
          submit: { action: 'schedule_intro' }
        }
      };
    case 'request_coverage':
      return {
        intent,
        prompt: 'Let’s capture case coverage details.',
        next: {
          type: 'form',
          fields: [
            { id: 'surgeon', label: 'Surgeon name', required: true },
            { id: 'practice', label: 'Practice', required: true },
            { id: 'procedure', label: 'Procedure', required: true },
            { id: 'date', label: 'Surgery date', required: true },
            { id: 'location', label: 'Surgery location/address', required: true },
            { id: 'coverage_hours', label: 'Requested coverage (hours)', required: true },
            { id: 'protocol', label: 'Post‑op protocol (notes/url)', required: false }
          ],
          submit: { action: 'queue_case' }
        }
      };
    case 'onboard_practice':
      return {
        intent,
        prompt: 'We’ll set up a white‑label program for your practice.',
        next: {
          type: 'form',
          fields: [
            { id: 'practice', label: 'Practice name', required: true },
            { id: 'contact', label: 'Primary contact', required: true },
            { id: 'email', label: 'Email', required: true },
            { id: 'phone', label: 'Phone', required: true },
            { id: 'volume', label: 'Estimated monthly cases', required: false }
          ],
          submit: { action: 'onboard' }
        }
      };
    case 'create_case':
      return {
        intent,
        prompt: 'Let’s add a new case. Please provide the details below.',
        next: {
          type: 'form',
          fields: [
            { id: 'patient_initials', label: 'Patient initials', required: true },
            { id: 'procedure', label: 'Procedure', required: true },
            { id: 'date', label: 'Surgery date', required: true },
            { id: 'hours', label: 'Coverage hours', required: true },
            { id: 'notes', label: 'Notes', required: false }
          ],
          submit: { action: 'create_case' }
        }
      };
    default:
      return {
        intent: 'route',
        prompt: 'How can we help today? Book intro, request coverage, onboard practice, or create case?',
        options: [
          { id: 'book_intro', label: 'Book 15‑min Intro' },
          { id: 'request_coverage', label: 'Request Coverage' },
          { id: 'onboard_practice', label: 'Onboard Practice' },
          { id: 'create_case', label: 'Create Case' }
        ]
      };
  }
}

const app = express();
app.use(cors({
  origin: (origin, cb) => cb(null, true), // tighten later
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/api/assistant/message', (req, res) => {
  const { message = '', intent } = req.body || {};
  const resolved = intent || classifyIntent(message);
  const reply = buildAssistantResponse(resolved);
  res.json(reply);
});

app.post('/api/cases', (req, res) => {
  const id = nanoid(10);
  const payload = { id, status: 'queued', createdAt: new Date().toISOString(), ...req.body };
  cases.set(id, payload);
  res.status(201).json(payload);
});

app.get('/api/cases/:id', (req, res) => {
  const c = cases.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`SENTINEL backend listening on :${port}`);
});

