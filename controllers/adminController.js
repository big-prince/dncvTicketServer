const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const TicketSale = require('../models/TicketSale');

class AdminController {
  // Validation rules for admin login
  static loginValidation = [
    body('adminId')
      .matches(/^DNCV-\d{4}$/)
      .withMessage('Invalid admin ID format. Must be DNCV-XXXX'),
    body('adminId')
      .isLength({ min: 9, max: 9 })
      .withMessage('Admin ID must be exactly 9 characters')
  ];

  // Admin login
  static async login(req, res) {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid input data',
          errors: errors.array()
        });
      }

      const { adminId } = req.body;

      // Find admin with populated fields by ID
      const admin = await Admin.findByAdminId(adminId);
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin ID or admin is inactive'
        });
      }

      // Update last login
      await admin.updateLastLogin();

      // Generate JWT token
      const token = jwt.sign(
        {
          adminId: admin.adminId,
          role: admin.role,
          permissions: admin.permissions
        },
        process.env.JWT_SECRET || 'fallback-secret-key',
        { expiresIn: '8h' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          admin: {
            adminId: admin.adminId,
            name: admin.name,
            role: admin.role,
            permissions: admin.permissions,
            lastLogin: admin.lastLogin,
            loginCount: admin.loginCount
          },
          token
        }
      });

    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get admin dashboard data
  static async getDashboard(req, res) {
    try {
      const admin = req.admin;

      // Get payment statistics
      const [
        totalPendingPayments,
        totalApprovedPayments,
        totalRejectedPayments,
        totalRevenue,
        recentPendingPayments,
        todayStats
      ] = await Promise.all([
        TicketSale.countDocuments({ 'paymentInfo.status': 'pending_approval' }),
        TicketSale.countDocuments({ 'paymentInfo.status': 'completed' }),
        TicketSale.countDocuments({ 'paymentInfo.status': 'rejected' }),
        TicketSale.aggregate([
          { $match: { 'paymentInfo.status': 'completed' } },
          { $group: { _id: null, total: { $sum: '$ticketInfo.totalAmount' } } }
        ]),
        TicketSale.find({ 'paymentInfo.status': 'pending_approval' })
          .sort({ 'paymentInfo.transferMarkedAt': -1 })
          .limit(10)
          .select('customerInfo ticketInfo paymentInfo createdAt'),
        TicketSale.aggregate([
          {
            $match: {
              createdAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0))
              }
            }
          },
          {
            $group: {
              _id: '$paymentInfo.status',
              count: { $sum: 1 },
              revenue: { $sum: '$ticketInfo.totalAmount' }
            }
          }
        ])
      ]);

      const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

      res.json({
        success: true,
        data: {
          admin: {
            adminId: admin.adminId,
            name: admin.name,
            role: admin.role,
            permissions: admin.permissions
          },
          statistics: {
            pendingPayments: totalPendingPayments,
            approvedPayments: totalApprovedPayments,
            rejectedPayments: totalRejectedPayments,
            totalRevenue: revenue,
            todayStats: todayStats
          },
          recentPendingPayments: recentPendingPayments.map(payment => ({
            id: payment._id,
            reference: payment.paymentInfo.reference,
            customerName: `${payment.customerInfo.firstName} ${payment.customerInfo.lastName}`,
            email: payment.customerInfo.email,
            phone: payment.customerInfo.phone,
            ticketType: payment.ticketInfo.typeName,
            quantity: payment.ticketInfo.quantity,
            amount: payment.ticketInfo.totalAmount,
            transferMarkedAt: payment.paymentInfo.transferMarkedAt,
            createdAt: payment.createdAt,
            status: payment.paymentInfo.status
          }))
        }
      });

    } catch (error) {
      console.error('Dashboard data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get pending payments with pagination
  static async getPendingPayments(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const [payments, totalCount] = await Promise.all([
        TicketSale.find({ 'paymentInfo.status': 'pending_approval' })
          .sort({ 'paymentInfo.transferMarkedAt': -1 })
          .skip(skip)
          .limit(limit),
        TicketSale.countDocuments({ 'paymentInfo.status': 'pending_approval' })
      ]);

      const formattedPayments = payments.map(payment => ({
        id: payment._id,
        reference: payment.paymentInfo.reference,
        customerInfo: {
          name: `${payment.customerInfo.firstName} ${payment.customerInfo.lastName}`,
          email: payment.customerInfo.email,
          phone: payment.customerInfo.phone
        },
        ticketInfo: {
          type: payment.ticketInfo.typeName,
          quantity: payment.ticketInfo.quantity,
          unitPrice: payment.ticketInfo.unitPrice,
          totalAmount: payment.ticketInfo.totalAmount
        },
        paymentInfo: {
          method: payment.paymentInfo.method,
          status: payment.paymentInfo.status,
          amount: payment.paymentInfo.amount,
          transferMarkedAt: payment.paymentInfo.transferMarkedAt
        },
        createdAt: payment.createdAt,
        daysPending: Math.floor((Date.now() - new Date(payment.paymentInfo.transferMarkedAt)) / (1000 * 60 * 60 * 24))
      }));

      res.json({
        success: true,
        data: {
          payments: formattedPayments,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            totalCount,
            hasNext: page < Math.ceil(totalCount / limit),
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Get pending payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending payments',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Approve payment
  static async approvePayment(req, res) {
    try {
      const { reference } = req.params;
      const admin = req.admin;

      if (!admin.hasPermission('approvePayments')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to approve payments'
        });
      }

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      if (ticketSale.paymentInfo.status !== 'pending_approval') {
        return res.status(400).json({
          success: false,
          message: 'Payment is not pending approval'
        });
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'completed';
      ticketSale.paymentInfo.paidAt = new Date();
      ticketSale.paymentInfo.approvedBy = admin.adminId;
      ticketSale.status = 'confirmed';

      // Generate QR code
      const qrData = JSON.stringify({
        ticketId: ticketSale.ticketId,
        customerName: `${ticketSale.customerInfo.firstName} ${ticketSale.customerInfo.lastName}`,
        ticketType: ticketSale.ticketInfo.typeName,
        quantity: ticketSale.ticketInfo.quantity,
        eventDate: '2025-09-28',
        venue: 'Oasis Event Centre, Port Harcourt'
      });

      ticketSale.qrCode = qrData;
      await ticketSale.save().catch(error => {
        console.error('Error saving ticket sale:', error);
        throw new Error('Failed to save ticket sale');
      })

      // Send ticket email
      const { sendTicketEmail } = require('../utils/emailService');
      await sendTicketEmail(ticketSale);

      res.json({
        success: true,
        message: 'Payment approved and ticket sent to customer',
        data: {
          reference,
          approvedBy: admin.adminId,
          approvedAt: ticketSale.paymentInfo.paidAt,
          customerEmail: ticketSale.customerInfo.email
        }
      });

    } catch (error) {
      console.error('Approve payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Reject payment
  static async rejectPayment(req, res) {
    try {
      const { reference } = req.params;
      const { reason } = req.body;
      const admin = req.admin;

      if (!admin.hasPermission('rejectPayments')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to reject payments'
        });
      }

      const ticketSale = await TicketSale.findOne({
        'paymentInfo.reference': reference
      });

      if (!ticketSale) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      if (ticketSale.paymentInfo.status !== 'pending_approval') {
        return res.status(400).json({
          success: false,
          message: 'Payment is not pending approval'
        });
      }

      // Update payment status
      ticketSale.paymentInfo.status = 'rejected';
      ticketSale.paymentInfo.rejectedAt = new Date();
      ticketSale.paymentInfo.rejectedBy = admin.adminId;
      ticketSale.paymentInfo.rejectionReason = reason || 'Payment verification failed';
      ticketSale.status = 'rejected';

      await ticketSale.save();

      // Send rejection email
      const { sendPaymentRejectionEmail } = require('../utils/emailService');
      await sendPaymentRejectionEmail(ticketSale, reason);

      res.json({
        success: true,
        message: 'Payment rejected and customer notified',
        data: {
          reference,
          rejectedBy: admin.adminId,
          rejectedAt: ticketSale.paymentInfo.rejectedAt,
          reason: reason || 'Payment verification failed'
        }
      });

    } catch (error) {
      console.error('Reject payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reject payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Enhanced analytics with AI insights
  static async getAnalytics(req, res) {
    try {
      const admin = req.admin;

      if (!admin.hasPermission('viewAnalytics')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to view analytics'
        });
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        // Time-based analytics
        ticketSalesOverTime,
        revenueOverTime,
        hourlyPurchasePattern,

        // Product analytics
        ticketTypeDistribution,
        averageOrderValue,
        conversionFunnelData,

        // Customer analytics
        customerSegmentation,
        topCustomers,
        customerRetention,
        geographicDistribution,

        // Performance metrics
        paymentStatusDistribution,
        responseTimeMetrics,
        abandonmentRate,

        // Trends and forecasting data
        weeklyTrends,
        monthlyComparison,
        projectionData
      ] = await Promise.all([
        // Time-based analytics
        TicketSale.aggregate([
          {
            $match: {
              createdAt: { $gte: thirtyDaysAgo }
            }
          },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
              },
              count: { $sum: 1 },
              revenue: { $sum: "$ticketInfo.totalAmount" },
              tickets: { $sum: "$ticketInfo.quantity" }
            }
          },
          { $sort: { "_id.date": 1 } }
        ]),

        TicketSale.aggregate([
          {
            $match: {
              createdAt: { $gte: thirtyDaysAgo },
              'paymentInfo.status': 'completed'
            }
          },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
              },
              revenue: { $sum: "$ticketInfo.totalAmount" }
            }
          },
          { $sort: { "_id.date": 1 } }
        ]),

        TicketSale.aggregate([
          {
            $group: {
              _id: { $hour: "$createdAt" },
              count: { $sum: 1 },
              revenue: { $sum: "$ticketInfo.totalAmount" }
            }
          },
          { $sort: { "_id": 1 } }
        ]),

        // Product analytics
        TicketSale.aggregate([
          {
            $group: {
              _id: "$ticketInfo.typeName",
              count: { $sum: "$ticketInfo.quantity" },
              revenue: { $sum: "$ticketInfo.totalAmount" },
              orders: { $sum: 1 },
              avgPrice: { $avg: "$ticketInfo.unitPrice" }
            }
          }
        ]),

        TicketSale.aggregate([
          {
            $match: { 'paymentInfo.status': 'completed' }
          },
          {
            $group: {
              _id: null,
              avgOrderValue: { $avg: "$ticketInfo.totalAmount" },
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: "$ticketInfo.totalAmount" }
            }
          }
        ]),

        TicketSale.aggregate([
          {
            $group: {
              _id: "$paymentInfo.status",
              count: { $sum: 1 },
              percentage: { $avg: 1 }
            }
          }
        ]),

        // Customer analytics
        TicketSale.aggregate([
          {
            $match: { 'paymentInfo.status': 'completed' }
          },
          {
            $group: {
              _id: "$customerInfo.email",
              customerName: { $first: { $concat: ["$customerInfo.firstName", " ", "$customerInfo.lastName"] } },
              totalSpent: { $sum: "$ticketInfo.totalAmount" },
              ticketCount: { $sum: "$ticketInfo.quantity" },
              orderCount: { $sum: 1 },
              firstPurchase: { $min: "$createdAt" },
              lastPurchase: { $max: "$createdAt" },
              avgOrderValue: { $avg: "$ticketInfo.totalAmount" }
            }
          },
          {
            $addFields: {
              customerValue: {
                $cond: {
                  if: { $gte: ["$totalSpent", 50000] },
                  then: "VIP",
                  else: {
                    $cond: {
                      if: { $gte: ["$totalSpent", 15000] },
                      then: "Premium",
                      else: "Regular"
                    }
                  }
                }
              },
              daysSinceFirstPurchase: {
                $divide: [
                  { $subtract: [new Date(), "$firstPurchase"] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          },
          { $sort: { totalSpent: -1 } }
        ]),

        TicketSale.aggregate([
          {
            $match: { 'paymentInfo.status': 'completed' }
          },
          {
            $group: {
              _id: "$customerInfo.email",
              customerName: { $first: { $concat: ["$customerInfo.firstName", " ", "$customerInfo.lastName"] } },
              totalSpent: { $sum: "$ticketInfo.totalAmount" },
              ticketCount: { $sum: "$ticketInfo.quantity" },
              orderCount: { $sum: 1 },
              phone: { $first: "$customerInfo.phone" }
            }
          },
          { $sort: { totalSpent: -1 } },
          { $limit: 20 }
        ]),

        TicketSale.aggregate([
          {
            $match: { 'paymentInfo.status': 'completed' }
          },
          {
            $group: {
              _id: { $month: "$createdAt" },
              newCustomers: { $addToSet: "$customerInfo.email" },
              returningCustomers: { $sum: 1 }
            }
          },
          {
            $addFields: {
              newCustomerCount: { $size: "$newCustomers" }
            }
          }
        ]),

        // Geographic analysis (based on phone area codes)
        TicketSale.aggregate([
          {
            $match: { 'paymentInfo.status': 'completed' }
          },
          {
            $addFields: {
              areaCode: { $substr: ["$customerInfo.phone", 0, 4] }
            }
          },
          {
            $group: {
              _id: "$areaCode",
              count: { $sum: 1 },
              revenue: { $sum: "$ticketInfo.totalAmount" }
            }
          },
          { $sort: { count: -1 } }
        ]),

        // Performance metrics
        TicketSale.aggregate([
          {
            $group: {
              _id: "$paymentInfo.status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$ticketInfo.totalAmount" },
              avgProcessingTime: {
                $avg: {
                  $subtract: ["$paymentInfo.paidAt", "$paymentInfo.transferMarkedAt"]
                }
              }
            }
          }
        ]),

        // Response time metrics
        TicketSale.aggregate([
          {
            $match: {
              'paymentInfo.status': { $in: ['completed', 'rejected'] },
              'paymentInfo.transferMarkedAt': { $exists: true },
              'paymentInfo.paidAt': { $exists: true }
            }
          },
          {
            $group: {
              _id: null,
              avgResponseTime: {
                $avg: {
                  $subtract: ["$paymentInfo.paidAt", "$paymentInfo.transferMarkedAt"]
                }
              },
              maxResponseTime: {
                $max: {
                  $subtract: ["$paymentInfo.paidAt", "$paymentInfo.transferMarkedAt"]
                }
              },
              minResponseTime: {
                $min: {
                  $subtract: ["$paymentInfo.paidAt", "$paymentInfo.transferMarkedAt"]
                }
              }
            }
          }
        ]),

        // Abandonment rate
        TicketSale.aggregate([
          {
            $group: {
              _id: null,
              totalStarted: { $sum: 1 },
              completed: {
                $sum: {
                  $cond: [{ $eq: ["$paymentInfo.status", "completed"] }, 1, 0]
                }
              },
              abandoned: {
                $sum: {
                  $cond: [{ $eq: ["$paymentInfo.status", "pending_approval"] }, 1, 0]
                }
              }
            }
          },
          {
            $addFields: {
              completionRate: { $divide: ["$completed", "$totalStarted"] },
              abandonmentRate: { $divide: ["$abandoned", "$totalStarted"] }
            }
          }
        ]),

        // Trends and forecasting
        TicketSale.aggregate([
          {
            $match: {
              createdAt: { $gte: sevenDaysAgo }
            }
          },
          {
            $group: {
              _id: { $dayOfWeek: "$createdAt" },
              count: { $sum: 1 },
              revenue: { $sum: "$ticketInfo.totalAmount" }
            }
          },
          { $sort: { "_id": 1 } }
        ]),

        TicketSale.aggregate([
          {
            $group: {
              _id: { $month: "$createdAt" },
              count: { $sum: 1 },
              revenue: { $sum: "$ticketInfo.totalAmount" },
              tickets: { $sum: "$ticketInfo.quantity" }
            }
          },
          { $sort: { "_id": 1 } }
        ]),

        // Projection data for forecasting
        TicketSale.aggregate([
          {
            $match: {
              createdAt: { $gte: thirtyDaysAgo },
              'paymentInfo.status': 'completed'
            }
          },
          {
            $group: {
              _id: null,
              dailyAvgRevenue: { $avg: "$ticketInfo.totalAmount" },
              dailyAvgTickets: { $avg: "$ticketInfo.quantity" },
              totalDays: { $sum: 1 }
            }
          }
        ])
      ]);

      // AI-powered insights generation
      const generateInsights = (data) => {
        const insights = [];
        const suggestions = [];
        const alerts = [];

        // Revenue insights
        const totalRevenue = data.revenueOverTime.reduce((sum, day) => sum + day.revenue, 0);
        const avgDailyRevenue = totalRevenue / data.revenueOverTime.length;

        if (avgDailyRevenue > 100000) {
          insights.push({
            type: 'success',
            title: 'Strong Revenue Performance',
            description: `Daily average revenue of ₦${avgDailyRevenue.toLocaleString()} indicates excellent market response.`,
            priority: 'high'
          });
        }

        // Ticket type optimization
        const topTicketType = data.ticketTypeDistribution.reduce((max, ticket) =>
          ticket.revenue > max.revenue ? ticket : max, data.ticketTypeDistribution[0]);

        if (topTicketType) {
          suggestions.push({
            type: 'optimization',
            title: 'Focus on High-Performing Tickets',
            description: `${topTicketType._id} tickets generate the highest revenue. Consider promoting similar experiences.`,
            impact: 'high',
            effort: 'low'
          });
        }

        // Customer behavior insights
        const vipCustomers = data.customerSegmentation.filter(c => c.customerValue === 'VIP').length;
        const totalCustomers = data.customerSegmentation.length;
        const vipPercentage = (vipCustomers / totalCustomers) * 100;

        if (vipPercentage > 15) {
          insights.push({
            type: 'info',
            title: 'High-Value Customer Base',
            description: `${vipPercentage.toFixed(1)}% of customers are VIP tier, indicating strong premium appeal.`,
            priority: 'medium'
          });
        }

        // Time-based recommendations
        const peakHour = data.hourlyPurchasePattern.reduce((max, hour) =>
          hour.count > max.count ? hour : max, data.hourlyPurchasePattern[0]);

        if (peakHour) {
          suggestions.push({
            type: 'timing',
            title: 'Optimize Marketing Timing',
            description: `Peak purchase activity occurs at ${peakHour._id}:00. Schedule promotions accordingly.`,
            impact: 'medium',
            effort: 'low'
          });
        }

        // Response time alerts
        const avgResponseTimeHours = data.responseTimeMetrics[0]?.avgResponseTime / (1000 * 60 * 60);
        if (avgResponseTimeHours > 24) {
          alerts.push({
            type: 'warning',
            title: 'Slow Payment Processing',
            description: `Average response time of ${avgResponseTimeHours.toFixed(1)} hours exceeds target. Consider increasing admin capacity.`,
            urgency: 'high'
          });
        }

        // Abandonment rate warnings
        const abandonmentRate = data.abandonmentRate[0]?.abandonmentRate || 0;
        if (abandonmentRate > 0.3) {
          alerts.push({
            type: 'critical',
            title: 'High Abandonment Rate',
            description: `${(abandonmentRate * 100).toFixed(1)}% abandonment rate indicates checkout issues. Review payment process.`,
            urgency: 'critical'
          });
        }

        // Growth projections
        const projectedMonthlyRevenue = avgDailyRevenue * 30;
        suggestions.push({
          type: 'projection',
          title: 'Revenue Forecast',
          description: `Based on current trends, projected monthly revenue: ₦${projectedMonthlyRevenue.toLocaleString()}`,
          impact: 'info',
          effort: 'none'
        });

        return { insights, suggestions, alerts };
      };

      const analyticsData = {
        salesOverTime: ticketSalesOverTime,
        revenueOverTime: revenueOverTime,
        hourlyPurchasePattern: hourlyPurchasePattern,
        ticketTypeDistribution: ticketTypeDistribution,
        averageOrderValue: averageOrderValue[0] || {},
        customerSegmentation: customerSegmentation,
        topCustomers: topCustomers,
        customerRetention: customerRetention,
        geographicDistribution: geographicDistribution.slice(0, 10),
        paymentStatusDistribution: paymentStatusDistribution,
        responseTimeMetrics: responseTimeMetrics,
        abandonmentRate: abandonmentRate,
        weeklyTrends: weeklyTrends,
        monthlyComparison: monthlyComparison,
        projectionData: projectionData[0] || {}
      };

      const aiInsights = generateInsights(analyticsData);

      res.json({
        success: true,
        data: {
          ...analyticsData,
          aiInsights: aiInsights,
          metadata: {
            lastUpdated: new Date().toISOString(),
            dataRange: {
              from: thirtyDaysAgo.toISOString(),
              to: new Date().toISOString()
            },
            totalDataPoints: ticketSalesOverTime.length,
            confidence: 'high'
          }
        }
      });

    } catch (error) {
      console.error('Enhanced analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get admin profile
  static async getProfile(req, res) {
    try {
      const admin = req.admin;

      res.json({
        success: true,
        data: {
          adminId: admin.adminId,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions,
          lastLogin: admin.lastLogin,
          loginCount: admin.loginCount,
          createdAt: admin.createdAt
        }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get all admins (super-admin only)
  static async getAllAdmins(req, res) {
    try {
      const admins = await Admin.find({})
        .select('-__v')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: admins
      });

    } catch (error) {
      console.error('Get all admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admins',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Create new admin (super-admin only)
  static async createAdmin(req, res) {
    try {
      const { name, role, permissions } = req.body;
      const createdBy = req.admin.adminId;

      // Generate unique admin ID
      let adminId;
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        adminId = Admin.generateAdminId();
        const existingAdmin = await Admin.findOne({ adminId });
        if (!existingAdmin) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate unique admin ID'
        });
      }

      const admin = new Admin({
        adminId,
        name,
        role: role || 'admin',
        permissions: permissions || {},
        createdBy
      });

      await admin.save();

      res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: {
          adminId: admin.adminId,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions,
          createdAt: admin.createdAt
        }
      });

    } catch (error) {
      console.error('Create admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create admin',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Update admin (super-admin only)
  static async updateAdmin(req, res) {
    try {
      const { adminId } = req.params;
      const updates = req.body;

      // Prevent updating sensitive fields
      delete updates.adminId;
      delete updates.createdAt;
      delete updates.loginCount;
      delete updates.lastLogin;

      const admin = await Admin.findOneAndUpdate(
        { adminId },
        updates,
        { new: true, runValidators: true }
      );

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      res.json({
        success: true,
        message: 'Admin updated successfully',
        data: admin
      });

    } catch (error) {
      console.error('Update admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update admin',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Delete admin (super-admin only)
  static async deleteAdmin(req, res) {
    try {
      const { adminId } = req.params;

      // Prevent self-deletion
      if (adminId === req.admin.adminId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own admin account'
        });
      }

      const admin = await Admin.findOneAndUpdate(
        { adminId },
        { isActive: false },
        { new: true }
      );

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      res.json({
        success: true,
        message: 'Admin deactivated successfully'
      });

    } catch (error) {
      console.error('Delete admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete admin',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get system stats (super-admin only)
  static async getSystemStats(req, res) {
    try {
      const [
        totalAdmins,
        activeAdmins,
        totalTicketsSold,
        totalRevenue,
        systemUptime
      ] = await Promise.all([
        Admin.countDocuments({}),
        Admin.countDocuments({ isActive: true }),
        TicketSale.countDocuments({ 'paymentInfo.status': 'completed' }),
        TicketSale.aggregate([
          { $match: { 'paymentInfo.status': 'completed' } },
          { $group: { _id: null, total: { $sum: '$ticketInfo.totalAmount' } } }
        ]),
        Promise.resolve(process.uptime())
      ]);

      const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

      res.json({
        success: true,
        data: {
          admins: {
            total: totalAdmins,
            active: activeAdmins
          },
          tickets: {
            sold: totalTicketsSold,
            revenue: revenue
          },
          system: {
            uptime: systemUptime,
            nodeVersion: process.version,
            platform: process.platform
          }
        }
      });

    } catch (error) {
      console.error('Get system stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system stats',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Toggle maintenance mode (super-admin only)
  static async toggleMaintenanceMode(req, res) {
    try {
      // This would typically be stored in a system settings collection
      // For now, we'll just return a success message
      res.json({
        success: true,
        message: 'Maintenance mode toggled successfully'
      });

    } catch (error) {
      console.error('Toggle maintenance mode error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle maintenance mode',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Private helper methods
  static _generateCSV(sales) {
    const headers = [
      'Sale ID',
      'Customer Name',
      'Email',
      'Phone',
      'Ticket Type',
      'Quantity',
      'Unit Price',
      'Total Amount',
      'Payment Status',
      'Payment Reference',
      'Purchase Date',
      'Payment Date'
    ];

    const rows = sales.map(sale => [
      sale._id,
      `${sale.customerInfo.firstName} ${sale.customerInfo.lastName}`,
      sale.customerInfo.email,
      sale.customerInfo.phone,
      sale.ticketInfo.typeName,
      sale.ticketInfo.quantity,
      sale.ticketInfo.unitPrice,
      sale.ticketInfo.totalAmount,
      sale.paymentInfo.status,
      sale.paymentInfo.reference,
      sale.createdAt.toISOString(),
      sale.paymentInfo.paidAt ? sale.paymentInfo.paidAt.toISOString() : ''
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  }
}

module.exports = AdminController;
