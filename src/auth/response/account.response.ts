import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { AccountEntity } from "../entity/account.entity.js";
import { AccountKind } from "../enum/account-kind.enum.js";

@ApiSchema({ name: "Account" })
export class AccountResponse {
	@ApiProperty({
		type: String,
		minLength: 6,
		maxLength: 6,
	})
	id: string;

	@ApiProperty({
		type: String,
	})
	name: string;

	@ApiProperty({
		enum: AccountKind,
		enumName: "AccountKind",
	})
	kind: AccountKind;

	@ApiProperty({
		type: Boolean,
		description: "Whether the account can provision other accounts",
	})
	isAdmin: boolean;

	@ApiProperty({
		type: String,
		format: "date-time",
	})
	createdAt: string;

	static from(account: AccountEntity): AccountResponse {
		return {
			id: account.id,
			name: account.name,
			kind: account.kind,
			isAdmin: account.isAdmin,
			createdAt: account.createdAt.toISOString(),
		};
	}
}
