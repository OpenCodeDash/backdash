import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { KanbanModule } from "./kanban/kanban.module.js";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EventsModule } from "./events/events.module.js";
import mikroOrmConfig from "./mikro-orm.config.js";

@Module({
	imports: [MikroOrmModule.forRoot(mikroOrmConfig), KanbanModule, EventsModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
