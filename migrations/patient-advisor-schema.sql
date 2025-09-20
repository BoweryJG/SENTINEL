-- SENTINEL Advisor Database Schema
-- HIPAA-compliant structure for intelligent care coordination

-- Patients table (core patient information)
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  admission_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  room_number VARCHAR(20),
  care_level VARCHAR(50), -- 'assisted_living', 'memory_care', 'skilled_nursing', 'rehabilitation'
  primary_diagnosis TEXT,
  allergies JSONB DEFAULT '[]',
  medications JSONB DEFAULT '[]',
  dietary_restrictions JSONB DEFAULT '[]',
  emergency_contact JSONB,
  preferences JSONB DEFAULT '{}', -- favorite activities, food preferences, daily routines
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'hospital', 'discharged'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Family members table
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  relationship VARCHAR(50), -- 'spouse', 'daughter', 'son', 'sibling', 'other'
  phone_primary VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email VARCHAR(255),
  is_primary_contact BOOLEAN DEFAULT false,
  is_authorized_caller BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{"daily_summary": true, "alerts": true, "updates": true}',
  preferred_contact_method VARCHAR(20) DEFAULT 'phone', -- 'phone', 'sms', 'email', 'whatsapp'
  preferred_contact_times JSONB DEFAULT '[]', -- array of time ranges
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Care events table (all activities, medications, meals, etc.)
CREATE TABLE IF NOT EXISTS care_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'medication', 'meal', 'activity', 'vital_signs', 'mood', 'incident'
  event_category VARCHAR(50), -- subcategory like 'breakfast', 'blood_pressure', 'fall'
  event_data JSONB NOT NULL, -- flexible structure for different event types
  recorded_by VARCHAR(255), -- staff member name or 'system'
  notes TEXT,
  severity VARCHAR(20) DEFAULT 'routine', -- 'routine', 'attention', 'urgent', 'emergency'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interactions table (all communications with families)
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  interaction_type VARCHAR(20) NOT NULL, -- 'call', 'sms', 'email', 'chat', 'visit'
  direction VARCHAR(10) DEFAULT 'inbound', -- 'inbound', 'outbound'
  duration_seconds INTEGER, -- for calls
  transcript TEXT, -- conversation content
  summary TEXT, -- AI-generated summary
  sentiment VARCHAR(20), -- 'positive', 'neutral', 'concerned', 'upset'
  topics JSONB DEFAULT '[]', -- array of topics discussed
  action_items JSONB DEFAULT '[]', -- follow-up tasks
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff notes table
CREATE TABLE IF NOT EXISTS staff_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  staff_name VARCHAR(100) NOT NULL,
  note_type VARCHAR(50), -- 'observation', 'medical', 'behavioral', 'social'
  content TEXT NOT NULL,
  is_private BOOLEAN DEFAULT false, -- some notes may be staff-only
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  appointment_type VARCHAR(50) NOT NULL, -- 'doctor', 'therapy', 'family_visit', 'assessment'
  provider_name VARCHAR(255),
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location VARCHAR(255),
  transportation_needed BOOLEAN DEFAULT false,
  family_notified BOOLEAN DEFAULT false,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled', 'no_show'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts table (proactive notifications)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'health_change', 'missed_meal', 'fall', 'medication_change'
  severity VARCHAR(20) NOT NULL, -- 'info', 'warning', 'urgent', 'emergency'
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES family_members(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  notifications_sent JSONB DEFAULT '[]', -- track who was notified and when
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice sessions table (for call tracking)
CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_call_sid VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) NOT NULL,
  family_member_id UUID REFERENCES family_members(id),
  patient_id UUID REFERENCES patients(id),
  call_status VARCHAR(50),
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  ai_context JSONB DEFAULT '{}', -- maintain conversation context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Audit log table (HIPAA compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type VARCHAR(20) NOT NULL, -- 'family', 'staff', 'system'
  user_id UUID,
  action VARCHAR(100) NOT NULL, -- 'view_patient', 'update_medication', 'access_notes'
  resource_type VARCHAR(50),
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_family_patient ON family_members(patient_id);
CREATE INDEX idx_care_events_patient ON care_events(patient_id);
CREATE INDEX idx_care_events_type ON care_events(event_type);
CREATE INDEX idx_care_events_created ON care_events(created_at DESC);
CREATE INDEX idx_interactions_family ON interactions(family_member_id);
CREATE INDEX idx_interactions_created ON interactions(created_at DESC);
CREATE INDEX idx_alerts_patient ON alerts(patient_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX idx_voice_sessions_phone ON voice_sessions(phone_number);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;