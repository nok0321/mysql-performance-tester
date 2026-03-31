/**
 * ws-token.ts - One-time WebSocket authentication token manager
 *
 * Generates short-lived tokens that the frontend fetches via REST API
 * and passes as a query parameter when opening a WebSocket connection.
 * Each token is single-use: validate() consumes it immediately.
 */

import crypto from 'crypto';

const DEFAULT_TTL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface TokenEntry {
  expiresAt: number;
}

class WsTokenManager {
  private tokens = new Map<string, TokenEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // Don't keep process alive
  }

  /** Generate a one-time token with the given TTL (default 60 s). */
  generate(ttlMs = DEFAULT_TTL_MS): string {
    const token = crypto.randomUUID();
    this.tokens.set(token, { expiresAt: Date.now() + ttlMs });
    return token;
  }

  /** Validate and consume a token. Returns true if valid; the token is deleted regardless. */
  validate(token: string): boolean {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    this.tokens.delete(token); // One-time use
    return Date.now() < entry.expiresAt;
  }

  /** Remove all expired tokens. */
  private cleanup(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now >= entry.expiresAt) this.tokens.delete(token);
    }
  }

  /** Tear down the cleanup timer and clear all tokens. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.tokens.clear();
  }
}

export const wsTokenManager = new WsTokenManager();
