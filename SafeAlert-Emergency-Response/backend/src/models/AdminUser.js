import mongoose, { Schema } from 'mongoose';

const adminUserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin'],
      default: 'admin',
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for email lookup
adminUserSchema.index({ email: 1 });

export const AdminUser = mongoose.model('AdminUser', adminUserSchema);

export const createAdminUser = async (email, password, name) => {
  try {
    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ email });
    if (existingAdmin) {
      return {
        success: false,
        error: 'Admin already exists',
      };
    }

    const hash = await bcrypt.hash(password, 10);

    const admin = new AdminUser({
      email,
      password: hash,
      name,
    });

    await admin.save();

    return {
      success: true,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
      },
    };
  } catch (error) {
    console.error('Error creating admin user:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};