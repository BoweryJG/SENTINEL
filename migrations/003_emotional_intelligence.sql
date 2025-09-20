-- SENTINEL Emotional Intelligence & Compassion Layer
-- The Digital Companion of Compassion

-- Emotional State Tracking
CREATE TABLE IF NOT EXISTS emotional_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid REFERENCES family_members(id),
  session_id text,

  -- Emotional Metrics
  grief_stage text CHECK (grief_stage IN (
    'denial', 'anger', 'bargaining', 'depression', 'acceptance', 'mixed'
  )),
  stress_level float CHECK (stress_level >= 0 AND stress_level <= 1),
  burnout_indicators jsonb DEFAULT '{}',
  emotional_valence float, -- -1 (negative) to 1 (positive)
  arousal_level float, -- 0 (calm) to 1 (agitated)

  -- Behavioral Signals
  response_time_ms int,
  message_length_trend text, -- 'increasing', 'decreasing', 'stable'
  interaction_frequency float, -- messages per day
  silence_duration_hours int,

  -- Voice Analysis (if available)
  voice_tremor_score float,
  speech_pace float,
  pause_frequency float,

  detected_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

-- Family Dynamics Mapping
CREATE TABLE IF NOT EXISTS family_dynamics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),

  -- Family Structure
  primary_decision_maker uuid REFERENCES family_members(id),
  emotional_support_seeker uuid REFERENCES family_members(id),
  information_gatherer uuid REFERENCES family_members(id),
  skeptic uuid REFERENCES family_members(id),

  -- Relationship Health
  cohesion_score float, -- 0 (fragmented) to 1 (unified)
  conflict_indicators jsonb DEFAULT '[]',
  communication_patterns jsonb DEFAULT '{}',
  decision_alignment float,

  -- Cultural Context
  cultural_background text,
  spiritual_preferences text[],
  language_preferences jsonb DEFAULT '{}',
  decision_making_style text CHECK (decision_making_style IN (
    'collective', 'hierarchical', 'democratic', 'delegated'
  )),

  updated_at timestamptz DEFAULT now()
);

-- Predictive Wellness Patterns
CREATE TABLE IF NOT EXISTS wellness_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),

  -- Recovery Milestones
  condition_type text,
  current_stage text,
  predicted_next_milestone text,
  milestone_date date,
  confidence_score float,

  -- Pattern Recognition
  similar_cases_analyzed int,
  typical_recovery_days int,
  risk_factors jsonb DEFAULT '[]',
  positive_indicators jsonb DEFAULT '[]',

  -- Emotional Journey Map
  expected_emotional_valleys jsonb DEFAULT '[]', -- [{day: 10, reason: "reality setting in"}]
  celebration_moments jsonb DEFAULT '[]',
  family_adjustment_phases jsonb DEFAULT '[]',

  created_at timestamptz DEFAULT now()
);

-- Memory Preservation Project
CREATE TABLE IF NOT EXISTS memory_preservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),
  family_member_id uuid REFERENCES family_members(id),

  -- Memory Details
  memory_type text CHECK (memory_type IN (
    'story', 'milestone', 'daily_moment', 'wisdom', 'tradition', 'joke', 'song'
  )),
  title text,
  content text NOT NULL,
  emotion_tags text[],

  -- Context
  shared_during text, -- 'music_therapy', 'meal_time', 'visit', etc
  lucidity_level text CHECK (lucidity_level IN ('clear', 'partial', 'confused')),
  family_members_mentioned text[],

  -- Media
  audio_url text,
  photo_urls text[],

  -- Preservation
  is_precious boolean DEFAULT false,
  share_with_family boolean DEFAULT true,
  legacy_book_inclusion boolean DEFAULT false,

  captured_at timestamptz DEFAULT now()
);

-- Hope Architecture
CREATE TABLE IF NOT EXISTS hope_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),

  -- Progress Tracking
  indicator_type text CHECK (indicator_type IN (
    'mobility', 'cognition', 'emotional', 'social', 'appetite', 'communication'
  )),
  description text,
  improvement_percentage float,

  -- Victory Moments
  is_breakthrough boolean DEFAULT false,
  celebrated boolean DEFAULT false,
  family_notified boolean DEFAULT false,

  -- Hope Index Calculation
  hope_score float, -- Calculated based on recent victories
  trajectory text CHECK (trajectory IN ('improving', 'stable', 'variable', 'declining')),

  recorded_at timestamptz DEFAULT now()
);

-- Caregiver Burnout Detection
CREATE TABLE IF NOT EXISTS caregiver_wellness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid REFERENCES family_members(id) UNIQUE,

  -- Burnout Metrics
  exhaustion_score float,
  detachment_score float,
  self_care_frequency float,
  support_network_strength float,

  -- Warning Signs
  missed_visits_count int DEFAULT 0,
  shortened_conversations boolean DEFAULT false,
  emotional_numbing_detected boolean DEFAULT false,
  help_resistance_level float,

  -- Support Activated
  support_group_offered boolean DEFAULT false,
  respite_care_suggested boolean DEFAULT false,
  counseling_recommended boolean DEFAULT false,
  guardian_angel_mode_active boolean DEFAULT false,

  last_assessment timestamptz DEFAULT now()
);

