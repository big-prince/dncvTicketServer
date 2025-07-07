// Authentication middleware for admin routes
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access'
    });
  }

  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Rate limiting middleware (basic implementation)
const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const clientIp = req.ip;
    const now = Date.now();

    if (!requests.has(clientIp)) {
      requests.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const clientData = requests.get(clientIp);

    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
      return next();
    }

    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    }

    clientData.count++;
    next();
  };
};

// CORS middleware
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    "https://dncvticket.netlify.app",
    process.env.FRONTEND_URL
  ].filter(Boolean);

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
};

module.exports = {
  authenticateAdmin,
  requestLogger,
  errorHandler,
  rateLimiter,
  corsMiddleware
};
