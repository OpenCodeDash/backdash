import { Module } from "@nestjs/common";
import { ResearchController } from "./research.controller.js";
import { ResearchService } from "./research.service.js";

@Module({
	controllers: [ResearchController],
	providers: [ResearchService],
	exports: [ResearchService],
})
export class ResearchModule {}
