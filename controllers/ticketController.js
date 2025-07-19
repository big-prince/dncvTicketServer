const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const TicketSale = require('../models/TicketSale');
const { sendTicketEmail } = require('../utils/emailService');

class TicketController {
  // Get all ticket types and availability
  static async getTicketTypes(req, res) {
    try {
      const ticketTypes = [
        {
          id: 'regular',
          name: 'Regular Ticket',
          price: 5000,
          description: 'Standard seating with great view of the stage',
          available: 150,
          maxPerPurchase: 5,
          features: [
            'General admission seating',
            'Access to main auditorium',
            'Concert program included',
            'Parking available'
          ]
        },
        {
          id: 'student',
          name: 'Student Ticket',
          price: 2500,
          description: 'Special discounted price for students with valid ID',
          available: 50,
          maxPerPurchase: 2,
          features: [
            'Student pricing (50% off)',
            'Valid student ID required',
            'General admission seating',
            'Concert program included'
          ]
        },
        {
          id: 'vip-single',
          name: 'VIP Single',
          price: 15000,
          description: 'Premium seating with exclusive perks',
          available: 30,
          maxPerPurchase: 2,
          features: [
            'Front row premium seating',
            'Complimentary refreshments',
            'Meet & greet opportunity',
            'Exclusive VIP lounge access',
            'Premium concert program'
          ]
        },
        {
          id: 'vip-couple',
          name: 'VIP Couple',
          price: 25000,
          description: 'Perfect for couples seeking a premium experience',
          available: 20,
          maxPerPurchase: 1,
          features: [
            'Two premium seats together',
            'Complimentary champagne',
            'Meet & greet opportunity',
            'Exclusive VIP lounge access',
            'Premium concert programs (2)',
            'Special couple photo opportunity'
          ]
        },
        {
          id: 'table',
          name: 'Table Booking',
          price: 50000,
          description: 'Reserved table for groups with premium service',
          available: 10,
          maxPerPurchase: 1,
          features: [
            'Reserved table for up to 6 people',
            'Premium bottle service',
            'Dedicated server',
            'Best viewing position',
            'Complimentary appetizers',
            'Group photo with artists'
          ]
        }
      ];

      // Get sold counts from database
      const soldCounts = await TicketSale.aggregate([
        { $match: { 'paymentInfo.status': 'completed' } },
        {
          $group: {
            _id: '$ticketInfo.type',
            sold: { $sum: '$ticketInfo.quantity' }
          }
        }
      ]);

      // Update availability based on sold tickets
      const soldMap = soldCounts.reduce((acc, item) => {
        acc[item._id] = item.sold;
        return acc;
      }, {});

      const updatedTicketTypes = ticketTypes.map(ticket => ({
        ...ticket,
        sold: soldMap[ticket.id] || 0,
        available: Math.max(0, ticket.available - (soldMap[ticket.id] || 0))
      }));

      res.json({
        success: true,
        data: updatedTicketTypes
      });
    } catch (error) {
      console.error('Error fetching ticket types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch ticket types',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Create a new ticket purchase
  static async createPurchase(req, res) {
    try {
      const {
        customerInfo,
        ticketType,
        quantity,
        paymentReference
      } = req.body;

      // Validate required fields
      const validationError = TicketController._validatePurchaseData({
        customerInfo,
        ticketType,
        quantity,
        paymentReference
      });

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError
        });
      }

      // Get ticket type details
      const ticketTypes = {
        'regular': { name: 'Regular Ticket', price: 5000 },
        'student': { name: 'Student Ticket', price: 2500 },
        'vip-single': { name: 'VIP Single', price: 15000 },
        'vip-couple': { name: 'VIP Couple', price: 25000 },
        'table': { name: 'Table Booking', price: 50000 }
      };

      const selectedTicket = ticketTypes[ticketType];
      if (!selectedTicket) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ticket type'
        });
      }

      // Check availability
      const availabilityCheck = await TicketController._checkAvailability(ticketType, quantity);
      if (!availabilityCheck.available) {
        return res.status(400).json({
          success: false,
          message: availabilityCheck.message
        });
      }

      const totalAmount = selectedTicket.price * quantity;

      // Generate individual tickets with QR codes
      const tickets = await TicketController._generateTickets(
        quantity,
        customerInfo,
        ticketType
      );

      // Generate a custom readable ticket ID using customer's firstName + 4 random digits
      const firstName = customerInfo.firstName.toUpperCase();
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const customTicketId = `${firstName}${randomNum}`;

      // Create ticket sale record
      const ticketSale = new TicketSale({
        customerInfo,
        ticketInfo: {
          type: ticketType,
          typeName: selectedTicket.name,
          quantity,
          unitPrice: selectedTicket.price,
          totalAmount
        },
        paymentInfo: {
          reference: paymentReference,
          amount: totalAmount,
          status: 'pending' // Will be updated by payment webhook
        },
        ticketId: customTicketId, // Add custom ticket ID for easier verification
        tickets
      });

      await ticketSale.save();

      res.status(201).json({
        success: true,
        message: 'Ticket purchase created successfully',
        data: {
          saleId: ticketSale._id,
          paymentReference,
          totalAmount,
          ticketCount: quantity
        }
      });

    } catch (error) {
      console.error('Error creating ticket purchase:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create ticket purchase',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get ticket details by reference
  static async getTicketDetails(req, res) {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Payment reference is required'
        });
      }

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      res.json({
        success: true,
        data: ticketSale
      });

    } catch (error) {
      console.error('Error fetching ticket details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch ticket details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Verify a ticket by QR code
  static async verifyTicket(req, res) {
    try {
      const { ticketId, verifiedBy } = req.body;

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          message: 'Ticket ID is required'
        });
      }

      // First try finding by direct ticket ID match
      let ticketSale = await TicketSale.findOne({
        'tickets.ticketId': ticketId,
        'paymentInfo.status': 'completed'
      });

      // If not found, try finding by custom ticket ID format
      if (!ticketSale) {
        // Also try finding by the ticketId field directly (for custom formatted IDs)
        ticketSale = await TicketSale.findOne({
          'ticketId': ticketId,
          'paymentInfo.status': 'completed'
        });
      }

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Invalid ticket or payment not completed'
        });
      }

      // Check if we're dealing with a custom ticket ID or UUID in tickets array
      const ticket = ticketSale.tickets ?
        ticketSale.tickets.find(t => t.ticketId === ticketId) :
        { ticketId: ticketSale.ticketId, isUsed: ticketSale.isUsed || false };

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found in the database'
        });
      }

      if (ticket.isUsed) {
        return res.status(400).json({
          success: false,
          message: 'Ticket has already been used',
          data: {
            usedAt: ticket.usedAt,
            verifiedBy: ticket.verifiedBy
          }
        });
      }

      // Mark ticket as used
      ticket.isUsed = true;
      ticket.usedAt = new Date();
      ticket.verifiedBy = verifiedBy || 'System';

      // Handle both array-based tickets and direct ticketId
      if (ticketSale.tickets) {
        await ticketSale.save();
      } else {
        ticketSale.isUsed = true;
        ticketSale.usedAt = new Date();
        ticketSale.verifiedBy = verifiedBy || 'System';
        await ticketSale.save();
      }

      res.json({
        success: true,
        message: 'Ticket verified successfully',
        data: {
          ticketId: ticket.ticketId,
          customerName: `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`,
          ticketType: ticketSale.ticketInfo.typeName,
          quantity: ticketSale.ticketInfo.quantity,
          verifiedAt: ticket.usedAt,
          verifiedBy: ticket.verifiedBy
        }
      });

    } catch (error) {
      console.error('Error verifying ticket:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify ticket',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Private helper methods
  static _validatePurchaseData({ customerInfo, ticketType, quantity, paymentReference }) {
    if (!customerInfo) return 'Customer information is required';
    if (!customerInfo.firstName) return 'First name is required';
    if (!customerInfo.lastName) return 'Last name is required';
    if (!customerInfo.email) return 'Email is required';
    if (!customerInfo.phone) return 'Phone number is required';
    if (!ticketType) return 'Ticket type is required';
    if (!quantity || quantity < 1) return 'Valid quantity is required';
    if (!paymentReference) return 'Payment reference is required';

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerInfo.email)) {
      return 'Valid email address is required';
    }

    return null;
  }

  static async _checkAvailability(ticketType, quantity) {
    try {
      const soldCount = await TicketSale.aggregate([
        {
          $match: {
            'ticketInfo.type': ticketType,
            'paymentInfo.status': 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$ticketInfo.quantity' }
          }
        }
      ]);

      const totalSold = soldCount.length > 0 ? soldCount[0].totalSold : 0;

      // Define max availability for each ticket type
      const maxAvailability = {
        'regular': 150,
        'student': 50,
        'vip-single': 30,
        'vip-couple': 20,
        'table': 10
      };

      const available = maxAvailability[ticketType] - totalSold;

      if (available < quantity) {
        return {
          available: false,
          message: `Only ${available} tickets available for ${ticketType}`
        };
      }

      return { available: true };
    } catch (error) {
      console.error('Error checking availability:', error);
      return {
        available: false,
        message: 'Unable to check ticket availability'
      };
    }
  }

  static async _generateTickets(quantity, customerInfo, ticketType) {
    const tickets = [];

    for (let i = 0; i < quantity; i++) {
      const ticketId = uuidv4();

      // Generate a custom readable ticket ID using customer's firstName + 4 random digits for each ticket
      const firstName = customerInfo.firstName.toUpperCase();
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const customTicketId = `${firstName}${randomNum}`;

      const qrCodeData = JSON.stringify({
        ticketId: customTicketId, // Use the custom ticket ID for easier scanning
        standardTicketId: ticketId, // Keep the UUID as a backup
        customerEmail: customerInfo.email,
        customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
        ticketType,
        eventDate: '2025-09-28',
        eventTime: '17:00',
        venue: 'Oasis Event Centre, Port Harcourt',
        generatedAt: new Date().toISOString()
      });

      const qrCode = await QRCode.toDataURL(qrCodeData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      tickets.push({
        ticketId: customTicketId, // Use the custom ticket ID for easier scanning
        standardTicketId: ticketId, // Keep the UUID as a backup
        qrCode,
        isUsed: false,
        generatedAt: new Date()
      });
    }

    return tickets;
  }
}

module.exports = TicketController;
