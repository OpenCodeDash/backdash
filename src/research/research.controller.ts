import {
	Body,
	Controller,
	Get,
	Header,
	HttpCode,
	Param,
	Post,
	Res,
	Sse,
	type MessageEvent,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiOkResponse,
	ApiOperation,
	ApiProduces,
	ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { Observable } from "rxjs";
import {
	CreateResearchCampaignDto,
	PreviewResearchCampaignDto,
	ResearchFeedbackDto,
} from "./dto/research.dto.js";
import { ResearchService } from "./research.service.js";

const STREAM_NOTES =
	"Server-sent events relayed from the harness daemon. Each frame's `data` is " +
	"a harness event (`run.started`, `stage`, `run.finished`, `status`, `error`).";

@ApiTags("research")
@ApiBearerAuth()
@Controller("research")
export class ResearchController {
	constructor(private readonly research: ResearchService) {}

	@Get("campaigns")
	@ApiOperation({ summary: "List research campaigns" })
	@ApiOkResponse({ description: "Campaigns from the harness daemon" })
	list(): Promise<unknown> {
		return this.research.list();
	}

	@Post("campaigns")
	@HttpCode(202)
	@ApiOperation({ summary: "Start a research campaign" })
	@ApiCreatedResponse({ description: "Campaign accepted and queued" })
	create(@Body() dto: CreateResearchCampaignDto): Promise<unknown> {
		return this.research.create(dto);
	}

	@Post("campaigns/preview")
	@ApiOperation({
		summary: "Compile a brief without starting",
		description: "Returns the parsed criteria, echo, and warnings for review.",
	})
	preview(@Body() dto: PreviewResearchCampaignDto): Promise<unknown> {
		return this.research.preview(dto);
	}

	@Get("campaigns/:id")
	@ApiOperation({ summary: "Campaign status, run, and brief" })
	get(@Param("id") id: string): Promise<unknown> {
		return this.research.get(id);
	}

	@Get("campaigns/:id/results")
	@ApiOperation({ summary: "Ranked results with evidence and gaps" })
	results(@Param("id") id: string): Promise<unknown> {
		return this.research.results(id);
	}

	@Get("campaigns/:id/export.csv")
	@Header("content-type", "text/csv; charset=utf-8")
	@ApiOperation({ summary: "Download the ranked CSV" })
	@ApiProduces("text/csv")
	async exportCsv(
		@Param("id") id: string,
		@Res({ passthrough: true }) res: Response
	): Promise<string> {
		res.setHeader(
			"content-disposition",
			`attachment; filename="${id}.csv"`
		);
		return this.research.exportCsv(id);
	}

	@Post("campaigns/:id/feedback")
	@ApiOperation({ summary: "Apply feedback and re-score" })
	feedback(
		@Param("id") id: string,
		@Body() dto: ResearchFeedbackDto
	): Promise<unknown> {
		return this.research.feedback(id, dto.text);
	}

	@Post("campaigns/:id/pause")
	@ApiOperation({ summary: "Pause a running campaign" })
	pause(@Param("id") id: string): Promise<unknown> {
		return this.research.pause(id);
	}

	@Post("campaigns/:id/resume")
	@ApiOperation({ summary: "Resume a paused campaign" })
	resume(@Param("id") id: string): Promise<unknown> {
		return this.research.resume(id);
	}

	@Post("campaigns/:id/stop")
	@ApiOperation({ summary: "Stop a running campaign" })
	stop(@Param("id") id: string): Promise<unknown> {
		return this.research.stop(id);
	}

	@Sse("campaigns/:id/events")
	@ApiOperation({
		summary: "Stream campaign events",
		description: STREAM_NOTES,
	})
	@ApiProduces("text/event-stream")
	events(@Param("id") id: string): Observable<MessageEvent> {
		return this.research.stream(id);
	}
}
