-- SENTINEL Complete Intelligent Orchestrator Database Schema
-- Version: 1.0.0
-- Purpose: Comprehensive healthcare orchestration with call intelligence, payments, and business analytics

-- =====================================================
-- CORE PATIENT & FAMILY MANAGEMENT
-- =====================================================

-- Patients table with enhanced tracking
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Personal Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(20),
  ssn_last_four VARCHAR(4),

  -- Contact Information
  phone_primary VARCHAR(20),
  phone_secondary VARCHAR(20),
  email VARCHAR(255),

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),

  -- Medical Information
  admission_date DATE NOT NULL,
  discharge_date DATE,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'transferred', 'deceased')),
  care_level VARCHAR(50) CHECK (care_level IN ('independent', 'assisted', 'memory_care', 'skilled_nursing', 'hospice')),
  primary_diagnosis TEXT,
  allergies TEXT[],

  -- Financial Information
  monthly_rate DECIMAL(10,2),
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  insurance_provider VARCHAR(100),
  insurance_policy_number VARCHAR(100),

  -- Emergency Contact
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relationship VARCHAR(50),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  INDEX idx_patient_status (status),
  INDEX idx_patient_admission (admission_date)
);

-- Family members with payment authority
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Personal Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  relationship VARCHAR(50) NOT NULL,

  -- Contact Information
  phone_primary VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email VARCHAR(255),

  -- Permissions
  is_primary_contact BOOLEAN DEFAULT FALSE,
  is_authorized_for_medical BOOLEAN DEFAULT FALSE,
  is_authorized_for_financial BOOLEAN DEFAULT TRUE,
  can_receive_updates BOOLEAN DEFAULT TRUE,
  preferred_contact_method VARCHAR(20) DEFAULT 'phone',

  -- Payment Information
  stripe_customer_id VARCHAR(255),
  payment_method_id VARCHAR(255),
  autopay_enabled BOOLEAN DEFAULT FALSE,

  -- Communication Preferences
  update_frequency VARCHAR(20) DEFAULT 'daily',
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_family_patient (patient_id),
  INDEX idx_family_primary (is_primary_contact)
);

-- =====================================================
-- CALL INTELLIGENCE & ROUTING
-- =====================================================

-- Incoming calls with transcription
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Call Information
  twilio_call_sid VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) NOT NULL,
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
  call_status VARCHAR(50),
  duration_seconds INTEGER,

  -- Caller Identification
  family_member_id UUID REFERENCES family_members(id),
  patient_id UUID REFERENCES patients(id),
  caller_name VARCHAR(200),

  -- Transcription & Analysis
  deepgram_request_id VARCHAR(255),
  transcription TEXT,
  transcription_confidence FLOAT,
  keywords TEXT[],
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative', 'urgent')),
  topics TEXT[],

  -- Routing & Response
  routed_to VARCHAR(100), -- staff member or department
  ai_response TEXT,
  action_taken VARCHAR(100),
  requires_callback BOOLEAN DEFAULT FALSE,
  callback_scheduled_at TIMESTAMPTZ,

  -- Recording
  recording_url TEXT,
  recording_duration INTEGER,

  -- Metadata
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_calls_phone (phone_number),
  INDEX idx_calls_family (family_member_id),
  INDEX idx_calls_patient (patient_id),
  INDEX idx_calls_sentiment (sentiment),
  INDEX idx_calls_callback (requires_callback)
);

-- Call routing rules
CREATE TABLE IF NOT EXISTS call_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Configuration
  rule_name VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT TRUE,

  -- Conditions
  keyword_matches TEXT[],
  sentiment_matches VARCHAR(20)[],
  time_of_day_start TIME,
  time_of_day_end TIME,
  day_of_week INTEGER[], -- 0-6

  -- Actions
  route_to VARCHAR(100),
  send_alert_to VARCHAR(255), -- email or phone
  auto_response_template TEXT,
  escalation_required BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_routing_priority (priority),
  INDEX idx_routing_active (active)
);

