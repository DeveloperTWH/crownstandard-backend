// utils/auditLogger.js
const AuditLog = require("../models/AuditLog");

/**
 * Log an action in the audit log
 * @param {ObjectId} performedBy - User/Admin who performed the action
 * @param {String} actionType - Type of action, e.g., 'PAYOUT_RELEASED'
 * @param {String} targetType - What was affected, e.g., 'booking', 'payment', 'tip'
 * @param {ObjectId} targetId - ID of the affected record
 * @param {String} description - Human-readable description
 * @param {Object} [before] - Optional snapshot before action
 * @param {Object} [after] - Optional snapshot after action
 * @param {Object} [meta] - Optional additional metadata
 * @param {String} [ipAddress] - Optional IP address
 */
async function logAction({
  performedBy,
  actionType,
  targetType,
  targetId,
  description,
  before = null,
  after = null,
  meta = {},
  ipAddress = null,
}) {
  try {
    const log = new AuditLog({
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

    await log.save();
  } catch (err) {
    console.error("Failed to save audit log:", err);
    // Optional: send error to monitoring service (Sentry, Datadog)
  }
}

module.exports = {
  logAction,
};
