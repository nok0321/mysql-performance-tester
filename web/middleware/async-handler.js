/**
 * Async route handler wrapper
 * Catches rejected promises and forwards to Express error middleware
 *
 * @param {Function} fn - async route handler (req, res, next) => Promise
 * @returns {Function} Express middleware
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