-- =====================================================
-- PAYMENT PROCESSING & BILLING
-- =====================================================

-- Payment accounts
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES family_members(id),
  patient_id UUID NOT NULL REFERENCES patients(id),

  -- Stripe Information
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255),

  -- Billing Details
  billing_email VARCHAR(255),
  billing_phone VARCHAR(20),
  billing_address_line1 VARCHAR(255),
  billing_address_line2 VARCHAR(255),
  billing_city VARCHAR(100),
  billing_state VARCHAR(2),
  billing_zip VARCHAR(10),

  -- Account Status
  account_status VARCHAR(50) DEFAULT 'active',
  payment_method_type VARCHAR(50),
  last_four_digits VARCHAR(4),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_payment_family (family_member_id),
  INDEX idx_payment_patient (patient_id),
  INDEX idx_payment_stripe (stripe_customer_id)
);

-- Transaction history
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_account_id UUID REFERENCES payment_accounts(id),
  patient_id UUID REFERENCES patients(id),

  -- Transaction Details
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Type and Status
  transaction_type VARCHAR(50) CHECK (transaction_type IN ('charge', 'refund', 'adjustment', 'deposit')),
  status VARCHAR(50) CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  -- Description
  description TEXT,
  billing_period_start DATE,
  billing_period_end DATE,

  -- Metadata
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_transaction_account (payment_account_id),
  INDEX idx_transaction_patient (patient_id),
  INDEX idx_transaction_status (status),
  INDEX idx_transaction_date (processed_at)
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  payment_account_id UUID REFERENCES payment_accounts(id),

  -- Invoice Details
  invoice_number VARCHAR(50) UNIQUE,
  stripe_invoice_id VARCHAR(255),

  -- Amounts
  subtotal DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  amount_due DECIMAL(10,2),

  -- Dates
  invoice_date DATE NOT NULL,
  due_date DATE,
  paid_date DATE,

  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void')),

  -- Line Items (JSON)
  line_items JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_invoice_patient (patient_id),
  INDEX idx_invoice_status (status),
  INDEX idx_invoice_due (due_date)
);

-- =====================================================
-- OUTREACH & LEAD MANAGEMENT
-- =====================================================

-- Outreach campaigns
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campaign Information
  campaign_name VARCHAR(200) NOT NULL,
  campaign_type VARCHAR(50) CHECK (campaign_type IN ('referral', 'direct', 'digital', 'event')),
  status VARCHAR(50) DEFAULT 'planning',

  -- Targeting
  target_audience TEXT,
  target_locations TEXT[],
  target_specialties TEXT[], -- for physician outreach

  -- Metrics
  total_contacts INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,

  -- Budget
  budget_allocated DECIMAL(10,2),
  budget_spent DECIMAL(10,2) DEFAULT 0,

  -- Dates
  start_date DATE,
  end_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_campaign_status (status),
  INDEX idx_campaign_type (campaign_type)
);

-- Leads from outreach
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_campaign_id UUID REFERENCES outreach_campaigns(id),

  -- Lead Information
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  organization VARCHAR(255),
  title VARCHAR(100),

  -- Contact Information
  phone VARCHAR(20),
  email VARCHAR(255),
  address VARCHAR(500),

  -- Lead Details
  lead_source VARCHAR(100),
  lead_type VARCHAR(50) CHECK (lead_type IN ('physician', 'facility', 'family', 'self')),
  lead_status VARCHAR(50) DEFAULT 'new',
  lead_score INTEGER DEFAULT 0,

  -- Engagement
  last_contact_date DATE,
  next_followup_date DATE,
  assigned_to VARCHAR(100),

  -- Notes
  notes TEXT,

  -- Conversion
  converted_to_patient_id UUID REFERENCES patients(id),
  converted_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_lead_campaign (outreach_campaign_id),
  INDEX idx_lead_status (lead_status),
  INDEX idx_lead_source (lead_source)
);

