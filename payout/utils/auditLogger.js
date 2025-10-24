/**
 * /payout/utils/auditLogger.js
 * ---------------------------------------------------------------
 * Centralized utility for logging payout and refund events
 * to the AuditLog collection.
 * ---------------------------------------------------------------
 */

const AuditLog = require("../../models/AuditLog");

class AuditLogger {
  /**
   * Logs a system or payout-related action.
   * This function is intentionally simple and lightweight — no await chains.
   *
   * @param {Object} params
   * @param {String} params.actionType - Enum value (PAYOUT_SCHEDULED, PAYOUT_RELEASED, etc.)
   * @param {String} params.targetType - booking | payment | tip | dispute | user
   * @param {ObjectId} params.targetId - ObjectId of the entity affected
   * @param {String} params.description - Human-readable summary
   * @param {Object} [params.meta] - Extra contextual metadata
   * @param {ObjectId} [params.performedBy] - Optional user/admin ID
   * @param {String} [params.ipAddress] - Optional IP for security logging
   */
  static async logAudit({
    actionType,
    targetType,
    targetId,
    description,
    meta = {},
    performedBy = null,
    ipAddress = null,
  }) {
    try {
      if (!actionType || !targetType || !targetId) {
        console.error("❌ Missing required fields for AuditLog entry");
        return;
      }

      const auditEntry = new AuditLog({
        performedBy: performedBy || null,
        actionType,
        targetType,
        targetId,
        description,
        meta,
        ipAddress,
      });

      await auditEntry.save();

      console.log(`🧾 Audit logged: ${actionType} → ${description}`);
    } catch (err) {
      console.error("❌ Failed to write AuditLog entry:", err.message);
    }
  }

  /**
   * Convenience function for logging payout actions
   */
  static async logPayoutAction(bookingId, actionType, description, meta = {}) {
    return this.logAudit({
      actionType,
      targetType: "booking",
      targetId: bookingId,
      description,
      meta,
    });
  }

  /**
   * Convenience function for logging refund actions
   */
  static async logRefundAction(paymentId, description, meta = {}) {
    return this.logAudit({
      actionType: "REFUND_ISSUED",
      targetType: "payment",
      targetId: paymentId,
      description,
      meta,
    });
  }
}

module.exports = {
  logAudit: AuditLogger.logAudit.bind(AuditLogger),
  logPayoutAction: AuditLogger.logPayoutAction.bind(AuditLogger),
  logRefundAction: AuditLogger.logRefundAction.bind(AuditLogger),
};
