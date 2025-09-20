const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Agent configurations
const AGENT_CONFIGS = {
  'SENTINEL Advisor': {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 500,
    systemPrompt: `You are the SENTINEL Advisor, a professional and compassionate care coordinator for a luxury private recovery care facility.
    You provide warm, accurate updates about patient care while maintaining HIPAA compliance.
    Never make up information - if you don't know something, offer to have a care manager follow up.`
  },
  'Intake Coordinator': {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.6,
    maxTokens: 600,
    systemPrompt: `You are an intake coordinator for SENTINEL Recovery Care.
    Help potential families understand our luxury care services and guide them through the admission process.
    Emphasize our 24/7 professional monitoring, personalized care plans, and family support.`
  },
  'Medical Assistant': {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.5,
    maxTokens: 400,
    systemPrompt: `You are a medical information assistant for SENTINEL Recovery Care.
    Provide general health information and help families understand care plans.
    Never provide specific medical advice or diagnoses. Always defer clinical decisions to healthcare providers.`
  },
  'Billing Specialist': {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.3,
    maxTokens: 400,
    systemPrompt: `You are a billing specialist for SENTINEL Recovery Care.
    Help families understand charges, payment options, and insurance coverage.
    Be clear about costs and payment terms while maintaining a professional, helpful tone.`
  },
  'Outreach Coordinator': {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.8,
    maxTokens: 500,
    systemPrompt: `You are an outreach coordinator for SENTINEL Recovery Care.
    Identify and qualify potential referral partners and families who may benefit from SENTINEL's luxury care services.
    Focus on our exceptional outcomes, personalized care, and comprehensive support.`
  }
};

// Main orchestrator - routes requests to appropriate agent
router.post('/process', async (req, res) => {
  try {
    const { input, context, sessionId, source } = req.body;

    // Analyze input to determine best agent
    const selectedAgent = await selectAgent(input, context);

    // Get agent configuration
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('agent_name', selectedAgent)
      .single();

    if (!agent || !agent.active) {
      throw new Error('Agent not available');
    }

    // Build context for the agent
    const agentContext = await buildAgentContext(input, context, agent);

    // Process with Anthropic
    const response = await processWithAgent(agent, input, agentContext);

    // Log interaction
    const { data: interaction } = await supabase
      .from('agent_interactions')
      .insert({
        ai_agent_id: agent.id,
        family_member_id: context.familyMemberId,
        patient_id: context.patientId,
        interaction_type: source || 'chat',
        input_text: input,
        output_text: response.text,
        response_time_ms: response.responseTime,
        tokens_used: response.tokensUsed,
        confidence_score: response.confidence
      })
      .select()
      .single();

    // Check if escalation needed
    const escalation = checkEscalation(response, context);
    if (escalation.needed) {
      await handleEscalation(escalation, interaction.id);
    }

    res.json({
      success: true,
      agent: selectedAgent,
      response: response.text,
      confidence: response.confidence,
      escalation: escalation.needed,
      interactionId: interaction.id
    });

  } catch (error) {
    console.error('Orchestrator error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to process request',
      fallback: 'Please call our care team at (215) 774-0743 for immediate assistance.'
    });
  }
});