-- =====================================================
-- BUSINESS INTELLIGENCE & ANALYTICS
-- =====================================================

-- Daily metrics snapshot
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,

  -- Census Metrics
  total_patients INTEGER,
  new_admissions INTEGER,
  discharges INTEGER,
  occupancy_rate DECIMAL(5,2),

  -- Financial Metrics
  daily_revenue DECIMAL(10,2),
  outstanding_receivables DECIMAL(10,2),
  collection_rate DECIMAL(5,2),

  -- Care Metrics
  total_care_events INTEGER,
  medication_compliance_rate DECIMAL(5,2),
  average_response_time_minutes DECIMAL(5,2),

  -- Communication Metrics
  total_calls INTEGER,
  average_call_duration_seconds INTEGER,
  family_satisfaction_score DECIMAL(3,2),

  -- Staff Metrics
  staff_on_duty INTEGER,
  patient_to_staff_ratio DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_metrics_date (metric_date)
);

-- Executive dashboard configuration
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Widget Configuration
  widget_name VARCHAR(100) NOT NULL,
  widget_type VARCHAR(50) CHECK (widget_type IN ('chart', 'metric', 'table', 'map')),
  position INTEGER,
  size VARCHAR(20) DEFAULT 'medium',

  -- Data Source
  data_query TEXT,
  refresh_interval_seconds INTEGER DEFAULT 300,

  -- Display Settings
  chart_type VARCHAR(50),
  color_scheme VARCHAR(50),
  show_trend BOOLEAN DEFAULT TRUE,

  -- Access Control
  visible_to_roles TEXT[],

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_widget_position (position),
  INDEX idx_widget_active (active)
);

-- =====================================================
-- AI AGENT ORCHESTRATION
-- =====================================================

-- AI agents configuration
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent Information
  agent_name VARCHAR(100) NOT NULL UNIQUE,
  agent_type VARCHAR(50) CHECK (agent_type IN ('advisor', 'intake', 'medical', 'billing', 'outreach')),

  -- Configuration
  model_name VARCHAR(100) DEFAULT 'claude-3-5-sonnet',
  temperature DECIMAL(2,1) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,

  -- Prompt Templates
  system_prompt TEXT,
  greeting_template TEXT,
  error_template TEXT,

  -- Capabilities
  can_access_patient_data BOOLEAN DEFAULT FALSE,
  can_access_financial_data BOOLEAN DEFAULT FALSE,
  can_make_appointments BOOLEAN DEFAULT FALSE,
  can_send_notifications BOOLEAN DEFAULT FALSE,

  -- Status
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_agent_type (agent_type),
  INDEX idx_agent_active (active)
);

-- Agent interactions log
CREATE TABLE IF NOT EXISTS agent_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Interaction Context
  ai_agent_id UUID REFERENCES ai_agents(id),
  call_id UUID REFERENCES calls(id),
  family_member_id UUID REFERENCES family_members(id),
  patient_id UUID REFERENCES patients(id),

  -- Interaction Details
  interaction_type VARCHAR(50),
  input_text TEXT,
  output_text TEXT,

  -- Performance Metrics
  response_time_ms INTEGER,
  tokens_used INTEGER,
  confidence_score DECIMAL(3,2),

  -- Outcome
  action_taken VARCHAR(100),
  escalated_to_human BOOLEAN DEFAULT FALSE,
  satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_agent_interaction (ai_agent_id),
  INDEX idx_interaction_call (call_id),
  INDEX idx_interaction_patient (patient_id)
);

-- =====================================================
-- CARE TRACKING & EVENTS
-- =====================================================

