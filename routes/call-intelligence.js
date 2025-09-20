const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Deepgram configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '05b1bf065caced502572e0ca7fe9b898d17f5987';
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

// Twilio webhook security
const twilioWebhook = twilio.webhook({
  validate: process.env.NODE_ENV === 'production'
});

// Main call handler for (215) 774-0743
router.post('/incoming', twilioWebhook, async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;
  const toNumber = req.body.To;

  try {
    // Create call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert({
        twilio_call_sid: callSid,
        phone_number: fromNumber,
        direction: 'inbound',
        call_status: 'initiated'
      })
      .select()
      .single();

    if (callError) throw callError;

    // Look up caller
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('*, patients(*)')
      .eq('phone_primary', fromNumber)
      .single();

    if (familyMember) {
      // Known family member - personalized greeting
      twiml.say({
        voice: 'Polly.Joanna'
      }, `Welcome back ${familyMember.first_name}. This is SENTINEL Recovery Care. How may I help you today?`);

      // Update call with identified caller
      await supabase
        .from('calls')
        .update({
          family_member_id: familyMember.id,
          patient_id: familyMember.patient_id,
          caller_name: `${familyMember.first_name} ${familyMember.last_name}`
        })
        .eq('id', call.id);

    } else {
      // Unknown caller - general greeting
      twiml.say({
        voice: 'Polly.Joanna'
      }, 'Thank you for calling SENTINEL Recovery Care. To better assist you, may I have your name and the reason for your call?');
    }

    // Start recording for transcription
    twiml.record({
      action: `/api/call-intelligence/process-recording/${call.id}`,
      method: 'POST',
      maxLength: 120,
      transcribe: false, // We'll use Deepgram instead
      recordingStatusCallback: `/api/call-intelligence/recording-status/${call.id}`,
      recordingStatusCallbackMethod: 'POST'
    });

    // Gather speech with real-time processing
    const gather = twiml.gather({
      input: 'speech',
      action: `/api/call-intelligence/process-speech/${call.id}`,
      language: 'en-US',
      enhanced: true,
      speechTimeout: 'auto',
      speechModel: 'numbers_and_commands'
    });

    gather.say('Please tell me how I can help you today.');

  } catch (error) {
    console.error('Call handler error:', error);
    twiml.say('I apologize, but I am having trouble accessing our system. Please stay on the line for assistance.');
    twiml.dial('12154987369'); // Fallback to main number
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech input and route intelligently
router.post('/process-speech/:callId', twilioWebhook, async (req, res) => {
  const callId = req.params.callId;
  const speechResult = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Get call context
    const { data: call } = await supabase
      .from('calls')
      .select('*, family_members(*), patients(*)')
      .eq('id', callId)
      .single();

    // Analyze speech for keywords and sentiment
    const analysis = analyzeSpeech(speechResult);

    // Update call with transcription
    await supabase
      .from('calls')
      .update({
        transcription: call.transcription ?
          `${call.transcription}\n\nCaller: ${speechResult}` :
          `Caller: ${speechResult}`,
        keywords: analysis.keywords,
        sentiment: analysis.sentiment,
        topics: analysis.topics
      })
      .eq('id', callId);

    // Get routing rules
    const { data: routingRules } = await supabase
      .from('call_routing_rules')
      .select('*')
      .eq('active', true)
      .order('priority');

    // Find matching rule
    let matchedRule = null;
    for (const rule of routingRules) {
      if (matchesRule(analysis, rule)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      // Apply routing rule
      if (matchedRule.escalation_required) {
        twiml.say('I understand this is urgent. Let me connect you with someone immediately.');
        twiml.dial(matchedRule.route_to || '12154987369');
      } else if (matchedRule.auto_response_template) {
        twiml.say({ voice: 'Polly.Joanna' }, matchedRule.auto_response_template);

        // Continue conversation
        twiml.gather({
          input: 'speech',
          action: `/api/call-intelligence/process-speech/${callId}`,
          language: 'en-US'
        });
      }

      // Update call routing
      await supabase
        .from('calls')
        .update({
          routed_to: matchedRule.route_to,
          action_taken: matchedRule.rule_name
        })
        .eq('id', callId);

    } else {
      // Default routing
      if (analysis.sentiment === 'urgent') {
        twiml.say('I can hear this is important. Let me connect you with our care team right away.');
        twiml.dial('12154987369');
      } else {
        // Provide AI-powered response
        const response = await generateAIResponse(speechResult, call);
        twiml.say({ voice: 'Polly.Joanna' }, response);

        // Continue gathering
        twiml.gather({
          input: 'speech',
          action: `/api/call-intelligence/process-speech/${callId}`,
          language: 'en-US'
        });
      }
    }

  } catch (error) {
    console.error('Speech processing error:', error);
    twiml.say('Let me transfer you to someone who can help.');
    twiml.dial('12154987369');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process recordings with Deepgram
router.post('/process-recording/:callId', twilioWebhook, async (req, res) => {
  const callId = req.params.callId;
  const recordingUrl = req.body.RecordingUrl;
  const recordingDuration = req.body.RecordingDuration;

  try {
    // Update call with recording info
    await supabase
      .from('calls')
      .update({
        recording_url: recordingUrl,
        recording_duration: parseInt(recordingDuration)
      })
      .eq('id', callId);

    // Transcribe with Deepgram
    if (recordingUrl) {
      const transcription = await transcribeWithDeepgram(recordingUrl);

      await supabase
        .from('calls')
        .update({
          transcription: transcription.text,
          transcription_confidence: transcription.confidence,
          keywords: extractKeywords(transcription.text)
        })
        .eq('id', callId);
    }

  } catch (error) {
    console.error('Recording processing error:', error);
  }

  res.status(200).send('OK');
});

// Recording status callback
router.post('/recording-status/:callId', twilioWebhook, async (req, res) => {
  const callId = req.params.callId;
  const recordingStatus = req.body.RecordingStatus;
  const recordingSid = req.body.RecordingSid;

  try {
    console.log(`Recording ${recordingSid} for call ${callId}: ${recordingStatus}`);

    if (recordingStatus === 'completed') {
      // Trigger post-call analysis
      await analyzeCallAndNotify(callId);
    }

  } catch (error) {
    console.error('Recording status error:', error);
  }

  res.status(200).send('OK');
});

// Call status callback
router.post('/status/:callId', twilioWebhook, async (req, res) => {
  const callId = req.params.callId;
  const callStatus = req.body.CallStatus;
  const callDuration = req.body.CallDuration;

  try {
    await supabase
      .from('calls')
      .update({
        call_status: callStatus,
        duration_seconds: parseInt(callDuration || 0),
        ended_at: new Date().toISOString()
      })
      .eq('id', callId);

    // Calculate daily metrics if call completed
    if (callStatus === 'completed') {
      await updateDailyMetrics();
    }

  } catch (error) {
    console.error('Call status error:', error);
  }

  res.status(200).send('OK');
});

// Helper function to transcribe with Deepgram
async function transcribeWithDeepgram(audioUrl) {
  try {
    const response = await fetch(DEEPGRAM_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: audioUrl,
        options: {
          punctuate: true,
          utterances: true,
          model: 'nova-2',
          language: 'en-US',
          smart_format: true,
          diarize: true,
          keywords: [
            'medication:2',
            'emergency:3',
            'pain:2',
            'doctor:2',
            'appointment:2',
            'billing:2',
            'payment:2',
            'insurance:2'
          ]
        }
      })
    });

    const data = await response.json();

    return {
      text: data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '',
      confidence: data.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0,
      keywords: data.results?.channels?.[0]?.detected_keywords || []
    };

  } catch (error) {
    console.error('Deepgram transcription error:', error);
    return { text: '', confidence: 0, keywords: [] };
  }
}

// Analyze speech for routing
function analyzeSpeech(text) {
  const lowerText = text.toLowerCase();

  // Keyword extraction
  const keywords = [];
  const keywordMap = {
    emergency: ['emergency', 'urgent', 'help', 'immediately', '911'],
    medical: ['medication', 'medicine', 'doctor', 'nurse', 'pain', 'sick'],
    billing: ['bill', 'payment', 'charge', 'invoice', 'insurance', 'cost'],
    visit: ['visit', 'see', 'come', 'visiting hours', 'when can'],
    update: ['update', 'how is', 'doing', 'status', 'condition']
  };

  for (const [category, terms] of Object.entries(keywordMap)) {
    if (terms.some(term => lowerText.includes(term))) {
      keywords.push(category);
    }
  }

  // Sentiment analysis
  let sentiment = 'neutral';
  if (lowerText.includes('emergency') || lowerText.includes('urgent') || lowerText.includes('help')) {
    sentiment = 'urgent';
  } else if (lowerText.includes('thank') || lowerText.includes('appreciate') || lowerText.includes('great')) {
    sentiment = 'positive';
  } else if (lowerText.includes('upset') || lowerText.includes('angry') || lowerText.includes('frustrated')) {
    sentiment = 'negative';
  }

  // Topic extraction
  const topics = keywords.filter(k => k !== 'emergency');

  return { keywords, sentiment, topics };
}

// Check if analysis matches routing rule
function matchesRule(analysis, rule) {
  // Check keyword matches
  if (rule.keyword_matches && rule.keyword_matches.length > 0) {
    const hasKeyword = rule.keyword_matches.some(keyword =>
      analysis.keywords.includes(keyword) ||
      analysis.topics.includes(keyword)
    );
    if (!hasKeyword) return false;
  }

  // Check sentiment matches
  if (rule.sentiment_matches && rule.sentiment_matches.length > 0) {
    if (!rule.sentiment_matches.includes(analysis.sentiment)) {
      return false;
    }
  }

  // Check time of day
  const now = new Date();
  if (rule.time_of_day_start && rule.time_of_day_end) {
    const currentTime = `${now.getHours()}:${now.getMinutes()}`;
    if (currentTime < rule.time_of_day_start || currentTime > rule.time_of_day_end) {
      return false;
    }
  }

  // Check day of week
  if (rule.day_of_week && rule.day_of_week.length > 0) {
    if (!rule.day_of_week.includes(now.getDay())) {
      return false;
    }
  }

  return true;
}

// Generate AI response (simplified - would use Anthropic in production)
async function generateAIResponse(input, call) {
  // For now, return contextual responses
  const lowerInput = input.toLowerCase();

  if (call.patients && lowerInput.includes('how is')) {
    return `${call.patients.first_name} is doing well today. They had a good breakfast and participated in morning activities. Is there something specific you would like to know?`;
  }

  if (lowerInput.includes('visit')) {
    return 'Visiting hours are from 9 AM to 8 PM daily. Would you like me to note down that you are planning to visit?';
  }

  if (lowerInput.includes('medication')) {
    return 'All medications are being administered as prescribed. I can have our medical team provide you with a detailed update. Would you like me to arrange that?';
  }

  return 'I understand your concern. Let me make sure you get the right information. Is there anything specific about your loved one is care you would like to know?';
}

// Post-call analysis and notifications
async function analyzeCallAndNotify(callId) {
  try {
    const { data: call } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (!call) return;

    // Check if follow-up is needed
    if (call.sentiment === 'urgent' || call.sentiment === 'negative') {
      // Create alert
      await supabase
        .from('alerts')
        .insert({
          patient_id: call.patient_id,
          alert_type: 'call_followup',
          severity: call.sentiment === 'urgent' ? 'high' : 'medium',
          title: 'Call requires follow-up',
          description: `${call.caller_name || 'Unknown caller'} called with ${call.sentiment} sentiment. Topics: ${call.topics?.join(', ')}`,
          requires_action: true
        });

      // Mark call for callback
      await supabase
        .from('calls')
        .update({
          requires_callback: true,
          callback_scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
        })
        .eq('id', callId);
    }

    // Log interaction for AI learning
    if (call.family_member_id) {
      await supabase
        .from('agent_interactions')
        .insert({
          ai_agent_id: (await getAgentId('SENTINEL Advisor')),
          call_id: callId,
          family_member_id: call.family_member_id,
          patient_id: call.patient_id,
          interaction_type: 'phone_call',
          input_text: call.transcription,
          output_text: call.ai_response,
          confidence_score: call.transcription_confidence
        });
    }

  } catch (error) {
    console.error('Post-call analysis error:', error);
  }
}

// Get AI agent ID helper
async function getAgentId(agentName) {
  const { data } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('agent_name', agentName)
    .single();
  return data?.id;
}

// Update daily metrics
async function updateDailyMetrics() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get today's call stats
    const { data: callStats } = await supabase
      .from('calls')
      .select('duration_seconds')
      .gte('started_at', today)
      .lt('started_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const totalCalls = callStats?.length || 0;
    const avgDuration = callStats?.length > 0 ?
      callStats.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / callStats.length : 0;

    // Update or insert metrics
    await supabase
      .from('daily_metrics')
      .upsert({
        metric_date: today,
        total_calls: totalCalls,
        average_call_duration_seconds: Math.round(avgDuration)
      }, {
        onConflict: 'metric_date'
      });

  } catch (error) {
    console.error('Metrics update error:', error);
  }
}

// Extract keywords helper
function extractKeywords(text) {
  const keywords = [];
  const importantTerms = [
    'medication', 'emergency', 'pain', 'doctor', 'nurse',
    'appointment', 'billing', 'payment', 'insurance',
    'visit', 'family', 'update', 'condition', 'care'
  ];

  const lowerText = text.toLowerCase();
  for (const term of importantTerms) {
    if (lowerText.includes(term)) {
      keywords.push(term);
    }
  }

  return keywords;
}

module.exports = router;