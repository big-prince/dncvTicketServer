const express = require('express');
const AdminController = require('../controllers/adminController');

const router = express.Router();

// Simple authentication middleware (in production, use proper auth)
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

// Get dashboard statistics
router.get('/stats', AdminController.getDashboardStats);

// Get all sales with pagination and filters
router.get('/sales', AdminController.getAllSales);

// Get single sale details
router.get('/sales/:saleId', AdminController.getSaleDetails);

// Update sale status
router.patch('/sales/:saleId/status', AdminController.updateSaleStatus);

// Export sales data
router.get('/export', AdminController.exportSales);

// Get ticket verification logs
router.get('/verification-logs', AdminController.getVerificationLogs);

module.exports = router;