-- Comprehensive care events
CREATE TABLE IF NOT EXISTS care_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Event Details
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(50),
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Description
  title VARCHAR(200),
  description TEXT,

  -- Medical Details
  vital_signs JSONB,
  medications_given TEXT[],

  -- Staff Information
  performed_by VARCHAR(100),
  verified_by VARCHAR(100),

  -- Timestamps
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Follow-up
  requires_followup BOOLEAN DEFAULT FALSE,
  followup_completed BOOLEAN DEFAULT FALSE,

  INDEX idx_care_patient (patient_id),
  INDEX idx_care_type (event_type),
  INDEX idx_care_severity (severity),
  INDEX idx_care_occurred (occurred_at)
);

-- =====================================================
-- AUDIT & COMPLIANCE
-- =====================================================

-- Comprehensive audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action Information
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id UUID,

  -- User Information
  user_id UUID,
  user_email VARCHAR(255),
  ip_address INET,

  -- Changes
  old_values JSONB,
  new_values JSONB,

  -- Context
  request_id VARCHAR(255),
  session_id VARCHAR(255),

  -- Compliance
  hipaa_relevant BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_audit_action (action),
  INDEX idx_audit_table (table_name),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Call analytics indexes
CREATE INDEX idx_calls_date_range ON calls(started_at, ended_at);
CREATE INDEX idx_calls_transcription ON calls USING GIN(to_tsvector('english', transcription));

-- Payment search indexes
CREATE INDEX idx_transaction_date_range ON transactions(processed_at, amount);
CREATE INDEX idx_invoice_overdue ON invoices(status, due_date) WHERE status = 'overdue';

-- Lead scoring indexes
CREATE INDEX idx_lead_scoring ON leads(lead_score DESC, lead_status);
CREATE INDEX idx_lead_followup ON leads(next_followup_date) WHERE lead_status != 'converted';

-- Metrics performance indexes
CREATE INDEX idx_metrics_recent ON daily_metrics(metric_date DESC);

-- =====================================================
-- INITIAL DATA & CONFIGURATION
-- =====================================================

-- Insert default AI agents
INSERT INTO ai_agents (agent_name, agent_type, system_prompt, greeting_template) VALUES
('SENTINEL Advisor', 'advisor',
 'You are the SENTINEL Advisor, a professional and compassionate care coordinator for a luxury private recovery care facility. Provide warm, accurate updates about patient care while maintaining HIPAA compliance.',
 'Hello, this is the SENTINEL Advisor. How may I assist you with your loved one''s care today?'),

('Intake Coordinator', 'intake',
 'You are an intake coordinator for SENTINEL Recovery Care. Help potential families understand our services and guide them through the admission process.',
 'Welcome to SENTINEL Recovery Care. I''m here to help you explore our care options.'),

('Medical Assistant', 'medical',
 'You are a medical information assistant. Provide general health information and help families understand care plans, but never provide specific medical advice.',
 'I''m here to help you understand your loved one''s care plan and medical needs.'),

('Billing Specialist', 'billing',
 'You are a billing specialist for SENTINEL Recovery Care. Help families understand charges, payment options, and insurance coverage.',
 'I can help you understand your billing statement and payment options.'),

('Outreach Coordinator', 'outreach',
 'You are an outreach coordinator identifying and qualifying potential referral partners and families who may benefit from SENTINEL''s services.',
 'Hello, I''m reaching out from SENTINEL Recovery Care to share how we can support your patients'' recovery journey.');

-- Insert default call routing rules
INSERT INTO call_routing_rules (rule_name, priority, keyword_matches, route_to, auto_response_template) VALUES
('Emergency', 10, ARRAY['emergency', 'urgent', 'help', '911'], 'emergency_team',
 'This is being treated as an emergency. Staff has been immediately notified.'),

('Medical Questions', 50, ARRAY['medication', 'doctor', 'nurse', 'pain', 'sick'], 'medical_team',
 'I''m connecting you with our medical team who can best address your concerns.'),