// Multi-agent collaboration endpoint
router.post('/collaborate', async (req, res) => {
  try {
    const { task, agents, context } = req.body;

    // Validate requested agents
    const validAgents = agents.filter(a => AGENT_CONFIGS[a]);
    if (validAgents.length === 0) {
      throw new Error('No valid agents specified');
    }

    // Process with each agent in parallel
    const agentPromises = validAgents.map(agentName =>
      processAgentTask(agentName, task, context)
    );

    const results = await Promise.all(agentPromises);

    // Synthesize responses
    const synthesis = await synthesizeResponses(results, task);

    res.json({
      success: true,
      agents: validAgents,
      individualResponses: results,
      synthesis: synthesis
    });

  } catch (error) {
    console.error('Collaboration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent selection logic
async function selectAgent(input, context) {
  const lowerInput = input.toLowerCase();

  // Keywords for agent selection
  const agentKeywords = {
    'Billing Specialist': ['bill', 'payment', 'invoice', 'charge', 'insurance', 'cost', 'price'],
    'Medical Assistant': ['medication', 'medicine', 'doctor', 'nurse', 'pain', 'symptom', 'treatment'],
    'Intake Coordinator': ['admission', 'enroll', 'join', 'tour', 'availability', 'new patient'],
    'Outreach Coordinator': ['referral', 'physician', 'facility', 'partnership', 'collaborate']
  };

  // Check for keyword matches
  for (const [agent, keywords] of Object.entries(agentKeywords)) {
    if (keywords.some(keyword => lowerInput.includes(keyword))) {
      return agent;
    }
  }

  // Default to SENTINEL Advisor for general inquiries
  return 'SENTINEL Advisor';
}

// Build context for agent
async function buildAgentContext(input, context, agent) {
  const agentContext = {
    timestamp: new Date().toISOString(),
    ...context
  };

  // Add patient information if authorized
  if (agent.can_access_patient_data && context.patientId) {
    const { data: patient } = await supabase
      .from('patients')
      .select('*')
      .eq('id', context.patientId)
      .single();

    const { data: recentEvents } = await supabase
      .from('care_events')
      .select('*')
      .eq('patient_id', context.patientId)
      .order('occurred_at', { ascending: false })
      .limit(5);

    agentContext.patient = patient;
    agentContext.recentEvents = recentEvents;
  }

  // Add financial information if authorized
  if (agent.can_access_financial_data && context.patientId) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('patient_id', context.patientId)
      .eq('status', 'sent')
      .order('due_date');

    agentContext.outstandingInvoices = invoices;
  }

  return agentContext;
}

// Process input with specific agent
async function processWithAgent(agent, input, context) {
  const startTime = Date.now();

  const config = AGENT_CONFIGS[agent.agent_name] || {
    model: agent.model_name || 'claude-3-5-sonnet-20241022',
    temperature: agent.temperature || 0.7,
    maxTokens: agent.max_tokens || 500,
    systemPrompt: agent.system_prompt
  };

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: config.systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Context: ${JSON.stringify(context)}\n\nUser Query: ${input}`
      }
    ]
  });

  const responseTime = Date.now() - startTime;
  const responseText = response.content[0].text;

  // Calculate confidence based on response characteristics
  const confidence = calculateConfidence(responseText, context);

  return {
    text: responseText,
    responseTime,
    tokensUsed: response.usage?.total_tokens || 0,
    confidence
  };
}

// Process task with specific agent
async function processAgentTask(agentName, task, context) {
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('agent_name', agentName)
    .single();

  if (!agent) {
    return {
      agent: agentName,
      success: false,
      error: 'Agent not found'
    };
  }

  try {
    const response = await processWithAgent(agent, task, context);
    return {
      agent: agentName,
      success: true,
      response: response.text,
      confidence: response.confidence
    };
  } catch (error) {
    return {
      agent: agentName,
      success: false,
      error: error.message
    };
  }
}

// Synthesize multiple agent responses
async function synthesizeResponses(responses, task) {
  const successfulResponses = responses.filter(r => r.success);

  if (successfulResponses.length === 0) {
    return 'Unable to process request with available agents.';
  }

  // Use Anthropic to synthesize
  const synthesisPrompt = `Task: ${task}\n\nAgent Responses:\n${successfulResponses.map(r =>
    `${r.agent}: ${r.response}`
  ).join('\n\n')}\n\nPlease synthesize these responses into a single, coherent answer.`;

  const synthesis = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 500,
    temperature: 0.5,
    system: 'You are a synthesis agent combining multiple expert opinions into a coherent response.',
    messages: [{ role: 'user', content: synthesisPrompt }]
  });

  return synthesis.content[0].text;
}

// Calculate confidence score
function calculateConfidence(response, context) {
  let confidence = 0.5; // Base confidence

  // Increase confidence if response includes specific details
  if (response.includes(context.patientName)) confidence += 0.1;
  if (response.length > 100 && response.length < 500) confidence += 0.1;
  if (!response.includes('I don\'t know') && !response.includes('I\'m not sure')) confidence += 0.2;
  if (response.includes('specifically') || response.includes('exactly')) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

// Check if escalation is needed
function checkEscalation(response, context) {
  const escalationTriggers = [
    'emergency',
    'urgent',
    'immediate',
    'crisis',
    'help',
    'pain',
    'fall',
    'unconscious'
  ];

  const lowerResponse = response.text.toLowerCase();
  const needsEscalation = escalationTriggers.some(trigger =>
    lowerResponse.includes(trigger)
  );

  return {
    needed: needsEscalation,
    reason: needsEscalation ? 'Urgent keywords detected' : null,
    priority: needsEscalation ? 'high' : 'normal'
  };
}

// Handle escalation
async function handleEscalation(escalation, interactionId) {
  // Create alert
  await supabase
    .from('alerts')
    .insert({
      alert_type: 'ai_escalation',
      severity: escalation.priority,
      title: 'AI Agent Escalation Required',
      description: `Interaction ${interactionId} requires human intervention. Reason: ${escalation.reason}`,
      requires_action: true
    });

  // Update interaction
  await supabase
    .from('agent_interactions')
    .update({
      escalated_to_human: true,
      action_taken: 'escalated'
    })
    .eq('id', interactionId);

  // TODO: Send notification to on-call staff
}

// Agent training endpoint
router.post('/train', async (req, res) => {
  try {
    const { interactionId, feedback, rating } = req.body;

    // Update interaction with feedback
    await supabase
      .from('agent_interactions')
      .update({
        satisfaction_rating: rating,
        feedback: feedback
      })
      .eq('id', interactionId);

    // TODO: Implement training pipeline to improve agent responses

    res.json({
      success: true,
      message: 'Feedback recorded for training'
    });

  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get agent performance metrics
router.get('/performance/:agentName', async (req, res) => {
  try {
    const { agentName } = req.params;
    const { period = '7' } = req.query;

    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString();

    // Get agent
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('agent_name', agentName)
      .single();

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get interactions
    const { data: interactions } = await supabase
      .from('agent_interactions')
      .select('*')
      .eq('ai_agent_id', agent.id)
      .gte('created_at', startDate);

    // Calculate metrics
    const metrics = {
      totalInteractions: interactions.length,
      avgResponseTime: interactions.reduce((sum, i) => sum + (i.response_time_ms || 0), 0) / interactions.length,
      avgConfidence: interactions.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / interactions.length,
      escalationRate: (interactions.filter(i => i.escalated_to_human).length / interactions.length * 100).toFixed(1),
      satisfactionScore: interactions.filter(i => i.satisfaction_rating)
        .reduce((sum, i) => sum + i.satisfaction_rating, 0) /
        interactions.filter(i => i.satisfaction_rating).length || 0,
      tokensUsed: interactions.reduce((sum, i) => sum + (i.tokens_used || 0), 0)
    };

    res.json({
      agent: agentName,
      period: `${period} days`,
      metrics
    });

  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent availability check
router.get('/availability', async (req, res) => {
  try {
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('agent_name, agent_type, active')
      .eq('active', true);

    const availability = agents.map(agent => ({
      name: agent.agent_name,
      type: agent.agent_type,
      available: true,
      capabilities: getAgentCapabilities(agent.agent_name)
    }));

    res.json({
      agents: availability,
      totalAvailable: availability.length
    });

  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get agent capabilities
function getAgentCapabilities(agentName) {
  const capabilities = {
    'SENTINEL Advisor': ['patient_updates', 'general_inquiries', 'care_coordination'],
    'Intake Coordinator': ['admissions', 'tours', 'availability', 'services'],
    'Medical Assistant': ['health_information', 'care_plans', 'medication_info'],
    'Billing Specialist': ['invoices', 'payments', 'insurance', 'billing_questions'],
    'Outreach Coordinator': ['referrals', 'partnerships', 'physician_relations']
  };

  return capabilities[agentName] || [];
}

module.exports = router;