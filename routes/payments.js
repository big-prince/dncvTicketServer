const express = require('express');
const PaymentController = require('../controllers/paymentController');

const router = express.Router();

// Initialize payments
router.post('/paystack/initialize', PaymentController.initializePaystack);
router.post('/opay/initialize', PaymentController.initializeOpay);
router.post('/bank-transfer', PaymentController.initiateBankTransfer);

// Transfer management
router.post('/transfer-completed', PaymentController.markTransferCompleted);
router.post('/approve-transfer', PaymentController.approveTransfer);
router.post('/reject-transfer', PaymentController.rejectTransfer);
router.get('/pending-transfers', PaymentController.getPendingTransfers);

// Webhook endpoints
router.post('/paystack/webhook', express.raw({ type: 'application/json' }), PaymentController.paystackWebhook);
router.post('/opay/webhook', express.raw({ type: 'application/json' }), PaymentController.opayWebhook);

// Verify and manage payments
router.get('/verify/:reference', PaymentController.verifyPayment);
router.get('/status/:reference', PaymentController.getPaymentStatus);

// Test email configuration
router.get('/test-email', async (req, res) => {
  try {
    const { testEmailConfig } = require('../utils/emailService');
    const isValid = await testEmailConfig();

    if (isValid) {
      res.json({
        success: true,
        message: 'Email configuration is working correctly!'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Email configuration failed. Please check your settings.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Email test failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