('Billing Inquiries', 60, ARRAY['bill', 'payment', 'invoice', 'charge', 'insurance'], 'billing_department',
 'I''ll connect you with our billing department to assist with your inquiry.'),

('General Updates', 100, ARRAY['update', 'how is', 'status', 'doing'], 'care_coordinator',
 'Let me get you the latest update on your loved one.');

-- Insert dashboard widgets
INSERT INTO dashboard_widgets (widget_name, widget_type, position, data_query) VALUES
('Daily Census', 'metric', 1,
 'SELECT COUNT(*) as value, ''patients'' as label FROM patients WHERE status = ''active'''),

('Today''s Revenue', 'metric', 2,
 'SELECT SUM(amount) as value, ''revenue'' as label FROM transactions WHERE DATE(processed_at) = CURRENT_DATE AND status = ''succeeded'''),

('Call Volume', 'chart', 3,
 'SELECT DATE(started_at) as date, COUNT(*) as calls FROM calls WHERE started_at >= CURRENT_DATE - INTERVAL ''7 days'' GROUP BY DATE(started_at)'),

('Occupancy Trend', 'chart', 4,
 'SELECT metric_date, occupancy_rate FROM daily_metrics WHERE metric_date >= CURRENT_DATE - INTERVAL ''30 days'' ORDER BY metric_date'),

('Recent Admissions', 'table', 5,
 'SELECT first_name, last_name, admission_date, care_level FROM patients WHERE admission_date >= CURRENT_DATE - INTERVAL ''7 days'' ORDER BY admission_date DESC'),

('Outstanding Receivables', 'metric', 6,
 'SELECT SUM(amount_due) as value, ''outstanding'' as label FROM invoices WHERE status IN (''sent'', ''overdue'')'),

('Family Satisfaction', 'metric', 7,
 'SELECT AVG(satisfaction_rating) as value, ''satisfaction'' as label FROM agent_interactions WHERE created_at >= CURRENT_DATE - INTERVAL ''30 days'''),

('Active Leads', 'table', 8,
 'SELECT first_name, last_name, organization, lead_score, next_followup_date FROM leads WHERE lead_status = ''active'' ORDER BY lead_score DESC LIMIT 10');

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (customize based on your auth setup)
CREATE POLICY "Service role has full access" ON patients
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Family members can view their patient" ON patients
  FOR SELECT USING (
    id IN (
      SELECT patient_id FROM family_members
      WHERE family_members.id = auth.uid()
    )
  );

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_payment_accounts_updated_at BEFORE UPDATE ON payment_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    user_id,
    hipaa_relevant
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    to_jsonb(OLD),
    to_jsonb(NEW),
    auth.uid(),
    TG_TABLE_NAME IN ('patients', 'care_events', 'family_members')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_patients AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_care_events AFTER INSERT OR UPDATE OR DELETE ON care_events
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Function to calculate daily metrics
CREATE OR REPLACE FUNCTION calculate_daily_metrics(target_date DATE)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_metrics (
    metric_date,
    total_patients,
    new_admissions,
    discharges,
    occupancy_rate,
    daily_revenue,
    outstanding_receivables,
    total_calls,
    average_call_duration_seconds
  )
  SELECT
    target_date,
    (SELECT COUNT(*) FROM patients WHERE status = 'active' AND admission_date <= target_date),
    (SELECT COUNT(*) FROM patients WHERE DATE(admission_date) = target_date),
    (SELECT COUNT(*) FROM patients WHERE DATE(discharge_date) = target_date),
    (SELECT COUNT(*)::DECIMAL / 50 * 100 FROM patients WHERE status = 'active'), -- Assuming 50 bed capacity
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE DATE(processed_at) = target_date AND status = 'succeeded'),
    (SELECT COALESCE(SUM(amount_due), 0) FROM invoices WHERE status IN ('sent', 'overdue')),
    (SELECT COUNT(*) FROM calls WHERE DATE(started_at) = target_date),
    (SELECT AVG(duration_seconds) FROM calls WHERE DATE(started_at) = target_date)
  ON CONFLICT (metric_date) DO UPDATE SET
    total_patients = EXCLUDED.total_patients,
    new_admissions = EXCLUDED.new_admissions,
    discharges = EXCLUDED.discharges,
    occupancy_rate = EXCLUDED.occupancy_rate,
    daily_revenue = EXCLUDED.daily_revenue,
    outstanding_receivables = EXCLUDED.outstanding_receivables,
    total_calls = EXCLUDED.total_calls,
    average_call_duration_seconds = EXCLUDED.average_call_duration_seconds;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR BUSINESS INTELLIGENCE
