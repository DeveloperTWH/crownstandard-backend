// payout/services/auditLogService.js
/**
 * CrownStandard Audit Log Service
 * --------------------------------
 * Centralized service for writing standardized audit events across
 * the payout ecosystem (payouts, tips, disputes, refunds, etc.)
 */

const AuditLog = require("../../models/AuditLog");

class AuditLogService {
  /**
   * Create a new audit log entry.
   * @param {Object} params
   * @param {String} params.actionType - Enum defined in AuditLog model
   * @param {ObjectId|String} params.performedBy - User ID or 'system'
   * @param {String} params.targetType - e.g. 'payout', 'booking', 'dispute'
   * @param {ObjectId} params.targetId - Target document ID
   * @param {String} params.description - Short description of the event
   * @param {Object} [params.meta] - Optional metadata
   * @param {Object} [params.before] - Optional snapshot (pre-change)
   * @param {Object} [params.after] - Optional snapshot (post-change)
   * @param {String} [params.ipAddress] - IP address (optional)
   */
  static async logAction({
    actionType,
    performedBy = "system",
    targetType,
    targetId,
    description,
    meta = {},
    before = null,
    after = null,
    ipAddress = null,
  }) {
    try {
      if (!actionType || !targetType || !targetId || !description) {
        throw new Error("Missing required fields for audit log");
      }

      const log = new AuditLog({
        actionType,
        performedBy,
        targetType,
        targetId,
        description,
        meta,
        before,
        after,
        ipAddress,
      });

      await log.save();
      return log;
    } catch (err) {
      console.error("❌ AuditLogService.logAction failed:", err.message);
      // never throw further — audit logging must not break core flows
      return null;
    }
  }

  /**
   * Log a system-level event (no user context required).
   * @param {String} actionType
   * @param {String} targetType
   * @param {ObjectId} targetId
   * @param {String} description
   * @param {Object} [meta]
   */
  static async logSystemAction(actionType, targetType, targetId, description, meta = {}) {
    return this.logAction({
      actionType,
      performedBy: "system",
      targetType,
      targetId,
      description,
      meta,
    });
  }

  /**
   * Retrieve all logs for a specific entity.
   * @param {String} targetType
   * @param {ObjectId} targetId
   * @returns {Promise<Array>}
   */
  static async getLogsForTarget(targetType, targetId) {
    return AuditLog.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Convenience helper to record errors in operations (without throwing).
   * @param {Error} err
   * @param {String} context
   * @param {Object} [meta]
   */
  static async logError(err, context, meta = {}) {
    return this.logAction({
      actionType: "SYSTEM_UPDATE",
      performedBy: "68ecd92380b49f8b5e884a2e",
      targetType: "system",
      targetId: "000000000000000000000000",
      description: `[Error] ${context}: ${err.message}`,
      meta,
    });
  }
}

module.exports = AuditLogService;
