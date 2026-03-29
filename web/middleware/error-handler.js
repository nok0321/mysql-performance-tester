/**
 * Centralized Express error handling middleware
 *
 * - Logs errors with timestamp and request context
 * - Returns consistent JSON error response
 * - Handles known error types (ValidationError, ID validation)
 */

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
    // ID validation errors (from validate-id.js) carry a status property
    if (err.status) {
        return res.status(err.status).json({
            success: false,
            error: err.message || 'リクエストが不正です',
        });
    }

    // ValidationError from lib/utils/validator.js
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: err.message,
        });
    }

    // Default: internal server error
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message || err);
    res.status(500).json({
        success: false,
        error: 'サーバーエラーが発生しました',
    });
}
