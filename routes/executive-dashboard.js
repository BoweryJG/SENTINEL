const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Real-time dashboard data
router.get('/realtime', async (req, res) => {
  try {
    // Current census
    const { data: activePatients } = await supabase
      .from('patients')
      .select('id, first_name, last_name, care_level, admission_date, monthly_rate')
      .eq('status', 'active');

    // Today's metrics
    const today = new Date().toISOString().split('T')[0];
    const { data: todayMetrics } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('metric_date', today)
      .single();

    // Recent calls (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCalls } = await supabase
      .from('calls')
      .select('*, family_members(first_name, last_name)')
      .gte('started_at', yesterday)
      .order('started_at', { ascending: false })
      .limit(10);

    // Revenue today
    const { data: todayRevenue } = await supabase
      .from('transactions')
      .select('amount')
      .gte('processed_at', today)
      .eq('status', 'succeeded');

    const dailyRevenue = todayRevenue?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;

    // Active leads
    const { data: activeLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('lead_status', 'active')
      .order('lead_score', { ascending: false })
      .limit(5);

    // Critical alerts
    const { data: alerts } = await supabase
      .from('alerts')
      .select('*, patients(first_name, last_name)')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(5);

    // Occupancy calculation
    const totalBeds = 50; // Configure based on facility
    const occupancyRate = (activePatients.length / totalBeds * 100).toFixed(1);

    // Monthly recurring revenue
    const monthlyRevenue = activePatients.reduce((sum, p) => sum + parseFloat(p.monthly_rate || 0), 0);

    res.json({
      timestamp: new Date().toISOString(),
      census: {
        current: activePatients.length,
        capacity: totalBeds,
        occupancyRate: parseFloat(occupancyRate),
        availableBeds: totalBeds - activePatients.length
      },
      financial: {
        dailyRevenue,
        monthlyRecurring: monthlyRevenue,
        annualizedRevenue: monthlyRevenue * 12,
        averageMonthlyRate: activePatients.length > 0 ?
          (monthlyRevenue / activePatients.length).toFixed(2) : 0
      },
      operations: {
        callsToday: todayMetrics?.total_calls || 0,
        averageCallDuration: todayMetrics?.average_call_duration_seconds || 0,
        newAdmissionsToday: todayMetrics?.new_admissions || 0,
        dischargestoday: todayMetrics?.discharges || 0
      },
      recentCalls: recentCalls?.map(call => ({
        time: call.started_at,
        caller: call.family_members ?
          `${call.family_members.first_name} ${call.family_members.last_name}` :
          call.phone_number,
        duration: call.duration_seconds,
        sentiment: call.sentiment,
        requiresCallback: call.requires_callback
      })),
      activeLeads: activeLeads?.map(lead => ({
        name: `${lead.first_name} ${lead.last_name}`,
        organization: lead.organization,
        score: lead.lead_score,
        nextFollowup: lead.next_followup_date
      })),
      alerts: alerts?.map(alert => ({
        severity: alert.severity,
        patient: alert.patients ?
          `${alert.patients.first_name} ${alert.patients.last_name}` :
          'General',
        title: alert.title,
        created: alert.created_at
      })),
      patients: activePatients.map(p => ({
        name: `${p.first_name} ${p.last_name}`,
        careLevel: p.care_level,
        admissionDate: p.admission_date,
        monthlyRate: p.monthly_rate
      }))
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Financial analytics
router.get('/financial-analytics', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString();

    // Revenue by day
    const { data: dailyRevenue } = await supabase
      .from('transactions')
      .select('processed_at, amount')
      .gte('processed_at', startDate)
      .eq('status', 'succeeded')
      .order('processed_at');

    // Group by day
    const revenueByDay = {};
    dailyRevenue?.forEach(t => {
      const day = t.processed_at.split('T')[0];
      revenueByDay[day] = (revenueByDay[day] || 0) + parseFloat(t.amount);
    });

    // Outstanding receivables
    const { data: outstanding } = await supabase
      .from('invoices')
      .select('patient_id, amount_due, due_date, patients(first_name, last_name)')
      .in('status', ['sent', 'overdue'])
      .order('due_date');

    // Payment methods breakdown
    const { data: paymentAccounts } = await supabase
      .from('payment_accounts')
      .select('payment_method_type')
      .eq('account_status', 'active');

    const paymentMethods = {};
    paymentAccounts?.forEach(pa => {
      const method = pa.payment_method_type || 'unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });

    // Collection rate
    const { data: invoiced } = await supabase
      .from('invoices')
      .select('total_amount, amount_paid')
      .gte('invoice_date', startDate);

    const totalInvoiced = invoiced?.reduce((sum, i) => sum + parseFloat(i.total_amount), 0) || 0;
    const totalPaid = invoiced?.reduce((sum, i) => sum + parseFloat(i.amount_paid), 0) || 0;
    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced * 100).toFixed(1) : 0;

    res.json({
      revenueByDay: Object.entries(revenueByDay).map(([date, amount]) => ({ date, amount })),
      totalRevenue: Object.values(revenueByDay).reduce((sum, amount) => sum + amount, 0),
      averageDailyRevenue: Object.values(revenueByDay).length > 0 ?
        Object.values(revenueByDay).reduce((sum, amount) => sum + amount, 0) / Object.values(revenueByDay).length : 0,
      outstandingReceivables: {
        total: outstanding?.reduce((sum, i) => sum + parseFloat(i.amount_due), 0) || 0,
        count: outstanding?.length || 0,
        details: outstanding?.map(i => ({
          patient: `${i.patients.first_name} ${i.patients.last_name}`,
          amount: i.amount_due,
          dueDate: i.due_date,
          daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(i.due_date)) / (24 * 60 * 60 * 1000)))
        }))
      },
      paymentMethods,
      collectionRate: parseFloat(collectionRate)
    });

  } catch (error) {
    console.error('Financial analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Operational metrics
router.get('/operational-metrics', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get daily metrics for period
    const { data: metrics } = await supabase
      .from('daily_metrics')
      .select('*')
      .gte('metric_date', startDate)
      .order('metric_date');

    // Care events by type
    const { data: careEvents } = await supabase
      .from('care_events')
      .select('event_type, severity')
      .gte('occurred_at', startDate);

    const eventsByType = {};
    const eventsBySeverity = {};
    careEvents?.forEach(event => {
      eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    // Staff performance (mock data - would come from staff table in production)
    const staffPerformance = {
      averageResponseTime: 8.5, // minutes
      tasksCompleted: 245,
      patientSatisfaction: 4.7, // out of 5
    };

    // Call patterns
    const { data: calls } = await supabase
      .from('calls')
      .select('started_at, duration_seconds, sentiment')
      .gte('started_at', startDate);

    // Group calls by hour of day
    const callsByHour = {};
    calls?.forEach(call => {
      const hour = new Date(call.started_at).getHours();
      callsByHour[hour] = (callsByHour[hour] || 0) + 1;
    });

    // Calculate average metrics
    const avgOccupancy = metrics?.reduce((sum, m) => sum + (m.occupancy_rate || 0), 0) / (metrics?.length || 1);
    const avgCallDuration = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / (calls?.length || 1);

    res.json({
      metrics: metrics?.map(m => ({
        date: m.metric_date,
        occupancy: m.occupancy_rate,
        calls: m.total_calls,
        admissions: m.new_admissions,
        discharges: m.discharges
      })),
      averages: {
        occupancyRate: avgOccupancy.toFixed(1),
        callDuration: Math.round(avgCallDuration),
        dailyCalls: (calls?.length || 0) / parseInt(period),
        responseTime: staffPerformance.averageResponseTime
      },
      careEvents: {
        byType: eventsByType,
        bySeverity: eventsBySeverity,
        total: careEvents?.length || 0
      },
      callPatterns: {
        byHour: Object.entries(callsByHour).map(([hour, count]) => ({
          hour: parseInt(hour),
          count
        })).sort((a, b) => a.hour - b.hour),
        totalCalls: calls?.length || 0,
        sentimentBreakdown: {
          positive: calls?.filter(c => c.sentiment === 'positive').length || 0,
          neutral: calls?.filter(c => c.sentiment === 'neutral').length || 0,
          negative: calls?.filter(c => c.sentiment === 'negative').length || 0,
          urgent: calls?.filter(c => c.sentiment === 'urgent').length || 0
        }
      },
      staffPerformance
    });

  } catch (error) {
    console.error('Operational metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lead pipeline analytics
router.get('/lead-analytics', async (req, res) => {
  try {
    // Get all leads
    const { data: leads } = await supabase
      .from('leads')
      .select('*, outreach_campaigns(campaign_name)');

    // Group by status
    const leadsByStatus = {};
    const leadsBySource = {};
    const leadsByCampaign = {};

    leads?.forEach(lead => {
      leadsByStatus[lead.lead_status] = (leadsByStatus[lead.lead_status] || 0) + 1;
      leadsBySource[lead.lead_source] = (leadsBySource[lead.lead_source] || 0) + 1;
      if (lead.outreach_campaigns?.campaign_name) {
        leadsByCampaign[lead.outreach_campaigns.campaign_name] =
          (leadsByCampaign[lead.outreach_campaigns.campaign_name] || 0) + 1;
      }
    });

    // Conversion funnel
    const funnel = {
      totalLeads: leads?.length || 0,
      contacted: leads?.filter(l => ['contacted', 'qualified', 'tour_scheduled', 'converted'].includes(l.lead_status)).length || 0,
      qualified: leads?.filter(l => ['qualified', 'tour_scheduled', 'converted'].includes(l.lead_status)).length || 0,
      tourScheduled: leads?.filter(l => ['tour_scheduled', 'converted'].includes(l.lead_status)).length || 0,
      converted: leads?.filter(l => l.converted_to_patient_id).length || 0
    };

    // Calculate conversion rates
    const conversionRates = {
      contactedToQualified: funnel.contacted > 0 ? (funnel.qualified / funnel.contacted * 100).toFixed(1) : 0,
      qualifiedToTour: funnel.qualified > 0 ? (funnel.tourScheduled / funnel.qualified * 100).toFixed(1) : 0,
      tourToConverted: funnel.tourScheduled > 0 ? (funnel.converted / funnel.tourScheduled * 100).toFixed(1) : 0,
      overall: funnel.totalLeads > 0 ? (funnel.converted / funnel.totalLeads * 100).toFixed(1) : 0
    };

    // Hot leads (high score, follow-up needed)
    const today = new Date().toISOString().split('T')[0];
    const hotLeads = leads?.filter(l =>
      l.lead_score >= 70 &&
      l.lead_status !== 'converted' &&
      l.next_followup_date <= today
    ).map(l => ({
      name: `${l.first_name} ${l.last_name}`,
      organization: l.organization,
      score: l.lead_score,
      daysInPipeline: Math.floor((Date.now() - new Date(l.created_at)) / (24 * 60 * 60 * 1000)),
      assignedTo: l.assigned_to
    }));

    res.json({
      summary: {
        totalLeads: leads?.length || 0,
        activeLeads: leads?.filter(l => l.lead_status === 'active').length || 0,
        convertedThisMonth: leads?.filter(l =>
          l.converted_date &&
          new Date(l.converted_date).getMonth() === new Date().getMonth()
        ).length || 0,
        averageLeadScore: leads?.reduce((sum, l) => sum + (l.lead_score || 0), 0) / (leads?.length || 1)
      },
      distribution: {
        byStatus: leadsByStatus,
        bySource: leadsBySource,
        byCampaign: leadsByCampaign
      },
      funnel,
      conversionRates,
      hotLeads: hotLeads?.slice(0, 10) // Top 10 hot leads
    });

  } catch (error) {
    console.error('Lead analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Outreach campaign performance
router.get('/campaign-performance', async (req, res) => {
  try {
    const { data: campaigns } = await supabase
      .from('outreach_campaigns')
      .select('*, leads(lead_status, converted_to_patient_id)')
      .order('created_at', { ascending: false });

    const campaignPerformance = campaigns?.map(campaign => {
      const leads = campaign.leads || [];
      const converted = leads.filter(l => l.converted_to_patient_id).length;
      const roi = campaign.budget_spent > 0 ?
        ((converted * 5000 - campaign.budget_spent) / campaign.budget_spent * 100).toFixed(1) : 0;

      return {
        name: campaign.campaign_name,
        type: campaign.campaign_type,
        status: campaign.status,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        metrics: {
          totalContacts: campaign.total_contacts,
          totalResponses: campaign.total_responses,
          totalConversions: converted,
          responseRate: campaign.total_contacts > 0 ?
            (campaign.total_responses / campaign.total_contacts * 100).toFixed(1) : 0,
          conversionRate: campaign.total_responses > 0 ?
            (converted / campaign.total_responses * 100).toFixed(1) : 0
        },
        budget: {
          allocated: campaign.budget_allocated,
          spent: campaign.budget_spent,
          remaining: campaign.budget_allocated - campaign.budget_spent,
          roi: parseFloat(roi),
          costPerLead: leads.length > 0 ? (campaign.budget_spent / leads.length).toFixed(2) : 0,
          costPerConversion: converted > 0 ? (campaign.budget_spent / converted).toFixed(2) : 0
        }
      };
    });

    res.json({
      campaigns: campaignPerformance,
      totals: {
        activeCampaigns: campaigns?.filter(c => c.status === 'active').length || 0,
        totalBudget: campaigns?.reduce((sum, c) => sum + (c.budget_allocated || 0), 0) || 0,
        totalSpent: campaigns?.reduce((sum, c) => sum + (c.budget_spent || 0), 0) || 0,
        totalConversions: campaignPerformance?.reduce((sum, c) => sum + c.metrics.totalConversions, 0) || 0
      }
    });

  } catch (error) {
    console.error('Campaign performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI agent performance
router.get('/ai-performance', async (req, res) => {
  try {
    const { period = '7' } = req.query;
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString();

    // Get agent interactions
    const { data: interactions } = await supabase
      .from('agent_interactions')
      .select('*, ai_agents(agent_name, agent_type)')
      .gte('created_at', startDate);

    // Group by agent
    const agentPerformance = {};
    interactions?.forEach(interaction => {
      const agentName = interaction.ai_agents?.agent_name || 'Unknown';
      if (!agentPerformance[agentName]) {
        agentPerformance[agentName] = {
          totalInteractions: 0,
          avgResponseTime: [],
          avgConfidence: [],
          escalations: 0,
          satisfactionScores: []
        };
      }

      agentPerformance[agentName].totalInteractions++;
      if (interaction.response_time_ms) {
        agentPerformance[agentName].avgResponseTime.push(interaction.response_time_ms);
      }
      if (interaction.confidence_score) {
        agentPerformance[agentName].avgConfidence.push(interaction.confidence_score);
      }
      if (interaction.escalated_to_human) {
        agentPerformance[agentName].escalations++;
      }
      if (interaction.satisfaction_rating) {
        agentPerformance[agentName].satisfactionScores.push(interaction.satisfaction_rating);
      }
    });

    // Calculate averages
    const agentMetrics = Object.entries(agentPerformance).map(([agent, data]) => ({
      agent,
      totalInteractions: data.totalInteractions,
      avgResponseTime: data.avgResponseTime.length > 0 ?
        Math.round(data.avgResponseTime.reduce((a, b) => a + b, 0) / data.avgResponseTime.length) : 0,
      avgConfidence: data.avgConfidence.length > 0 ?
        (data.avgConfidence.reduce((a, b) => a + b, 0) / data.avgConfidence.length).toFixed(2) : 0,
      escalationRate: data.totalInteractions > 0 ?
        (data.escalations / data.totalInteractions * 100).toFixed(1) : 0,
      avgSatisfaction: data.satisfactionScores.length > 0 ?
        (data.satisfactionScores.reduce((a, b) => a + b, 0) / data.satisfactionScores.length).toFixed(1) : 0
    }));

    res.json({
      agents: agentMetrics,
      summary: {
        totalInteractions: interactions?.length || 0,
        avgResponseTime: interactions?.reduce((sum, i) => sum + (i.response_time_ms || 0), 0) / (interactions?.length || 1),
        avgConfidence: (interactions?.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / (interactions?.length || 1)).toFixed(2),
        totalEscalations: interactions?.filter(i => i.escalated_to_human).length || 0,
        avgSatisfaction: (interactions?.filter(i => i.satisfaction_rating)
          .reduce((sum, i) => sum + i.satisfaction_rating, 0) /
          (interactions?.filter(i => i.satisfaction_rating).length || 1)).toFixed(1)
      }
    });

  } catch (error) {
    console.error('AI performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Predictive analytics
router.get('/predictive', async (req, res) => {
  try {
    // Get historical data for predictions
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: historicalMetrics } = await supabase
      .from('daily_metrics')
      .select('*')
      .gte('metric_date', thirtyDaysAgo)
      .order('metric_date');

    // Simple moving average for occupancy prediction
    const recentOccupancy = historicalMetrics?.slice(-7).map(m => m.occupancy_rate) || [];
    const predictedOccupancy = recentOccupancy.length > 0 ?
      (recentOccupancy.reduce((a, b) => a + b, 0) / recentOccupancy.length).toFixed(1) : 0;

    // Revenue trend
    const recentRevenue = historicalMetrics?.slice(-7).map(m => m.daily_revenue) || [];
    const avgDailyRevenue = recentRevenue.length > 0 ?
      recentRevenue.reduce((a, b) => a + b, 0) / recentRevenue.length : 0;
    const predictedMonthlyRevenue = avgDailyRevenue * 30;

    // Lead conversion prediction
    const { data: recentLeads } = await supabase
      .from('leads')
      .select('lead_score, converted_to_patient_id')
      .gte('created_at', thirtyDaysAgo);

    const conversionByScore = {
      high: { total: 0, converted: 0 },
      medium: { total: 0, converted: 0 },
      low: { total: 0, converted: 0 }
    };

    recentLeads?.forEach(lead => {
      const category = lead.lead_score >= 70 ? 'high' :
        lead.lead_score >= 40 ? 'medium' : 'low';
      conversionByScore[category].total++;
      if (lead.converted_to_patient_id) {
        conversionByScore[category].converted++;
      }
    });

    // Calculate conversion probabilities
    const conversionProbabilities = {
      high: conversionByScore.high.total > 0 ?
        (conversionByScore.high.converted / conversionByScore.high.total * 100).toFixed(1) : 0,
      medium: conversionByScore.medium.total > 0 ?
        (conversionByScore.medium.converted / conversionByScore.medium.total * 100).toFixed(1) : 0,
      low: conversionByScore.low.total > 0 ?
        (conversionByScore.low.converted / conversionByScore.low.total * 100).toFixed(1) : 0
    };

    // Risk indicators
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('amount_due')
      .eq('status', 'overdue');

    const financialRisk = overdueInvoices?.reduce((sum, i) => sum + parseFloat(i.amount_due), 0) || 0;

    res.json({
      predictions: {
        occupancy: {
          next7Days: predictedOccupancy,
          trend: recentOccupancy.length > 1 ?
            (recentOccupancy[recentOccupancy.length - 1] > recentOccupancy[0] ? 'increasing' : 'decreasing') : 'stable'
        },
        revenue: {
          next30Days: predictedMonthlyRevenue.toFixed(2),
          dailyAverage: avgDailyRevenue.toFixed(2)
        },
        leadConversion: conversionProbabilities
      },
      risks: {
        financial: {
          overdueAmount: financialRisk,
          riskLevel: financialRisk > 50000 ? 'high' : financialRisk > 20000 ? 'medium' : 'low'
        },
        operational: {
          lowOccupancy: predictedOccupancy < 70,
          highCallVolume: historicalMetrics?.slice(-1)[0]?.total_calls > 50
        }
      },
      recommendations: generateRecommendations(predictedOccupancy, financialRisk, conversionProbabilities)
    });

  } catch (error) {
    console.error('Predictive analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate recommendations
function generateRecommendations(occupancy, financialRisk, conversionRates) {
  const recommendations = [];

  if (occupancy < 75) {
    recommendations.push({
      priority: 'high',
      category: 'marketing',
      action: 'Increase marketing spend to boost occupancy',
      impact: 'Could increase monthly revenue by $' + ((85 - occupancy) * 0.01 * 5000 * 50).toFixed(0)
    });
  }

  if (financialRisk > 30000) {
    recommendations.push({
      priority: 'high',
      category: 'financial',
      action: 'Focus on collections for overdue accounts',
      impact: 'Recover $' + financialRisk.toFixed(0) + ' in outstanding receivables'
    });
  }

  if (parseFloat(conversionRates.high) < 50) {
    recommendations.push({
      priority: 'medium',
      category: 'sales',
      action: 'Improve follow-up process for high-score leads',
      impact: 'Could increase conversions by ' + (50 - parseFloat(conversionRates.high)).toFixed(0) + '%'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      category: 'general',
      action: 'All metrics are performing well. Consider expansion opportunities.',
      impact: 'Maintain current performance levels'
    });
  }

  return recommendations;
}

module.exports = router;