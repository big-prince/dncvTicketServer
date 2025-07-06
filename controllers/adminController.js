const TicketSale = require('../models/TicketSale');

class AdminController {
  // Get dashboard statistics
  static async getDashboardStats(req, res) {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Total stats
      const totalStats = await TicketSale.aggregate([
        {
          $match: { 'paymentInfo.status': 'completed' }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: '$paymentInfo.amount' },
            totalTickets: { $sum: '$ticketInfo.quantity' }
          }
        }
      ]);

      // Today's stats
      const todayStats = await TicketSale.aggregate([
        {
          $match: {
            'paymentInfo.status': 'completed',
            'paymentInfo.paidAt': { $gte: startOfToday }
          }
        },
        {
          $group: {
            _id: null,
            todaySales: { $sum: 1 },
            todayRevenue: { $sum: '$paymentInfo.amount' },
            todayTickets: { $sum: '$ticketInfo.quantity' }
          }
        }
      ]);

      // Ticket type breakdown
      const ticketTypeStats = await TicketSale.aggregate([
        {
          $match: { 'paymentInfo.status': 'completed' }
        },
        {
          $group: {
            _id: '$ticketInfo.type',
            count: { $sum: 1 },
            quantity: { $sum: '$ticketInfo.quantity' },
            revenue: { $sum: '$paymentInfo.amount' }
          }
        }
      ]);

      // Recent sales trend (last 7 days)
      const salesTrend = await TicketSale.aggregate([
        {
          $match: {
            'paymentInfo.status': 'completed',
            'paymentInfo.paidAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$paymentInfo.paidAt'
              }
            },
            dailySales: { $sum: 1 },
            dailyRevenue: { $sum: '$paymentInfo.amount' }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ]);

      // Payment method stats
      const paymentStats = await TicketSale.aggregate([
        {
          $match: { 'paymentInfo.status': 'completed' }
        },
        {
          $group: {
            _id: '$paymentInfo.gateway',
            count: { $sum: 1 },
            revenue: { $sum: '$paymentInfo.amount' }
          }
        }
      ]);

      const total = totalStats[0] || { totalSales: 0, totalRevenue: 0, totalTickets: 0 };
      const today = todayStats[0] || { todaySales: 0, todayRevenue: 0, todayTickets: 0 };

      // Calculate conversion rate (mock data for now)
      const totalViews = total.totalSales * 1.2; // Assume 20% conversion rate
      const conversionRate = totalViews > 0 ? (total.totalSales / totalViews * 100).toFixed(1) : 0;

      res.json({
        success: true,
        data: {
          overview: {
            totalSales: total.totalSales,
            totalRevenue: total.totalRevenue,
            totalTickets: total.totalTickets,
            conversionRate: parseFloat(conversionRate)
          },
          today: {
            sales: today.todaySales,
            revenue: today.todayRevenue,
            tickets: today.todayTickets
          },
          ticketTypes: ticketTypeStats,
          salesTrend,
          paymentMethods: paymentStats
        }
      });

    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get all sales with pagination and filters
  static async getAllSales(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        ticketType,
        search,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter query
      const filter = {};

      if (status && status !== 'all') {
        filter['paymentInfo.status'] = status;
      }

      if (ticketType && ticketType !== 'all') {
        filter['ticketInfo.type'] = ticketType;
      }

      if (search) {
        filter.$or = [
          { 'customerInfo.firstName': { $regex: search, $options: 'i' } },
          { 'customerInfo.lastName': { $regex: search, $options: 'i' } },
          { 'customerInfo.email': { $regex: search, $options: 'i' } },
          { 'paymentInfo.reference': { $regex: search, $options: 'i' } }
        ];
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [sales, totalCount] = await Promise.all([
        TicketSale.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        TicketSale.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: {
          sales,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalCount,
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('Error fetching sales:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sales data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get single sale details
  static async getSaleDetails(req, res) {
    try {
      const { saleId } = req.params;

      const sale = await TicketSale.findById(saleId);

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Sale not found'
        });
      }

      res.json({
        success: true,
        data: sale
      });

    } catch (error) {
      console.error('Error fetching sale details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sale details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Update sale status (manual override)
  static async updateSaleStatus(req, res) {
    try {
      const { saleId } = req.params;
      const { status, reason } = req.body;

      const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status provided'
        });
      }

      const sale = await TicketSale.findById(saleId);

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Sale not found'
        });
      }

      // Update status
      sale.paymentInfo.status = status;
      sale.paymentInfo.updatedAt = new Date();

      if (reason) {
        sale.paymentInfo.statusReason = reason;
      }

      await sale.save();

      res.json({
        success: true,
        message: 'Sale status updated successfully',
        data: {
          saleId: sale._id,
          newStatus: status,
          updatedAt: sale.paymentInfo.updatedAt
        }
      });

    } catch (error) {
      console.error('Error updating sale status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update sale status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Export sales data
  static async exportSales(req, res) {
    try {
      const {
        format = 'csv',
        status,
        ticketType,
        startDate,
        endDate
      } = req.query;

      // Build filter query
      const filter = {};

      if (status && status !== 'all') {
        filter['paymentInfo.status'] = status;
      }

      if (ticketType && ticketType !== 'all') {
        filter['ticketInfo.type'] = ticketType;
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      const sales = await TicketSale.find(filter).lean();

      if (format === 'csv') {
        const csv = AdminController._generateCSV(sales);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=ticket-sales-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: sales
        });
      }

    } catch (error) {
      console.error('Error exporting sales:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export sales data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get ticket verification logs
  static async getVerificationLogs(req, res) {
    try {
      const { page = 1, limit = 50 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const verifiedTickets = await TicketSale.aggregate([
        {
          $unwind: '$tickets'
        },
        {
          $match: {
            'tickets.isUsed': true
          }
        },
        {
          $project: {
            ticketId: '$tickets.ticketId',
            customerName: {
              $concat: ['$customerInfo.firstName', ' ', '$customerInfo.lastName']
            },
            customerEmail: '$customerInfo.email',
            ticketType: '$ticketInfo.typeName',
            usedAt: '$tickets.usedAt',
            verifiedBy: '$tickets.verifiedBy'
          }
        },
        {
          $sort: { usedAt: -1 }
        },
        {
          $skip: skip
        },
        {
          $limit: parseInt(limit)
        }
      ]);

      res.json({
        success: true,
        data: verifiedTickets
      });

    } catch (error) {
      console.error('Error fetching verification logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch verification logs',
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
