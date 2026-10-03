import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityManager, UniqueConstraintViolationException } from "@mikro-orm/core";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import { AccountEntity } from "./entity/account.entity.js";
import { AccountRepository } from "./repository/account.repository.js";
import { AccountKind } from "./enum/account-kind.enum.js";
import {
	generateToken,
	hashSecret,
	tokenPrefix,
	verifySecret,
} from "../util/crypto.util.js";

export interface AuthSession {
	account: AccountEntity;
	token: string;
}

@Injectable()
export class AuthService {
	constructor(
		private readonly em: EntityManager,
		@InjectRepository(AccountEntity)
		private readonly accounts: AccountRepository
	) {}

	// Open only until the first account exists. That first account becomes the
	// admin; every later account is provisioned by an admin (createUser /
	// createServiceAccount).
	async register(name: string, password: string): Promise<AuthSession> {
		if ((await this.accounts.count()) > 0) {
			throw new ForbiddenException(
				"Registration is closed; ask an admin to create your account"
			);
		}

		return this.createAccount(name, password, true);
	}

	// Admin-only: provisions another user account.
	createUser(
		name: string,
		password: string,
		isAdmin = false
	): Promise<AuthSession> {
		return this.createAccount(name, password, isAdmin);
	}

	private async createAccount(
		name: string,
		password: string,
		isAdmin: boolean
	): Promise<AuthSession> {
		const token = generateToken();
		let account: AccountEntity;

		try {
			account = await this.accounts.createUnique({
				name,
				kind: AccountKind.User,
				isAdmin,
				passwordHash: hashSecret(password),
				tokenPrefix: tokenPrefix(token),
				tokenHash: hashSecret(token),
			});
		} catch (error) {
			// A concurrent registration/creation can hit the unique name
			// constraint
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(`Account '${name}' already exists`);
			}

			throw error;
		}

		return { account, token };
	}

	async login(name: string, password: string): Promise<AuthSession> {
		const em = this.em.fork();
		const account = await em.findOne(AccountEntity, { name });

		if (
			!account ||
			account.kind !== AccountKind.User ||
			!verifySecret(password, account.passwordHash)
		) {
			// Same message for unknown account and wrong password, so the
			// endpoint does not reveal which names exist
			throw new UnauthorizedException("Invalid name or password");
		}

		// Rotate the token on every login: the account keeps a single active
		// token, and each login invalidates the previous one.
		const token = generateToken();
		account.tokenPrefix = tokenPrefix(token);
		account.tokenHash = hashSecret(token);
		await em.flush();

		return { account, token };
	}

	getById(id: string): Promise<AccountEntity> {
		return this.accounts.findOneOrFail({ id }).catch(() => {
			throw new NotFoundException(`Account '${id}' not found`);
		});
	}

	// Creates a non-interactive account for an agent/tool. It has no password
	// and a single long-lived token, returned once. The name shares the account
	// namespace, so it cannot shadow a user.
	async createServiceAccount(name: string): Promise<AuthSession> {
		const existing = await this.accounts.findByName(name);

		if (existing) {
			throw new ConflictException(`Account '${name}' already exists`);
		}

		const token = generateToken();
		let account: AccountEntity;

		try {
			account = await this.accounts.createUnique({
				name,
				kind: AccountKind.Service,
				isAdmin: false,
				passwordHash: null,
				tokenPrefix: tokenPrefix(token),
				tokenHash: hashSecret(token),
			});
		} catch (error) {
			if (error instanceof UniqueConstraintViolationException) {
				throw new ConflictException(`Account '${name}' already exists`);
			}

			throw error;
		}

		return { account, token };
	}

	listServiceAccounts(): Promise<AccountEntity[]> {
		return this.accounts.findServiceAccounts();
	}

	// Revokes a service account (and therefore its token) by deleting it.
	async revokeServiceAccount(id: string): Promise<void> {
		const em = this.em.fork();
		const account = await em.findOne(AccountEntity, {
			id,
			kind: AccountKind.Service,
		});

		if (!account) {
			throw new NotFoundException(`Service account '${id}' not found`);
		}

		await em.remove(account).flush();
	}

	// Resolves a presented bearer token to its account, or null when no account
	// matches. The prefix narrows the search; the scrypt hash decides.
	async accountByToken(token: string): Promise<AccountEntity | null> {
		const candidates = await this.accounts.findByTokenPrefix(
			tokenPrefix(token)
		);

		for (const account of candidates) {
			if (verifySecret(token, account.tokenHash)) {
				return account;
			}
		}

		return null;
	}
}
