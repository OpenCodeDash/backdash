import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import {
	createTestContext,
	type TestContext,
} from "../../test/mikro-orm.test-helper.js";
import { AuthModule } from "./auth.module.js";
import { AuthService } from "./auth.service.js";
import { AccountKind } from "./enum/account-kind.enum.js";

let ctx: TestContext;
let service: AuthService;

beforeEach(async () => {
	ctx = await createTestContext([AuthModule]);
	service = ctx.module.get(AuthService);
});

afterEach(async () => {
	await ctx.module.close();
});

describe("AuthService", () => {
	it("the first register creates an admin account with a usable token", async () => {
		const { account, token } = await service.register("alice", "password123");

		expect(account.name).toBe("alice");
		expect(account.kind).toBe(AccountKind.User);
		expect(account.isAdmin).toBe(true);
		expect(account.passwordHash).not.toContain("password123");
		expect(account.tokenHash).not.toContain(token);
		expect(token).toMatch(/^bdsk_/);
		expect((await service.accountByToken(token))!.id).toBe(account.id);
	});

	it("closes registration once an account exists", async () => {
		await service.register("alice", "password123");

		await expect(
			service.register("bob", "password456")
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("createUser provisions a non-admin user that can log in", async () => {
		await service.register("alice", "password123");

		const { account, token } = await service.createUser("bob", "password456");

		expect(account.kind).toBe(AccountKind.User);
		expect(account.isAdmin).toBe(false);
		expect(await service.accountByToken(token)).not.toBeNull();
		await expect(service.login("bob", "password456")).resolves.toMatchObject({
			token: expect.any(String),
		});
	});

	it("createUser can grant admin", async () => {
		await service.register("alice", "password123");

		const { account } = await service.createUser("carol", "password456", true);

		expect(account.isAdmin).toBe(true);
	});

	it("createUser rejects a duplicate name with 409", async () => {
		await service.register("alice", "password123");
		await service.createUser("bob", "password456");

		await expect(
			service.createUser("bob", "password789")
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("login returns a fresh token and invalidates the previous one", async () => {
		const { token: first } = await service.register("alice", "password123");

		const { token: second } = await service.login("alice", "password123");

		expect(second).not.toBe(first);
		expect(await service.accountByToken(first)).toBeNull();
		expect(await service.accountByToken(second)).not.toBeNull();
	});

	it("login rejects a wrong password with 401", async () => {
		await service.register("alice", "password123");

		await expect(
			service.login("alice", "wrong-password")
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("login rejects an unknown account with 401", async () => {
		await expect(
			service.login("ghost", "password123")
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("accountByToken returns null for an unknown token", async () => {
		expect(await service.accountByToken("bdsk_deadbeef")).toBeNull();
	});

	it("getById returns the account or throws 404", async () => {
		const { account } = await service.register("alice", "password123");

		expect((await service.getById(account.id)).name).toBe("alice");
		await expect(service.getById("zzzzzz")).rejects.toBeInstanceOf(
			NotFoundException
		);
	});
});

describe("AuthService service accounts", () => {
	it("createServiceAccount returns a service account and a usable token", async () => {
		const { account, token } = await service.createServiceAccount("agent-1");

		expect(account.kind).toBe(AccountKind.Service);
		expect(account.passwordHash).toBeNull();
		expect(await service.accountByToken(token)).not.toBeNull();
	});

	it("createServiceAccount rejects a duplicate name with 409", async () => {
		await service.createServiceAccount("agent-1");

		await expect(
			service.createServiceAccount("agent-1")
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("createServiceAccount rejects a name already used by a user", async () => {
		await service.register("alice", "password123");

		await expect(
			service.createServiceAccount("alice")
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("a service account cannot log in with a password", async () => {
		await service.createServiceAccount("agent-1");

		await expect(
			service.login("agent-1", "anything")
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("listServiceAccounts returns only service accounts", async () => {
		await service.register("alice", "password123");
		await service.createServiceAccount("agent-1");

		const accounts = await service.listServiceAccounts();

		expect(accounts.map((account) => account.name)).toEqual(["agent-1"]);
	});

	it("revokeServiceAccount invalidates the token and removes it", async () => {
		const { account, token } = await service.createServiceAccount("agent-1");

		await service.revokeServiceAccount(account.id);

		expect(await service.accountByToken(token)).toBeNull();
		expect(await service.listServiceAccounts()).toHaveLength(0);
	});

	it("revokeServiceAccount throws 404 for a missing id", async () => {
		await expect(
			service.revokeServiceAccount("zzzzzz")
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("revokeServiceAccount refuses to delete a user account", async () => {
		const { account } = await service.register("alice", "password123");

		await expect(
			service.revokeServiceAccount(account.id)
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
