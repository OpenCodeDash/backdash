import { AccountKind } from "./enum/account-kind.enum.js";

// The shape the AuthGuard attaches to the request (`req.account`). It is
// deliberately a plain object, not the ORM entity, so downstream code cannot
// accidentally mutate or lazily load through the request.
export interface AuthenticatedAccount {
	id: string;
	name: string;
	kind: AccountKind;
	isAdmin: boolean;
}
