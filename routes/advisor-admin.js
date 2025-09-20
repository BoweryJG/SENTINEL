const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  // For now, simple email check - expand with proper auth later
  const userEmail = req.headers['x-user-email'];
  if (!adminEmails.includes(userEmail)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  next();
};

// Add new patient
router.post('/patients', requireAdmin, async (req, res) => {
  try {
    const patientData = req.body;

    const { data, error } = await supabase
      .from('patients')
      .insert(patientData)
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from('audit_logs').insert({
      user_type: 'staff',
      user_id: req.headers['x-user-id'],
      action: 'create_patient',
      resource_type: 'patient',
      resource_id: data.id,
      metadata: { patient_name: `${data.first_name} ${data.last_name}` }
    });

    res.json(data);
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// Add family member
router.post('/family-members', requireAdmin, async (req, res) => {
  try {
    const familyData = req.body;

    const { data, error } = await supabase
      .from('family_members')
      .insert(familyData)
      .select()
      .single();

    if (error) throw error;

    // Send welcome email
    if (data.email) {
      await transporter.sendMail({
        from: `"SENTINEL Advisor" <${process.env.FROM_EMAIL}>`,
        to: data.email,
        subject: 'Welcome to SENTINEL Recovery Care',
        html: `
          <h2>Welcome to SENTINEL Recovery Care</h2>
          <p>Dear ${data.first_name},</p>
          <p>You've been registered as an authorized family contact for ${data.patient_id}.</p>
          <p>You can now:</p>
          <ul>
            <li>Call ${process.env.TWILIO_PHONE_NUMBER} anytime for updates</li>
            <li>Text the same number for quick status checks</li>
            <li>Receive daily email summaries (if enabled)</li>
          </ul>
          <p>Our SENTINEL Advisor is available 24/7 to provide you with real-time updates about your loved one.</p>
          <p>Best regards,<br>SENTINEL Recovery Care Team</p>
        `
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating family member:', error);
    res.status(500).json({ error: 'Failed to create family member' });
  }
});

// Record care event
router.post('/care-events', requireAdmin, async (req, res) => {
  try {
    const eventData = req.body;

    const { data, error } = await supabase
      .from('care_events')
      .insert(eventData)
      .select()
      .single();

    if (error) throw error;

    // Check if alert needed
    if (eventData.severity === 'urgent' || eventData.severity === 'emergency') {
      await createAlert(eventData.patient_id, eventData);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating care event:', error);
    res.status(500).json({ error: 'Failed to create care event' });
  }
});

// Create alert and notify family
async function createAlert(patientId, eventData) {
  try {
    // Create alert
    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        patient_id: patientId,
        alert_type: eventData.event_type,
        severity: eventData.severity,
        message: `${eventData.event_type}: ${eventData.notes || 'Immediate attention required'}`,
        data: eventData
      })
      .select()
      .single();

    // Get family members to notify
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('*')
      .eq('patient_id', patientId)
      .eq('is_primary_contact', true);

    // Send notifications
    for (const member of familyMembers) {
      if (member.notification_preferences?.alerts) {
        // Send SMS via Twilio
        if (member.preferred_contact_method === 'sms') {
          await sendSMS(member.phone_primary,
            `SENTINEL Alert: ${alert.message}. Call ${process.env.TWILIO_PHONE_NUMBER} for details.`
          );
        }

        // Send email
        if (member.email && member.preferred_contact_method === 'email') {
          await transporter.sendMail({
            from: `"SENTINEL Advisor" <${process.env.FROM_EMAIL}>`,
            to: member.email,
            subject: `Urgent: ${alert.alert_type}`,
            html: `
              <h2>SENTINEL Recovery Care Alert</h2>
              <p><strong>Severity:</strong> ${alert.severity}</p>
              <p><strong>Message:</strong> ${alert.message}</p>
              <p>Please call ${process.env.TWILIO_PHONE_NUMBER} for immediate information.</p>
            `
          });
        }
      }
    }

    // Update alert with notifications sent
    await supabase
      .from('alerts')
      .update({
        notifications_sent: familyMembers.map(m => ({
          member_id: m.id,
          method: m.preferred_contact_method,
          sent_at: new Date().toISOString()
        }))
      })
      .eq('id', alert.id);

  } catch (error) {
    console.error('Error creating alert:', error);
  }
}

// Send SMS helper (using Twilio)
async function sendSMS(toNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require('twilio')(accountSid, authToken);

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toNumber
    });
  } catch (error) {
    console.error('SMS send error:', error);
  }
}

// Daily summary job
router.post('/send-daily-summaries', requireAdmin, async (req, res) => {
  try {
    // Get all patients with family members who want daily summaries
    const { data: families } = await supabase
      .from('family_members')
      .select('*, patients(*)')
      .eq('notification_preferences->daily_summary', true);

    for (const family of families) {
      // Get today's events for patient
      const today = new Date().toISOString().split('T')[0];
      const { data: events } = await supabase
        .from('care_events')
        .select('*')
        .eq('patient_id', family.patient_id)
        .gte('created_at', today)
        .order('created_at');

      if (events.length > 0 && family.email) {
        const summary = generateDailySummary(family.patients, events);

        await transporter.sendMail({
          from: `"SENTINEL Advisor" <${process.env.FROM_EMAIL}>`,
          to: family.email,
          subject: `Daily Update: ${family.patients.first_name} ${family.patients.last_name}`,
          html: summary
        });
      }
    }

    res.json({ message: 'Daily summaries sent' });
  } catch (error) {
    console.error('Error sending summaries:', error);
    res.status(500).json({ error: 'Failed to send summaries' });
  }
});

function generateDailySummary(patient, events) {
  const meals = events.filter(e => e.event_type === 'meal');
  const medications = events.filter(e => e.event_type === 'medication');
  const activities = events.filter(e => e.event_type === 'activity');
  const vitals = events.filter(e => e.event_type === 'vital_signs');

  return `
    <h2>Daily Summary for ${patient.first_name} ${patient.last_name}</h2>
    <p>Date: ${new Date().toLocaleDateString()}</p>

    <h3>Meals (${meals.length})</h3>
    <ul>
      ${meals.map(m => `<li>${m.event_category}: ${m.notes || 'Completed'}</li>`).join('')}
    </ul>

    <h3>Medications (${medications.length})</h3>
    <ul>
      ${medications.map(m => `<li>${m.event_data?.medication || 'Administered'} at ${new Date(m.created_at).toLocaleTimeString()}</li>`).join('')}
    </ul>

    <h3>Activities (${activities.length})</h3>
    <ul>
      ${activities.map(a => `<li>${a.event_category || 'Activity'}: ${a.notes || 'Participated'}</li>`).join('')}
    </ul>

    ${vitals.length > 0 ? `
      <h3>Vital Signs</h3>
      <ul>
        ${vitals.map(v => `<li>${JSON.stringify(v.event_data)}</li>`).join('')}
      </ul>
    ` : ''}

    <p>For immediate updates, call ${process.env.TWILIO_PHONE_NUMBER}</p>
    <p>Best regards,<br>SENTINEL Recovery Care</p>
  `;
}

// Dashboard stats
router.get('/dashboard-stats', requireAdmin, async (req, res) => {
  try {
    const { data: patientCount } = await supabase
      .from('patients')
      .select('id', { count: 'exact' })
      .eq('status', 'active');

    const { data: alertCount } = await supabase
      .from('alerts')
      .select('id', { count: 'exact' })
      .eq('acknowledged', false);

    const { data: todayEvents } = await supabase
      .from('care_events')
      .select('id', { count: 'exact' })
      .gte('created_at', new Date().toISOString().split('T')[0]);

    const { data: todayInteractions } = await supabase
      .from('interactions')
      .select('id', { count: 'exact' })
      .gte('created_at', new Date().toISOString().split('T')[0]);

    res.json({
      activePatients: patientCount?.length || 0,
      pendingAlerts: alertCount?.length || 0,
      todayEvents: todayEvents?.length || 0,
      todayInteractions: todayInteractions?.length || 0
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;