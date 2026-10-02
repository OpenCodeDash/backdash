import { describe, expect, it, vi } from "vitest";
import {
	HttpException,
	HttpStatus,
	type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.guard.js";
import { RateLimitService } from "./rate-limit.service.js";
import { RATE_LIMIT_KEY } from "./rate-limit.decorator.js";

interface FakeRequest {
	ip?: string;
}

function makeContext(request: FakeRequest) {
	const headers: Record<string, string> = {};
	return {
		context: {
			getHandler: () => function handler() {},
			getClass: () => class Controller {},
			switchToHttp: () => ({
				getRequest: () => request,
				getResponse: () => ({
					setHeader: (name: string, value: string) => {
						headers[name] = value;
					},
				}),
			}),
		} as unknown as ExecutionContext,
		headers,
	};
}

function makeGuard(options: { limit: number; windowMs: number } | null) {
	const reflector = {
		getAllAndOverride: vi.fn((key: string) =>
			key === RATE_LIMIT_KEY ? options : undefined
		),
	} as unknown as Reflector;

	return new RateLimitGuard(reflector, new RateLimitService());
}

describe("RateLimitService", () => {
	it("allows up to the limit within a window and rejects beyond it", () => {
		const service = new RateLimitService();

		expect(service.hit("k", 2, 1000, 0)).toBe(true);
		expect(service.hit("k", 2, 1000, 0)).toBe(true);
		expect(service.hit("k", 2, 1000, 0)).toBe(false);
	});

	it("starts a fresh window once it expires", () => {
		const service = new RateLimitService();

		expect(service.hit("k", 1, 1000, 0)).toBe(true);
		expect(service.hit("k", 1, 1000, 500)).toBe(false);
		expect(service.hit("k", 1, 1000, 1001)).toBe(true);
	});

	it("tracks keys independently", () => {
		const service = new RateLimitService();

		expect(service.hit("a", 1, 1000, 0)).toBe(true);
		expect(service.hit("b", 1, 1000, 0)).toBe(true);
		expect(service.hit("a", 1, 1000, 0)).toBe(false);
	});
});

describe("RateLimitGuard", () => {
	it("passes through routes without @RateLimit metadata", () => {
		const guard = makeGuard(null);
		const { context } = makeContext({ ip: "1.1.1.1" });
		expect(guard.canActivate(context)).toBe(true);
	});

	it("allows requests up to the limit and then throws 429 with Retry-After", () => {
		const guard = makeGuard({ limit: 2, windowMs: 60_000 });
		const first = makeContext({ ip: "1.1.1.1" });
		const second = makeContext({ ip: "1.1.1.1" });
		const third = makeContext({ ip: "1.1.1.1" });

		expect(guard.canActivate(first.context)).toBe(true);
		expect(guard.canActivate(second.context)).toBe(true);

		let thrown: unknown;
		try {
			guard.canActivate(third.context);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(HttpException);
		expect((thrown as HttpException).getStatus()).toBe(
			HttpStatus.TOO_MANY_REQUESTS
		);
		expect(third.headers["Retry-After"]).toBeDefined();
	});

	it("limits by client ip", () => {
		const guard = makeGuard({ limit: 1, windowMs: 60_000 });

		expect(guard.canActivate(makeContext({ ip: "1.1.1.1" }).context)).toBe(true);
		expect(guard.canActivate(makeContext({ ip: "2.2.2.2" }).context)).toBe(true);
	});

	it("uses a bare HttpException for the 429", () => {
		const guard = makeGuard({ limit: 0, windowMs: 60_000 });
		expect(() => guard.canActivate(makeContext({ ip: "x" }).context)).toThrow(
			HttpException
		);
	});
});
