const crypto = require('crypto');
const axios = require('axios');
const TicketSale = require('../models/TicketSale');
const { sendTicketEmail, sendPaymentConfirmationEmail, sendBankTransferEmail, sendTransferCompletedEmail, sendPaymentRejectionEmail } = require('../utils/emailService');
const { addToBuffer } = require('../utils/buffer/emailBuffer');
const { sendAdminPaymentNotification, sendUrgentApprovalNotification } = require('../utils/whatsappService');

class PaymentController {
  // Handle Paystack webhook
  static async paystackWebhook(req, res) {
    try {
      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== req.headers['x-paystack-signature']) {
        return res.status(400).json({
          success: false,
          message: 'Invalid signature'
        });
      }

      const event = req.body;

      switch (event.event) {
        case 'charge.success':
          await PaymentController._handleSuccessfulPayment(event.data);
          break;
        case 'charge.failed':
          await PaymentController._handleFailedPayment(event.data);
          break;
        default:
          console.log(`Unhandled event type: ${event.event}`);
      }

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      console.error('Error processing Paystack webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Verify payment status
  static async verifyPayment(req, res) {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Payment reference is required'
        });
      }

      // Find the ticket sale
      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      // Verify with Paystack API
      const paystackResponse = await PaymentController._verifyWithPaystack(reference);

