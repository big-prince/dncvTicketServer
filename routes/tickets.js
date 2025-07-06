const express = require('express');
const TicketController = require('../controllers/ticketController');

const router = express.Router();

// Get all ticket types and availability
router.get('/types', TicketController.getTicketTypes);

// Create a new ticket purchase
router.post('/purchase', TicketController.createPurchase);

// Get ticket details by reference
router.get('/details/:reference', TicketController.getTicketDetails);

// Verify a ticket by QR code
router.post('/verify', TicketController.verifyTicket);

module.exports = router;
