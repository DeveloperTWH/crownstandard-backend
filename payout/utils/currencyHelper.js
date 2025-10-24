/**
 * /payout/utils/currencyHelper.js
 * ---------------------------------------------------------------
 * Handles dynamic currency conversion and rounding logic.
 * Now supports contextual normalization — e.g.,
 * normalize tips to the booking's payment currency.
 * ---------------------------------------------------------------
 */

const axios = require("axios");

const FX_API_KEY = process.env.FX_API_KEY || null;

class CurrencyHelper {
  /**
   * Converts an amount from one currency to another.
   * Defaults to 1:1 if no FX integration configured.
   */
  static async convertCurrency(amount, from, to) {
    try {
      if (!amount || from === to) return this.roundAmount(amount);

      if (!FX_API_KEY) {
        console.warn(`⚠️ No FX_API_KEY configured → assuming 1:1 for ${from}→${to}`);
        return this.roundAmount(amount);
      }

      const response = await axios.get("https://api.apilayer.com/fixer/convert", {
        params: { from, to, amount },
        headers: { apikey: FX_API_KEY },
      });

      if (response.data?.result) {
        return this.roundAmount(response.data.result);
      }

      console.warn(`⚠️ Conversion API fallback used for ${from}→${to}`);
      return this.roundAmount(amount);
    } catch (err) {
      console.error("❌ Currency conversion error:", err.message);
      return this.roundAmount(amount);
    }
  }

  /**
   * Normalizes a secondary currency (e.g., tip/refund)
   * to match the booking's payment currency.
   *
   * Example:
   *  normalizeToBookingCurrency(10, "USD", "INR") → converts USD tip → INR
   *  normalizeToBookingCurrency(5, "EUR", "CAD") → converts EUR tip → CAD
   */
  static async normalizeToBookingCurrency(amount, sourceCurrency, bookingCurrency) {
    return await this.convertCurrency(amount, sourceCurrency, bookingCurrency);
  }

  /**
   * Rounds to two decimals consistently
   */
  static roundAmount(amount) {
    if (!amount) return 0;
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  /**
   * Converts to smallest unit (for Stripe)
   */
  static toMinorUnits(amount) {
    return Math.round(amount * 100);
  }
}

module.exports = {
  convertCurrency: CurrencyHelper.convertCurrency.bind(CurrencyHelper),
  normalizeToBookingCurrency: CurrencyHelper.normalizeToBookingCurrency.bind(CurrencyHelper),
  roundAmount: CurrencyHelper.roundAmount.bind(CurrencyHelper),
  toMinorUnits: CurrencyHelper.toMinorUnits.bind(CurrencyHelper),
};
