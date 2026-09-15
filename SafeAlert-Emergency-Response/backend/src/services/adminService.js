import bcrypt from 'bcryptjs';
import { User, Responder, AdminUser, Alert } from '../models/index.js';

export const approveUser = async (userId, updateData = {}) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...updateData,
        status: 'approved',
      },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    return {
      success: true,
      message: 'User approved successfully',
      user,
    };
  } catch (error) {
    console.error('Approve user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const rejectUser = async (userId) => {
  try {
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return {
      success: true,
      message: 'User rejected and removed successfully',
    };
  } catch (error) {
    console.error('Reject user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const approveResponder = async (responderId, updateData = {}) => {
  try {
    const responder = await Responder.findByIdAndUpdate(
      responderId,
      {
        ...updateData,
        status: 'approved',
      },
      { new: true }
    ).select('-password');

    if (!responder) {
      throw new Error('Responder not found');
    }

    return {
      success: true,
      message: 'Responder approved successfully',
      responder,
    };
  } catch (error) {
    console.error('Approve responder error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const rejectResponder = async (responderId) => {
  try {
    const responder = await Responder.findByIdAndDelete(responderId);

    if (!responder) {
      throw new Error('Responder not found');
    }

    return {
      success: true,
      message: 'Responder rejected and removed successfully',
    };
  } catch (error) {
    console.error('Reject responder error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getPendingApprovals = async (type = 'user', status = 'pending') => {
  try {
    const Model = type === 'user' ? User : Responder;

    const items = await Model.find({
      ...(type === 'user' ? { status } : {}),
    }).select('-password');

    return {
      approvals: items,
      count: items.length,
    };
  } catch (error) {
    console.error('Get pending approvals error:', error);
    throw error;
  }
};

export const getActiveResponders = async (options = {}) => {
  try {
    const { department, page = 1, limit = 20 } = options;
    const skip = (parseInt(page) - 1) * limit;

    const activeResponders = await Responder.find({
      isOnDuty: true,
      ...(department && { department }),
    })
      .skip(skip)
      .limit(limit)
      .select('-password')
      .sort({ createdAt: -1 });

    const total = await Responder.countDocuments({ isOnDuty: true });

    return {
      responders: activeResponders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error('Get active responders error:', error);
    throw error;
  }
};

export const getActiveAlerts = async (options = {}) => {
  try {
    const { page = 1, limit = 20 } = options;
    const skip = (parseInt(page) - 1) * limit;

    const activeAlerts = await Alert.find({
      status: { $in: ['pending', 'responding'] },
    })
      .skip(skip)
      .limit(limit)
      .select('-userId -password')
      .populate('responderId', 'name badgeId department')
      .sort({ createdAt: -1 });

    return {
      alerts: activeAlerts,
      count: activeAlerts.length,
    };
  } catch (error) {
    console.error('Get active alerts error:', error);
    throw error;
  }
};

export const createAdminUser = async (email, password, name) => {
  try {
    const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() });

    if (existingAdmin) {
      return {
        success: false,
        error: 'Admin already exists',
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new AdminUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'admin',
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
    console.error('Create admin user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const loginAdmin = async (email, password) => {
  try {
    const admin = await AdminUser.findOne({
      email: email.toLowerCase(),
    });

    if (!admin) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    const isValid = await bcrypt.compare(password, admin.password);

    if (!isValid) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    return {
      success: true,
      adminId: admin._id,
      email: admin.email,
      name: admin.name,
      role: 'admin',
    };
  } catch (error) {
    console.error('Admin login error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getAdminStats = async () => {
  try {
    const totalUsers = await User.countDocuments();
    const approvedUsers = await User.countDocuments({ status: 'approved' });
    const pendingUsers = await User.countDocuments({ status: 'pending' });

    const totalResponders = await Responder.countDocuments();
    const activeResponders = await Responder.countDocuments({ isOnDuty: true });
    const pendingResponders = await Responder.countDocuments({ status: 'pending' });

    const totalAlerts = await Alert.countDocuments();
    const activeAlerts = await Alert.countDocuments({
      status: { $in: ['pending', 'responding'] },
    });

    return {
      users: {
        total: totalUsers,
        approved: approvedUsers,
        pending: pendingUsers,
      },
      responders: {
        total: totalResponders,
        active: activeResponders,
        pending: pendingResponders,
      },
      alerts: {
        total: totalAlerts,
        active: activeAlerts,
      },
    };
  } catch (error) {
    console.error('Get admin stats error:', error);
    throw error;
  }
};

export default {
  approveUser,
  rejectUser,
  approveResponder,
  rejectResponder,
  getPendingApprovals,
  getActiveResponders,
  getActiveAlerts,
  createAdminUser,
  loginAdmin,
  getAdminStats,
};