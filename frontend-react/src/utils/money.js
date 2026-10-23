/**
 * Formats integer paise from the backend API into INR currency string.
 * @param {number|string} paise - The amount in paise (1 INR = 100 paise)
 * @param {boolean} showSymbol - Whether to prepend the ₹ symbol (default: true)
 * @returns {string} e.g. "₹500.00"
 */
export function formatPaise(paise, showSymbol = true) {
  if (paise === null || paise === undefined || isNaN(paise)) {
    return showSymbol ? '₹0.00' : '0.00';
  }
  const rupees = Number(paise) / 100;
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Converts integer paise to float rupees.
 * @param {number|string} paise
 * @returns {number}
 */
export function paiseToRupees(paise) {
  if (!paise || isNaN(paise)) return 0;
  return Number(paise) / 100;
}

/**
 * Converts float/integer rupees to integer paise for API payloads.
 * @param {number|string} rupees
 * @returns {number}
 */
export function rupeesToPaise(rupees) {
  if (!rupees || isNaN(rupees)) return 0;
  return Math.round(Number(rupees) * 100);
}
