const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true,
    unique: true,
    match: /^DNCV-\d{4}$/,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['super-admin', 'admin', 'manager'],
    default: 'admin'
  },
  permissions: {
    approvePayments: { type: Boolean, default: true },
    rejectPayments: { type: Boolean, default: true },
    viewAnalytics: { type: Boolean, default: true },
    verifyTickets: { type: Boolean, default: true },
    manageAdmins: { type: Boolean, default: false },
    systemSettings: { type: Boolean, default: false }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  loginCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    default: 'system'
  }
});

// Indexes for performance
adminSchema.index({ adminId: 1 });
adminSchema.index({ isActive: 1 });
adminSchema.index({ role: 1 });

// Methods
adminSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  this.loginCount += 1;
  return this.save();
};

adminSchema.methods.hasPermission = function (permission) {
  return this.isActive && this.permissions[permission];
};

// Static methods
adminSchema.statics.findByAdminId = function (adminId) {
  return this.findOne({ adminId, isActive: true });
};

adminSchema.statics.generateAdminId = function () {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return `DNCV-${randomNum}`;
};

module.exports = mongoose.model('Admin', adminSchema);
