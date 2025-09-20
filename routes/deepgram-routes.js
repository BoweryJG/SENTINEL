/**
 * Deepgram Voice Routes for Sentinel
 * Handles Deepgram TTS with Aura 2 models and STT configuration
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/deepgram/config
 * Get Deepgram configuration for client
 */
router.get('/config', (req, res) => {
    if (!process.env.DEEPGRAM_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'Deepgram not configured'
        });
    }

    res.json({
        success: true,
        apiKey: process.env.DEEPGRAM_API_KEY,
        models: {
            stt: 'nova-3',
            tts: 'aura-2-odysseus-en'
        }
    });
});

/**
 * POST /api/deepgram/tts
 * Generate speech using Deepgram's Aura 2 voice models
 */
router.post('/tts', async (req, res) => {
    try {
        const { text, model = 'aura-2-odysseus-en', encoding = 'mp3' } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

        if (!process.env.DEEPGRAM_API_KEY) {
            return res.status(503).json({
                success: false,
                error: 'Deepgram TTS not configured'
            });
        }

        // Call Deepgram TTS API
        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${model}&encoding=${encoding}`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Deepgram TTS] Error:', error);
            throw new Error(`Deepgram TTS failed: ${response.status}`);
        }

        const audioBuffer = await response.buffer();

        // Set appropriate content type based on encoding
        const contentType = encoding === 'mp3' ? 'audio/mpeg' :
                           encoding === 'wav' ? 'audio/wav' :
                           encoding === 'opus' ? 'audio/opus' : 'audio/mpeg';

        res.set({
            'Content-Type': contentType,
            'Content-Length': audioBuffer.length,
            'X-TTS-Service': 'deepgram',
            'X-TTS-Model': model
        });

        return res.send(audioBuffer);

    } catch (error) {
        console.error('[Deepgram TTS] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate speech with Deepgram',
            details: error.message
        });
    }
});

/**
 * GET /api/deepgram/models
 * Get available Deepgram voice models
 */
router.get('/models', (req, res) => {
    res.json({
        success: true,
        models: {
            'aura-2': [
                {
                    id: 'aura-2-odysseus-en',
                    name: 'Odysseus',
                    language: 'English',
                    gender: 'Male',
                    description: 'Warm, engaging narrator voice',
                    characteristics: ['Warm', 'Engaging', 'Natural', 'Storytelling']
                },
                {
                    id: 'aura-2-arcas-en',
                    name: 'Arcas',
                    language: 'English',
                    gender: 'Male',
                    description: 'Confident, professional voice',
                    characteristics: ['Professional', 'Clear', 'Confident', 'Business']
                },
                {
                    id: 'aura-2-orpheus-en',
                    name: 'Orpheus',
                    language: 'English',
                    gender: 'Male',
                    description: 'Deep, authoritative voice',
                    characteristics: ['Deep', 'Authoritative', 'Strong', 'Commanding']
                },
                {
                    id: 'aura-2-asteria-en',
                    name: 'Asteria',
                    language: 'English',
                    gender: 'Female',
                    description: 'Clear, articulate voice',
                    characteristics: ['Clear', 'Articulate', 'Professional', 'Precise']
                },
                {
                    id: 'aura-2-luna-en',
                    name: 'Luna',
                    language: 'English',
                    gender: 'Female',
                    description: 'Friendly, conversational voice',
                    characteristics: ['Friendly', 'Warm', 'Conversational', 'Approachable']
                },
                {
                    id: 'aura-2-stella-en',
                    name: 'Stella',
                    language: 'English',
                    gender: 'Female',
                    description: 'Bright, energetic voice',
                    characteristics: ['Bright', 'Energetic', 'Enthusiastic', 'Dynamic']
                }
            ]
        },
        encodings: ['mp3', 'wav', 'opus', 'flac'],
        defaultModel: 'aura-2-odysseus-en',
        defaultEncoding: 'mp3',
        features: {
            realTime: true,
            streaming: true,
            customPronunciation: true,
            emotionalControl: true
        }
    });
});

/**
 * POST /api/deepgram/stream
 * Initialize streaming TTS session
 */
router.post('/stream', async (req, res) => {
    try {
        const { model = 'aura-2-odysseus-en' } = req.body;

        if (!process.env.DEEPGRAM_API_KEY) {
            return res.status(503).json({
                success: false,
                error: 'Deepgram not configured'
            });
        }

        // Return WebSocket URL for client to connect directly
        const wsUrl = `wss://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=48000`;

        res.json({
            success: true,
            wsUrl,
            token: process.env.DEEPGRAM_API_KEY,
            instructions: 'Connect WebSocket with token in header'
        });

    } catch (error) {
        console.error('[Deepgram Stream] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize stream'
        });
    }
});

module.exports = router;