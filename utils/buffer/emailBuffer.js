/**
 * Email Buffer System
 * Handles failed email sending attempts with retry logic
 */
const fs = require('fs').promises;
const path = require('path');
const { sendTransferCompletedEmail, sendTicketEmail, sendPaymentRejectionEmail } = require('../emailService');

// Buffered emails directory
const BUFFER_DIR = path.join(__dirname, '../../data/email-buffer');
const RETRY_INTERVALS = [5, 20, 60, 240]; // Minutes to wait between retries

// Ensure buffer directory exists
const ensureBufferDirExists = async () => {
  try {
    await fs.mkdir(BUFFER_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating buffer directory:', error);
  }
};

// Add email to buffer for retry
const addToBuffer = async (emailType, data, attempts = 0) => {
  await ensureBufferDirExists();

  const timestamp = Date.now();
  const filename = `${timestamp}-${emailType}-${attempts}.json`;
  const filePath = path.join(BUFFER_DIR, filename);

  const bufferEntry = {
    emailType,
    data,
    attempts,
    createdAt: timestamp,
    nextRetryAt: timestamp + (RETRY_INTERVALS[attempts] * 60 * 1000) // Convert minutes to ms
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(bufferEntry, null, 2));
    console.log(`Email added to buffer: ${filename}`);
    return true;
  } catch (error) {
    console.error('Error adding email to buffer:', error);
    return false;
  }
};

// Process buffer and retry sending emails
const processBuffer = async () => {
  await ensureBufferDirExists();

  try {
    const files = await fs.readdir(BUFFER_DIR);

    for (const file of files) {
      const filePath = path.join(BUFFER_DIR, file);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const bufferEntry = JSON.parse(fileContent);

      // Check if it's time to retry
      if (bufferEntry.nextRetryAt <= Date.now()) {
        console.log(`Retrying email: ${file}`);

        // Attempt to send the email
        let success = false;
        try {
          success = await retrySendEmail(bufferEntry.emailType, bufferEntry.data);
        } catch (error) {
          console.error(`Error retrying email ${file}:`, error);
        }

        if (success) {
          // Email sent successfully, remove from buffer
          await fs.unlink(filePath);
          console.log(`Email sent successfully and removed from buffer: ${file}`);
        } else {
          // Update retry count and next retry time
          bufferEntry.attempts++;

          if (bufferEntry.attempts >= RETRY_INTERVALS.length) {
            // Max retries reached, move to failed directory
            const failedDir = path.join(BUFFER_DIR, 'failed');
            await fs.mkdir(failedDir, { recursive: true });
            await fs.rename(filePath, path.join(failedDir, file));
            console.log(`Max retries reached, moved to failed: ${file}`);
          } else {
            // Schedule next retry
            bufferEntry.nextRetryAt = Date.now() + (RETRY_INTERVALS[bufferEntry.attempts] * 60 * 1000);
            await fs.writeFile(filePath, JSON.stringify(bufferEntry, null, 2));
            console.log(`Retry failed, updated buffer entry: ${file}, next retry in ${RETRY_INTERVALS[bufferEntry.attempts]} minutes`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing email buffer:', error);
  }
};

// Function to retry sending emails based on type
const retrySendEmail = async (emailType, data) => {
  switch (emailType) {
    case 'transfer_completed':
      return await sendTransferCompletedEmail(data);
    case 'ticket_email':
      return await sendTicketEmail(data);
    case 'payment_rejection':
      return await sendPaymentRejectionEmail(data.ticketSale, data.reason);
    default:
      console.error(`Unknown email type: ${emailType}`);
      return false;
  }
};

// Start the buffer processor
const startBufferProcessor = () => {
  // Process buffer every 1 minute
  setInterval(processBuffer, 60 * 1000);
  console.log('Email buffer processor started');

  // Initial process on startup
  processBuffer();
};

module.exports = {
  addToBuffer,
  processBuffer,
  startBufferProcessor
};
