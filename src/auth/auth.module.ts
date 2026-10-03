import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AccountEntity } from "./entity/account.entity.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { RateLimitService } from "./rate-limit/rate-limit.service.js";

@Module({
	imports: [MikroOrmModule.forFeature([AccountEntity])],
	controllers: [AuthController],
	providers: [AuthService, RateLimitService],
	exports: [AuthService],
})
export class AuthModule {}
