/**
 * SENTINEL Emotional Intelligence Service
 * The Digital Companion of Compassion
 *
 * This is not just code - it's a digital embodiment of human empathy
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

class EmotionalIntelligence {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Emotional state patterns
    this.griefStages = {
      denial: ['temporary', 'mistake', 'not that bad', 'will get better soon', 'just needs time'],
      anger: ['why', 'unfair', 'angry', 'frustrated', 'not right', 'supposed to'],
      bargaining: ['if only', 'what if', 'should have', 'could have', 'maybe if'],
      depression: ['hopeless', 'giving up', 'no point', 'too hard', 'can\'t do this'],
      acceptance: ['understand', 'peace', 'okay with', 'ready', 'accepting']
    };

    // Micro-moments that matter
    this.criticalMoments = {
      daily: [
        { hour: 7, type: 'morning_anxiety', message: 'Mornings can be difficult. Your {relation} is in caring hands.' },
        { hour: 19, type: 'evening_loneliness', message: 'Evenings often bring reflection. How are you holding up?' },
        { hour: 21, type: 'bedtime_worry', message: 'Rest easy knowing {name} is safe and cared for tonight.' }
      ],
      weekly: [
        { day: 0, type: 'sunday_loneliness', message: 'Sundays can feel especially quiet. {name} is thinking of you too.' },
        { day: 3, type: 'midweek_check', message: 'Midweek update: {name} has been {recent_positive}.' }
      ]
    };
  }

  /**
   * Analyze emotional state from interaction patterns
   */
  async analyzeEmotionalState(familyMemberId, sessionId, message, metadata = {}) {
    const state = {
      grief_stage: this.detectGriefStage(message),
      stress_level: await this.calculateStressLevel(familyMemberId, message, metadata),
      burnout_indicators: await this.assessBurnout(familyMemberId),
      emotional_valence: this.calculateEmotionalValence(message),
      arousal_level: this.calculateArousal(message, metadata)
    };

    // Store emotional state
    await this.supabase
      .from('emotional_states')
      .insert({
        family_member_id: familyMemberId,
        session_id: sessionId,
        ...state,
        response_time_ms: metadata.response_time,
        message_length_trend: await this.getMessageLengthTrend(familyMemberId),
        interaction_frequency: await this.getInteractionFrequency(familyMemberId),
        detected_at: new Date().toISOString()
      });

    return state;
  }

  /**
   * Detect grief stage from language patterns
   */
  detectGriefStage(message) {
    const lower = message.toLowerCase();
    let scores = {};

    for (const [stage, patterns] of Object.entries(this.griefStages)) {
      scores[stage] = patterns.filter(p => lower.includes(p)).length;
    }

    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return null;

    return Object.keys(scores).find(key => scores[key] === maxScore);
  }

  /**
   * Calculate stress level from multiple factors
   */
  async calculateStressLevel(familyMemberId, message, metadata) {
    // Language stress indicators
    const stressWords = ['overwhelmed', 'exhausted', 'can\'t', 'too much', 'breaking', 'falling apart'];
    const languageStress = stressWords.filter(w => message.toLowerCase().includes(w)).length / stressWords.length;

    // Response time stress (faster = more stressed)
    const timeStress = metadata.response_time ? Math.min(1, 1000 / metadata.response_time) : 0.5;

    // Message length stress (shorter = more stressed)
    const lengthStress = message.length < 20 ? 0.8 : message.length < 50 ? 0.5 : 0.2;

    // Frequency stress (too many or too few messages)
    const frequency = await this.getInteractionFrequency(familyMemberId);
    const frequencyStress = frequency > 20 ? 0.7 : frequency < 2 ? 0.6 : 0.3;

    // Weighted average
    return (languageStress * 0.4 + timeStress * 0.2 + lengthStress * 0.2 + frequencyStress * 0.2);
  }

  /**
   * Assess caregiver burnout
   */
  async assessBurnout(familyMemberId) {
    const { data: wellness } = await this.supabase
      .from('caregiver_wellness')
      .select('*')
      .eq('family_member_id', familyMemberId)
      .single();

    if (!wellness) {
      // Create initial assessment
      await this.supabase
        .from('caregiver_wellness')
        .insert({
          family_member_id: familyMemberId,
          exhaustion_score: 0.3,
          detachment_score: 0.2,
          self_care_frequency: 0.5,
          support_network_strength: 0.5
        });
      return { level: 'unknown', needs_assessment: true };
    }

    const burnoutScore = (wellness.exhaustion_score + wellness.detachment_score) / 2;

    if (burnoutScore > 0.8) {
      return {
        level: 'critical',
        interventions: ['immediate_respite', 'crisis_support', 'counseling'],
        message: 'You\'ve been carrying so much. It\'s time to let us support you too.'
      };
    } else if (burnoutScore > 0.6) {
      return {
        level: 'high',
        interventions: ['support_group', 'respite_planning'],
        message: 'Caring for yourself isn\'t selfish - it\'s necessary.'
      };
    } else if (burnoutScore > 0.4) {
      return {
        level: 'moderate',
        interventions: ['preventive_support'],
        message: 'Remember to take breaks. Your wellbeing matters too.'
      };
    }

    return { level: 'low', message: 'You\'re doing well. Keep taking care of yourself.' };
  }

  /**
   * Create proactive care insights
   */
  async generateProactiveInsights(patientId, familyMemberId) {
    const insights = [];

    // Get recent patterns
    const { data: events } = await this.supabase
      .from('care_events')
      .select('*')
      .eq('patient_id', patientId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Analyze eating patterns
    const mealEvents = events?.filter(e => e.event_type === 'meal') || [];
    if (mealEvents.length > 0) {
      const recentMeals = mealEvents.slice(0, 3);
      const avgIntake = recentMeals.reduce((sum, m) => sum + (m.metadata?.percentage_eaten || 50), 0) / 3;

      if (avgIntake < 40) {
        insights.push({
          type: 'nutrition_concern',
          priority: 'high',
          message: `I've noticed ${patientId} hasn't been eating as much lately (averaging ${Math.round(avgIntake)}% of meals). This is common after procedures. Would you like some strategies that have helped other families?`,
          suggestions: ['favorite_foods', 'small_frequent_meals', 'nutritionist_consultation']
        });
      }
    }

    // Analyze mood patterns
    const moodEvents = events?.filter(e => e.event_type === 'mood') || [];
    const negativeMoods = moodEvents.filter(m => ['sad', 'anxious', 'withdrawn'].includes(m.metadata?.mood));

    if (negativeMoods.length > moodEvents.length * 0.6) {
      insights.push({
        type: 'emotional_support',
        priority: 'medium',
        message: 'The care team has noticed some emotional challenges this week. This is a normal part of the journey. Music therapy on Tuesdays has been particularly helpful.',
        suggestions: ['video_call_schedule', 'music_therapy', 'chaplain_visit']
      });
    }

    // Check for milestone moments
    const admissionDate = await this.getAdmissionDate(patientId);
    const daysSinceAdmission = Math.floor((Date.now() - new Date(admissionDate).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceAdmission % 7 === 0 && daysSinceAdmission > 0) {
      insights.push({
        type: 'milestone',
        priority: 'low',
        message: `Today marks ${daysSinceAdmission / 7} week${daysSinceAdmission > 7 ? 's' : ''} of recovery. Each day is a step forward, even when progress feels slow.`,
        celebration: true
      });
    }

    return insights;
  }

  /**
   * Map family dynamics
   */
  async mapFamilyDynamics(patientId) {
    const { data: familyMembers } = await this.supabase
      .from('family_members')
      .select('*')
      .eq('patient_id', patientId);

    const { data: interactions } = await this.supabase
      .from('interactions')
      .select('*')
      .eq('patient_id', patientId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const dynamics = {
      primary_decision_maker: null,
      emotional_support_seeker: null,
      information_gatherer: null,
      skeptic: null,
      cohesion_score: 0,
      communication_patterns: {}
    };

    // Analyze interaction patterns
    familyMembers?.forEach(member => {
      const memberInteractions = interactions?.filter(i => i.family_member_id === member.id) || [];

      // Identify roles based on interaction patterns
      const questions = memberInteractions.filter(i => i.transcript?.includes('?')).length;
      const medicalQuestions = memberInteractions.filter(i =>
        i.topics?.some(t => ['medication', 'health', 'doctor'].includes(t))
      ).length;
      const emotionalExpressions = memberInteractions.filter(i =>
        i.topics?.some(t => ['mood', 'feeling', 'worried'].includes(t))
      ).length;

      if (medicalQuestions > questions * 0.5) {
        dynamics.information_gatherer = member.id;
      }
      if (emotionalExpressions > memberInteractions.length * 0.4) {
        dynamics.emotional_support_seeker = member.id;
      }
    });

    // Calculate cohesion score
    const uniqueInteractors = new Set(interactions?.map(i => i.family_member_id));
    dynamics.cohesion_score = uniqueInteractors.size / Math.max(1, familyMembers?.length || 1);

    // Store dynamics
    await this.supabase
      .from('family_dynamics')
      .upsert({
        patient_id: patientId,
        ...dynamics,
        updated_at: new Date().toISOString()
      });

    return dynamics;
  }

  /**
   * Preserve precious memories
   */
  async captureMemory(patientId, familyMemberId, memory) {
    // Analyze memory for emotional content
    const emotionTags = this.extractEmotions(memory.content);
    const familyMentions = this.extractFamilyMentions(memory.content);

    const preserved = await this.supabase
      .from('memory_preservation')
      .insert({
        patient_id: patientId,
        family_member_id: familyMemberId,
        memory_type: memory.type || 'story',
        title: memory.title || this.generateMemoryTitle(memory.content),
        content: memory.content,
        emotion_tags: emotionTags,
        family_members_mentioned: familyMentions,
        shared_during: memory.context || 'conversation',
        lucidity_level: memory.lucidity || 'clear',
        is_precious: emotionTags.includes('love') || emotionTags.includes('joy'),
        captured_at: new Date().toISOString()
      })
      .select()
      .single();

    // Offer to create memory book
    if (preserved.data?.is_precious) {
      return {
        memory_id: preserved.data.id,
        message: 'This is a beautiful memory. Would you like me to add it to your family\'s digital memory book?',
        memory_book_eligible: true
      };
    }

    return { memory_id: preserved.data?.id };
  }

  /**
   * Calculate Hope Index
   */
  async calculateHopeIndex(patientId) {
    const { data: indicators } = await this.supabase
      .from('hope_indicators')
      .select('*')
      .eq('patient_id', patientId)
      .gte('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false });

    if (!indicators || indicators.length === 0) {
      return { score: 0.5, trajectory: 'unknown', message: 'Building hope baseline...' };
    }

    // Calculate victories and improvements
    const recentVictories = indicators.slice(0, 7).filter(i => i.improvement_percentage > 0);
    const victoryRate = recentVictories.length / 7;

    // Calculate trend
    const oldAvg = indicators.slice(14, 21).reduce((sum, i) => sum + (i.improvement_percentage || 0), 0) / 7;
    const newAvg = indicators.slice(0, 7).reduce((sum, i) => sum + (i.improvement_percentage || 0), 0) / 7;
    const trend = newAvg - oldAvg;

    // Generate hope score
    const hopeScore = Math.min(1, Math.max(0, 0.3 + victoryRate * 0.4 + (trend > 0 ? 0.3 : 0)));

    // Create hope message
    let message = '';
    if (hopeScore > 0.7) {
      message = `Wonderful progress! ${recentVictories.length} positive moments this week. ${this.getVictoryHighlight(recentVictories[0])}`;
    } else if (hopeScore > 0.4) {
      message = `Steady progress with ${recentVictories.length} bright moments. Every small step matters.`;
    } else {
      // Find something positive even in difficult times
      const bestMoment = indicators.find(i => i.improvement_percentage > 0);
      message = bestMoment
        ? `Recovery has ups and downs. Remember ${this.getDaysAgo(bestMoment.recorded_at)} when ${bestMoment.description}.`
        : 'Every journey has challenging periods. Your presence means everything.';
    }

    return {
      score: hopeScore,
      trajectory: trend > 0.1 ? 'improving' : trend < -0.1 ? 'challenging' : 'stable',
      recent_victories: recentVictories.length,
      message
    };
  }

  /**
   * Generate narrative updates that touch the heart
   */
  async createNarrativeUpdate(patientId, updateType = 'daily_story') {
    const { data: patient } = await this.supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    const { data: recentEvents } = await this.supabase
      .from('care_events')
      .select('*')
      .eq('patient_id', patientId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    const { data: memories } = await this.supabase
      .from('memory_preservation')
      .select('*')
      .eq('patient_id', patientId)
      .order('captured_at', { ascending: false })
      .limit(5);

    let narrative = '';

    switch (updateType) {
      case 'daily_story':
        narrative = await this.craftDailyStory(patient, recentEvents, memories);
        break;

      case 'memory_moment':
        narrative = await this.craftMemoryMoment(patient, memories);
        break;

      case 'milestone_celebration':
        narrative = await this.craftMilestone(patient, recentEvents);
        break;

      default:
        narrative = this.craftDefaultUpdate(patient);
    }

    // Store narrative
    await this.supabase
      .from('narrative_updates')
      .insert({
        patient_id: patientId,
        update_type: updateType,
        narrative_text: narrative,
        emotional_tone: this.analyzeNarrativeTone(narrative),
        includes_family_references: narrative.includes('family') || narrative.includes('you'),
        created_at: new Date().toISOString()
      });

    return narrative;
  }

  /**
   * Craft a daily story that feels human
   */
  async craftDailyStory(patient, events, memories) {
    const morning = events?.find(e => new Date(e.created_at).getHours() < 12);
    const therapy = events?.find(e => e.event_type === 'therapy');
    const meal = events?.find(e => e.event_type === 'meal');
    const mood = events?.find(e => e.event_type === 'mood');

    let story = `This morning, ${patient.first_name} `;

    // Morning scene
    if (morning && mood?.metadata?.mood === 'happy') {
      story += `greeted the sunrise with that familiar smile - the one you know so well. `;
    } else if (morning) {
      story += `started the day quietly, finding comfort in the morning routine. `;
    } else {
      story += `had a peaceful morning. `;
    }

    // Activity highlight
    if (therapy) {
      story += `During ${therapy.metadata?.type || 'therapy'}, ${therapy.description || 'there was good participation'}. `;
      if (therapy.metadata?.breakthrough) {
        story += `The therapist mentioned this was a real breakthrough moment. `;
      }
    }

    // Meal narrative
    if (meal && meal.metadata?.percentage_eaten > 75) {
      story += `Lunch was enjoyed today - `;
      if (meal.metadata?.favorite_dish) {
        story += `especially the ${meal.metadata.favorite_dish}. It reminded the staff of your stories about Sunday dinners. `;
      } else {
        story += `clean plate club! `;
      }
    }

    // Memory connection
    if (memories && memories.length > 0 && Math.random() > 0.5) {
      const memory = memories[0];
      story += `\n\n💭 "${memory.content.substring(0, 100)}..." - a moment shared ${this.getDaysAgo(memory.captured_at)}. `;
    }

    // Closing with hope
    story += `\n\nEvery day writes a new page in ${patient.first_name}'s story. Tomorrow holds its own promises.`;

    return story;
  }

  /**
   * Detect silence and absence patterns
   */
  async monitorSilence(familyMemberId) {
    const { data: lastInteraction } = await this.supabase
      .from('interactions')
      .select('*')
      .eq('family_member_id', familyMemberId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastInteraction) return null;

    const hoursSinceContact = (Date.now() - new Date(lastInteraction.created_at).getTime()) / (1000 * 60 * 60);

    // Get typical pattern
    const { data: historicalPattern } = await this.supabase
      .from('interactions')
      .select('created_at')
      .eq('family_member_id', familyMemberId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const typicalGap = this.calculateTypicalGap(historicalPattern);

    if (hoursSinceContact > typicalGap * 2) {
      // Unusual silence detected
      await this.supabase
        .from('communication_gaps')
        .insert({
          family_member_id: familyMemberId,
          last_interaction: lastInteraction.created_at,
          typical_frequency_hours: typicalGap,
          current_gap_hours: hoursSinceContact,
          detected_at: new Date().toISOString()
        });

      return {
        detected: true,
        message: this.generateSilenceCheckIn(hoursSinceContact, typicalGap),
        priority: hoursSinceContact > typicalGap * 3 ? 'high' : 'medium'
      };
    }

    return { detected: false };
  }

  /**
   * Generate culturally aware responses
   */
  async applyCulturalIntelligence(response, familyId) {
    const { data: cultural } = await this.supabase
      .from('cultural_preferences')
      .select('*')
      .eq('family_id', familyId)
      .single();

    if (!cultural) return response;

    let adapted = response;

    // Apply formality
    if (cultural.formality_level === 'formal') {
      adapted = adapted.replace(/Hi |Hey /g, 'Good day ');
      adapted = adapted.replace(/your mom/g, 'your mother');
      adapted = adapted.replace(/your dad/g, 'your father');
    }

    // Apply directness preference
    if (cultural.directness_preference === 'indirect') {
      adapted = this.softenDirectStatements(adapted);
    }

    // Add spiritual elements if appropriate
    if (cultural.faith_tradition) {
      const spiritualAdditions = {
        'Christian': '\n\n🙏 "Cast all your anxiety on Him because He cares for you." - 1 Peter 5:7',
        'Jewish': '\n\n🕊️ May you find comfort in community and tradition.',
        'Muslim': '\n\n☪️ "Indeed, with hardship comes ease." - Quran 94:6',
        'Buddhist': '\n\n☸️ May you find peace in this moment.',
        'Hindu': '\n\n🕉️ May you find strength in dharma.'
      };

      if (spiritualAdditions[cultural.faith_tradition]) {
        adapted += spiritualAdditions[cultural.faith_tradition];
      }
    }

    return adapted;
  }

  // === Helper Functions ===

  extractEmotions(text) {
    const emotions = [];
    const emotionMap = {
      love: ['love', 'adore', 'cherish', 'dear'],
      joy: ['happy', 'joy', 'laugh', 'smile', 'wonderful'],
      sadness: ['sad', 'cry', 'tears', 'miss'],
      fear: ['afraid', 'scared', 'worried', 'anxious'],
      gratitude: ['thank', 'grateful', 'appreciate', 'blessed']
    };

    const lower = text.toLowerCase();
    for (const [emotion, keywords] of Object.entries(emotionMap)) {
      if (keywords.some(k => lower.includes(k))) {
        emotions.push(emotion);
      }
    }

    return emotions;
  }

  extractFamilyMentions(text) {
    const familyTerms = ['daughter', 'son', 'wife', 'husband', 'grandchild', 'sister', 'brother', 'mother', 'father'];
    const lower = text.toLowerCase();
    return familyTerms.filter(term => lower.includes(term));
  }

  generateMemoryTitle(content) {
    const words = content.split(' ').slice(0, 5).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  }

  getVictoryHighlight(indicator) {
    if (!indicator) return 'Progress continues.';
    return `${indicator.description} showed ${Math.round(indicator.improvement_percentage)}% improvement!`;
  }

  getDaysAgo(date) {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'last week';
    return `${Math.floor(days / 7)} weeks ago`;
  }

  calculateEmotionalValence(text) {
    const positive = ['good', 'happy', 'better', 'improving', 'wonderful', 'blessed', 'grateful'].filter(w => text.toLowerCase().includes(w)).length;
    const negative = ['bad', 'worse', 'sad', 'angry', 'frustrated', 'worried', 'scared'].filter(w => text.toLowerCase().includes(w)).length;

    if (positive + negative === 0) return 0;
    return (positive - negative) / (positive + negative);
  }

  calculateArousal(text, metadata) {
    const exclamations = (text.match(/!/g) || []).length;
    const questions = (text.match(/\?/g) || []).length;
    const capitals = (text.match(/[A-Z]/g) || []).length / text.length;

    return Math.min(1, (exclamations * 0.3 + questions * 0.2 + capitals * 0.5));
  }

  async getMessageLengthTrend(familyMemberId) {
    const { data: recent } = await this.supabase
      .from('interactions')
      .select('transcript')
      .eq('family_member_id', familyMemberId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!recent || recent.length < 3) return 'stable';

    const lengths = recent.map(i => i.transcript?.length || 0);
    const firstHalf = lengths.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const secondHalf = lengths.slice(5).reduce((a, b) => a + b, 0) / Math.min(5, lengths.length - 5);

    if (firstHalf > secondHalf * 1.3) return 'decreasing';
    if (firstHalf < secondHalf * 0.7) return 'increasing';
    return 'stable';
  }

  async getInteractionFrequency(familyMemberId) {
    const { data: count } = await this.supabase
      .from('interactions')
      .select('id', { count: 'exact' })
      .eq('family_member_id', familyMemberId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    return count?.length || 0;
  }

  async getAdmissionDate(patientId) {
    const { data: patient } = await this.supabase
      .from('patients')
      .select('admission_date')
      .eq('id', patientId)
      .single();

    return patient?.admission_date || new Date().toISOString();
  }

  calculateTypicalGap(interactions) {
    if (!interactions || interactions.length < 2) return 24; // Default to daily

    const gaps = [];
    for (let i = 1; i < interactions.length; i++) {
      const gap = (new Date(interactions[i-1].created_at) - new Date(interactions[i].created_at)) / (1000 * 60 * 60);
      gaps.push(gap);
    }

    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  generateSilenceCheckIn(currentGap, typicalGap) {
    if (currentGap > typicalGap * 3) {
      return 'I noticed we haven\'t heard from you in a while. Sometimes the weight of caring becomes too heavy for words. I\'m here whenever you\'re ready.';
    } else {
      return 'You\'ve been quieter than usual. Everything okay? Remember, taking space is perfectly normal. Your loved one is in good hands.';
    }
  }

  softenDirectStatements(text) {
    return text
      .replace(/You should/g, 'You might consider')
      .replace(/You need to/g, 'It might be helpful to')
      .replace(/must/g, 'could')
      .replace(/Do this/g, 'One option is to');
  }

  analyzeNarrativeTone(narrative) {
    const positive = ['smile', 'joy', 'happy', 'wonderful', 'blessed', 'progress', 'better'].some(w => narrative.toLowerCase().includes(w));
    const negative = ['difficult', 'challenge', 'struggle', 'setback'].some(w => narrative.toLowerCase().includes(w));

    if (positive && !negative) return 'hopeful';
    if (negative && !positive) return 'realistic';
    if (positive && negative) return 'balanced';
    return 'neutral';
  }
}

module.exports = EmotionalIntelligence;