-- =====================================================

-- Executive dashboard view
CREATE OR REPLACE VIEW executive_summary AS
SELECT
  (SELECT COUNT(*) FROM patients WHERE status = 'active') as current_census,
  (SELECT COUNT(*) FROM patients WHERE admission_date >= CURRENT_DATE - INTERVAL '30 days') as monthly_admissions,
  (SELECT SUM(amount) FROM transactions WHERE processed_at >= CURRENT_DATE - INTERVAL '30 days' AND status = 'succeeded') as monthly_revenue,
  (SELECT COUNT(*) FROM leads WHERE lead_status = 'active') as active_leads,
  (SELECT AVG(satisfaction_rating) FROM agent_interactions WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as avg_satisfaction,
  (SELECT COUNT(*) FROM calls WHERE started_at >= CURRENT_DATE) as todays_calls,
  (SELECT COUNT(*) FROM care_events WHERE occurred_at >= CURRENT_DATE AND severity = 'critical') as critical_events_today;

-- Patient revenue view
CREATE OR REPLACE VIEW patient_revenue_summary AS
SELECT
  p.id,
  p.first_name || ' ' || p.last_name as patient_name,
  p.admission_date,
  p.monthly_rate,
  COUNT(DISTINCT i.id) as total_invoices,
  SUM(t.amount) as total_paid,
  SUM(i.amount_due) as outstanding_balance,
  MAX(t.processed_at) as last_payment_date
FROM patients p
LEFT JOIN invoices i ON i.patient_id = p.id
LEFT JOIN transactions t ON t.patient_id = p.id AND t.status = 'succeeded'
GROUP BY p.id, p.first_name, p.last_name, p.admission_date, p.monthly_rate;

-- Call analytics view
CREATE OR REPLACE VIEW call_analytics AS
SELECT
  DATE(started_at) as call_date,
  COUNT(*) as total_calls,
  AVG(duration_seconds) as avg_duration,
  SUM(CASE WHEN sentiment = 'urgent' THEN 1 ELSE 0 END) as urgent_calls,
  SUM(CASE WHEN requires_callback THEN 1 ELSE 0 END) as pending_callbacks,
  COUNT(DISTINCT family_member_id) as unique_callers,
  AVG(transcription_confidence) as avg_transcription_confidence
FROM calls
GROUP BY DATE(started_at);

-- Lead conversion funnel
CREATE OR REPLACE VIEW lead_funnel AS
SELECT
  lead_source,
  COUNT(*) as total_leads,
  SUM(CASE WHEN lead_status = 'contacted' THEN 1 ELSE 0 END) as contacted,
  SUM(CASE WHEN lead_status = 'qualified' THEN 1 ELSE 0 END) as qualified,
  SUM(CASE WHEN lead_status = 'tour_scheduled' THEN 1 ELSE 0 END) as tours_scheduled,
  SUM(CASE WHEN converted_to_patient_id IS NOT NULL THEN 1 ELSE 0 END) as converted,
  AVG(lead_score) as avg_lead_score
FROM leads
GROUP BY lead_source;

-- =====================================================
-- PERMISSIONS GRANT
-- =====================================================

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;