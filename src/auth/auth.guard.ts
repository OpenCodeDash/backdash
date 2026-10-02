import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import type { AuthenticatedAccount } from "./auth.types.js";

// API docs are served outside the DI/controller pipeline, so they carry no
// @Public() metadata; allow them explicitly.
const PUBLIC_PATH_PREFIXES = ["/docs", "/openapi.json"];

function extractBearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}

	const [scheme, value] = header.split(" ");

	if (!value || scheme.toLowerCase() !== "bearer") {
		return null;
	}

	return value.trim() || null;
}

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly auth: AuthService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) {
			return true;
		}

		const request = context.switchToHttp().getRequest<{
			path?: string;
			url?: string;
			headers: Record<string, string | string[] | undefined>;
			account?: AuthenticatedAccount;
		}>();

		const path = request.path ?? request.url ?? "";

		if (PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
			return true;
		}

		const header = request.headers.authorization;
		const token = extractBearerToken(
			Array.isArray(header) ? header[0] : header
		);

		if (!token) {
			throw new UnauthorizedException("Missing bearer token");
		}

		const account = await this.auth.accountByToken(token);

		if (!account) {
			throw new UnauthorizedException("Invalid bearer token");
		}

		request.account = {
			id: account.id,
			name: account.name,
			kind: account.kind,
			isAdmin: account.isAdmin,
		};

		return true;
	}
}
