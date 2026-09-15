import mongoose, { Schema } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    actorEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    actorRole: {
      type: String,
      enum: ['user', 'responder', 'admin'],
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      required: true,
    },
    details: {
      type: String,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
auditLogSchema.index({ actorEmail: 1, action: 1 });
auditLogSchema.index({ target: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorRole: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export const createAuditLog = async (actorId, actorEmail, actorRole, action, target, details = '') => {
  try {
    const ip = req?.ip || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    const log = new AuditLog({
      actorId,
      actorEmail,
      actorRole,
      action,
      target,
      details,
      ipAddress: ip,
      userAgent: userAgent,
    });

    await log.save();
    return log;
  } catch (error) {
    console.error('Error creating audit log:', error);
    return null;
  }
};

export const getAuditLogs = async (options = {}) => {
  try {
    const {
      actorId,
      actorEmail,
      actorRole,
      action,
      target,
      startDate,
      endDate,
      limit = 100,
    } = options;

    const query = {};

    if (actorId) query.actorId = actorId;
    if (actorEmail) query.actorEmail = actorEmail.toLowerCase();
    if (actorRole) query.actorRole = actorRole;
    if (action) query.action = action;
    if (target) query.target = target;
    if (startDate) query.createdAt = { $gte: startDate };
    if (endDate) query.createdAt = { $lte: endDate };

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return logs;
  } catch (error) {
    console.error('Error getting audit logs:', error);
    return [];
  }
};

export const getAuditLogCount = async (options = {}) => {
  try {
    const { actorId, actorEmail, actorRole, action, target } = options;
    const query = {};

    if (actorId) query.actorId = actorId;
    if (actorEmail) query.actorEmail = actorEmail.toLowerCase();
    if (actorRole) query.actorRole = actorRole;
    if (action) query.action = action;
    if (target) query.target = target;

    return await AuditLog.countDocuments(query);
  } catch (error) {
    console.error('Error getting audit log count:', error);
    return 0;
  }
};