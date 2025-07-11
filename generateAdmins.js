const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Admin = require('./models/Admin');

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dncv-tickets', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Generate initial admin accounts
const generateInitialAdmins = async () => {
  try {
    console.log('🎭 Generating initial admin accounts...\n');

    // Check if any admins already exist
    const existingAdmins = await Admin.find({});
    if (existingAdmins.length > 0) {
      console.log('⚠️  Admin accounts already exist:');
      existingAdmins.forEach(admin => {
        console.log(`   - ${admin.adminId} (${admin.name}) - Role: ${admin.role} - Status: ${admin.isActive ? 'Active' : 'Inactive'}`);
      });

      console.log('\n❓ Do you want to generate additional admin accounts? (y/n)');
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve) => {
        readline.question('', (answer) => {
          readline.close();
          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('✋ Operation cancelled.');
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Error checking existing admins:', error);
    return false;
  }
};

// Create admin accounts
const createAdmins = async () => {
  const adminConfigs = [
    {
      name: 'Super Administrator',
      role: 'super-admin',
      permissions: {
        approvePayments: true,
        rejectPayments: true,
        viewAnalytics: true,
        manageAdmins: true,
        systemSettings: true
      }
    },
    {
      name: 'Payment Manager',
      role: 'admin',
      permissions: {
        approvePayments: true,
        rejectPayments: true,
        viewAnalytics: true,
        manageAdmins: false,
        systemSettings: false
      }
    },
    {
      name: 'Analytics Manager',
      role: 'manager',
      permissions: {
        approvePayments: false,
        rejectPayments: false,
        viewAnalytics: true,
        manageAdmins: false,
        systemSettings: false
      }
    },
    {
      name: 'Operations Admin',
      role: 'admin',
      permissions: {
        approvePayments: true,
        rejectPayments: true,
        viewAnalytics: true,
        manageAdmins: false,
        systemSettings: false
      }
    },
    {
      name: 'Event Coordinator',
      role: 'admin',
      permissions: {
        approvePayments: true,
        rejectPayments: true,
        viewAnalytics: false,
        manageAdmins: false,
        systemSettings: false
      }
    }
  ];

  const createdAdmins = [];

  for (const config of adminConfigs) {
    try {
      // Generate unique admin ID
      let adminId;
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 20) {
        adminId = Admin.generateAdminId();
        const existingAdmin = await Admin.findOne({ adminId });
        if (!existingAdmin) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        console.log(`❌ Failed to generate unique ID for ${config.name}`);
        continue;
      }

      const admin = new Admin({
        adminId,
        ...config,
        createdBy: 'system'
      });

      await admin.save();
      createdAdmins.push(admin);

      console.log(`✅ Created: ${adminId} - ${config.name} (${config.role})`);

    } catch (error) {
      console.error(`❌ Error creating admin ${config.name}:`, error.message);
    }
  }

  return createdAdmins;
};

// Main function
const main = async () => {
  try {
    await connectDB();

    const shouldProceed = await generateInitialAdmins();
    if (!shouldProceed) {
      process.exit(0);
    }

    const createdAdmins = await createAdmins();

    console.log('\n🎉 Admin account generation complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 ADMIN ACCOUNT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');

    createdAdmins.forEach(admin => {
      console.log(`\n🔑 Admin ID: ${admin.adminId}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Permissions:`);
      Object.entries(admin.permissions).forEach(([key, value]) => {
        console.log(`     • ${key}: ${value ? '✅' : '❌'}`);
      });
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔒 SECURITY NOTES:');
    console.log('• Store these Admin IDs securely');
    console.log('• Share only with authorized personnel');
    console.log('• Use the admin login endpoint with these IDs');
    console.log('• Admin IDs cannot be changed after creation');
    console.log('═══════════════════════════════════════════════════════════');

    console.log('\n🌐 LOGIN ENDPOINT: POST /api/admin/login');
    console.log('📋 Required payload: { "adminId": "DNCV-XXXX" }');
    console.log('🎯 Example: { "adminId": "' + createdAdmins[0].adminId + '" }');

  } catch (error) {
    console.error('❌ Error in main function:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📦 Database connection closed.');
    process.exit(0);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Process interrupted. Closing database connection...');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the script
main().catch(console.error);
