import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { AccountEntity } from "../entity/account.entity.js";
import { AccountResponse } from "./account.response.js";

// Returned once by register/login. The bearer token is never retrievable
// again, so a client must persist it.
@ApiSchema({ name: "AuthSession" })
export class AuthSessionResponse {
	@ApiProperty({ type: AccountResponse })
	account: AccountResponse;

	@ApiProperty({
		type: String,
		description: "Bearer token; store it securely, it is shown only once",
	})
	token: string;

	static from(account: AccountEntity, token: string): AuthSessionResponse {
		return {
			account: AccountResponse.from(account),
			token,
		};
	}
}
