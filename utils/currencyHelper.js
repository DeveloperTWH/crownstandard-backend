// utils/currencyHelper.js

/**
 * Calculate total payout for a booking including tip
 * @param {Object} booking - Booking document
 * @param {Object} tipTransaction - TipTransaction document (optional)
 * @returns {Number} totalAmount - amount to payout to provider
 */
function calculateTotalPayoutAmount(booking, tipTransaction) {
  if (!booking || !booking.pricingSnapshot) {
    throw new Error("Invalid booking data");
  }

  // Base payout (provider share)
  let totalAmount = booking.pricingSnapshot.providerShare || 0;

  // Add tip if available
  if (tipTransaction && tipTransaction.amount) {
    // Check currency match
    if (tipTransaction.currency !== booking.pricingSnapshot.currency) {
      // Here you may call a currency conversion service if needed
      throw new Error(
        `Currency mismatch: booking(${booking.pricingSnapshot.currency}) vs tip(${tipTransaction.currency})`
      );
    }
    totalAmount += tipTransaction.amount;
  } else if (booking.tipSummary && booking.tipSummary.totalTip) {
    // If tipTransaction is not available but booking has tipSummary
    totalAmount += booking.tipSummary.totalTip;
  }

  return totalAmount;
}

/**
 * Optionally, convert amount between currencies
 * @param {Number} amount 
 * @param {String} fromCurrency 
 * @param {String} toCurrency 
 * @returns {Number}
 */
async function convertCurrency(amount, fromCurrency, toCurrency) {
  // You can integrate with a real FX service like OpenExchangeRates, etc.
  if (fromCurrency === toCurrency) return amount;
  // Mock conversion rate
  const rate = 1; // Replace with real API call
  return amount * rate;
}

module.exports = {
  calculateTotalPayoutAmount,
  convertCurrency,
};
