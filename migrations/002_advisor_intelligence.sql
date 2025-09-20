-- SENTINEL Advisor Intelligence Layer
-- Implements pgvector, RAG, and multi-agent orchestration

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Base with Vector Embeddings
CREATE TABLE knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
  metadata jsonb DEFAULT '{}',
  category text CHECK (category IN (
    'care_protocol',
    'faq',
    'policy',
    'medical_procedure',
    'facility_info',
    'insurance',
    'daily_routine',
    'emergency_protocol',
    'family_communication',
    'sales_info'
  )),
  tags text[],
  source text,
  confidence_score float DEFAULT 1.0,
  usage_count int DEFAULT 0,
  last_accessed timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Conversation Memory with Embeddings
CREATE TABLE conversation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  family_member_id uuid REFERENCES family_members(id),
  patient_id uuid REFERENCES patients(id),
  message text NOT NULL,
  response text NOT NULL,
  message_embedding vector(1536),
  intent text,
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'negative', 'urgent')),
  success_score float, -- Was the response helpful? (0-1)
  escalated boolean DEFAULT false,
  resolution text,
  topics text[],
  context_used jsonb, -- What knowledge was retrieved
  agent_type text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Agent Definitions
CREATE TABLE agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  personality jsonb NOT NULL, -- Tone, style, approach
  knowledge_domains text[], -- Which categories this agent knows
  capabilities text[],
  system_prompt text NOT NULL,
  temperature float DEFAULT 0.7,
  max_tokens int DEFAULT 500,
  priority int DEFAULT 1, -- For routing decisions
  is_active boolean DEFAULT true,
  performance_metrics jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Intent Classification Patterns
CREATE TABLE intent_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent text NOT NULL,
  pattern text NOT NULL, -- Regex or keyword pattern
  pattern_type text CHECK (pattern_type IN ('keyword', 'regex', 'embedding')),
  priority int DEFAULT 1,
  route_to_agent text REFERENCES agent_definitions(agent_type),
  requires_auth boolean DEFAULT false,
  is_emergency boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Family Communication Preferences
