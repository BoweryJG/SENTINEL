const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const AdvisorIntelligence = require('../services/advisor-intelligence');

// Initialize from environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Initialize Advisor Intelligence
const advisorAI = new AdvisorIntelligence();

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
      }, 'Welcome to SENTINEL Recovery Care. This is your 24-hour Advisor. May I have your name and the patient you are calling about?');
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
    twiml.say('I apologize, but I am having trouble accessing the system. Please try again or call our main line.');
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

// Intent classification helper
function classifyIntent(message) {
  const lowerMessage = message.toLowerCase();

  // Sales/prospect indicators
  const prospectKeywords = [
    'considering', 'thinking about', 'looking for', 'interested in',
    'need help for', 'options for', 'information about', 'tell me about',
    'how much', 'cost', 'pricing', 'services', 'facility', 'tour',
    'admission', 'availability', 'what do you offer', 'home care',
    'assisted living', 'recovery care', 'my mom', 'my dad', 'my parent',
    'my husband', 'my wife', 'my spouse'
  ];

  // Existing family indicators
  const familyKeywords = [
    'how is', 'update on', 'status of', 'visited today', 'medication given',
    'ate breakfast', 'therapy session', 'doctor said', 'nurse mentioned',
    'room number', 'visiting hours', 'bring tomorrow'
  ];

  // Emergency indicators
  const emergencyKeywords = [
    'emergency', 'urgent', 'immediately', 'right now', 'fell', 'pain',
    'not responding', 'breathing', 'chest pain', 'unconscious'
  ];

  // Check for emergency first
  if (emergencyKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'emergency';
  }

  // Check for existing family context
  const hasPatientReference = familyKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasPatientReference) {
    return 'existing_family';
  }

  // Check for sales/prospect intent
  const hasProspectIntent = prospectKeywords.some(keyword => lowerMessage.includes(keyword));
  if (hasProspectIntent) {
    return 'prospect';
  }

  // Default to prospect for general inquiries
  return 'general_inquiry';
}

// Web chat endpoint with intelligent multi-agent routing
router.post('/chat', async (req, res) => {
  try {
    const { message, context, sessionId, userId } = req.body;

    // Classify the intent
    const intent = classifyIntent(message);

    // Try to identify if this is an existing family member
    let familyMember = null;
    let patient = null;

    if (userId) {
      // In production, lookup by authenticated user ID
      const { data: fm } = await supabase
        .from('family_members')
        .select('*, patients(*)')
        .eq('user_id', userId)
        .single();

      if (fm) {
        familyMember = fm;
        patient = fm.patients;
      }
    }

    // Route based on intent and user status
    let systemPrompt, contextInfo;

    if (intent === 'emergency') {
      // Emergency response
      return res.json({
        response: 'I understand this is urgent. Please call 911 immediately or contact our 24-hour care team at (215) 774-0743. A nurse is being notified now.',
        emergency: true,
        timestamp: new Date().toISOString()
      });
    }

    if (familyMember && patient) {
      // Existing family member with patient
      const { data: recentEvents } = await supabase
        .from('care_events')
        .select('*')
        .eq('patient_id', patient.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      contextInfo = {
        patientName: `${patient.first_name} ${patient.last_name}`,
        room: patient.room_number,
        status: patient.status,
        recentEvents: recentEvents.map(e => `${e.event_type}: ${e.description}`).join(', ')
      };

      systemPrompt = `You are the SENTINEL Advisor, a warm and professional care coordinator.
      You're speaking with ${familyMember.first_name}, who is the ${familyMember.relationship} of ${patient.first_name} ${patient.last_name}.

      Patient is in room ${patient.room_number}, status: ${patient.status}.
      Recent events: ${contextInfo.recentEvents || 'No recent events'}

      Provide accurate, compassionate updates. Be specific when you have information.
      If you don't have specific information, offer to have a care manager follow up.`;

    } else if (intent === 'prospect' || intent === 'general_inquiry') {
      // Sales prospect or general inquiry
      contextInfo = { type: 'prospect' };

      systemPrompt = `You are the SENTINEL Advisor, a warm and professional representative for SENTINEL Recovery Care, Philadelphia's premier luxury private recovery and senior care facility.

      You're speaking with a potential client who is exploring care options for their loved one.

      Our services include:
      - 24/7 professional medical supervision
      - Luxury private suites with personalized care
      - Post-surgical and post-hospitalization recovery
      - Physical therapy and rehabilitation
      - Medication management
      - Gourmet nutrition programs
      - Family communication and updates
      - Concierge services

      Key differentiators:
      - Nurse-to-patient ratio of 1:3
      - All private suites with premium amenities
      - Located in Philadelphia's premier medical district
      - Average length of stay: 30-90 days
      - Accepts Medicare, most insurance, and private pay

      Be warm, empathetic, and helpful. Listen to their concerns.
      Don't quote specific prices - instead offer to schedule a consultation.
      Emphasize our personalized approach and luxury care environment.
      If they're comparing options, highlight what makes SENTINEL unique.`;

    } else {
      // Unknown context - treat as prospect
      contextInfo = { type: 'unknown' };
      systemPrompt = `You are the SENTINEL Advisor for SENTINEL Recovery Care.
      Determine if this person is an existing family member or someone seeking information about our services.
      Ask clarifying questions to understand how you can help them.
      Be professional, warm, and helpful.`;
    }

    // Process with Anthropic
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        ...(context || []),
        { role: 'user', content: message }
      ]
    });

    const advisorResponse = response.content[0].text;

    // Log interaction with proper classification
    await supabase
      .from('interactions')
      .insert({
        family_member_id: familyMember?.id || null,
        patient_id: patient?.id || null,
        interaction_type: 'web_chat',
        direction: 'inbound',
        transcript: message,
        summary: advisorResponse,
        topics: [...extractTopics(message), intent],
        metadata: {
          intent,
          sessionId,
          hasAuth: !!userId
        }
      });

    // Track prospects for sales team
    if (intent === 'prospect' && !familyMember) {
      await supabase
        .from('sales_leads')
        .insert({
          source: 'web_chat',
          initial_inquiry: message,
          response: advisorResponse,
          session_id: sessionId,
          status: 'new',
          priority: message.toLowerCase().includes('urgent') ? 'high' : 'normal'
        });
    }

    res.json({
      response: advisorResponse,
      context: contextInfo,
      intent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);

    // Fallback response
    res.json({
      response: 'I apologize for the technical difficulty. Please call us directly at (215) 774-0743 to speak with a care coordinator who can assist you immediately.',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;