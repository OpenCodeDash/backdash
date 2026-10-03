import {
	EntityRepository,
	UniqueConstraintViolationException,
} from "@mikro-orm/core";
import { AccountEntity } from "../entity/account.entity.js";
import { AccountKind } from "../enum/account-kind.enum.js";
import { generateAccountId } from "#/util/id.util";

const MAX_ATTEMPTS = 5;

export interface NewAccount {
	name: string;
	kind: AccountKind;
	isAdmin: boolean;
	passwordHash: string | null;
	tokenPrefix: string;
	tokenHash: string;
}

export class AccountRepository extends EntityRepository<AccountEntity> {
	findByName(name: string): Promise<AccountEntity | null> {
		return this.findOne({ name });
	}

	// Tokens are looked up by their (non-secret) prefix, then verified against
	// the stored scrypt hash. A prefix may match several rows in theory, so the
	// caller verifies each candidate. Run on a fresh fork so a token that was
	// rotated earlier in the same process is never served from a stale
	// identity-map entry.
	findByTokenPrefix(prefix: string): Promise<AccountEntity[]> {
		return this.em
			.fork()
			.find(AccountEntity, { tokenPrefix: prefix });
	}

	findServiceAccounts(): Promise<AccountEntity[]> {
		return this.find(
			{ kind: AccountKind.Service },
			{ orderBy: { name: "asc" } }
		);
	}

	// Retries on id collisions (the id is the only value we generate). A
	// duplicate `name` is pre-checked by the service, so a persistent
	// constraint violation here is surfaced after the attempts are exhausted.
	async createUnique(data: NewAccount): Promise<AccountEntity> {
		let lastError: unknown;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const em = this.em.fork();
			const id = generateAccountId();

			try {
				const account = em.create(AccountEntity, { id, ...data });
				await em.flush();

				return account;
			} catch (error) {
				if (!(error instanceof UniqueConstraintViolationException)) {
					throw error;
				}

				lastError = error;
			}
		}

		throw lastError;
	}
}
