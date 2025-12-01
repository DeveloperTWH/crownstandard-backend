// payout/events/eventPublisher.js
/**
 * CrownStandard Event Publisher
 * -----------------------------------------------------
 * Lightweight local event bus (can be replaced with EventBridge/SQS later).
 * Responsible for emitting standardized domain events.
 */

const { EventEmitter } = require("events");

class EventPublisher extends EventEmitter {
  /**
   * Emit a standardized domain event.
   * @param {String} eventName - e.g., "PAYOUT_SCHEDULED"
   * @param {Object} payload
   */
  publish(eventName, payload = {}) {
    console.log(`📢 Event emitted: ${eventName}`, JSON.stringify(payload));
    this.emit(eventName, payload);
  }

  /**
   * Register a one-time debug log for all events (for local dev).
   */
  enableDebugLogging() {
    this.onAny?.((event, payload) =>
      console.log(`[DEBUG EVENT] ${event}:`, payload)
    );
  }
}

const eventPublisher = new EventPublisher();
module.exports = eventPublisher;
