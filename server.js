const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { requestLogger, errorHandler, corsMiddleware, rateLimiter } = require('./middleware');
const cronJobService = require('./utils/cronJobService');
const dbIndexManager = require('./utils/dbIndexManager');
const { startBufferProcessor } = require('./utils/buffer/emailBuffer');
const { emailQueue } = require('./utils/emailQueue');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for correct IP detection
app.set('trust proxy', 1);

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Rate limiting (100 requests per 15 minutes per IP)
app.use(rateLimiter(100, 15 * 60 * 1000));

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dncv-tickets', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');

    // Initialize database indexes
    await dbIndexManager.init();

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// API Routes
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/adminAuth')); // New JWT-based admin routes
app.use('/api/admin/legacy', require('./routes/admin')); // Legacy admin routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'DNCV Ticketing Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'DNCV E-Ticketing API',
    version: '1.0.0',
    endpoints: {
      tickets: {
        'GET /api/tickets/types': 'Get all ticket types and availability',
        'POST /api/tickets/purchase': 'Create a new ticket purchase',
        'GET /api/tickets/details/:reference': 'Get ticket details by payment reference',
        'POST /api/tickets/verify': 'Verify a ticket by QR code'
      },
      payments: {
        'POST /api/payments/paystack/webhook': 'Paystack webhook endpoint',
        'GET /api/payments/verify/:reference': 'Verify payment with Paystack',
        'GET /api/payments/status/:reference': 'Get payment status',
        'POST /api/payments/opay/webhook': 'OPay webhook endpoint'
      },
      admin: {
        'POST /api/admin/login': 'Admin login (returns JWT token)',
        'GET /api/admin/dashboard': 'Get dashboard statistics (requires JWT)',
        'GET /api/admin/profile': 'Get admin profile (requires JWT)',
        'GET /api/admin/payments/pending': 'Get pending payments (requires JWT)',
        'POST /api/admin/payments/:reference/approve': 'Approve payment (requires JWT)',
        'POST /api/admin/payments/:reference/reject': 'Reject payment (requires JWT)',
        'GET /api/admin/analytics': 'Get analytics data (requires JWT)',
        'GET /api/admin/admins': 'Get all admins (super-admin only)',
        'POST /api/admin/admins': 'Create admin (super-admin only)',
        'PATCH /api/admin/admins/:adminId': 'Update admin (super-admin only)',
        'DELETE /api/admin/admins/:adminId': 'Delete admin (super-admin only)',
        'GET /api/admin/system/stats': 'Get system stats (requires JWT)',
        'POST /api/admin/system/maintenance': 'Toggle maintenance mode (super-admin only)'
      }
    },
    authentication: {
      admin: 'Send Authorization header with Bearer token'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
    path: req.originalUrl
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'De Noble Choral Voices E-Ticketing System',
    status: 'Running',
    docs: '/api'
  });
});

// Global 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('📦 MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('📦 MongoDB connection closed.');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log('🎵 ================================');
      console.log('🎼 DNCV E-Ticketing Server Started');
      console.log('🎵 ================================');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
      console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
      console.log('🎵 ================================');

      // Initialize cron jobs
      cronJobService.init();

      // Start email buffer processor
      startBufferProcessor();
      console.log('📧 Email buffer processor started');

      // Initialize email queue
      emailQueue.on('job:success', (job) => {
        console.log(`✅ Email job completed: ${job.type} for ${job.data.customerInfo?.email}`);
      });

      emailQueue.on('job:failed', (job) => {
        console.log(`❌ Email job failed permanently: ${job.type} - ${job.lastError}`);
      });

      console.log('📬 Email queue processor initialized');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
