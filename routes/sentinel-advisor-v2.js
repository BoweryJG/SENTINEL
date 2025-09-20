/**
 * SENTINEL Advisor V2 - Intelligent Multi-Agent System
 * Award-winning healthcare chatbot with RAG and personalization
 */

const express = require('express');
const router = express.Router();
const AdvisorIntelligence = require('../services/advisor-intelligence');

// Initialize Advisor Intelligence
const advisorAI = new AdvisorIntelligence();

/**
 * Main chat endpoint with intelligent routing
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, userId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Generate session ID if not provided
    const chatSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Process with intelligent advisor
    const result = await advisorAI.processChat(message, chatSessionId, userId);

    // Handle escalation if needed
    if (result.escalated) {
      // In production, trigger real notifications
      console.log(`[ESCALATION] Type: ${result.escalation_type}`);

      return res.json({
        success: true,
        response: result.response,
        escalated: true,
        escalation_type: result.escalation_type,
        session_id: chatSessionId,
        timestamp: new Date().toISOString()
      });
    }

    // Return intelligent response
    res.json({
      success: true,
      response: result.response,
      agent: result.agent,
      intent: result.intent,
      confidence: result.confidence,
      session_id: chatSessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Advisor V2] Chat error:', error);

    // Fallback response
    res.json({
      success: false,
      response: 'I apologize for the technical difficulty. Please call us directly at (215) 774-0743 for immediate assistance.',
      error: true,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get agent performance metrics
 */
router.get('/metrics/agents', async (req, res) => {
  try {
    const { data: agents } = await advisorAI.supabase
      .from('agent_definitions')
      .select('agent_type, name, performance_metrics')
      .eq('is_active', true);

    res.json({
      success: true,
      agents: agents || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Advisor V2] Metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve metrics'
    });
  }
});

/**
 * Submit feedback for interaction
 */
router.post('/feedback', async (req, res) => {
  try {
    const {
      conversation_memory_id,
      interaction_id,
      was_helpful,
      feedback_text,
      resolution_type
    } = req.body;

    const { data, error } = await advisorAI.supabase
      .from('interaction_feedback')
      .insert({
        conversation_memory_id,
        interaction_id,
        was_helpful,
        feedback_text,
        resolution_type,
        sentiment_accuracy: true, // Can be enhanced with actual validation
        intent_accuracy: true, // Can be enhanced with actual validation
        response_quality_score: was_helpful ? 0.9 : 0.3
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      feedback_id: data.id,
      message: 'Thank you for your feedback. We use this to continuously improve our service.'
    });

  } catch (error) {
    console.error('[Advisor V2] Feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to submit feedback'
    });
  }
});

/**
 * Get conversation history for a session
 */
router.get('/conversation/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: conversation } = await advisorAI.supabase
      .from('conversation_memory')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    res.json({
      success: true,
      session_id: sessionId,
      conversation: conversation || [],
      message_count: conversation ? conversation.length : 0
    });

  } catch (error) {
    console.error('[Advisor V2] History error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve conversation history'
    });
  }
});

/**
 * Add knowledge to the knowledge base
 */
router.post('/knowledge', async (req, res) => {
  try {
    const { content, category, tags, source } = req.body;

    if (!content || !category) {
      return res.status(400).json({
        success: false,
        error: 'Content and category are required'
      });
    }

    // Create embedding for the knowledge
    const embedding = await advisorAI.createEmbedding(content);

    const { data, error } = await advisorAI.supabase
      .from('knowledge_base')
      .insert({
        content,
        embedding,
        category,
        tags: tags || [],
        source: source || 'manual_entry',
        confidence_score: 1.0
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      knowledge_id: data.id,
      message: 'Knowledge added successfully'
    });

  } catch (error) {
    console.error('[Advisor V2] Knowledge error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to add knowledge'
    });
  }
});

/**
 * Test agent selection for a message
 */
router.post('/test/agent-selection', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Classify intent
    const intent = await advisorAI.classifyIntent(message);

    // Select agent
    const agent = await advisorAI.selectAgent(intent);

    res.json({
      success: true,
      message,
      intent: intent.intent,
      confidence: intent.confidence,
      is_emergency: intent.is_emergency,
      selected_agent: {
        type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }
    });

  } catch (error) {
    console.error('[Advisor V2] Test error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to test agent selection'
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const { data, error } = await advisorAI.supabase
      .from('agent_definitions')
      .select('count')
      .single();

    res.json({
      success: true,
      status: 'healthy',
      service: 'SENTINEL Advisor V2',
      agents_available: data ? data.count : 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      service: 'SENTINEL Advisor V2',
      error: error.message
    });
  }
});

module.exports = router;