      if (!paystackResponse.success) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          data: paystackResponse.data
        });
      }

      // Update payment status if successful
      if (paystackResponse.data.status === 'success' && ticketSale.paymentInfo.status !== 'completed') {
        ticketSale.paymentInfo.status = 'completed';
        ticketSale.paymentInfo.paidAt = new Date();
        ticketSale.paymentInfo.paystackData = paystackResponse.data;

        await ticketSale.save();

        // Send ticket email
        try {
          await sendTicketEmail(ticketSale);
        } catch (emailError) {
          console.error('Error sending ticket email:', emailError);
          // Don't fail the payment verification if email fails
        }
      }

      res.json({
        success: true,
        data: {
          paymentStatus: ticketSale.paymentInfo.status,
          ticketSale: {
            id: ticketSale._id,
            customerInfo: ticketSale.customerInfo,
            ticketInfo: ticketSale.ticketInfo,
            paymentInfo: {
              reference: ticketSale.paymentInfo.reference,
              amount: ticketSale.paymentInfo.amount,
              status: ticketSale.paymentInfo.status,
              paidAt: ticketSale.paymentInfo.paidAt
            }
          }
        }
      }
      )

    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({
        success: false,
        message: 'Payment verification failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get payment status
  static async getPaymentStatus(req, res) {
    try {
      const { reference } = req.params;

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      }).select('paymentInfo customerInfo ticketInfo');

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      res.json({
        success: true,
        data: {
          reference: ticketSale.paymentInfo.reference,
          status: ticketSale.paymentInfo.status,
          amount: ticketSale.paymentInfo.amount,
          customerName: `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`,
          ticketType: ticketSale.ticketInfo.typeName,
          quantity: ticketSale.ticketInfo.quantity,
          createdAt: ticketSale.createdAt,
          paidAt: ticketSale.paymentInfo.paidAt
        }
      });

    } catch (error) {
      console.error('Error fetching payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Initialize Paystack payment
  static async initializePaystack(req, res) {
    try {
      const { ticketType, quantity, email, phone, fullName } = req.body;

      // Calculate amount (in kobo for Paystack)
      const ticketPrices = {
        'student': 2000,
        'regular': 5000,
        'vip-single': 25000,
        'vip-couple': 50000,
        'table': 200000
      };

      const amount = ticketPrices[ticketType] * quantity * 100; // Convert to kobo

      const paystackData = {
        email,
        amount,
        callback_url: `${process.env.FRONTEND_URL}/ticket-success`,
        metadata: {
          ticketType,
          quantity,
          phone,
          fullName,
          custom_fields: [
            {
              display_name: "Ticket Type",
              variable_name: "ticket_type",
              value: ticketType
            },
            {
              display_name: "Quantity",
              variable_name: "quantity",
              value: quantity.toString()
            }
          ]
        }
      };

      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        paystackData,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      res.status(200).json({
        success: true,
        data: response.data.data
      });

    } catch (error) {
      console.error('Paystack initialization error:', error);
      res.status(500).json({
        success: false,
        message: 'Payment initialization failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Initialize OPay payment
  static async initializeOpay(req, res) {
    try {
      const { ticketType, quantity, email, phone, fullName } = req.body;

      const ticketPrices = {
        'student': 2000,
        'regular': 5000,
        'vip-single': 25000,
        'vip-couple': 50000,
        'table': 200000
      };

      const amount = ticketPrices[ticketType] * quantity;
      const reference = `DNCV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const opayData = {
        reference,
        amount,
        currency: 'NGN',
        country: 'NG',
        userPhone: phone,
        userRequestIp: req.ip,
        returnUrl: `${process.env.FRONTEND_URL}/ticket-success`,
        callbackUrl: `${process.env.BACKEND_URL}/api/webhooks/opay`,
        expireAt: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
        productName: `DNCV Concert Ticket - ${ticketType}`,
        productDesc: `De Noble Choral Voices 5th Edition - ${quantity} ${ticketType} ticket(s)`,
        userInfo: {
          userEmail: email,
          userName: fullName,
          userMobile: phone
        }
      };

      // Create signature for OPay
      const signatureData = JSON.stringify(opayData);
      const signature = crypto
        .createHmac('sha512', process.env.OPAY_PRIVATE_KEY)
        .update(signatureData)
        .digest('hex');

      const response = await axios.post(
        `${process.env.OPAY_ENV === 'production' ? 'https://api.opay.ng' : 'https://sandboxapi.opay.ng'}/api/v1/international/cashier/create`,
        opayData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPAY_PUBLIC_KEY}`,
            'MerchantId': process.env.OPAY_MERCHANT_ID,
            'Content-Type': 'application/json',
            'Signature': signature
          }
        }
      );

      res.status(200).json({
        success: true,
        data: response.data.data
      });

    } catch (error) {
      console.error('OPay initialization error:', error);
      res.status(500).json({
        success: false,
        message: 'OPay payment initialization failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Handle manual bank transfer (Primary payment method)
  static async initiateBankTransfer(req, res) {
    try {
      const { ticketType, quantity, email, phone, fullName } = req.body;

      // Validate required fields
      if (!ticketType || !quantity || !email || !phone || !fullName) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      const ticketPrices = {
        'student': 2000,
        'regular': 5000,
        'vip-single': 25000,
        'vip-couple': 50000,
        'table': 200000
      };

      const amount = ticketPrices[ticketType] * quantity;

      // Generate reference: FirstName + 4 random numbers (no zeros)
      const firstName = fullName.split(' ')[0].toUpperCase();
      const randomNumbers = Array.from({ length: 4 }, () => Math.floor(Math.random() * 9) + 1).join('');
      const reference = `${firstName}${randomNumbers}`;

      // Create pending ticket sale record
      const ticketSale = new TicketSale({
        customerInfo: {
          firstName: fullName.split(' ')[0],
          lastName: fullName.split(' ').slice(1).join(' ') || '',
          email: email,
          phone: phone
        },
        ticketInfo: {
          typeId: ticketType,
          typeName: ticketType.charAt(0).toUpperCase() + ticketType.slice(1).replace('-', ' '),
          quantity: quantity,
          unitPrice: ticketPrices[ticketType],
          totalAmount: amount
        },
        paymentInfo: {
          method: 'bank_transfer',
          status: 'pending_transfer',
          reference: reference,
          amount: amount,
          currency: 'NGN'
        },
        ticketId: reference,
        qrCode: reference, // Will be generated later
        status: 'pending_payment'
      });

      await ticketSale.save();

      res.status(200).json({
        success: true,
        message: 'Payment reference generated successfully.',
        data: {
          reference,
          customerName: fullName,
          amount: amount,
          ticketType: ticketType,
          quantity: quantity
        }
      });

    } catch (error) {
      console.error('Bank transfer initiation error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to process request. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Handle OPay webhook
  static async opayWebhook(req, res) {
    try {
      const signature = req.headers['signature'];
      const computedSignature = crypto
        .createHmac('sha512', process.env.OPAY_PRIVATE_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== computedSignature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid signature'
        });
      }

      const { status, reference } = req.body;

      if (status === 'SUCCESS') {
        await PaymentController._handleSuccessfulOpayPayment(req.body);
      } else if (status === 'FAILED') {
        await PaymentController._handleFailedOpayPayment(req.body);
      }

      res.status(200).json({
        success: true,
        message: 'OPay webhook processed successfully'
      });

    } catch (error) {
      console.error('Error processing OPay webhook:', error);
      res.status(500).json({
        success: false,
        message: 'OPay webhook processing failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Mark transfer as completed by user
  static async markTransferCompleted(req, res) {
    try {
      const { reference } = req.body;
      const userIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];

      console.log(`[TRANSFER] Reference: ${reference}, IP: ${userIp}, Headers: ${JSON.stringify(req.headers)}`);

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
          message: 'Transaction not found'
        });
      }

      console.log(`[TRANSFER] Current status: ${ticketSale.paymentInfo.status}, Previous IP: ${ticketSale.paymentInfo.userIpAddress}, Previous click: ${ticketSale.paymentInfo.transferClickedAt}`);

      if (ticketSale.paymentInfo.status !== 'pending_transfer') {
        return res.status(400).json({
          success: false,
          message: 'Transaction already processed'
        });
      }

      const now = new Date();
      const rateLimitWindow = 1.5 * 60 * 1000;

      // Check for recent attempts of the same ticket type from this IP
      const recentSameTypeAttempt = await TicketSale.findOne({
        'paymentInfo.userIpAddress': userIp,
        'ticketInfo.typeId': ticketSale.ticketInfo.typeId,
        'paymentInfo.transferClickedAt': {
          $gte: new Date(now - rateLimitWindow)
        },
        '_id': { $ne: ticketSale._id } // Exclude current ticket
      }).sort({ 'paymentInfo.transferClickedAt': -1 });

      if (recentSameTypeAttempt) {
        const waitTimeSeconds = Math.ceil((rateLimitWindow - (now - recentSameTypeAttempt.paymentInfo.transferClickedAt)) / 1000);
        console.log(`[TICKET_TYPE_RATE_LIMIT] Blocking ${ticketSale.ticketInfo.typeId} purchase from ${userIp}. Last attempt: ${recentSameTypeAttempt.paymentInfo.transferClickedAt}, Wait time: ${waitTimeSeconds}s`);

        return res.status(429).json({
          success: false,
          message: `You just attempted to purchase a ${ticketSale.ticketInfo.typeName} ticket. Please wait 2 minutes before trying again.`,
          rateLimited: true,
          ticketType: ticketSale.ticketInfo.typeName,
          waitTime: waitTimeSeconds
        });
      }

      // Also check the existing same-reference rate limit as backup
      if (ticketSale.paymentInfo.transferClickedAt &&
        ticketSale.paymentInfo.userIpAddress === userIp &&
        (now - ticketSale.paymentInfo.transferClickedAt) < rateLimitWindow) {

        const waitTimeSeconds = Math.ceil((rateLimitWindow - (now - ticketSale.paymentInfo.transferClickedAt)) / 1000);
        console.log(`[REFERENCE_RATE_LIMIT] Blocking repeat request from ${userIp} for reference ${reference}. Wait time: ${waitTimeSeconds}s`);

        return res.status(429).json({
          success: false,
          message: 'Please wait 2 minutes before clicking again. We have received your first request.',
          rateLimited: true,
          waitTime: waitTimeSeconds
        });
      }

      // Update status and tracking info
      ticketSale.paymentInfo.status = 'pending_approval';
      ticketSale.paymentInfo.transferMarkedAt = new Date();
      ticketSale.paymentInfo.userIpAddress = userIp;
      ticketSale.paymentInfo.transferClickedAt = now;
      ticketSale.paymentInfo.transferClickCount = (ticketSale.paymentInfo.transferClickCount || 0) + 1;
      await ticketSale.save();

      console.log(`[TRANSFER] Successfully updated. Click count: ${ticketSale.paymentInfo.transferClickCount}, IP: ${userIp}`);

      // Queue email instead of sending immediately
      try {
        const { queueEmail } = require('../utils/emailQueue');
        await queueEmail('transfer_completed', ticketSale);
      } catch (queueError) {
        console.error('Error queueing email:', queueError);
        try {
          await sendTransferCompletedEmail(ticketSale);
        } catch (emailError) {
          console.error('Error sending email directly:', emailError);
          const { addToBuffer } = require('../utils/buffer/emailBuffer');
          await addToBuffer('transfer_completed', ticketSale);
        }
      }

      // Send urgent notification to admin
      try {
        await PaymentController._sendAdminApprovalRequest(ticketSale);
      } catch (notificationError) {
        console.error('Error sending admin notification:', notificationError);
        // Non-critical, continue even if admin notification fails
      }

      res.status(200).json({
        success: true,
        message: 'Transfer marked as completed. Your ticket will be sent once payment is confirmed by our team.',
        data: {
          reference,
          status: 'pending_approval',
          message: 'We will verify your payment and send your ticket within 2-4 hours during business hours.',
          clickCount: ticketSale.paymentInfo.transferClickCount
        }
      });

    } catch (error) {
      console.error('Mark transfer completed error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to update transfer status. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Admin approve transfer (admin only)
  static async approveTransfer(req, res) {
    try {
      const { reference, adminKey } = req.body;

      // Simple admin verification (you can enhance this)
      if (adminKey !== process.env.ADMIN_SECRET || !adminKey) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      if (ticketSale.paymentInfo.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Transaction already approved'
        });
      }

      // Update payment status to completed
      ticketSale.paymentInfo.status = 'completed';
      ticketSale.paymentInfo.paidAt = new Date();
      ticketSale.paymentInfo.approvedBy = 'admin';
      ticketSale.status = 'confirmed';

      // Generate QR code data
      const qrData = JSON.stringify({
        ticketId: ticketSale.ticketId,
        customerName: `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`,
        ticketType: ticketSale.ticketInfo.typeName,
        quantity: ticketSale.ticketInfo.quantity,
        eventDate: '2024-12-22',
        eventTime: '17:00',
        venue: 'National Theatre, Lagos',
        generatedAt: new Date().toISOString()
      });

      // Generate QR code as data URL image
      const QRCode = require('qrcode');
      const qrCodeImage = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      ticketSale.qrCode = qrCodeImage;

      // Try to send the ticket email before saving the updated status
      let emailSent = false;
      try {
        await sendTicketEmail(ticketSale);
        emailSent = true;

        // Only save the updated status if email sent successfully
        await ticketSale.save();

        res.status(200).json({
          success: true,
          message: 'Payment approved and ticket sent to customer',
          data: {
            reference,
            customerEmail: ticketSale.customerInfo.email,
            ticketType: ticketSale.ticketInfo.typeName,
            amount: ticketSale.ticketInfo.totalAmount
          }
        });
      } catch (emailError) {
        console.error('Error sending ticket email:', emailError);

        // Revert payment status since email failed
        res.status(500).json({
          success: false,
          message: 'Unable to send ticket email. Please check your internet connection and try again in a few minutes.',
          error: 'Email delivery failed'
        });
      }

    } catch (error) {
      console.error('Transfer approval error:', error);
      res.status(500).json({
        success: false,
        message: 'Transfer approval failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Admin reject transfer (admin only)
  static async rejectTransfer(req, res) {
    try {
      const { reference, adminKey, reason } = req.body;

      // Simple admin verification
      if (adminKey !== process.env.ADMIN_SECRET || !adminKey) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      if (ticketSale.paymentInfo.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot reject an already approved transaction'
        });
      }

      // Update payment status to rejected
      ticketSale.paymentInfo.status = 'rejected';
      ticketSale.paymentInfo.rejectedAt = new Date();
      ticketSale.paymentInfo.rejectedBy = 'admin';
      ticketSale.paymentInfo.rejectionReason = reason || 'Payment not verified';
      ticketSale.status = 'rejected';

      // Try to send the rejection email before saving the updated status
      let emailSent = false;
      try {
        await sendPaymentRejectionEmail(ticketSale, reason);
        emailSent = true;

        // Only save the updated status if email sent successfully
        await ticketSale.save();

        res.status(200).json({
          success: true,
          message: 'Payment rejected and customer notified',
          data: {
            reference,
            customerEmail: ticketSale.customerInfo.email,
            rejectionReason: reason || 'Payment not verified'
          }
        });
      } catch (emailError) {
        console.error('Error sending rejection email:', emailError);

        // Return error since email couldn't be sent
        res.status(500).json({
          success: false,
          message: 'Unable to send rejection email. Please check your internet connection and try again in a few minutes.',
          error: 'Email delivery failed'
        });
      }

    } catch (error) {
      console.error('Transfer rejection error:', error);
      res.status(500).json({
        success: false,
        message: 'Transfer rejection failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get pending transfers for admin
  static async getPendingTransfers(req, res) {
    try {
      const { adminKey } = req.query;

      if (adminKey !== process.env.ADMIN_SECRET || !adminKey) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      const pendingTransfers = await TicketSale.find({
        'paymentInfo.status': 'pending_approval'
      }).sort({ 'paymentInfo.transferMarkedAt': -1 });

      res.status(200).json({
        success: true,
        data: pendingTransfers.map(sale => ({
          reference: sale.paymentInfo.reference,
          customerName: `${sale.customerInfo.firstName} ${sale.customerInfo.lastName}`,
          email: sale.customerInfo.email,
          phone: sale.customerInfo.phone,
          ticketType: sale.ticketInfo.typeName,
          quantity: sale.ticketInfo.quantity,
          amount: sale.ticketInfo.totalAmount,
          transferMarkedAt: sale.paymentInfo.transferMarkedAt,
          createdAt: sale.createdAt
        }))
      });

    } catch (error) {
      console.error('Get pending transfers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending transfers',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Private helper methods
  static async _handleSuccessfulPayment(paymentData) {
    try {
      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': paymentData.reference
      });

      if (!ticketSale) {
        console.error('Ticket sale not found for reference:', paymentData.reference);
        return;
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'completed';
      ticketSale.paymentInfo.paidAt = new Date();
      ticketSale.paymentInfo.paystackData = paymentData;

      await ticketSale.save();

      // Send ticket email
      try {
        await sendTicketEmail(ticketSale);
        console.log('Ticket email sent successfully for reference:', paymentData.reference);
      } catch (emailError) {
        console.error('Error sending ticket email:', emailError);
      }

    } catch (error) {
      console.error('Error handling successful payment:', error);
    }
  }

  static async _handleFailedPayment(paymentData) {
    try {
      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': paymentData.reference
      });

      if (!ticketSale) {
        console.error('Ticket sale not found for reference:', paymentData.reference);
        return;
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'failed';
      ticketSale.paymentInfo.failedAt = new Date();
      ticketSale.paymentInfo.failureReason = paymentData.gateway_response || 'Payment failed';

      await ticketSale.save();

      console.log('Payment failed for reference:', paymentData.reference);

    } catch (error) {
      console.error('Error handling failed payment:', error);
    }
  }

  static async _handleSuccessfulOpayPayment(paymentData) {
    try {
      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': paymentData.reference
      });

      if (!ticketSale) {
        console.error('Ticket sale not found for reference:', paymentData.reference);
        return;
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'completed';
      ticketSale.paymentInfo.paidAt = new Date();
      ticketSale.paymentInfo.opayData = paymentData;

      await ticketSale.save();

      // Send ticket email
      try {
        await sendTicketEmail(ticketSale);
        console.log('Ticket email sent successfully for reference:', paymentData.reference);
      } catch (emailError) {
        console.error('Error sending ticket email:', emailError);
      }

    } catch (error) {
      console.error('Error handling successful OPay payment:', error);
    }
  }

  static async _handleFailedOpayPayment(paymentData) {
    try {
      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': paymentData.reference
      });

      if (!ticketSale) {
        console.error('Ticket sale not found for reference:', paymentData.reference);
        return;
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'failed';
      ticketSale.paymentInfo.failedAt = new Date();
      ticketSale.paymentInfo.failureReason = paymentData.gateway_response || 'Payment failed';

      await ticketSale.save();

      console.log('Payment failed for reference:', paymentData.reference);

    } catch (error) {
      console.error('Error handling failed OPay payment:', error);
    }
  }

  static async _verifyWithPaystack(reference) {
    try {
      const https = require('https');

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.paystack.co',
          port: 443,
          path: `/transaction/verify/${reference}`,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              resolve({
                success: response.status,
                data: response.data
              });
            } catch (parseError) {
              reject(parseError);
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.end();
      });

    } catch (error) {
      console.error('Error verifying with Paystack:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper method to send admin notification
  static async _sendAdminNotification(ticketSale) {
    try {
      // Log the notification
      console.log(`New ticket purchase: ${ticketSale.paymentInfo.reference} - ${ticketSale.customerInfo.email}`);

      // Send WhatsApp notification to admin (if enabled)
      if (process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true') {
        try {
          await sendAdminPaymentNotification(ticketSale);
        } catch (whatsappError) {
          console.error('Error sending WhatsApp notification:', whatsappError);
          // Non-critical, continue even if WhatsApp notification fails
        }
      }

      // You can also implement email notification here
      // await sendAdminNotificationEmail({
      //   reference: ticketSale.paymentInfo.reference,
      //   customerName: `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`,
      //   amount: ticketSale.ticketInfo.totalAmount,
      //   ticketType: ticketSale.ticketInfo.typeName
      // });

    } catch (error) {
      console.error('Error sending admin notification:', error);
      // Non-critical, don't throw error
    }
  }

  // Helper method to send transfer completed email
  static async _sendTransferCompletedEmail(ticketSale) {
    try {
      const { sendTransferCompletedEmail } = require('../utils/emailService');
      const result = await sendTransferCompletedEmail(ticketSale);
      return result;
    } catch (error) {
      console.error('Error sending transfer completed email:', error);
      throw error; // Re-throw the error so the caller can handle it
    }
  }

  // Helper method to send admin approval request
  static async _sendAdminApprovalRequest(ticketSale) {
    try {
      // Send urgent notification to admin about pending approval
      console.log(`URGENT: Transfer completed for ${ticketSale.paymentInfo.reference} - Needs approval`);

      // Send WhatsApp notification to admin (if enabled)
      if (process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true') {
        try {
          await sendUrgentApprovalNotification(ticketSale);
        } catch (whatsappError) {
          console.error('Error sending WhatsApp notification:', whatsappError);
          // Non-critical, continue even if WhatsApp notification fails
        }
      }

      // You can also implement email notification here
      // await sendUrgentAdminNotification(ticketSale);

    } catch (error) {
      console.error('Error sending admin approval request:', error);
      throw error; // Re-throw the error so the caller can handle it
    }
  }

  // Helper method to send rejection email
  static async _sendRejectionEmail(ticketSale, reason) {
    try {
      const { sendPaymentRejectionEmail } = require('../utils/emailService');
      await sendPaymentRejectionEmail(ticketSale, reason);
    } catch (error) {
      console.error('Error sending rejection email:', error);
    }
  }

  // Helper method to send payment rejection email
  static async _sendPaymentRejectionEmail(ticketSale, reason) {
    try {
      const { sendPaymentRejectionEmail } = require('../utils/emailService');
      const result = await sendPaymentRejectionEmail(ticketSale, reason);
      return result;
    } catch (error) {
      console.error('Error sending payment rejection email:', error);
      throw error; // Re-throw the error so the caller can handle it
    }
  }
}

module.exports = PaymentController;