CREATE TABLE family_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid REFERENCES family_members(id) UNIQUE,
  preferred_communication_style text CHECK (preferred_communication_style IN (
    'detailed', 'brief', 'medical', 'simple'
  )),
  preferred_contact_time text,
  topics_of_interest text[],
  avoid_topics text[],
  language_preference text DEFAULT 'en',
  requires_translation boolean DEFAULT false,
  personalization_notes text,
  empathy_level text CHECK (empathy_level IN ('high', 'moderate', 'professional')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Response Templates for Consistency
CREATE TABLE response_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type text NOT NULL,
  situation text NOT NULL,
  template text NOT NULL,
  variables text[], -- Placeholders to fill
  agent_type text REFERENCES agent_definitions(agent_type),
  priority int DEFAULT 1,
  usage_count int DEFAULT 0,
  success_rate float,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Learning Feedback Loop
CREATE TABLE interaction_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_memory_id uuid REFERENCES conversation_memory(id),
  interaction_id uuid REFERENCES interactions(id),
  was_helpful boolean,
  resolution_type text CHECK (resolution_type IN (
    'resolved', 'escalated', 'transferred', 'scheduled_callback', 'provided_info'
  )),
  feedback_text text,
  sentiment_accuracy boolean,
  intent_accuracy boolean,
  response_quality_score float CHECK (response_quality_score >= 0 AND response_quality_score <= 1),
  learned_pattern text, -- What can we learn from this
  should_train_on boolean DEFAULT false, -- Use for model improvement
  reviewed_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Sales Lead Scoring
CREATE TABLE sales_lead_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_lead_id uuid REFERENCES sales_leads(id),
  urgency_score float DEFAULT 0.5,
  budget_indicator text,
  decision_timeline text,
  key_concerns text[],
  competing_facilities text[],
  preferred_features text[],
  objections text[],
  next_best_action text,
  conversion_probability float,
  ai_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Emergency Escalation Rules
CREATE TABLE escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_keywords text[],
  trigger_sentiment text[],
  trigger_intent text[],
  escalation_type text CHECK (escalation_type IN (
    'immediate_call', 'nurse_notification', 'admin_alert', 'schedule_callback'
  )),
  notification_targets text[], -- Phone numbers or user IDs
  priority int DEFAULT 1,
  auto_response text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for vector similarity search
CREATE INDEX idx_knowledge_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_conversation_embedding ON conversation_memory USING ivfflat (message_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_knowledge_category ON knowledge_base(category);
CREATE INDEX idx_conversation_session ON conversation_memory(session_id);
CREATE INDEX idx_conversation_intent ON conversation_memory(intent);
CREATE INDEX idx_feedback_quality ON interaction_feedback(response_quality_score) WHERE response_quality_score IS NOT NULL;

-- Insert default agent definitions
INSERT INTO agent_definitions (agent_type, name, description, personality, knowledge_domains, capabilities, system_prompt, temperature) VALUES
(
  'sales_advisor',
  'SENTINEL Sales Advisor',
  'Warm, consultative sales agent for new prospects',
  '{"tone": "warm", "style": "consultative", "approach": "empathetic", "language": "simple"}',
  ARRAY['sales_info', 'facility_info', 'insurance', 'faq'],
  ARRAY['qualify_leads', 'schedule_tours', 'explain_services', 'address_concerns'],
  'You are the SENTINEL Sales Advisor, representing Philadelphia''s premier luxury recovery care facility. You help families explore care options with warmth and empathy. Listen to their concerns, explain our services, and guide them toward the best solution. Never quote specific prices - offer consultations instead. Emphasize our 1:3 nurse ratio, private suites, and personalized care approach.',
  0.8
),
(
  'care_coordinator',
  'SENTINEL Care Coordinator',
  'Professional care updates for existing families',
  '{"tone": "professional", "style": "informative", "approach": "reassuring", "language": "clear"}',
  ARRAY['care_protocol', 'medical_procedure', 'daily_routine', 'family_communication'],
  ARRAY['provide_updates', 'explain_care', 'answer_questions', 'schedule_visits'],
  'You are the SENTINEL Care Coordinator, providing updates to families about their loved ones. Be specific with available information, reassuring about care quality, and professional in delivery. If you lack specific information, offer to have the care team follow up. Always maintain HIPAA compliance.',
  0.7
),
(
  'emergency_responder',
  'SENTINEL Emergency Responder',
  'Calm, decisive agent for urgent situations',
  '{"tone": "calm", "style": "direct", "approach": "decisive", "language": "clear"}',
  ARRAY['emergency_protocol', 'medical_procedure'],
  ARRAY['triage', 'escalate', 'provide_immediate_guidance', 'document_urgency'],
  'You are the SENTINEL Emergency Responder. Quickly assess urgency, provide clear immediate actions, and escalate appropriately. Stay calm and decisive. For true emergencies, immediately provide the emergency number and notify staff. Document all urgent situations clearly.',
  0.5
),
(
  'wellness_companion',
  'SENTINEL Wellness Companion',
  'Empathetic companion for daily wellness discussions',
  '{"tone": "gentle", "style": "conversational", "approach": "supportive", "language": "warm"}',
  ARRAY['daily_routine', 'family_communication', 'faq'],
  ARRAY['emotional_support', 'activity_updates', 'wellness_tips', 'family_connection'],
  'You are the SENTINEL Wellness Companion, providing emotional support and daily updates. Use a warm, gentle tone. Share positive moments, activities, and wellness updates. Help families feel connected to their loved ones. Be especially patient with elderly callers.',
  0.9
),
(
  'admin_assistant',
  'SENTINEL Administrative Assistant',
  'Efficient assistant for billing and scheduling',
  '{"tone": "professional", "style": "efficient", "approach": "helpful", "language": "precise"}',
  ARRAY['insurance', 'policy', 'facility_info'],
  ARRAY['billing_questions', 'insurance_verification', 'scheduling', 'documentation'],
  'You are the SENTINEL Administrative Assistant, handling billing, insurance, and scheduling matters. Be precise with information, helpful with complex insurance questions, and efficient in scheduling. Always maintain confidentiality and accuracy.',
  0.6
);

-- Insert common intent patterns
INSERT INTO intent_patterns (intent, pattern, pattern_type, route_to_agent, is_emergency) VALUES
('sales_inquiry', 'considering|thinking about|looking for|interested in|home care|assisted living', 'keyword', 'sales_advisor', false),
('care_update', 'how is|update on|status of|visited today|medication', 'keyword', 'care_coordinator', false),
('emergency', 'emergency|urgent|fell|pain|breathing|chest pain|unconscious', 'keyword', 'emergency_responder', true),
('wellness_check', 'lonely|sad|worried|miss|love|activity|mood', 'keyword', 'wellness_companion', false),
('admin_question', 'bill|insurance|payment|schedule|appointment|medicare', 'keyword', 'admin_assistant', false);

-- Insert escalation rules
INSERT INTO escalation_rules (trigger_keywords, escalation_type, notification_targets, priority, auto_response) VALUES
(ARRAY['emergency', 'urgent', 'fell', 'not breathing'], 'immediate_call', ARRAY['2157740743'], 1,
 'I understand this is urgent. A nurse is being contacted immediately. If this is a medical emergency, please also call 911.'),
(ARRAY['very worried', 'concerned', 'not right'], 'nurse_notification', ARRAY['nurse_station'], 2,
 'I understand your concern. I''m notifying the nursing team to check on your loved one right away.'),
(ARRAY['complaint', 'unhappy', 'problem', 'issue'], 'admin_alert', ARRAY['admin_team'], 3,
 'I apologize for any concerns. I''m connecting you with our administrative team to address this immediately.');

-- Function to find similar knowledge
CREATE OR REPLACE FUNCTION find_similar_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.category,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    kb.is_active = true
    AND (categories IS NULL OR kb.category = ANY(categories))
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get conversation context
CREATE OR REPLACE FUNCTION get_conversation_context(
  p_session_id text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  message text,
  response text,
  intent text,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.message,
    cm.response,
    cm.intent,
    cm.created_at
  FROM conversation_memory cm
  WHERE cm.session_id = p_session_id
  ORDER BY cm.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Function to calculate agent performance
CREATE OR REPLACE FUNCTION calculate_agent_performance(p_agent_type text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_metrics jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_interactions', COUNT(*),
    'avg_success_score', AVG(success_score),
    'escalation_rate', AVG(CASE WHEN escalated THEN 1 ELSE 0 END),
    'positive_sentiment_rate', AVG(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END),
    'avg_response_quality', (
      SELECT AVG(response_quality_score)
      FROM interaction_feedback if
      JOIN conversation_memory cm ON if.conversation_memory_id = cm.id
      WHERE cm.agent_type = p_agent_type
    )
  ) INTO v_metrics
  FROM conversation_memory
  WHERE agent_type = p_agent_type
  AND created_at > now() - interval '30 days';

  RETURN v_metrics;
END;
$$;

-- Trigger to update agent performance metrics
CREATE OR REPLACE FUNCTION update_agent_performance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.agent_type IS NOT NULL THEN
    UPDATE agent_definitions
    SET
      performance_metrics = calculate_agent_performance(NEW.agent_type),
      updated_at = now()
    WHERE agent_type = NEW.agent_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_agent_performance
AFTER INSERT ON conversation_memory
FOR EACH ROW
EXECUTE FUNCTION update_agent_performance();

-- Row Level Security
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_feedback ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;