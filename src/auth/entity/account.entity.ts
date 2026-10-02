import type { Opt } from "@mikro-orm/core";
import {
	Entity,
	Index,
	PrimaryKey,
	Property,
	Unique,
} from "@mikro-orm/decorators/legacy";
import { AccountRepository } from "../repository/account.repository.js";
import { AccountKind } from "../enum/account-kind.enum.js";

@Entity({
	tableName: "accounts",
	repository: () => AccountRepository,
})
@Unique({ properties: ["name"] })
@Index({ properties: ["tokenPrefix"] })
export class AccountEntity {
	@PrimaryKey({
		type: "text",
		length: 6,
	})
	id: string;

	// The identity used as the `actor` on events and as `claimedBy` on tasks.
	@Property({
		type: "text",
		length: 100,
	})
	name: string;

	@Property({
		type: "text",
		length: 10,
	})
	kind: AccountKind = AccountKind.User;

	// The first account to register is the admin; admins provision every later
	// account (users and service accounts).
	@Property({
		type: "boolean",
	})
	isAdmin: Opt<boolean> = false;

	// Users authenticate with a password; service accounts have none.
	@Property({
		type: "text",
		nullable: true,
	})
	passwordHash: Opt<string> | null = null;

	// The bearer token is never stored in the clear: `tokenPrefix` is an
	// indexed, non-secret lookup key and `tokenHash` is the salted scrypt hash
	// the presented token must match.
	@Property({
		type: "text",
		length: 12,
	})
	tokenPrefix: string;

	@Property({
		type: "text",
	})
	tokenHash: string;

	@Property({
		type: "datetime",
		onCreate: () => new Date(),
	})
	createdAt: Opt<Date> = new Date();

	@Property({
		type: "datetime",
		onCreate: () => new Date(),
		onUpdate: () => new Date(),
	})
	updatedAt: Opt<Date> = new Date();
}
