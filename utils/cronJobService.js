const cron = require('node-cron');
const TicketSale = require('../models/TicketSale');
const { sendPaymentReminderEmail } = require('../utils/emailService');
const axios = require('axios');

class CronJobService {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  // Initialize all cron jobs
  init() {
    if (this.isRunning) {
      console.log('Cron jobs already running');
      return;
    }

    console.log('🕐 Initializing cron jobs...');

    // Job 1: Check for unverified payments and send reminders
    this.schedulePaymentReminders();

    // Job 2: Keep deployment awake (if enabled)
    this.scheduleKeepAlive();

    this.isRunning = true;
    console.log('✅ All cron jobs initialized successfully');
  }

  // Schedule payment reminder emails
  schedulePaymentReminders() {
    // Run once daily at 10:00 AM WAT
    const reminderJob = cron.schedule('0 10 * * *', async () => {
      console.log('🔍 Daily check for unverified payments...');
      await this.checkUnverifiedPayments();
    }, {
      scheduled: false,
      timezone: 'Africa/Lagos'
    });

    reminderJob.start();
    this.jobs.push({ name: 'payment-reminders', job: reminderJob });
    console.log('📧 Payment reminder job scheduled');
  }

  // Schedule keep-alive pings
  scheduleKeepAlive() {
    const keepAliveEnabled = process.env.ENABLE_KEEP_ALIVE === 'true';
    const keepAliveUrl = process.env.KEEP_ALIVE_URL;

    if (!keepAliveEnabled || !keepAliveUrl) {
      console.log('⏭️  Keep-alive job disabled or URL not configured');
      return;
    }

    // Ping every 14 minutes to prevent sleep (Render free tier sleeps after 15 minutes)
    const keepAliveJob = cron.schedule('*/14 * * * *', async () => {
      await this.pingKeepAlive(keepAliveUrl);
    }, {
      scheduled: false
    });

    keepAliveJob.start();
    this.jobs.push({ name: 'keep-alive', job: keepAliveJob });
    console.log(`🏃 Keep-alive job scheduled for ${keepAliveUrl}`);
  }

  // Check for unverified payments and send reminders
  async checkUnverifiedPayments() {
    try {
      // Find payments that are pending approval for more than the reminder threshold
      const reminderThresholdHours = parseInt(process.env.PAYMENT_REMINDER_HOURS || '24'); // 24 hours default
      const thresholdTime = new Date(Date.now() - (reminderThresholdHours * 60 * 60 * 1000));

      const unverifiedPayments = await TicketSale.find({
        'paymentInfo.status': 'pending_approval',
        'paymentInfo.transferMarkedAt': { $lt: thresholdTime },
        $or: [
          { 'paymentInfo.lastReminderSent': { $exists: false } },
          {
            'paymentInfo.lastReminderSent': {
              $lt: new Date(Date.now() - (24 * 60 * 60 * 1000)) // Last reminder was more than 24 hours ago
            }
          }
        ]
      });
      if (unverifiedPayments.length === 0) {
        console.log('✅ No unverified payments found');
        return;
      }

      console.log(`🔍 Found ${unverifiedPayments.length} unverified payments`);
      for (const ticketSale of unverifiedPayments) {
        // Send reminder email
        await this.sendPaymentReminder(ticketSale);

        // Update last reminder sent timestamp
        ticketSale.paymentInfo.lastReminderSent = new Date();
        await ticketSale.save();
      }
      console.log(`📧 Sent reminders for ${unverifiedPayments.length} unverified payments`);
    } catch (error) {
      console.error('❌ Error checking unverified payments:', error);
    }
  }

  // Send payment reminder email
  async sendPaymentReminder(ticketSale) {
    try {
      // Check if this payment has been waiting too long (mark as suspicious)
      const maxWaitHours = parseInt(process.env.MAX_WAIT_HOURS || '72'); // 3 days
      const maxWaitTime = new Date(Date.now() - (maxWaitHours * 60 * 60 * 1000));

      const isSuspicious = ticketSale.paymentInfo.transferMarkedAt < maxWaitTime;

      await sendPaymentReminderEmail(ticketSale, isSuspicious);

      // Send admin notification for suspicious payments
      if (isSuspicious) {
        await this.notifyAdminSuspiciousPayment(ticketSale);
      }

      console.log(`📧 Reminder sent for payment: ${ticketSale.paymentInfo.reference} `);

    } catch (error) {
      console.error(`❌ Error sending reminder for ${ticketSale.paymentInfo.reference}: `, error);
    }
  }

  // Notify admin about suspicious/overdue payments
  async notifyAdminSuspiciousPayment(ticketSale) {
    try {
      // You can implement WhatsApp, Slack, or email notification here
      console.log(`🚨 SUSPICIOUS PAYMENT: ${ticketSale.paymentInfo.reference} - Customer: ${ticketSale.customerInfo.email} `);

      // Example: Send urgent admin notification
      // await sendUrgentAdminAlert({
      //   type: 'suspicious_payment',
      //   reference: ticketSale.paymentInfo.reference,
      //   customerEmail: ticketSale.customerInfo.email,
      //   amount: ticketSale.ticketInfo.totalAmount,
      //   daysPending: Math.floor((Date.now() - ticketSale.paymentInfo.transferMarkedAt) / (24 * 60 * 60 * 1000))
      // });

    } catch (error) {
      console.error('❌ Error notifying admin of suspicious payment:', error);
    }
  }

  // Ping keep-alive URL
  async pingKeepAlive(url) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      console.log(`🏃 Keep - alive ping successful: ${response.status} `);
    } catch (error) {
      console.error(`❌ Keep - alive ping failed: ${error.message} `);
    }
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stop all cron jobs
  stop() {
    console.log('🛑 Stopping all cron jobs...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`✅ Stopped ${name} job`);
    });

    this.jobs = [];
    this.isRunning = false;
    console.log('✅ All cron jobs stopped');
  }

  // Get job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.map(({ name }) => name),
      totalJobs: this.jobs.length
    };
  }

  // Manually trigger payment reminder check (for testing)
  async triggerPaymentCheck() {
    console.log('🔧 Manually triggering payment reminder check...');
    await this.checkUnverifiedPayments();
  }

  // Manually trigger keep-alive ping (for testing)
  async triggerKeepAlive() {
    const keepAliveUrl = process.env.KEEP_ALIVE_URL;
    if (keepAliveUrl) {
      console.log('🔧 Manually triggering keep-alive ping...');
      await this.pingKeepAlive(keepAliveUrl);
    } else {
      console.log('❌ Keep-alive URL not configured');
    }
  }
}

// Create singleton instance
const cronJobService = new CronJobService();

module.exports = cronJobService;
