/**
 * WhatsApp Notification Service
 * Uses the WhatsApp Business API to send notifications to admins
 * 
 * Requirements:
 * 1. WhatsApp Business API account (via Meta/Facebook Business)
 * 2. Twilio API (alternative option)
 */

const axios = require('axios');

// Meta WhatsApp Business API implementation
const sendWhatsAppNotificationViaMeta = async (phoneNumber, message) => {
  try {
    // Example implementation using Meta's Graph API
    const response = await axios.post(
      `https://graph.facebook.com/v15.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber, // Format: 234XXXXXXXXXX (no + sign)
        type: 'text',
        text: {
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('WhatsApp notification sent via Meta:', response.data);
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp notification via Meta:', error.response?.data || error.message);
    return false;
  }
};

// Twilio WhatsApp API implementation (alternative)
const sendWhatsAppNotificationViaTwilio = async (phoneNumber, message) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = require('twilio')(accountSid, authToken);

    const result = await client.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, // Format: +14155238886
      to: `whatsapp:${phoneNumber}` // Format: +234XXXXXXXXXX (with + sign)
    });

    console.log('WhatsApp notification sent via Twilio:', result.sid);
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp notification via Twilio:', error);
    return false;
  }
};

// Send admin notification about new payment
const sendAdminPaymentNotification = async (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;
  const adminPhoneNumbers = process.env.ADMIN_WHATSAPP_NUMBERS?.split(',') || [];

  if (!adminPhoneNumbers.length) {
    console.warn('No admin WhatsApp numbers configured. Skipping WhatsApp notification.');
    return false;
  }

  const message = `🎫 *NEW PAYMENT NOTIFICATION*\n\n` +
    `*Reference:* ${ticketSale.paymentInfo.reference}\n` +
    `*Customer:* ${customerName}\n` +
    `*Ticket:* ${ticketSale.ticketInfo.typeName}\n` +
    `*Quantity:* ${ticketSale.ticketInfo.quantity}\n` +
    `*Amount:* ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}\n\n` +
    `Please verify this payment in the admin dashboard.`;

  let success = false;
  for (const phoneNumber of adminPhoneNumbers) {
    // Use either Meta or Twilio implementation based on your preference
    if (process.env.WHATSAPP_PROVIDER === 'twilio') {
      success = await sendWhatsAppNotificationViaTwilio(phoneNumber, message);
    } else {
      success = await sendWhatsAppNotificationViaMeta(phoneNumber, message);
    }

    if (success) {
      console.log(`WhatsApp notification sent to admin: ${phoneNumber}`);
    }
  }

  return success;
};

// Send urgent approval request notification
const sendUrgentApprovalNotification = async (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;
  const adminPhoneNumbers = process.env.ADMIN_WHATSAPP_NUMBERS?.split(',') || [];

  if (!adminPhoneNumbers.length) {
    console.warn('No admin WhatsApp numbers configured. Skipping WhatsApp notification.');
    return false;
  }

  const message = `🚨 *URGENT: PAYMENT APPROVAL NEEDED*\n\n` +
    `*Reference:* ${ticketSale.paymentInfo.reference}\n` +
    `*Customer:* ${customerName}\n` +
    `*Ticket:* ${ticketSale.ticketInfo.typeName}\n` +
    `*Quantity:* ${ticketSale.ticketInfo.quantity}\n` +
    `*Amount:* ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}\n` +
    `*Contact:* ${ticketSale.customerInfo.phone}\n\n` +
    `Customer has marked their bank transfer as completed. Please verify and approve ASAP.`;

  let success = false;
  for (const phoneNumber of adminPhoneNumbers) {
    // Use either Meta or Twilio implementation based on your preference
    if (process.env.WHATSAPP_PROVIDER === 'twilio') {
      success = await sendWhatsAppNotificationViaTwilio(phoneNumber, message);
    } else {
      success = await sendWhatsAppNotificationViaMeta(phoneNumber, message);
    }

    if (success) {
      console.log(`Urgent WhatsApp notification sent to admin: ${phoneNumber}`);
    }
  }

  return success;
};

module.exports = {
  sendAdminPaymentNotification,
  sendUrgentApprovalNotification
};
