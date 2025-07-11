const express = require('express');
const AdminController = require('../controllers/adminController');
const dbIndexManager = require('../utils/dbIndexManager');

const router = express.Router();

// Simple authentication middleware (legacy - for backward compatibility)
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

// Apply authentication to all admin routes
router.use(authenticateAdmin);

// Legacy routes for backward compatibility
router.get('/stats', AdminController.getSystemStats);

// Redirect to new admin endpoints
router.get('/dashboard', (req, res) => {
  res.json({
    success: false,
    message: 'This endpoint has been moved to /api/admin/dashboard with JWT authentication',
    newEndpoint: '/api/admin/dashboard'
  });
});

router.get('/sales', (req, res) => {
  res.json({
    success: false,
    message: 'This endpoint has been moved to /api/admin/payments/pending with JWT authentication',
    newEndpoint: '/api/admin/payments/pending'
  });
});

router.get('/analytics', (req, res) => {
  res.json({
    success: false,
    message: 'This endpoint has been moved to /api/admin/analytics with JWT authentication',
    newEndpoint: '/api/admin/analytics'
  });
});

// Database Index Management Routes

// Get index status
router.get('/db/indexes/status', authenticateAdmin, async (req, res) => {
  try {
    const status = await dbIndexManager.getIndexStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get index status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Validate indexes
router.get('/db/indexes/validate', authenticateAdmin, async (req, res) => {
  try {
    const validation = await dbIndexManager.validateIndexes();
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate indexes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Reinitialize indexes
router.post('/db/indexes/reinitialize', authenticateAdmin, async (req, res) => {
  try {
    await dbIndexManager.init();
    res.json({
      success: true,
      message: 'Indexes reinitialized successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reinitialize indexes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
