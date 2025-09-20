/**
 * SENTINEL Advisor Intelligence Service
 * Multi-agent orchestration with RAG and personalization
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AdvisorIntelligence {
  constructor() {
    // Initialize Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Initialize OpenAI for embeddings
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Initialize Anthropic for conversation
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Cache for agent definitions
    this.agentsCache = null;
    this.agentsCacheTime = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Create embedding for text using OpenAI
   */
  async createEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding creation error:', error);
      return null;
    }
  }

  /**
   * Enhanced intent classification with embeddings
   */
  async classifyIntent(message, sessionId = null) {
    // Get embedding for the message
    const messageEmbedding = await this.createEmbedding(message);

    // Check pattern-based classification first
    const { data: patterns } = await this.supabase
      .from('intent_patterns')
      .select('*')
      .order('priority');

    const lowerMessage = message.toLowerCase();
    let matchedIntent = null;
    let isEmergency = false;

    for (const pattern of patterns || []) {
      if (pattern.pattern_type === 'keyword') {
        const keywords = pattern.pattern.split('|');
        if (keywords.some(keyword => lowerMessage.includes(keyword))) {
          matchedIntent = pattern;
          isEmergency = pattern.is_emergency;
          break;
        }
      } else if (pattern.pattern_type === 'regex') {
        const regex = new RegExp(pattern.pattern, 'i');
        if (regex.test(message)) {
          matchedIntent = pattern;
          isEmergency = pattern.is_emergency;
          break;
        }
      }
    }

    // If we have an embedding, also check semantic similarity
    let semanticIntent = null;
    if (messageEmbedding) {
      // Find similar past conversations
      const { data: similarConversations } = await this.supabase.rpc(
        'match_conversation_memory',
        {
          query_embedding: messageEmbedding,
          match_threshold: 0.7,
          match_count: 3
        }
      );

      if (similarConversations && similarConversations.length > 0) {
        // Use the most common intent from similar conversations
        const intents = similarConversations.map(c => c.intent).filter(Boolean);
        if (intents.length > 0) {
          semanticIntent = this.mostCommon(intents);
        }
      }
    }

    return {
      intent: matchedIntent?.intent || semanticIntent || 'general_inquiry',
      route_to_agent: matchedIntent?.route_to_agent || this.selectDefaultAgent(message),
      is_emergency: isEmergency,
      confidence: matchedIntent ? 0.9 : (semanticIntent ? 0.7 : 0.5),
      embedding: messageEmbedding
    };
  }

  /**
   * Retrieve relevant knowledge using RAG
   */
  async retrieveKnowledge(message, embedding = null, categories = null) {
    if (!embedding) {
      embedding = await this.createEmbedding(message);
    }

    if (!embedding) {
      // Fallback to keyword search if embedding fails
      const { data: knowledge } = await this.supabase
        .from('knowledge_base')
        .select('*')
        .textSearch('content', message.split(' ').join(' & '))
        .limit(5);

      return knowledge || [];
    }

    // Use vector similarity search
    const { data: similarKnowledge } = await this.supabase.rpc(
      'find_similar_knowledge',
      {
        query_embedding: embedding,
        match_count: 5,
        categories: categories
      }
    );

    // Update usage count for retrieved knowledge
    if (similarKnowledge && similarKnowledge.length > 0) {
      const ids = similarKnowledge.map(k => k.id);
      await this.supabase
        .from('knowledge_base')
        .update({
          usage_count: this.supabase.raw('usage_count + 1'),
          last_accessed: new Date().toISOString()
        })
        .in('id', ids);
    }

    return similarKnowledge || [];
  }

  /**
   * Get or refresh agent definitions
   */
  async getAgents() {
    // Check cache
    if (this.agentsCache && this.agentsCacheTime &&
        (Date.now() - this.agentsCacheTime < this.CACHE_DURATION)) {
      return this.agentsCache;
    }

    // Refresh from database
    const { data: agents } = await this.supabase
      .from('agent_definitions')
      .select('*')
      .eq('is_active', true)
      .order('priority');

    this.agentsCache = agents;
    this.agentsCacheTime = Date.now();
    return agents || [];
  }

  /**
   * Select the best agent for the task
   */
  async selectAgent(intent, context = {}) {
    const agents = await this.getAgents();

    // Find agent by type
    const agent = agents.find(a => a.agent_type === intent.route_to_agent) ||
                  agents.find(a => a.agent_type === 'care_coordinator') || // Default
                  agents[0]; // Fallback to first agent

    return agent;
  }

  /**
   * Build conversation context with memory and personalization
   */
  async buildContext(message, sessionId, userId = null) {
    const context = {
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString()
    };

    // Get conversation history
    if (sessionId) {
      const { data: history } = await this.supabase.rpc(
        'get_conversation_context',
        {
          p_session_id: sessionId,
          p_limit: 10
        }
      );
      context.conversation_history = history || [];
    }

    // Get family member and patient info if authenticated
    if (userId) {
      const { data: familyMember } = await this.supabase
        .from('family_members')
        .select(`
          *,
          patients(*),
          family_preferences(*)
        `)
        .eq('user_id', userId)
        .single();

      if (familyMember) {
        context.family_member = familyMember;
        context.patient = familyMember.patients;
        context.preferences = familyMember.family_preferences;

        // Get recent patient events
        if (familyMember.patient_id) {
          const { data: recentEvents } = await this.supabase
            .from('care_events')
            .select('*')
            .eq('patient_id', familyMember.patient_id)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

          context.recent_events = recentEvents || [];
        }
      }
    }

    // Classify intent
    context.intent = await this.classifyIntent(message, sessionId);

    // Retrieve relevant knowledge
    const agent = await this.selectAgent(context.intent);
    context.knowledge = await this.retrieveKnowledge(
      message,
      context.intent.embedding,
      agent?.knowledge_domains
    );

    // Check for escalation triggers
    context.requires_escalation = await this.checkEscalation(message, context);

    return context;
  }

  /**
   * Check if message requires escalation
   */
  async checkEscalation(message, context) {
    const { data: rules } = await this.supabase
      .from('escalation_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority');

    const lowerMessage = message.toLowerCase();

    for (const rule of rules || []) {
      // Check keyword triggers
      if (rule.trigger_keywords && rule.trigger_keywords.length > 0) {
        if (rule.trigger_keywords.some(keyword => lowerMessage.includes(keyword))) {
          return {
            should_escalate: true,
            escalation_type: rule.escalation_type,
            notification_targets: rule.notification_targets,
            auto_response: rule.auto_response
          };
        }
      }

      // Check sentiment triggers
      if (rule.trigger_sentiment && context.intent.sentiment) {
        if (rule.trigger_sentiment.includes(context.intent.sentiment)) {
          return {
            should_escalate: true,
            escalation_type: rule.escalation_type,
            notification_targets: rule.notification_targets,
            auto_response: rule.auto_response
          };
        }
      }
    }

    return { should_escalate: false };
  }

  /**
   * Generate response using the selected agent
   */
  async generateResponse(message, context) {
    const agent = await this.selectAgent(context.intent);

    // Build system prompt with agent personality and knowledge
    let systemPrompt = agent.system_prompt + '\n\n';

    // Add relevant knowledge
    if (context.knowledge && context.knowledge.length > 0) {
      systemPrompt += 'Relevant information:\n';
      context.knowledge.forEach(k => {
        systemPrompt += `- ${k.content}\n`;
      });
      systemPrompt += '\n';
    }

    // Add patient context if available
    if (context.patient) {
      systemPrompt += `Patient: ${context.patient.first_name} ${context.patient.last_name}\n`;
      systemPrompt += `Room: ${context.patient.room_number || 'N/A'}\n`;
      systemPrompt += `Status: ${context.patient.status || 'Active'}\n\n`;
    }

    // Add personalization preferences
    if (context.preferences) {
      const pref = context.preferences;
      systemPrompt += `Communication style: ${pref.preferred_communication_style || 'standard'}\n`;
      systemPrompt += `Empathy level: ${pref.empathy_level || 'moderate'}\n\n`;
    }

    // Build messages array with conversation history
    const messages = [];

    if (context.conversation_history && context.conversation_history.length > 0) {
      context.conversation_history.reverse().forEach(h => {
        messages.push({ role: 'user', content: h.message });
        messages.push({ role: 'assistant', content: h.response });
      });
    }

    messages.push({ role: 'user', content: message });

    try {
      // Generate response with Anthropic
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: agent.max_tokens || 500,
        temperature: agent.temperature || 0.7,
        system: systemPrompt,
        messages: messages
      });

      const generatedResponse = response.content[0].text;

      // Store in conversation memory
      await this.storeConversation(
        message,
        generatedResponse,
        context,
        agent.agent_type
      );

      return {
        response: generatedResponse,
        agent: agent.name,
        intent: context.intent.intent,
        confidence: context.intent.confidence,
        requires_escalation: context.requires_escalation
      };

    } catch (error) {
      console.error('Response generation error:', error);

      // Fallback response
      return {
        response: this.getFallbackResponse(agent.agent_type),
        agent: agent.name,
        intent: context.intent.intent,
        confidence: 0,
        error: true
      };
    }
  }

  /**
   * Store conversation in memory with embeddings
   */
  async storeConversation(message, response, context, agentType) {
    const embedding = context.intent.embedding || await this.createEmbedding(message);

    await this.supabase
      .from('conversation_memory')
      .insert({
        session_id: context.session_id,
        family_member_id: context.family_member?.id,
        patient_id: context.patient?.id,
        message: message,
        response: response,
        message_embedding: embedding,
        intent: context.intent.intent,
        sentiment: this.analyzeSentiment(message),
        topics: this.extractTopics(message),
        context_used: {
          knowledge_ids: context.knowledge?.map(k => k.id),
          agent_type: agentType
        },
        agent_type: agentType,
        escalated: context.requires_escalation.should_escalate,
        metadata: {
          confidence: context.intent.confidence,
          timestamp: context.timestamp
        }
      });
  }

  /**
   * Analyze sentiment (simple implementation)
   */
  analyzeSentiment(text) {
    const lower = text.toLowerCase();

    const urgentWords = ['emergency', 'urgent', 'immediately', 'critical', 'pain'];
    const negativeWords = ['worried', 'concerned', 'unhappy', 'problem', 'issue', 'wrong'];
    const positiveWords = ['good', 'great', 'happy', 'thank', 'appreciate', 'wonderful'];

    if (urgentWords.some(w => lower.includes(w))) return 'urgent';
    if (negativeWords.some(w => lower.includes(w))) return 'negative';
    if (positiveWords.some(w => lower.includes(w))) return 'positive';

    return 'neutral';
  }

  /**
   * Extract topics from message
   */
  extractTopics(text) {
    const topics = [];
    const topicKeywords = {
      medication: ['medication', 'medicine', 'pills', 'prescription', 'dose'],
      health: ['health', 'feeling', 'pain', 'sick', 'doctor', 'nurse'],
      meals: ['eat', 'food', 'meal', 'breakfast', 'lunch', 'dinner', 'nutrition'],
      activities: ['activity', 'exercise', 'therapy', 'walk', 'physical'],
      mood: ['mood', 'happy', 'sad', 'depression', 'anxiety', 'lonely'],
      visit: ['visit', 'see', 'come', 'visiting', 'hours', 'weekend'],
      billing: ['bill', 'payment', 'insurance', 'medicare', 'cost', 'charge'],
      facility: ['room', 'facility', 'staff', 'care', 'service']
    };

    const lowerText = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Get fallback response for agent type
   */
  getFallbackResponse(agentType) {
    const fallbacks = {
      sales_advisor: "I'd be happy to help you explore care options for your loved one. Please call us at (215) 774-0743 to speak with a care coordinator who can provide detailed information.",
      care_coordinator: "I apologize for the technical difficulty. A member of our care team will follow up with you shortly. For immediate assistance, please call (215) 774-0743.",
      emergency_responder: "If this is a medical emergency, please call 911 immediately. For urgent care concerns, contact our facility at (215) 774-0743.",
      wellness_companion: "I'm here to help. Let me connect you with someone who can assist you right away. Please hold on.",
      admin_assistant: "I apologize for the inconvenience. Please contact our administrative team at (215) 774-0743 for immediate assistance."
    };

    return fallbacks[agentType] || fallbacks.care_coordinator;
  }

  /**
   * Select default agent based on message content
   */
  selectDefaultAgent(message) {
    const lower = message.toLowerCase();

    if (lower.includes('considering') || lower.includes('interested') || lower.includes('tour')) {
      return 'sales_advisor';
    }
    if (lower.includes('bill') || lower.includes('insurance') || lower.includes('payment')) {
      return 'admin_assistant';
    }
    if (lower.includes('lonely') || lower.includes('sad') || lower.includes('miss')) {
      return 'wellness_companion';
    }

    return 'care_coordinator';
  }

  /**
   * Most common element in array
   */
  mostCommon(arr) {
    const counts = {};
    let maxCount = 0;
    let mostCommon = null;

    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        mostCommon = item;
      }
    }

    return mostCommon;
  }

  /**
   * Main chat processing function
   */
  async processChat(message, sessionId, userId = null) {
    // Build comprehensive context
    const context = await this.buildContext(message, sessionId, userId);

    // Check for escalation first
    if (context.requires_escalation.should_escalate) {
      // Handle escalation
      await this.handleEscalation(context.requires_escalation);

      // Return escalation response
      return {
        response: context.requires_escalation.auto_response,
        escalated: true,
        escalation_type: context.requires_escalation.escalation_type
      };
    }

    // Generate intelligent response
    return await this.generateResponse(message, context);
  }

  /**
   * Handle escalation
   */
  async handleEscalation(escalation) {
    // Log escalation
    console.log('ESCALATION TRIGGERED:', escalation);

    // In production, trigger actual notifications
    // For now, just log
    if (escalation.notification_targets) {
      escalation.notification_targets.forEach(target => {
        console.log(`Would notify: ${target}`);
      });
    }
  }
}

module.exports = AdvisorIntelligence;