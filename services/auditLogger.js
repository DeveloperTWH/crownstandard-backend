// services/auditLogger.js
const AuditLog = require("../models/AuditLog");

async function logAudit({ performedBy, actionType, targetType, targetId, description, before, after, meta = {}, ipAddress }) {
  try {
    await AuditLog.create({
      performedBy,
      actionType,
      targetType,
      targetId,
      description,
      before,
      after,
      meta,
      ipAddress,
    });
  } catch (err) {
    console.error("Audit log failed", err);
  }
}

module.exports = { logAudit };
