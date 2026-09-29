import { Module } from "@nestjs/common";
import { EventsService } from "./events.service.js";
import { EventsController } from "./events.controller.js";
import { KanbanModule } from "#/kanban/kanban.module";

@Module({
	imports: [KanbanModule],
	controllers: [EventsController],
	providers: [EventsService],
})
export class EventsModule {}
