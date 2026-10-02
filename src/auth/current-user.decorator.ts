import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedAccount } from "./auth.types.js";

// Injects the account authenticated by the global AuthGuard. Only valid on
// protected routes.
export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthenticatedAccount => {
		const request = ctx.switchToHttp().getRequest<{
			account?: AuthenticatedAccount;
		}>();

		return request.account as AuthenticatedAccount;
	}
);