-- Cultural & Spiritual Intelligence
CREATE TABLE IF NOT EXISTS cultural_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid, -- Can be linked to patient or family

  -- Cultural Context
  primary_culture text,
  secondary_cultures text[],

  -- Communication Styles
  formality_level text CHECK (formality_level IN ('formal', 'moderate', 'casual')),
  directness_preference text CHECK (directness_preference IN ('direct', 'indirect', 'contextual')),
  hierarchy_importance text CHECK (hierarchy_importance IN ('high', 'medium', 'low')),

  -- Decision Making
  family_consultation_required boolean DEFAULT false,
  elder_deference boolean DEFAULT false,
  group_consensus_needed boolean DEFAULT false,

  -- Spiritual Care
  faith_tradition text,
  prayer_times jsonb DEFAULT '[]',
  dietary_restrictions text[],
  sacred_rituals text[],
  chaplain_visits_requested boolean DEFAULT false,

  -- Death & Dying Perspectives
  end_of_life_traditions text[],
  afterlife_beliefs text,
  mourning_customs text[],

  created_at timestamptz DEFAULT now()
);

-- Micro-Moment Detection
CREATE TABLE IF NOT EXISTS critical_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),
  family_member_id uuid REFERENCES family_members(id),

  -- Moment Identification
  moment_type text CHECK (moment_type IN (
    'first_video_call', 'pre_procedure', 'sunday_loneliness', 'anniversary',
    'birthday', 'holiday', 'milestone', 'setback', 'transition', 'decision_point'
  )),
  scheduled_date timestamptz,

  -- Proactive Support
  outreach_scheduled boolean DEFAULT false,
  message_template text,
  personalized_content text,

  -- Response
  family_responded boolean,
  emotional_support_needed boolean,
  escalation_triggered boolean,

  created_at timestamptz DEFAULT now()
);

-- Conversation Wisdom Library
CREATE TABLE IF NOT EXISTS collective_wisdom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Wisdom Category
  category text CHECK (category IN (
    'coping_strategies', 'family_communication', 'decision_making',
    'emotional_support', 'practical_tips', 'recovery_insights',
    'end_of_life', 'caregiver_wellness'
  )),

  -- Wisdom Content
  situation text NOT NULL,
  insight text NOT NULL,
  success_rate float,
  applicable_conditions text[],

  -- Usage Tracking
  times_shared int DEFAULT 0,
  helpfulness_score float,

  -- Privacy
  is_anonymized boolean DEFAULT true,
  can_share boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

-- Story-Based Updates
CREATE TABLE IF NOT EXISTS narrative_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),

  -- Narrative Elements
  update_type text CHECK (update_type IN (
    'daily_story', 'weekly_summary', 'milestone_celebration', 'memory_moment'
  )),

  -- Story Components
  setting text, -- "In the sunny therapy room..."
  characters text[], -- ["Your mother", "Therapy dog Buddy", "Nurse Sarah"]
  emotional_tone text,
  key_moment text,
  connection_to_past text, -- Links to family history

  -- Personalization
  includes_family_references boolean DEFAULT true,
  uses_patient_preferred_name boolean DEFAULT true,
  incorporates_memories boolean DEFAULT false,

  -- Delivery
  narrative_text text NOT NULL,
  delivered_to uuid[] REFERENCES family_members(id),

  created_at timestamptz DEFAULT now()
);

-- Silence & Absence Detection
CREATE TABLE IF NOT EXISTS communication_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid REFERENCES family_members(id),

  -- Gap Analysis
  last_interaction timestamptz,
  typical_frequency_hours int,
  current_gap_hours int,

  -- Pattern Changes
  previous_avg_questions int,
  current_question_count int,
  topic_avoidance text[],
  emotional_withdrawal_score float,

  -- Intervention
  gentle_check_in_sent boolean DEFAULT false,
  support_offered text,
  response_received boolean,

  detected_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_emotional_states_family ON emotional_states(family_member_id);
CREATE INDEX IF NOT EXISTS idx_emotional_states_session ON emotional_states(session_id);
CREATE INDEX IF NOT EXISTS idx_hope_patient ON hope_indicators(patient_id);
CREATE INDEX IF NOT EXISTS idx_memory_patient ON memory_preservation(patient_id);
CREATE INDEX IF NOT EXISTS idx_critical_moments_date ON critical_moments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_wellness_predictions_patient ON wellness_predictions(patient_id);

-- Function to calculate Hope Index
CREATE OR REPLACE FUNCTION calculate_hope_index(p_patient_id uuid)
RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  v_hope_score float;
  v_recent_victories int;
  v_improvement_trend float;
