import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AccountKind } from "./enum/account-kind.enum.js";
import type { AuthenticatedAccount } from "./auth.types.js";

interface FakeRequest {
	path?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	account?: AuthenticatedAccount;
}

function makeContext(request: FakeRequest): ExecutionContext {
	return {
		getHandler: () => function handler() {},
		getClass: () => class Controller {},
		switchToHttp: () => ({ getRequest: () => request }),
	} as unknown as ExecutionContext;
}

function makeGuard(isPublic: boolean) {
	const accountByToken = vi.fn();
	const reflector = {
		getAllAndOverride: vi.fn().mockReturnValue(isPublic),
	} as unknown as Reflector;
	const auth = { accountByToken } as unknown as AuthService;

	return { guard: new AuthGuard(reflector, auth), accountByToken };
}

describe("AuthGuard", () => {
	it("allows public routes without touching the token", async () => {
		const { guard, accountByToken } = makeGuard(true);
		const request: FakeRequest = { path: "/auth/login", headers: {} };

		await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
		expect(accountByToken).not.toHaveBeenCalled();
	});

	it("allows the API docs routes", async () => {
		const { guard, accountByToken } = makeGuard(false);
		const request: FakeRequest = { path: "/openapi.json", headers: {} };

		await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
		expect(accountByToken).not.toHaveBeenCalled();
	});

	it("rejects a missing bearer token with 401", async () => {
		const { guard } = makeGuard(false);

		await expect(
			guard.canActivate(makeContext({ path: "/kanban", headers: {} }))
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("rejects a non-bearer authorization scheme with 401", async () => {
		const { guard } = makeGuard(false);
		const request: FakeRequest = {
			path: "/kanban",
			headers: { authorization: "Basic abc" },
		};

		await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
			UnauthorizedException
		);
	});

	it("rejects a token that matches no account with 401", async () => {
		const { guard, accountByToken } = makeGuard(false);
		accountByToken.mockResolvedValue(null);
		const request: FakeRequest = {
			path: "/kanban",
			headers: { authorization: "Bearer nope" },
		};

		await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
			UnauthorizedException
		);
	});

	it("attaches the account when the token is valid", async () => {
		const { guard, accountByToken } = makeGuard(false);
		accountByToken.mockResolvedValue({
			id: "acct01",
			name: "alice",
			kind: AccountKind.User,
			isAdmin: true,
		});
		const request: FakeRequest = {
			path: "/kanban",
			headers: { authorization: "Bearer good-token" },
		};

		await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
		expect(accountByToken).toHaveBeenCalledWith("good-token");
		expect(request.account).toEqual({
			id: "acct01",
			name: "alice",
			kind: AccountKind.User,
			isAdmin: true,
		});
	});
});
