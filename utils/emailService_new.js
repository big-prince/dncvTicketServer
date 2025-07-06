const nodemailer = require('nodemailer');

// Email configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // Use TLS
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-email-password'
    }
  });
};

// Generate ticket email HTML template
const generateTicketEmailTemplate = (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your DNCV Concert Tickets</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .header p { margin: 5px 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .ticket-info { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .event-details { background: #e0e7ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .qr-container { text-align: center; margin: 20px 0; }
        .qr-container img { max-width: 200px; border-radius: 8px; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; font-size: 14px; }
        .btn { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .important { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .ticket-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎵 Concert Tickets Confirmed!</h1>
          <p>De Noble Choral Voices 5th Edition</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName}!</h2>
          <p>Thank you for purchasing tickets to De Noble Choral Voices 5th Edition Concert. Your payment has been confirmed and your tickets are ready!</p>
          
          <div class="event-details">
            <h3>📅 Event Details</h3>
            <p><strong>Event:</strong> De Noble Choral Voices 5th Edition Concert</p>
            <p><strong>Date:</strong> Sunday, December 22, 2024</p>
            <p><strong>Time:</strong> 5:00 PM</p>
            <p><strong>Venue:</strong> National Theatre, Lagos</p>
            <p><strong>Address:</strong> National Arts Theatre, Iganmu, Lagos, Nigeria</p>
          </div>

          <div class="ticket-info">
            <h3>🎫 Your Ticket Information</h3>
            <p><strong>Ticket Type:</strong> ${ticketSale.ticketInfo.typeName}</p>
            <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
            <p><strong>Total Amount:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
            <p><strong>Payment Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
          </div>

          <div class="important">
            <strong>⚠️ Important Instructions:</strong>
            <ul>
              <li>Present the QR code(s) below at the venue entrance</li>
              <li>Arrive at least 30 minutes before the event starts</li>
              <li>Valid ID may be required for entry</li>
              <li>No refunds or exchanges allowed</li>
            </ul>
          </div>

          <h3>🔍 Your QR Tickets</h3>
          ${ticketSale.tickets.map((ticket, index) => `
            <div class="ticket-item">
              <h4>Ticket ${index + 1} of ${ticketSale.tickets.length}</h4>
              <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
              <div class="qr-container">
                <img src="${ticket.qrCode}" alt="QR Code for Ticket ${index + 1}" />
              </div>
            </div>
          `).join('')}

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=DNCV%205th%20Edition%20Concert&dates=20241222T170000Z/20241222T210000Z&details=De%20Noble%20Choral%20Voices%205th%20Edition%20Concert&location=National%20Theatre,%20Lagos" class="btn">
              📅 Add to Calendar
            </a>
          </div>
        </div>

        <div class="footer">
          <p>De Noble Choral Voices | National Theatre, Lagos</p>
          <p>For inquiries: info@denoblechoralvoices.com | +234 XXX XXX XXXX</p>
          <p>Follow us on social media for updates!</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate payment confirmation email template
const generatePaymentConfirmationTemplate = (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payment Confirmation - DNCV</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .success-icon { font-size: 48px; margin-bottom: 20px; }
        .summary { background: #f0f9f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="success-icon">✅</div>
          <h1>Payment Successful!</h1>
          <p>Your payment has been processed successfully</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName}!</h2>
          <p>We've received your payment for De Noble Choral Voices 5th Edition Concert tickets.</p>
          
          <div class="summary">
            <h3>Payment Summary</h3>
            <p><strong>Amount Paid:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
            <p><strong>Payment Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Status:</strong> Completed ✅</p>
          </div>

          <p>Your tickets will be sent to you shortly in a separate email. Please keep this confirmation for your records.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send ticket email with attachments
const sendTicketEmail = async (ticketSale) => {
  try {
    const transporter = createTransporter();
    const customerEmail = ticketSale.customerInfo.email;
    const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

    const mailOptions = {
      from: {
        name: 'De Noble Choral Voices',
        address: process.env.EMAIL_USER || 'noreply@denoblechoralvoices.com'
      },
      to: customerEmail,
      subject: '🎵 Your DNCV Concert Tickets - QR Codes Inside!',
      html: generateTicketEmailTemplate(ticketSale),
      attachments: [
        // You can add PDF tickets here if needed
        // {
        //   filename: 'ticket.pdf',
        //   content: pdfBuffer,
        //   contentType: 'application/pdf'
        // }
      ]
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Ticket email sent successfully to ${customerEmail}`);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('❌ Error sending ticket email:', error);
    throw error;
  }
};

// Send payment confirmation email
const sendPaymentConfirmationEmail = async (ticketSale) => {
  try {
    const transporter = createTransporter();
    const customerEmail = ticketSale.customerInfo.email;
    const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

    const mailOptions = {
      from: {
        name: 'De Noble Choral Voices',
        address: process.env.EMAIL_USER || 'noreply@denoblechoralvoices.com'
      },
      to: customerEmail,
      subject: '✅ Payment Confirmation - DNCV Concert',
      html: generatePaymentConfirmationTemplate(ticketSale)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Payment confirmation sent to ${customerEmail}`);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('❌ Error sending payment confirmation:', error);
    throw error;
  }
};

// Send admin notification email
const sendAdminNotification = async (ticketSale) => {
  try {
    const transporter = createTransporter();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@denoblechoralvoices.com';

    const mailOptions = {
      from: {
        name: 'DNCV Ticketing System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: `🎫 New Ticket Sale - ${ticketSale.ticketInfo.typeName}`,
      html: `
        <h2>New Ticket Sale Notification</h2>
        <p><strong>Customer:</strong> ${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}</p>
        <p><strong>Email:</strong> ${ticketSale.customerInfo.email}</p>
        <p><strong>Phone:</strong> ${ticketSale.customerInfo.phone}</p>
        <p><strong>Ticket Type:</strong> ${ticketSale.ticketInfo.typeName}</p>
        <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
        <p><strong>Amount:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
        <p><strong>Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
        <p><strong>Date:</strong> ${new Date().toISOString()}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Admin notification sent');

  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
    // Don't throw error for admin notifications
  }
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email configuration is valid');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error);
    return false;
  }
};

module.exports = {
  sendTicketEmail,
  sendPaymentConfirmationEmail,
  sendAdminNotification,
  testEmailConfig
};
