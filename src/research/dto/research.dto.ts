import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateResearchCampaignDto {
	@IsOptional()
	@IsString()
	@MaxLength(4000)
	@ApiPropertyOptional({
		type: String,
		maxLength: 4000,
		description: "Natural-language brief; compiled by the harness",
	})
	prompt?: string;

	@IsOptional()
	@IsString()
	@MaxLength(20000)
	@ApiPropertyOptional({
		type: String,
		maxLength: 20000,
		description: "Pre-compiled brief YAML",
	})
	brief?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	@ApiPropertyOptional({ type: String, example: "property" })
	pack?: string;

	@IsOptional()
	@IsString()
	@MaxLength(120)
	@ApiPropertyOptional({ type: String })
	name?: string;
}

export class ResearchFeedbackDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(4000)
	@ApiProperty({ type: String, maxLength: 4000 })
	text: string;
}
