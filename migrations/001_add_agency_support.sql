-- SENTINEL Agency Support Migration
-- Adds agency_id to all relevant tables for multi-tenant isolation

-- Add agency_id to existing tables if they exist
DO $$
BEGIN
    -- Add agency_id to consultation_requests if table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'consultation_requests') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns
                      WHERE table_name = 'consultation_requests' AND column_name = 'agency_id') THEN
            ALTER TABLE consultation_requests ADD COLUMN agency_id UUID;
            CREATE INDEX idx_consultation_requests_agency ON consultation_requests(agency_id);
        END IF;
    ELSE
        -- Create consultation_requests table
        CREATE TABLE consultation_requests (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            agency_id UUID,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            message TEXT,
            preferred_time TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            INDEX idx_consultation_requests_agency (agency_id)
        );
    END IF;
END $$;

-- Create patients table with agency support
CREATE TABLE IF NOT EXISTS patients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    phone TEXT,
    email TEXT,
    emergency_contact JSONB,
    medical_history JSONB,
    surgery_type TEXT,
    surgery_date DATE,
    surgeon_name TEXT,
    insurance_info JSONB,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_agency ON patients(agency_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(agency_id, status);

-- Create care_plans table
CREATE TABLE IF NOT EXISTS care_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    plan_type TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'pending',
    start_date DATE,
    end_date DATE,
    objectives JSONB,
    interventions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_plans_patient ON care_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_agency ON care_plans(agency_id);

-- Create care_notes table
CREATE TABLE IF NOT EXISTS care_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    note_type TEXT DEFAULT 'general',
    content TEXT NOT NULL,
    author_name TEXT,
    author_id UUID,
    attachments JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_notes_patient ON care_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_agency ON care_notes(agency_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_created ON care_notes(created_at DESC);

-- Create patient_portal_access table
CREATE TABLE IF NOT EXISTS patient_portal_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    access_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_accessed TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_access_token ON patient_portal_access(access_token);
CREATE INDEX IF NOT EXISTS idx_portal_access_patient ON patient_portal_access(patient_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_agency ON patient_portal_access(agency_id);

-- Create agency_staff table for staff management
CREATE TABLE IF NOT EXISTS agency_staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL,
    user_id UUID,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT DEFAULT 'caregiver',
    permissions JSONB,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_staff_agency ON agency_staff(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_staff_user ON agency_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_staff_email ON agency_staff(email);

-- Create patient_vitals table for tracking vital signs
CREATE TABLE IF NOT EXISTS patient_vitals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    blood_pressure_systolic INTEGER,
    blood_pressure_diastolic INTEGER,
    heart_rate INTEGER,
    temperature DECIMAL(4,1),
    oxygen_saturation INTEGER,
    pain_level INTEGER CHECK (pain_level >= 0 AND pain_level <= 10),
    notes TEXT,
    recorded_by UUID,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient ON patient_vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_agency ON patient_vitals(agency_id);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_recorded ON patient_vitals(recorded_at DESC);

-- Create patient_medications table
CREATE TABLE IF NOT EXISTS patient_medications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    medication_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    route TEXT,
    prescriber TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_medications_patient ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_agency ON patient_medications(agency_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_status ON patient_medications(status);

-- Add RLS (Row Level Security) policies
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for agency isolation
-- These ensure users can only see data from their own agency

-- Patients policies
CREATE POLICY patients_agency_isolation ON patients
    FOR ALL USING (
        agency_id = current_setting('app.agency_id', true)::UUID
        OR current_setting('app.is_master_admin', true)::BOOLEAN = true
    );

-- Care plans policies
CREATE POLICY care_plans_agency_isolation ON care_plans
    FOR ALL USING (
        agency_id = current_setting('app.agency_id', true)::UUID
        OR current_setting('app.is_master_admin', true)::BOOLEAN = true
    );

-- Care notes policies
CREATE POLICY care_notes_agency_isolation ON care_notes
    FOR ALL USING (
        agency_id = current_setting('app.agency_id', true)::UUID
        OR current_setting('app.is_master_admin', true)::BOOLEAN = true
    );

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;