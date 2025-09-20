# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SENTINEL is an AI-powered luxury post-operative recovery care platform that reduces readmissions by 87%. It consists of a frontend (Netlify) and backend (Railway) with sophisticated multi-agent AI orchestration, emotional intelligence, and predictive wellness capabilities.

## Development Commands

```bash
# Install dependencies
npm install

# Run locally
npm start  # Runs on port 3000 locally, PORT env var in production

# Development mode with auto-reload
npm run dev

# Run database migrations
node run-migrations.js  # Runs all migrations in /migrations folder
```

## Architecture

### Key Services & Routes

- **Multi-Agent System**: `/services/advisor-intelligence.js` - Orchestrates 5 specialized AI agents
  - Guardian (Medical monitoring)
  - Companion (Emotional support)
  - Navigator (Care coordination)
  - Advocate (Insurance/billing)
  - Memory Keeper (Family updates)

- **Emotional Intelligence**: `/services/emotional-intelligence.js` - Detects grief stages, burnout, family dynamics

- **API Routes**:
  - `/api/sentinel-advisor` - Main chat interface
  - `/api/advisor/v2` - Intelligent multi-agent system
  - `/api/call-intelligence` - Twilio voice integration
  - `/api/payments` - Stripe payment processing

### Database (Supabase)

Project ID: `alkzliirqdofpygknsij`

Key tables:
- `conversation_memory` - Chat history with embeddings
- `agent_definitions` - AI agent configurations
- `emotional_states` - Grief/stress tracking
- `family_dynamics` - Relationship mapping
- `hope_indicators` - Recovery progress

### AI Stack

- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Vector Search**: pgvector extension in Supabase
- **Conversation**: Anthropic Claude (primary), OpenAI GPT-4 (fallback)
- **Voice**: Twilio + Deepgram Aura 2

### Environment Variables (Railway)

Required:
- `OPENAI_API_KEY` - For embeddings only
- `ANTHROPIC_API_KEY` - Primary conversation AI
- `SUPABASE_URL` - Database endpoint
- `SUPABASE_ANON_KEY` - Public key
- `SUPABASE_SERVICE_KEY` - Service role key
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` - Voice calls
- `DEEPGRAM_API_KEY` - Speech-to-text
- `STRIPE_SECRET_KEY` - Payments

### Frontend Integration

The frontend at `/index.html` includes an integrated advisor widget (lines 1094-1781) with:
- Floating interface with 3 tabs (Quick Actions, Chat, Voice)
- Direct connection to Railway backend
- Real-time chat with typing indicators
- Voice call initiation via Twilio

### Special Features

- **RAG Pipeline**: Semantic search using pgvector for context-aware responses
- **Proactive Care**: Detects critical moments (pre-surgery anxiety, Sunday loneliness)
- **Narrative Updates**: Generates story-based updates instead of clinical reports
- **Memory Preservation**: Captures precious moments for families

### Deployment

- **Frontend**: Netlify (sentinel-care.netlify.app)
- **Backend**: Railway (sentinel-production-ded5.up.railway.app)
- **Database**: Supabase (alkzliirqdofpygknsij.supabase.co)

Changes pushed to main branch auto-deploy to Railway. Frontend updates may need manual Netlify deploy.