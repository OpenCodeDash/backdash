import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
	RATE_LIMIT_KEY,
	type RateLimitOptions,
} from "./rate-limit.decorator.js";
import { RateLimitService } from "./rate-limit.service.js";

interface RatedRequest {
	ip?: string;
}

interface RatedResponse {
	setHeader: (name: string, value: string) => void;
}

// Enforces the per-route @RateLimit(...) metadata, keyed by client IP and
// handler. Routes without the metadata pass through untouched.
@Injectable()
export class RateLimitGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly limiter: RateLimitService
	) {}

	canActivate(context: ExecutionContext): boolean {
		const options = this.reflector.getAllAndOverride<RateLimitOptions>(
			RATE_LIMIT_KEY,
			[context.getHandler(), context.getClass()]
		);

		if (!options) {
			return true;
		}

		const http = context.switchToHttp();
		const request = http.getRequest<RatedRequest>();
		const key = `${context.getClass().name}.${context.getHandler().name}:${
			request.ip ?? "unknown"
		}`;

		if (!this.limiter.hit(key, options.limit, options.windowMs)) {
			const retryAfter = this.limiter.retryAfterSeconds(key);
			http
				.getResponse<RatedResponse>()
				.setHeader("Retry-After", String(retryAfter));
			throw new HttpException(
				"Too many requests",
				HttpStatus.TOO_MANY_REQUESTS
			);
		}

		return true;
	}
}