BEGIN
  -- Count recent victories
  SELECT COUNT(*) INTO v_recent_victories
  FROM hope_indicators
  WHERE patient_id = p_patient_id
  AND recorded_at > now() - interval '7 days'
  AND improvement_percentage > 0;

  -- Calculate improvement trend
  SELECT AVG(improvement_percentage) INTO v_improvement_trend
  FROM hope_indicators
  WHERE patient_id = p_patient_id
  AND recorded_at > now() - interval '30 days';

  -- Calculate hope score (0-1 scale)
  v_hope_score := LEAST(1.0, (v_recent_victories * 0.1 + COALESCE(v_improvement_trend, 0) / 100));

  RETURN v_hope_score;
END;
$$;

-- Function to detect caregiver burnout
CREATE OR REPLACE FUNCTION assess_caregiver_burnout(p_family_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_burnout_level text;
  v_recommendations jsonb;
  v_exhaustion float;
  v_detachment float;
BEGIN
  -- Get current metrics
  SELECT exhaustion_score, detachment_score
  INTO v_exhaustion, v_detachment
  FROM caregiver_wellness
  WHERE family_member_id = p_family_member_id;

  -- Determine burnout level
  IF v_exhaustion > 0.8 OR v_detachment > 0.8 THEN
    v_burnout_level := 'critical';
    v_recommendations := '["immediate_respite", "counseling", "support_group", "self_care_plan"]'::jsonb;
  ELSIF v_exhaustion > 0.6 OR v_detachment > 0.6 THEN
    v_burnout_level := 'high';
    v_recommendations := '["support_group", "respite_planning", "self_care_reminders"]'::jsonb;
  ELSIF v_exhaustion > 0.4 OR v_detachment > 0.4 THEN
    v_burnout_level := 'moderate';
    v_recommendations := '["preventive_support", "resource_sharing"]'::jsonb;
  ELSE
    v_burnout_level := 'low';
    v_recommendations := '["maintain_wellness"]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'burnout_level', v_burnout_level,
    'exhaustion_score', v_exhaustion,
    'detachment_score', v_detachment,
    'recommendations', v_recommendations
  );
END;
$$;

-- Function to generate narrative update
CREATE OR REPLACE FUNCTION generate_narrative_template(
  p_patient_id uuid,
  p_update_type text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_patient record;
  v_recent_memory record;
  v_narrative text;
BEGIN
  -- Get patient info
  SELECT * INTO v_patient
  FROM patients
  WHERE id = p_patient_id;

  -- Get recent memory if available
  SELECT * INTO v_recent_memory
  FROM memory_preservation
  WHERE patient_id = p_patient_id
  ORDER BY captured_at DESC
  LIMIT 1;

  -- Generate narrative based on type
  CASE p_update_type
    WHEN 'daily_story' THEN
      v_narrative := format(
        'This morning, %s greeted the day with %s. %s',
        v_patient.first_name,
        CASE WHEN random() > 0.5 THEN 'a smile' ELSE 'quiet determination' END,
        COALESCE(v_recent_memory.content, 'The care team notes continued progress.')
      );
    WHEN 'memory_moment' THEN
      v_narrative := format(
        'A beautiful moment today: %s shared a memory about %s. These glimpses of the past remind us of the rich life lived.',
        v_patient.first_name,
        COALESCE(v_recent_memory.title, 'family times')
      );
    ELSE
      v_narrative := 'Your loved one is resting comfortably.';
  END CASE;

  RETURN v_narrative;
END;
$$;

-- Trigger to detect critical moments
CREATE OR REPLACE FUNCTION detect_critical_moments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check for first video call after admission
  IF NEW.interaction_type = 'video_call' THEN
    INSERT INTO critical_moments (
      patient_id,
      family_member_id,
      moment_type,
      scheduled_date
    )
    SELECT
      NEW.patient_id,
      NEW.family_member_id,
      'first_video_call',
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM critical_moments
      WHERE patient_id = NEW.patient_id
      AND moment_type = 'first_video_call'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_critical_moments
AFTER INSERT ON interactions
FOR EACH ROW
EXECUTE FUNCTION detect_critical_moments();

-- Insert initial collective wisdom
INSERT INTO collective_wisdom (category, situation, insight, success_rate, applicable_conditions) VALUES
('coping_strategies', 'First week anxiety', 'Families who establish a regular communication schedule (e.g., Tuesday/Thursday video calls) report 40% less anxiety', 0.87, ARRAY['post_admission']),
('emotional_support', 'Feeling helpless from distance', 'Sending voice messages with familiar stories helps patients feel connected even when confused', 0.91, ARRAY['dementia', 'distance_family']),
('recovery_insights', 'Hip surgery recovery', 'Week 3 typically shows significant mobility improvement. Celebrating small victories (sitting up, first steps) boosts morale', 0.83, ARRAY['orthopedic']),
('caregiver_wellness', 'Guilt about self-care', 'Taking breaks isn''t abandonment - it''s ensuring you can provide sustained support. Families who practice self-care visit 50% more consistently', 0.94, ARRAY['all']),
('end_of_life', 'Approaching difficult conversations', 'Starting with "What would mom want us to know?" opens dialogue more gently than medical decisions', 0.88, ARRAY['palliative']);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;