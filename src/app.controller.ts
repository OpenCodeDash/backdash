import { Controller, Get } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import { AppService } from "./app.service.js";
import { Public } from "./auth/public.decorator.js";

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Public()
	@Get()
	@ApiOperation({ operationId: "health" })
	getHello(): string {
		return this.appService.getHello();
	}
}
