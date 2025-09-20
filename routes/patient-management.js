/**
 * Patient Management Routes for SENTINEL
 * Handles patient creation, updates, and queries with agency isolation
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://alkzliirqdofpygknsij.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Middleware to validate agency access
const validateAgencyAccess = (req, res, next) => {
  const agency_id = req.headers['x-agency-id'] || req.body.agency_id || req.query.agency_id;

  if (!agency_id) {
    return res.status(400).json({ error: 'Agency ID is required' });
  }

  req.agency_id = agency_id;
  next();
};

/**
 * Create a new patient record
 */
router.post('/create', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      first_name,
      last_name,
      date_of_birth,
      phone,
      email,
      emergency_contact,
      medical_history,
      surgery_type,
      surgery_date,
      surgeon_name,
      insurance_info
    } = req.body;

    // Create patient record
    const { data: patient, error } = await supabase
      .from('patients')
      .insert({
        agency_id: req.agency_id,
        first_name,
        last_name,
        date_of_birth,
        phone,
        email,
        emergency_contact,
        medical_history,
        surgery_type,
        surgery_date,
        surgeon_name,
        insurance_info,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Create initial care plan
    await supabase
      .from('care_plans')
      .insert({
        patient_id: patient.id,
        agency_id: req.agency_id,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      patient
    });
  } catch (err) {
    console.error('Patient creation error:', err);
    res.status(500).json({ error: 'Failed to create patient record' });
  }
});

/**
 * Get all patients for an agency
 */
router.get('/list', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { page = 1, limit = 20, status = 'active' } = req.query;
    const offset = (page - 1) * limit;

    const { data: patients, error, count } = await supabase
      .from('patients')
      .select('*', { count: 'exact' })
      .eq('agency_id', req.agency_id)
      .eq('status', status)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      patients,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Patient list error:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

/**
 * Get patient details
 */
router.get('/:patient_id', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { patient_id } = req.params;

    const { data: patient, error } = await supabase
      .from('patients')
      .select(`
        *,
        care_plans (*),
        care_notes (*)
      `)
      .eq('id', patient_id)
      .eq('agency_id', req.agency_id)
      .single();

    if (error) {
      throw error;
    }

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      success: true,
      patient
    });
  } catch (err) {
    console.error('Patient detail error:', err);
    res.status(500).json({ error: 'Failed to fetch patient details' });
  }
});

/**
 * Update patient record
 */
router.put('/:patient_id', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { patient_id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.agency_id;
    delete updates.created_at;

    updates.updated_at = new Date().toISOString();

    const { data: patient, error } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', patient_id)
      .eq('agency_id', req.agency_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      success: true,
      patient
    });
  } catch (err) {
    console.error('Patient update error:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * Add care note for patient
 */
router.post('/:patient_id/notes', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { patient_id } = req.params;
    const { note_type, content, author_name } = req.body;

    // Verify patient belongs to agency
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patient_id)
      .eq('agency_id', req.agency_id)
      .single();

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: note, error } = await supabase
      .from('care_notes')
      .insert({
        patient_id,
        agency_id: req.agency_id,
        note_type: note_type || 'general',
        content,
        author_name,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      note
    });
  } catch (err) {
    console.error('Care note error:', err);
    res.status(500).json({ error: 'Failed to add care note' });
  }
});

/**
 * Generate patient portal access
 */
router.post('/:patient_id/portal-access', validateAgencyAccess, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { patient_id } = req.params;

    // Verify patient belongs to agency
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patient_id)
      .eq('agency_id', req.agency_id)
      .single();

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Generate unique access token
    const crypto = require('crypto');
    const access_token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store portal access
    const { error } = await supabase
      .from('patient_portal_access')
      .upsert({
        patient_id,
        agency_id: req.agency_id,
        access_token,
        expires_at: expires_at.toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    // Generate portal URL
    const portal_url = `https://portal.sentinelrecovery.com/patient/${patient_id}?token=${access_token}`;

    res.json({
      success: true,
      portal_url,
      expires_at: expires_at.toISOString(),
      patient_name: `${patient.first_name} ${patient.last_name}`
    });
  } catch (err) {
    console.error('Portal access error:', err);
    res.status(500).json({ error: 'Failed to generate portal access' });
  }
});

module.exports = router;