const nodemailer = require('nodemailer');

// Email configuration with fallback options
const createTransporter = () => {
  const useSecure = process.env.EMAIL_SECURE === 'true';
  const port = parseInt(process.env.EMAIL_PORT || (useSecure ? '465' : '587'));

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: port,
    secure: useSecure, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'your-email-password'
    },
    // Additional options to handle connection issues
    connectionTimeout: 60000, // 60 seconds
    greetingTimeout: 30000, // 30 seconds  
    socketTimeout: 60000, // 60 seconds
    // Retry options
    pool: true,
    maxConnections: 5,
    maxMessages: 10,
    // TLS options
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    }
  });
};

// Create transporter with multiple fallback options
const createTransporterWithFallback = async () => {
  const transporters = [
    // Primary: Gmail with SSL (port 465)
    {
      name: 'Gmail SSL',
      transporter: nodemailer.createTransport({
        service: 'gmail',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
        }
      })
    },
    // Fallback 1: Gmail with STARTTLS (port 587)
    {
      name: 'Gmail STARTTLS',
      transporter: nodemailer.createTransport({
        service: 'gmail',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
        }
      })
    },
    // Fallback 2: Direct SMTP
    {
      name: 'Direct SMTP',
      transporter: nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        },
        connectionTimeout: 10000,
        socketTimeout: 10000
      })
    }
  ];

  // Try each transporter until one works
  for (const { name, transporter } of transporters) {
    try {
      console.log(`🔍 Testing ${name} connection...`);
      await transporter.verify();
      console.log(`✅ ${name} connection successful!`);
      return transporter;
    } catch (error) {
      console.log(`❌ ${name} failed:`, error.message);
      continue;
    }
  }

  throw new Error('All email transporters failed. Please check your email configuration.');
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
            <p><strong>Date:</strong> Sunday, 28th September, 2025</p>
            <p><strong>Time:</strong> 5:00 PM till 8:00 PM</p>
            <p><strong>Venue:</strong> Oasis Event Centre, PH</p>
            <p><strong>Address:</strong> #12 Psychiatric Hospital Road, Rumuola, PH</p>
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

          <h3>🔍 Your QR Ticket</h3>
          <div class="ticket-item">
            <h4>Ticket Information</h4>
            <p><strong>Ticket ID:</strong> ${ticketSale.ticketId}</p>
            <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
            <div class="qr-container">
              <div style="font-size: 14px; color: #666; margin-bottom: 10px;">
                QR Code for Entry
              </div>
              <div style="background: white; padding: 20px; border-radius: 8px; border: 2px solid #e5e7eb;">
                <div style="font-family: monospace; font-size: 12px; word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                  ${ticketSale.qrCode || 'QR Code will be generated upon payment approval'}
                </div>
              </div>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=DNCV%205th%20Edition%20Concert&dates=20241222T170000Z/20241222T210000Z&details=De%20Noble%20Choral%20Voices%205th%20Edition%20Concert&location=National%20Theatre,%20Lagos" class="btn">
              📅 Add to Calendar
            </a>
          </div>
        </div>

        <div class="footer">
          <p>De Noble Choral Voices | Oasis Event Centre, PH</p>
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

