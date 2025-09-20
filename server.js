const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway/production environments
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'https://sentinel-recovery.com', 'https://sentinel-care.netlify.app'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5 // limit each IP to 5 contact requests per hour
});

app.use('/api/', limiter);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Import SENTINEL Advisor routes
const sentinelAdvisor = require('./routes/sentinel-advisor');
const advisorAdmin = require('./routes/advisor-admin');

// Mount SENTINEL Advisor routes
app.use('/api/sentinel-advisor', sentinelAdvisor);
app.use('/api/advisor-admin', advisorAdmin);

// API Routes
app.post('/api/consultation', contactLimiter, async (req, res) => {
  try {
    const { name, phone, email, message, preferredTime } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    // Phone validation (basic)
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Email validation if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    // Log consultation request (in production, save to database)
    console.log('New consultation request:', {
      name,
      phone,
      email: email || 'Not provided',
      message: message || 'No message',
      preferredTime: preferredTime || 'Not specified',
      timestamp: new Date().toISOString()
    });

    // Send notification email if configured
    if (process.env.NOTIFICATION_EMAIL && process.env.SMTP_HOST) {
      const nodemailer = require('nodemailer');

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@sentinel-recovery.com',
        to: process.env.NOTIFICATION_EMAIL,
        subject: 'New SENTINEL Consultation Request',
        html: `
          <h2>New Consultation Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
          ${preferredTime ? `<p><strong>Preferred Time:</strong> ${preferredTime}</p>` : ''}
          <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
        // Don't fail the request if email fails
      }
    }

    // Send SMS notification if Twilio is configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      try {
        await client.messages.create({
          body: `New SENTINEL consultation from ${name} - ${phone}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.NOTIFICATION_PHONE || '+12154987369'
        });
      } catch (smsError) {
        console.error('SMS notification failed:', smsError);
        // Don't fail the request if SMS fails
      }
    }

    res.json({
      success: true,
      message: 'Thank you for your inquiry. We will contact you within 24 hours to schedule your private consultation.'
    });

  } catch (error) {
    console.error('Consultation request error:', error);
    res.status(500).json({
      error: 'We apologize for the inconvenience. Please call us directly at (215) 498-7369.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SENTINEL Recovery Care API',
    timestamp: new Date().toISOString()
  });
});

// Service information endpoint
app.get('/api/services', (req, res) => {
  res.json({
    services: [
      {
        category: 'Medical Excellence',
        items: [
          '24/7 Professional Monitoring',
          'Pain Management Expertise',
          'Medication Supervision',
          'Wound Care Specialists',
          'Physical Therapy Coordination'
        ]
      },
      {
        category: 'Personal Support',
        items: [
          'Mobility Assistance',
          'Daily Living Support',
          'Nutritional Excellence',
          'Companion Services',
          'Family Communication'
        ]
      },
      {
        category: 'Life Continuity',
        items: [
          'Household Management',
          'Social Engagement',
          'Appointment Coordination',
          'Recovery Milestones',
          'Independence Planning'
        ]
      }
    ]
  });
});

// Admin dashboard route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Voice chat interface route
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'sentinel-voice-chat.html'));
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`SENTINEL Backend Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;