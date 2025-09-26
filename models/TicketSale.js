const mongoose = require('mongoose');

const ticketSaleSchema = new mongoose.Schema({
  // Customer Information
  customerInfo: {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    }
  },

  // Ticket Information
  ticketInfo: {
    typeId: {
      type: String,
      required: true,
      enum: ['regular', 'student', 'vip-single', 'vip-couple', 'table']
    },
    typeName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true
    },
    totalAmount: {
      type: Number,
      required: true
    }
  },

  // Payment Information
  paymentInfo: {
    method: {
      type: String,
      enum: ['paystack', 'opay', 'bank_transfer'],
      default: 'bank_transfer'
    },
    status: {
      type: String,
      enum: ['pending', 'pending_transfer', 'pending_approval', 'completed', 'failed', 'rejected', 'refunded'],
      default: 'pending'
    },
    reference: {
      type: String,
      required: true
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    provider: {
      type: String,
      enum: ['paystack', 'opay', 'bank_transfer'],
      default: 'bank_transfer'
    },
    paidAt: {
      type: Date
    },
    amount: {
      type: Number,
      required: true
    },
    transferMarkedAt: {
      type: Date
    },
    userIpAddress: {
      type: String
    },
    transferClickedAt: {
      type: Date
    },
    transferClickCount: {
      type: Number,
      default: 0
    },
    lastReminderSent: {
      type: Date
    },
    rejectedAt: {
      type: Date
    },
    rejectedBy: {
      type: String
    },
    rejectionReason: {
      type: String
    },
    approvedBy: {
      type: String
    }
  },

  // Ticket Details
  ticketId: {
    type: String,
    required: true
  },
  qrCode: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending_payment', 'confirmed', 'cancelled', 'rejected'],
    default: 'pending_payment'
  },

  // Metadata
  eventDetails: {
    eventName: {
      type: String,
      default: 'De Noble Choral Voices 5th Edition Concert'
    },
    eventDate: {
      type: Date,
      default: new Date('2024-12-22T17:00:00Z')
    },
    venue: {
      type: String,
      default: 'National Theatre, Lagos'
    }
  },

  // Email Status
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },

  // Admin Notes
  adminNotes: {
    type: String
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
ticketSaleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for better query performance
ticketSaleSchema.index({ 'customerInfo.email': 1 });
ticketSaleSchema.index({ 'paymentInfo.reference': 1 }, { unique: true });
ticketSaleSchema.index({ 'paymentInfo.status': 1 });
ticketSaleSchema.index({ 'ticketId': 1 });
ticketSaleSchema.index({ createdAt: -1 });

// Virtual for customer's full name
ticketSaleSchema.virtual('customerInfo.fullName').get(function () {
  return `${this.customerInfo.firstName} ${this.customerInfo.lastName}`;
});

// Virtual for total tickets count
ticketSaleSchema.virtual('totalTickets').get(function () {
  return this.ticketInfo.quantity || 0;
});

// Ensure virtuals are included in JSON output
ticketSaleSchema.set('toJSON', { virtuals: true });
ticketSaleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TicketSale', ticketSaleSchema);
