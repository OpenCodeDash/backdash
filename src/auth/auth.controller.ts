import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	HttpCode,
	Param,
	Post,
	UseGuards,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { RegisterDto } from "./dto/register.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { CreateServiceAccountDto } from "./dto/create-service-account.dto.js";
import { AccountResponse } from "./response/account.response.js";
import { AuthSessionResponse } from "./response/auth-session.response.js";
import { Public } from "./public.decorator.js";
import { CurrentUser } from "./current-user.decorator.js";
import { RateLimit } from "./rate-limit/rate-limit.decorator.js";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard.js";
import type { AuthenticatedAccount } from "./auth.types.js";

// Account provisioning is an admin action; a non-admin (including any agent
// service account) must not be able to mint credentials.
function requireAdmin(account: AuthenticatedAccount): void {
	if (!account.isAdmin) {
		throw new ForbiddenException("Admin account required");
	}
}

@ApiTags("auth")
@ApiBearerAuth()
@UseGuards(RateLimitGuard)
@Controller("auth")
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Public()
	@Post("register")
	@RateLimit({ limit: 5, windowMs: 60_000 })
	@ApiOperation({
		operationId: "register",
		description:
			"Open only until the first account exists; that first account becomes the admin",
	})
	@ApiCreatedResponse({ type: AuthSessionResponse })
	@ApiForbiddenResponse({ description: "Registration is closed" })
	@ApiConflictResponse({ description: "An account with this name exists" })
	async register(@Body() dto: RegisterDto): Promise<AuthSessionResponse> {
		const session = await this.auth.register(dto.name, dto.password);
		return AuthSessionResponse.from(session.account, session.token);
	}

	@Public()
	@Post("login")
	@HttpCode(200)
	@RateLimit({ limit: 10, windowMs: 60_000 })
	@ApiOperation({ operationId: "login" })
	@ApiOkResponse({ type: AuthSessionResponse })
	@ApiUnauthorizedResponse({ description: "Invalid name or password" })
	async login(@Body() dto: LoginDto): Promise<AuthSessionResponse> {
		const session = await this.auth.login(dto.name, dto.password);
		return AuthSessionResponse.from(session.account, session.token);
	}

	@Get("me")
	@ApiOperation({ operationId: "getCurrentAccount" })
	@ApiOkResponse({ type: AccountResponse })
	@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
	async me(
		@CurrentUser() current: AuthenticatedAccount
	): Promise<AccountResponse> {
		const account = await this.auth.getById(current.id);
		return AccountResponse.from(account);
	}

	@Post("users")
	@ApiOperation({ operationId: "createUser" })
	@ApiCreatedResponse({ type: AuthSessionResponse })
	@ApiConflictResponse({ description: "An account with this name exists" })
	@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
	async createUser(
		@Body() dto: CreateUserDto,
		@CurrentUser() current: AuthenticatedAccount
	): Promise<AuthSessionResponse> {
		requireAdmin(current);
		const session = await this.auth.createUser(
			dto.name,
			dto.password,
			dto.isAdmin ?? false
		);
		return AuthSessionResponse.from(session.account, session.token);
	}

	@Post("service")
	@ApiOperation({ operationId: "createServiceAccount" })
	@ApiCreatedResponse({ type: AuthSessionResponse })
	@ApiConflictResponse({ description: "An account with this name exists" })
	@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
	async createServiceAccount(
		@Body() dto: CreateServiceAccountDto,
		@CurrentUser() current: AuthenticatedAccount
	): Promise<AuthSessionResponse> {
		requireAdmin(current);
		const session = await this.auth.createServiceAccount(dto.name);
		return AuthSessionResponse.from(session.account, session.token);
	}

	@Get("service")
	@ApiOperation({ operationId: "listServiceAccounts" })
	@ApiOkResponse({ type: [AccountResponse] })
	@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
	async listServiceAccounts(
		@CurrentUser() current: AuthenticatedAccount
	): Promise<AccountResponse[]> {
		requireAdmin(current);
		const accounts = await this.auth.listServiceAccounts();
		return accounts.map((account) => AccountResponse.from(account));
	}

	@Delete("service/:id")
	@HttpCode(204)
	@ApiOperation({ operationId: "revokeServiceAccount" })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: "Service account not found" })
	@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
	async revokeServiceAccount(
		@Param("id") id: string,
		@CurrentUser() current: AuthenticatedAccount
	): Promise<void> {
		requireAdmin(current);
		await this.auth.revokeServiceAccount(id);
	}
}
