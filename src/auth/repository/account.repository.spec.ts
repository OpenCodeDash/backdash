import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	initTestOrm,
	type TestOrm,
} from "../../../test/mikro-orm.test-helper.js";
import { AccountEntity } from "../entity/account.entity.js";
import {
	AccountRepository,
	type NewAccount,
} from "./account.repository.js";
import { AccountKind } from "../enum/account-kind.enum.js";

let ctx: TestOrm;
let repo: AccountRepository;

beforeEach(async () => {
	ctx = await initTestOrm();
	repo = ctx.em.getRepository(AccountEntity) as AccountRepository;
});

afterEach(async () => {
	await ctx.orm.close();
});

function seed(overrides: Partial<NewAccount> = {}): Promise<AccountEntity> {
	return repo.createUnique({
		name: "alice",
		kind: AccountKind.User,
		isAdmin: false,
		passwordHash: "salt:hash",
		tokenPrefix: "bdsk_0000001",
		tokenHash: "salt:hash",
		...overrides,
	});
}

describe("AccountRepository", () => {
	it("creates an account with a generated six-letter id", async () => {
		const account = await seed();

		expect(account.id).toMatch(/^[a-z]{6}$/);
		expect(account.name).toBe("alice");
		expect(account.kind).toBe(AccountKind.User);
	});

	it("findByName returns the account or null", async () => {
		const account = await seed();

		expect((await repo.findByName("alice"))!.id).toBe(account.id);
		expect(await repo.findByName("nobody")).toBeNull();
	});

	it("findByTokenPrefix returns only matching accounts", async () => {
		await seed({ name: "a", tokenPrefix: "bdsk_0000001" });
		await seed({ name: "b", tokenPrefix: "bdsk_0000002" });

		const matches = await repo.findByTokenPrefix("bdsk_0000001");

		expect(matches).toHaveLength(1);
		expect(matches[0].name).toBe("a");
	});

	it("findServiceAccounts returns only service accounts", async () => {
		await seed({ name: "user1" });
		await seed({
			name: "svc1",
			kind: AccountKind.Service,
			passwordHash: null,
			tokenPrefix: "bdsk_0000003",
		});

		const services = await repo.findServiceAccounts();

		expect(services.map((account) => account.name)).toEqual(["svc1"]);
	});

	it("createUnique rejects a duplicate name", async () => {
		await seed();
		await expect(seed()).rejects.toThrow();
	});
});
