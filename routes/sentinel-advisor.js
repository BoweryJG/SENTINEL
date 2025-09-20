const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize from environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Twilio webhook security
const twilioWebhook = twilio.webhook({
  validate: process.env.NODE_ENV === 'production'
});

// SENTINEL Advisor Voice Webhook - Main entry point
router.post('/voice', twilioWebhook, async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;

  try {
    // Create or update voice session
    const { data: session } = await supabase
      .from('voice_sessions')
      .insert({
        twilio_call_sid: callSid,
        phone_number: fromNumber,
        call_status: 'initiated'
      })
      .select()
      .single();

    // Look up family member by phone
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('*, patients(*)')
      .eq('phone_primary', fromNumber)
      .single();

    if (familyMember) {
      // Known family member
      const patientName = `${familyMember.patients.first_name} ${familyMember.patients.last_name}`;

      twiml.say({
        voice: 'Polly.Joanna'
      }, `Hello ${familyMember.first_name}. This is the SENTINEL Advisor. I have the latest update on ${patientName}. How can I help you today?`);

      // Update session with identified caller
      await supabase
        .from('voice_sessions')
        .update({
          family_member_id: familyMember.id,
          patient_id: familyMember.patient_id
        })
        .eq('id', session.id);

    } else {
      // Unknown caller
      twiml.say({
        voice: 'Polly.Joanna'
      }, 'Welcome to SENTINEL Recovery Care. This is your 24-hour Advisor. May I have your name and the patient you're calling about?');
    }

    // Gather speech input
    twiml.gather({
      input: 'speech',
      action: `/api/sentinel-advisor/process-speech/${session.id}`,
      language: 'en-US',
      speechTimeout: 'auto',
      speechModel: 'enhanced'
    });

  } catch (error) {
    console.error('Voice webhook error:', error);
    twiml.say('I apologize, but I'm having trouble accessing the system. Please try again or call our main line.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech input with Anthropic
router.post('/process-speech/:sessionId', twilioWebhook, async (req, res) => {
  const sessionId = req.params.sessionId;
  const speechResult = req.body.SpeechResult;
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Get session context
    const { data: session } = await supabase
      .from('voice_sessions')
      .select('*, family_members(*), patients(*)')
      .eq('id', sessionId)
      .single();

    if (!session.patient_id) {
      // Still identifying the caller
      twiml.say('Thank you. Let me look that up for you.');
      // TODO: Implement caller identification logic
    } else {
      // Get recent care events for context
      const { data: recentEvents } = await supabase
        .from('care_events')
        .select('*')
        .eq('patient_id', session.patient_id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Get latest staff notes
      const { data: staffNotes } = await supabase
        .from('staff_notes')
        .select('*')
        .eq('patient_id', session.patient_id)
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(5);

      // Build context for Anthropic
      const patientContext = {
        patient: session.patients,
        recentEvents,
        staffNotes,
        lastInteraction: session.ai_context || {}
      };

      // Process with Anthropic
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.7,
        system: `You are the SENTINEL Advisor, a professional and compassionate care coordinator for a luxury private recovery care facility.
        You're speaking with ${session.family_members.first_name}, who is the ${session.family_members.relationship} of ${session.patients.first_name} ${session.patients.last_name}.

        Patient context: ${JSON.stringify(patientContext)}

        Provide warm, professional, and accurate updates. Be empathetic but not overly emotional.
        Focus on facts but deliver them with appropriate compassion.
        Never make up information - if you don't know something, offer to have a care manager follow up.
        Keep responses concise for phone conversation.`,
        messages: [{
          role: 'user',
          content: speechResult
        }]
      });

      const advisorResponse = response.content[0].text;

      // Say the response
      twiml.say({
        voice: 'Polly.Joanna'
      }, advisorResponse);

      // Log the interaction
      await supabase
        .from('interactions')
        .insert({
          family_member_id: session.family_member_id,
          patient_id: session.patient_id,
          interaction_type: 'call',
          direction: 'inbound',
          transcript: speechResult,
          summary: advisorResponse,
          topics: extractTopics(speechResult)
        });

      // Update session context
      await supabase
        .from('voice_sessions')
        .update({
          transcript: session.transcript ?
            `${session.transcript}\n\nUser: ${speechResult}\nAdvisor: ${advisorResponse}` :
            `User: ${speechResult}\nAdvisor: ${advisorResponse}`,
          ai_context: { lastQuery: speechResult, lastResponse: advisorResponse }
        })
        .eq('id', sessionId);
    }

    // Continue gathering input
    twiml.gather({
      input: 'speech',
      action: `/api/sentinel-advisor/process-speech/${sessionId}`,
      language: 'en-US',
      speechTimeout: 'auto',
      speechModel: 'enhanced'
    });

  } catch (error) {
    console.error('Speech processing error:', error);
    twiml.say('I apologize, but I need to transfer you to a care coordinator. Please hold.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// SMS/WhatsApp webhook
router.post('/message', twilioWebhook, async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const fromNumber = req.body.From;
  const messageBody = req.body.Body;
  const isWhatsApp = fromNumber.includes('whatsapp');

  try {
    // Look up family member
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('*, patients(*)')
      .eq('phone_primary', fromNumber.replace('whatsapp:', ''))
      .single();

    if (!familyMember) {
      twiml.message('Welcome to SENTINEL Recovery Care. Please call our main line to register for updates.');
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Get patient status
    const { data: recentEvents } = await supabase
      .from('care_events')
      .select('*')
      .eq('patient_id', familyMember.patient_id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Process with Anthropic
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      temperature: 0.7,
      system: `You are the SENTINEL Advisor responding via ${isWhatsApp ? 'WhatsApp' : 'SMS'} to a family member's question about their loved one.
      Keep responses brief and appropriate for text messaging. Patient: ${familyMember.patients.first_name} ${familyMember.patients.last_name}
      Recent events: ${JSON.stringify(recentEvents)}`,
      messages: [{
        role: 'user',
        content: messageBody
      }]
    });

    twiml.message(response.content[0].text);

    // Log interaction
    await supabase
      .from('interactions')
      .insert({
        family_member_id: familyMember.id,
        patient_id: familyMember.patient_id,
        interaction_type: isWhatsApp ? 'whatsapp' : 'sms',
        direction: 'inbound',
        transcript: messageBody,
        summary: response.content[0].text
      });

  } catch (error) {
    console.error('Message processing error:', error);
    twiml.message('I apologize for the inconvenience. Please call our care team for immediate assistance.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Get patient status (for internal API calls)
router.get('/patient-status/:patientId', async (req, res) => {
  try {
    const patientId = req.params.patientId;

    // Get patient info
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    // Get today's events
    const { data: todayEvents } = await supabase
      .from('care_events')
      .select('*')
      .eq('patient_id', patientId)
      .gte('created_at', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false });

    // Get active alerts
    const { data: activeAlerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('patient_id', patientId)
      .eq('acknowledged', false);

    // Get upcoming appointments
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patientId)
      .eq('status', 'scheduled')
      .gte('scheduled_date', new Date().toISOString())
      .order('scheduled_date')
      .limit(5);

    res.json({
      patient,
      todayEvents,
      activeAlerts,
      appointments,
      summary: generatePatientSummary(patient, todayEvents, activeAlerts)
    });

  } catch (error) {
    console.error('Patient status error:', error);
    res.status(500).json({ error: 'Unable to retrieve patient status' });
  }
});

// Helper functions
function extractTopics(text) {
  const topics = [];
  const topicKeywords = {
    medication: ['medication', 'medicine', 'pills', 'prescription'],
    health: ['health', 'feeling', 'pain', 'sick', 'doctor'],
    meals: ['eat', 'food', 'meal', 'breakfast', 'lunch', 'dinner'],
    activities: ['activity', 'exercise', 'therapy', 'walk'],
    mood: ['mood', 'happy', 'sad', 'depression', 'anxiety'],
    visit: ['visit', 'see', 'come by', 'visiting hours']
  };

  const lowerText = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(topic);
    }
  }

  return topics;
}

function generatePatientSummary(patient, events, alerts) {
  const summary = {
    status: patient.status,
    lastMeal: events.find(e => e.event_type === 'meal'),
    lastMedication: events.find(e => e.event_type === 'medication'),
    lastActivity: events.find(e => e.event_type === 'activity'),
    alertCount: alerts.length,
    overallCondition: alerts.length > 0 ? 'needs_attention' : 'stable'
  };
  return summary;
}

module.exports = router;