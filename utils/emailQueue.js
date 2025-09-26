const EventEmitter = require('events');
const { sendTransferCompletedEmail } = require('./emailService');
const { addToBuffer } = require('./buffer/emailBuffer');

class EmailQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.retryDelay = 5000;
    this.maxRetries = 3;
  }

  async queueEmail(type, data, priority = 'normal') {
    const emailJob = {
      id: Date.now() + Math.random(),
      type,
      data,
      priority,
      attempts: 0,
      createdAt: new Date()
    };

    if (priority === 'high') {
      this.queue.unshift(emailJob);
    } else {
      this.queue.push(emailJob);
    }

    this.processQueue();
    return emailJob.id;
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();

      try {
        await this.processEmailJob(job);
        this.emit('job:success', job);
      } catch (error) {
        job.attempts++;
        job.lastError = error.message;

        if (job.attempts < this.maxRetries) {
          setTimeout(() => {
            this.queue.unshift(job);
            this.processQueue();
          }, this.retryDelay * job.attempts);
          this.emit('job:retry', job);
        } else {
          await addToBuffer(job.type, job.data);
          this.emit('job:failed', job);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.processing = false;
  }

  async processEmailJob(job) {
    switch (job.type) {
      case 'transfer_completed':
        return await sendTransferCompletedEmail(job.data);
      default:
        throw new Error(`Unknown email job type: ${job.type}`);
    }
  }

  getQueueStatus() {
    return {
      pending: this.queue.length,
      processing: this.processing,
      queue: this.queue.map(job => ({
        id: job.id,
        type: job.type,
        attempts: job.attempts,
        createdAt: job.createdAt
      }))
    };
  }
}

const emailQueue = new EmailQueue();

module.exports = {
  queueEmail: (type, data, priority) => emailQueue.queueEmail(type, data, priority),
  getQueueStatus: () => emailQueue.getQueueStatus(),
  emailQueue
};
