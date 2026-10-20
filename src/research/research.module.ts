import { Module } from "@nestjs/common";
import { ResearchController } from "./research.controller.js";
import {
	RESEARCH_OPTIONS,
	ResearchService,
} from "./research.service.js";

@Module({
	controllers: [ResearchController],
	providers: [
		{ provide: RESEARCH_OPTIONS, useValue: {} },
		ResearchService,
	],
	exports: [ResearchService],
})
export class ResearchModule {}
