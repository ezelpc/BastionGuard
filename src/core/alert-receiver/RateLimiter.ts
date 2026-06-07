import { NextFunction, Request, Response } from "express";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  windowMs: number; // milliseconds
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter
 * Can be replaced with Redis-based limiter for production
 */
export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private perMinute: number = 100,
    private perHour: number = 2000
  ) {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request should be allowed
   */
  public isAllowed(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + 60 * 1000 });
      return { allowed: true, remaining: this.perMinute - 1, resetIn: 60 };
    }

    entry.count++;
    const remaining = this.perMinute - entry.count;
    const resetIn = Math.ceil((entry.resetAt - now) / 1000);

    return {
      allowed: entry.count <= this.perMinute && entry.count <= this.perHour,
      remaining: Math.max(0, remaining),
      resetIn,
    };
  }

  /**
   * Get current count for a key
   */
  public getCount(key: string): number {
    const entry = this.store.get(key);
    return entry ? entry.count : 0;
  }

  /**
   * Reset count for a key
   */
  public reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now - 60 * 60 * 1000) {
        // Older than 1 hour
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.store.delete(key));
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Express middleware for rate limiting
 */
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  keyExtractor?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyExtractor?.(req) || req.ip || "unknown";
    const result = limiter.isAllowed(key);

    // Add headers
    res.set({
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": (Math.floor(Date.now() / 1000) + result.resetIn).toString(),
    });

    if (!result.allowed) {
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: result.resetIn,
        message: `Too many requests. Please try again in ${result.resetIn} seconds.`,
      });
      return;
    }

    next();
  };
}

/**
 * Get client identifier for rate limiting
 */
export function getClientIdentifier(req: Request, tenantId?: string): string {
  // Prefer tenant-based limiting in production
  if (tenantId) {
    return `tenant:${tenantId}`;
  }

  // Fall back to IP-based limiting
  return req.ip || req.socket.remoteAddress || "unknown";
}
