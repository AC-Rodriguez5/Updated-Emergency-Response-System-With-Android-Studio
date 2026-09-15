import bcrypt from 'bcryptjs';
import { User, Alert } from '../models/index.js';

export const getUserById = async (id) => {
  try {
    const user = await User.findById(id).select('-password');
    return user || null;
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
  }
};

export const getUserByEmail = async (email) => {
  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select('-password');
    return user || null;
  } catch (error) {
    console.error('Get user by email error:', error);
    throw error;
  }
};

export const verifyPassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
};

export const hashPassword = async (password) => {
  try {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('Password hashing error:', error);
    throw error;
  }
};

export const findOrCreateUserFromAlert = async (userName, userPhone) => {
  try {
    // Create user if not found and it's the first alert
    const existingUser = await User.findOne({
      $or: [
        { phone: userPhone },
        { 'contacts.name': userName },
      ],
    });

    if (!existingUser) {
      const user = new User({
        name: userName || 'Anonymous',
        email: `${userName?.toLowerCase() || 'anonymous'}@alert.com`,
        phone: userPhone || 'Not provided',
        password: 'placeholder', // Will be hashed later
      });
      await user.save();
      return user;
    }

    return existingUser;
  } catch (error) {
    console.error('Find or create user error:', error);
    throw error;
  }
};

export const updateUserStatus = async (userId, status) => {
  try {
    return await User.findByIdAndUpdate(userId, { status }, { new: true }).select('-password');
  } catch (error) {
    console.error('Update user status error:', error);
    throw error;
  }
};

export const getUserAlertsCount = async (userId) => {
  try {
    return await Alert.countDocuments({ userId });
  } catch (error) {
    console.error('Get user alerts count error:', error);
    return 0;
  }
};

export const updateUserProfile = async (userId, profileData) => {
  try {
    const { name, address, municipality, ...filterData } = profileData;
    const updateData = {
      ...(name && { name }),
      ...(address && { address }),
      ...(municipality && { municipality }),
    };
    return await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
  } catch (error) {
    console.error('Update user profile error:', error);
    throw error;
  }
};

export default {
  getUserById,
  getUserByEmail,
  verifyPassword,
  hashPassword,
  findOrCreateUserFromAlert,
  updateUserStatus,
  getUserAlertsCount,
  updateUserProfile,
};