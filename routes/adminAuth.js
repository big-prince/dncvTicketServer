const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticateToken, requirePermission, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', AdminController.loginValidation, AdminController.login);

// Protected routes (require authentication)
router.use(authenticateToken);

// Dashboard routes
router.get('/dashboard', AdminController.getDashboard);
router.get('/profile', AdminController.getProfile);

// Payment management routes
router.get('/payments/pending', AdminController.getPendingPayments);
router.post('/payments/:reference/approve', requirePermission('approvePayments'), AdminController.approvePayment);
router.post('/payments/:reference/reject', requirePermission('rejectPayments'), AdminController.rejectPayment);

// Analytics routes
router.get('/analytics', requirePermission('viewAnalytics'), AdminController.getAnalytics);

// Super admin routes
router.get('/admins', requireRole('super-admin'), AdminController.getAllAdmins);
router.post('/admins', requireRole('super-admin'), AdminController.createAdmin);
router.patch('/admins/:adminId', requireRole('super-admin'), AdminController.updateAdmin);
router.delete('/admins/:adminId', requireRole('super-admin'), AdminController.deleteAdmin);

// System management routes
router.get('/system/stats', requirePermission('systemSettings'), AdminController.getSystemStats);
router.post('/system/maintenance', requireRole('super-admin'), AdminController.toggleMaintenanceMode);

module.exports = router;
