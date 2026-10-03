import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { KanbanModule } from "./kanban/kanban.module.js";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EventsModule } from "./events/events.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthGuard } from "./auth/auth.guard.js";
import mikroOrmConfig from "./mikro-orm.config.js";

@Module({
	imports: [
		MikroOrmModule.forRoot(mikroOrmConfig),
		AuthModule,
		KanbanModule,
		EventsModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		// Everything is protected by default; @Public() opts individual routes
		// out (health, register, login).
		{ provide: APP_GUARD, useClass: AuthGuard },
	],
})
export class AppModule {}
