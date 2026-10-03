import { Injectable } from "@nestjs/common";

interface Window {
	count: number;
	resetAt: number;
}

// A small fixed-window counter, kept in memory. Good enough to blunt online
// credential stuffing on a single-process, single-instance server; it is not a
// distributed limiter.
@Injectable()
export class RateLimitService {
	private readonly windows = new Map<string, Window>();

	// Records a hit and reports whether it is within the limit. Expired windows
	// are evicted lazily whenever the key is touched.
	hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
		const existing = this.windows.get(key);

		if (!existing || existing.resetAt <= now) {
			this.windows.set(key, { count: 1, resetAt: now + windowMs });
			return limit >= 1;
		}

		existing.count += 1;
		return existing.count <= limit;
	}

	// Seconds until the key's current window resets (for Retry-After).
	retryAfterSeconds(key: string, now = Date.now()): number {
		const existing = this.windows.get(key);
		if (!existing) return 0;
		return Math.max(0, Math.ceil((existing.resetAt - now) / 1000));
	}

	reset(): void {
		this.windows.clear();
	}
}
