import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "backdash:rateLimit";

export interface RateLimitOptions {
	// Maximum requests allowed per `windowMs` for a given client key.
	limit: number;
	windowMs: number;
}

// Slows online brute force on the auth endpoints. Applied with
// `@UseGuards(RateLimitGuard)`; routes without this metadata are unaffected.
export const RateLimit = (options: RateLimitOptions) =>
	SetMetadata(RATE_LIMIT_KEY, options);
