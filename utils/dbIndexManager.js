const mongoose = require('mongoose');

class DatabaseIndexManager {
  constructor() {
    this.isInitialized = false;
  }

  // Initialize all database indexes
  async init() {
    if (this.isInitialized) {
      console.log('🔍 Database indexes already initialized');
      return;
    }

    console.log('🔧 Initializing database indexes...');

    try {
      await this.cleanupOldIndexes();
      await this.createRequiredIndexes();
      this.isInitialized = true;
      console.log('✅ Database indexes initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing database indexes:', error);
      throw error;
    }
  }

  // Clean up old/conflicting indexes
  async cleanupOldIndexes() {
    try {
      const TicketSale = mongoose.model('TicketSale');
      const collection = TicketSale.collection;

      // Get existing indexes
      const existingIndexes = await collection.listIndexes().toArray();
      console.log('🔍 Found existing indexes:', existingIndexes.map(idx => idx.name));

      // Drop problematic indexes that conflict with new schema
      const problematicIndexes = [
        'tickets.ticketId_1',
        'tickets_1',
        'ticketId_1'
      ];

      for (const indexName of problematicIndexes) {
        try {
          const indexExists = existingIndexes.some(idx => idx.name === indexName);
          if (indexExists) {
            await collection.dropIndex(indexName);
            console.log(`🗑️  Dropped conflicting index: ${indexName}`);
          }
        } catch (error) {
          // Index might not exist, which is fine
          if (error.code !== 27) { // 27 = IndexNotFound
            console.warn(`⚠️  Could not drop index ${indexName}:`, error.message);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error cleaning up old indexes:', error);
      // Don't throw here, continue with creating new indexes
    }
  }

  // Create required indexes for optimal performance
  async createRequiredIndexes() {
    try {
      const TicketSale = mongoose.model('TicketSale');
      const collection = TicketSale.collection;

      // Define required indexes
      const requiredIndexes = [
        // Payment reference - unique and most frequently queried
        {
          fields: { 'paymentInfo.reference': 1 },
          options: {
            unique: true,
            name: 'payment_reference_unique',
            background: true
          }
        },

        // Payment status - for admin queries and cron jobs
        {
          fields: { 'paymentInfo.status': 1 },
          options: {
            name: 'payment_status_idx',
            background: true
          }
        },

        // Transfer marked date - for cron job queries
        {
          fields: { 'paymentInfo.transferMarkedAt': 1 },
          options: {
            name: 'transfer_marked_date_idx',
            background: true,
            sparse: true // Only index documents that have this field
          }
        },

        // Customer email - for customer lookups
        {
          fields: { 'customerInfo.email': 1 },
          options: {
            name: 'customer_email_idx',
            background: true
          }
        },

        // Created date - for reporting and sorting
        {
          fields: { 'createdAt': -1 },
          options: {
            name: 'created_date_desc_idx',
            background: true
          }
        },

        // Compound index for cron job queries (status + transfer date)
        {
          fields: {
            'paymentInfo.status': 1,
            'paymentInfo.transferMarkedAt': 1
          },
          options: {
            name: 'status_transfer_date_compound_idx',
            background: true,
            sparse: true
          }
        },

        // Last reminder sent - for cron job efficiency
        {
          fields: { 'paymentInfo.lastReminderSent': 1 },
          options: {
            name: 'last_reminder_sent_idx',
            background: true,
            sparse: true
          }
        }
      ];

      // Create each index
      for (const indexSpec of requiredIndexes) {
        try {
          await this.ensureIndex(collection, indexSpec.fields, indexSpec.options);
        } catch (error) {
          console.error(`❌ Error creating index ${indexSpec.options.name}:`, error.message);
          // Continue with other indexes even if one fails
        }
      }

    } catch (error) {
      console.error('❌ Error creating required indexes:', error);
      throw error;
    }
  }

  // Safely create an index (check if exists first)
  async ensureIndex(collection, fields, options) {
    try {
      // Check if index already exists
      const existingIndexes = await collection.listIndexes().toArray();
      const indexExists = existingIndexes.some(idx => idx.name === options.name);

      if (indexExists) {
        console.log(`✅ Index already exists: ${options.name}`);
        return;
      }

      // Create the index
      await collection.createIndex(fields, options);
      console.log(`✅ Created index: ${options.name}`);

    } catch (error) {
      if (error.code === 85) { // Index already exists with different options
        console.log(`⚠️  Index ${options.name} exists with different options, skipping`);
      } else {
        throw error;
      }
    }
  }

  // Drop all indexes (for complete reset - use with caution)
  async resetAllIndexes() {
    try {
      const TicketSale = mongoose.model('TicketSale');
      const collection = TicketSale.collection;

      console.log('🗑️  Dropping all indexes...');

      // Get all indexes except _id (which can't be dropped)
      const indexes = await collection.listIndexes().toArray();

      for (const index of indexes) {
        if (index.name !== '_id_') {
          try {
            await collection.dropIndex(index.name);
            console.log(`🗑️  Dropped index: ${index.name}`);
          } catch (error) {
            console.warn(`⚠️  Could not drop index ${index.name}:`, error.message);
          }
        }
      }

      // Recreate required indexes
      await this.createRequiredIndexes();
      console.log('✅ All indexes reset and recreated');

    } catch (error) {
      console.error('❌ Error resetting indexes:', error);
      throw error;
    }
  }

  // Get index status and statistics
  async getIndexStatus() {
    try {
      const TicketSale = mongoose.model('TicketSale');
      const collection = TicketSale.collection;

      const indexes = await collection.listIndexes().toArray();
      const stats = await collection.stats();

      return {
        totalIndexes: indexes.length,
        indexes: indexes.map(idx => ({
          name: idx.name,
          fields: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          background: idx.background || false
        })),
        collectionStats: {
          documents: stats.count,
          storageSize: stats.storageSize,
          totalIndexSize: stats.totalIndexSize
        }
      };

    } catch (error) {
      console.error('❌ Error getting index status:', error);
      throw error;
    }
  }

  // Validate that all required indexes exist
  async validateIndexes() {
    try {
      const TicketSale = mongoose.model('TicketSale');
      const collection = TicketSale.collection;

      const existingIndexes = await collection.listIndexes().toArray();
      const existingNames = existingIndexes.map(idx => idx.name);

      const requiredIndexNames = [
        'payment_reference_unique',
        'payment_status_idx',
        'customer_email_idx',
        'created_date_desc_idx'
      ];

      const missing = requiredIndexNames.filter(name => !existingNames.includes(name));

      if (missing.length > 0) {
        console.warn('⚠️  Missing required indexes:', missing);
        return { valid: false, missing };
      }

      console.log('✅ All required indexes are present');
      return { valid: true, missing: [] };

    } catch (error) {
      console.error('❌ Error validating indexes:', error);
      return { valid: false, error: error.message };
    }
  }

  // Performance optimization suggestions
  async analyzePerformance() {
    try {
      const TicketSale = mongoose.model('TicketSale');

      // Get query patterns that might need optimization
      const suggestions = [];

      // Check for large collections without proper indexes
      const stats = await TicketSale.collection.stats();
      if (stats.count > 1000) {
        const indexStatus = await this.getIndexStatus();
        if (indexStatus.totalIndexes < 5) {
          suggestions.push('Consider adding more indexes for better query performance');
        }
      }

      // Check for queries that might be slow
      const recentPendingCount = await TicketSale.countDocuments({
        'paymentInfo.status': 'pending_approval'
      });

      if (recentPendingCount > 100) {
        suggestions.push('High number of pending payments - ensure payment_status_idx is present');
      }

      return {
        suggestions,
        collectionSize: stats.count,
        indexCount: (await this.getIndexStatus()).totalIndexes
      };

    } catch (error) {
      console.error('❌ Error analyzing performance:', error);
      return { suggestions: ['Error analyzing performance'], error: error.message };
    }
  }
}

// Create singleton instance
const dbIndexManager = new DatabaseIndexManager();

module.exports = dbIndexManager;