// Generate transfer completed confirmation email
const generateTransferCompletedTemplate = (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Transfer Received - DNCV Concert</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .status-box { background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
        .info-box { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Transfer Confirmation Received</h1>
          <p>De Noble Choral Voices Concert</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName}!</h2>
          
          <div class="status-box">
            <h3 style="color: #059669; margin: 0;">Your transfer has been recorded!</h3>
            <p style="margin: 10px 0 0;">We're now verifying your payment and will send your tickets shortly.</p>
          </div>
          
          <div class="info-box">
            <h3>Transfer Details:</h3>
            <p><strong>Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
            <p><strong>Amount:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
            <p><strong>Ticket Type:</strong> ${ticketSale.ticketInfo.typeName}</p>
            <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
          </div>
          
          <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #92400e;">What happens next?</h3>
            <ol style="color: #92400e;">
              <li>Our team will verify your payment (usually within 2-4 hours during business hours)</li>
              <li>Once confirmed, you'll receive your tickets via email</li>
              <li>Your tickets will include QR codes for entry</li>
              <li>Bring your tickets (printed or on phone) to the venue</li>
            </ol>
          </div>
          
          <p>If you have any questions, please contact us at <a href="mailto:denoblechoralvoices@gmail.com</a></p>
        </div>
        
        <div class="footer">
          <p>De Noble Choral Voices 5th Edition<br>
          Oasis Event Centre, Port Harcourt<br>
          Sunday, 28th September 2025 • 5:00 PM</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate payment rejection email template
const generatePaymentRejectionTemplate = (ticketSale, reason) => {
  console.log(ticketSale, "Ticket Sale")
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payment Update - DNCV Concert</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .info-box { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .contact-box { background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Payment Update Required</h1>
          <p>De Noble Choral Voices Concert</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName},</h2>
          
          <div class="alert-box">
            <h3 style="color: #dc2626; margin: 0 0 10px;">We couldn't verify your payment</h3>
            <p style="margin: 0; color: #7f1d1d;">
              Unfortunately, we were unable to locate your transfer for reference: <strong>${ticketSale.paymentInfo.reference}</strong>
            </p>
          </div>
          
          <div class="info-box">
            <h3>Reason:</h3>
            <p>${reason || 'Payment not found in our records'}</p>
            
            <h3>Your Transfer Details:</h3>
            <p><strong>Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
            <p><strong>Amount:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
            <p><strong>Ticket Type:</strong> ${ticketSale.ticketInfo.typeName}</p>
            <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
          </div>
          
          <div class="contact-box">
            <h3 style="color: #1d4ed8;">What to do next:</h3>
            <ol style="color: #1e40af;">
              <li><strong>Check your transfer:</strong> Ensure you sent the exact amount to our account</li>
              <li><strong>Verify reference:</strong> Make sure you used "${ticketSale.paymentInfo.reference}" as description</li>
              <li><strong>Send proof:</strong> Reply to this email with a screenshot of your transfer receipt</li>
              <li><strong>Call us:</strong> Contact us at +234 806 868 3392 for immediate assistance</li>
            </ol>
          </div>
          
          <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #92400e;">Our Bank Details (for verification):</h3>
            <p style="color: #92400e; margin: 5px 0;"><strong>Bank:</strong> FCMB</p>
            <p style="color: #92400e; margin: 5px 0;"><strong>Account:</strong> De Noble Choral Voices</p>
            <p style="color: #92400e; margin: 5px 0;"><strong>Number:</strong> 5393339013</p>
          </div>
          
          <p>We're here to help! Please contact us as soon as possible so we can resolve this and get your tickets to you.</p>
        </div>
        
        <div class="footer">
          <p><strong>Contact Us:</strong><br>
          📞 +234 806 868 3392<br>
          📧 denoblechoralvoices@gmail.com<br><br>
          De Noble Choral Voices 5th Edition<br>
          Oasis Event Centre, Port Harcourt<br>
          Sunday, 28th September 2025</p>
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

// Send transfer completed confirmation email
const sendTransferCompletedEmail = async (ticketSale) => {
  const transporter = createTransporter();
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'DNCV Concert <noreply@dncvconcert.com>',
    to: ticketSale.customerInfo.email,
    subject: '✅ Transfer Confirmed - DNCV Concert Tickets',
    html: generateTransferCompletedTemplate(ticketSale)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Transfer completed email sent to: ${ticketSale.customerInfo.email}`);
  } catch (error) {
    console.error('Error sending transfer completed email:', error);
    throw error;
  }
};

// Send payment rejection email
const sendPaymentRejectionEmail = async (ticketSale, reason) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'DNCV Concert <noreply@dncvconcert.com>',
    to: ticketSale.customerInfo.email,
    subject: '⚠️ Payment Verification Required - DNCV Concert',
    html: generatePaymentRejectionTemplate(ticketSale, reason)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Payment rejection email sent to: ${ticketSale.customerInfo.email}`);
  } catch (error) {
    console.error('Error sending payment rejection email:', error);
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

// Send bank transfer details email
const sendBankTransferEmail = async (ticketSale) => {
  try {
    const transporter = createTransporter();
    const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

    const mailOptions = {
      from: {
        name: 'De Noble Choral Voices',
        address: process.env.EMAIL_USER
      },
      to: ticketSale.customerInfo.email,
      subject: 'Bank Transfer Details - DNCV Concert Tickets',
      html: generateBankTransferEmailTemplate(ticketSale)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Bank transfer email sent:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending bank transfer email:', error);
    throw error;
  }
};

// Generate bank transfer email template
const generateBankTransferEmailTemplate = (ticketSale) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Complete Your Payment - DNCV Concert</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .content { padding: 30px; }
        .bank-details { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { border-bottom: none; }
        .amount { font-size: 24px; font-weight: bold; color: #d97706; text-align: center; margin: 15px 0; }
        .important { background: #fee2e2; border: 1px solid #ef4444; border-radius: 6px; padding: 15px; margin: 15px 0; color: #991b1b; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏦 Complete Your Payment</h1>
          <p>Bank Transfer Details</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName}!</h2>
          <p>Thank you for choosing De Noble Choral Voices 5th Edition! Please complete your payment using the bank details below:</p>
          
          <div class="bank-details">
            <h3 style="margin-top: 0; color: #d97706;">Bank Transfer Details</h3>
            <div class="detail-row">
              <strong>Bank Name:</strong>
              <span>${process.env.BANK_NAME || 'Access Bank Plc'}</span>
            </div>
            <div class="detail-row">
              <strong>Account Name:</strong>
              <span>${process.env.ACCOUNT_NAME || 'De Noble Choral Voices'}</span>
            </div>
            <div class="detail-row">
              <strong>Account Number:</strong>
              <span style="font-weight: bold; font-size: 18px;">${process.env.ACCOUNT_NUMBER || '0123456789'}</span>
            </div>
            <div class="detail-row">
              <strong>Reference:</strong>
              <span style="font-weight: bold; color: #d97706;">${ticketSale.paymentInfo.reference}</span>
            </div>
          </div>
          
          <div class="amount">
            Amount: ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}
          </div>
          
          <div class="important">
            <h4 style="margin-top: 0;">⚠️ Important Instructions:</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Use the reference number</strong> as your transfer description/narration</li>
              <li>Transfer the <strong>exact amount</strong> shown above</li>
              <li>After completing the transfer, click "Transfer Done" in the app</li>
              <li>Your tickets will be sent once payment is verified</li>
            </ul>
          </div>
          
          <h3>Order Summary:</h3>
          <div style="background: #f8fafc; padding: 15px; border-radius: 6px;">
            <div class="detail-row">
              <strong>Ticket Type:</strong>
              <span>${ticketSale.ticketInfo.typeName}</span>
            </div>
            <div class="detail-row">
              <strong>Quantity:</strong>
              <span>${ticketSale.ticketInfo.quantity}</span>
            </div>
            <div class="detail-row">
              <strong>Total Amount:</strong>
              <span>₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</span>
            </div>
          </div>
          
          <p style="margin-top: 30px;">
            <strong>Need Help?</strong><br>
            WhatsApp: ${process.env.WHATSAPP_NUMBER || '+234 XXX XXX XXXX'}<br>
            Email: ${process.env.CONTACT_EMAIL || 'support@dncv.com'}
          </p>
        </div>
        
        <div class="footer">
          <p>&copy; 2025 De Noble Choral Voices. All rights reserved.</p>
          <p>Oasis Event Centre • Port Harcourt</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send payment reminder email template
const generatePaymentReminderEmailTemplate = (ticketSale, isSuspicious = false) => {
  const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;
  const hoursPending = Math.floor((Date.now() - ticketSale.paymentInfo.transferMarkedAt) / (1000 * 60 * 60));

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payment Verification Reminder - DNCV Concert</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: ${isSuspicious ? '#dc2626' : '#f59e0b'}; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: bold; }
        .content { padding: 30px; }
        .reminder-box { background: ${isSuspicious ? '#fef2f2' : '#fef3c7'}; border: 1px solid ${isSuspicious ? '#fca5a5' : '#fbbf24'}; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .payment-details { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .contact-info { background: #e0e7ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; font-size: 14px; }
        .btn { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .urgent { color: #dc2626; font-weight: bold; }
        .warning { color: #f59e0b; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${isSuspicious ? '🚨' : '⏰'} Payment Verification ${isSuspicious ? 'Urgent' : 'Reminder'}</h1>
          <p>De Noble Choral Voices 5th Edition</p>
        </div>
        
        <div class="content">
          <h2>Hello ${customerName},</h2>
          
          <div class="reminder-box">
            <h3 class="${isSuspicious ? 'urgent' : 'warning'}">
              ${isSuspicious ? '🚨 Urgent Action Required' : '⏰ Payment Verification Pending'}
            </h3>
            <p>
              ${isSuspicious
      ? `Your payment has been pending verification for over ${Math.floor(hoursPending / 24)} days. This requires immediate attention.`
      : `We are still waiting to verify your bank transfer for your DNCV concert ticket(s). It has been ${hoursPending} hours since you marked the transfer as completed.`
    }
            </p>
          </div>

          <div class="payment-details">
            <h3>📋 Payment Details</h3>
            <p><strong>Reference:</strong> ${ticketSale.paymentInfo.reference}</p>
            <p><strong>Amount:</strong> ₦${ticketSale.ticketInfo.totalAmount.toLocaleString()}</p>
            <p><strong>Ticket Type:</strong> ${ticketSale.ticketInfo.typeName}</p>
            <p><strong>Quantity:</strong> ${ticketSale.ticketInfo.quantity}</p>
            <p><strong>Transfer Marked:</strong> ${new Date(ticketSale.paymentInfo.transferMarkedAt).toLocaleString()}</p>
          </div>

          <div class="contact-info">
            <h3>📞 Need Help?</h3>
            <p>If you have already made the transfer, please reply to this email with:</p>
            <ul>
              <li>Screenshot or proof of the bank transfer</li>
              <li>Your payment reference: <strong>${ticketSale.paymentInfo.reference}</strong></li>
              <li>Transfer date and time</li>
            </ul>
            
            <p><strong>Contact Information:</strong></p>
            <p>📧 Email: ${process.env.CONTACT_EMAIL || 'tickets@dnoblechoral.com'}</p>
            <p>📱 Phone: ${process.env.CONTACT_PHONE || '+234 XXX XXX XXXX'}</p>
            <p>💬 WhatsApp: ${process.env.WHATSAPP_NUMBER || '+234 XXX XXX XXXX'}</p>
          </div>

          ${isSuspicious ? `
          <div class="reminder-box">
            <h3 class="urgent">⚠️ Important Notice</h3>
            <p>
              This payment has been pending for an extended period. If we do not receive proof of payment or hear from you within 24 hours, 
              we may need to cancel this ticket reservation to make it available for other customers.
            </p>
          </div>
          ` : ''}

          <p>
            We appreciate your patience and look forward to seeing you at the concert!
          </p>

          <p>
            Best regards,<br>
            <strong>De Noble Choral Voices Team</strong>
          </p>
        </div>
        
        <div class="footer">
          <p>© 2025 De Noble Choral Voices. All rights reserved.</p>
          <p>This is an automated reminder for payment reference: ${ticketSale.paymentInfo.reference}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send payment reminder email
const sendPaymentReminderEmail = async (ticketSale, isSuspicious = false) => {
  try {
    const transporter = createTransporter();
    const customerEmail = ticketSale.customerInfo.email;
    const customerName = `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`;

    const mailOptions = {
      from: `"De Noble Choral Voices" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: isSuspicious
        ? `🚨 URGENT: Payment Verification Required - ${ticketSale.paymentInfo.reference}`
        : `⏰ Payment Verification Reminder - ${ticketSale.paymentInfo.reference}`,
      html: generatePaymentReminderEmailTemplate(ticketSale, isSuspicious)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Payment reminder email sent to ${customerEmail}:`, info.messageId);
    return true;

  } catch (error) {
    console.error('Error sending payment reminder email:', error);
    throw error;
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
  sendTransferCompletedEmail,
  sendAdminNotification,
  sendBankTransferEmail,
  testEmailConfig,
  sendPaymentRejectionEmail,
  sendPaymentReminderEmail
};
