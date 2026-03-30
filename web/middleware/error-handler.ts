/**
 * Centralized Express error handling middleware
 *
 * - Logs errors with timestamp and request context
 * - Returns consistent JSON error response
 * - Handles known error types (ValidationError, ID validation)
 */

import type { Request, Response, NextFunction } from 'express';

/** Error with an optional HTTP status code (e.g. from validate-id) */
interface HttpError extends Error {
    status?: number;
}

export function errorHandler(
    err: HttpError,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    // ID validation errors (from validate-id.ts) carry a status property
    if (err.status) {
        res.status(err.status).json({
            success: false,
            error: err.message || 'リクエストが不正です',
        });
        return;
    }

    // ValidationError from lib/utils/validator.ts
    if (err.name === 'ValidationError') {
        res.status(400).json({
            success: false,
            error: err.message,
        });
        return;
    }

    // Default: internal server error
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message || err);
    res.status(500).json({
        success: false,
        error: 'サーバーエラーが発生しました',
    });
}
