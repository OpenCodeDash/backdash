import { Migration } from '@mikro-orm/migrations';

export class Migration20261002033751_AddTaskDependencies extends Migration {

  override name = 'Migration20261002033751_AddTaskDependencies';

  override up(): void | Promise<void> {
    this.addSql(`create table \`tasks_depends_on\` (\`tasks_1_id\` integer not null, \`tasks_2_id\` integer not null, primary key (\`tasks_1_id\`, \`tasks_2_id\`), constraint \`tasks_depends_on_tasks_1_id_foreign\` foreign key (\`tasks_1_id\`) references \`tasks\` (\`id\`) on update cascade on delete cascade, constraint \`tasks_depends_on_tasks_2_id_foreign\` foreign key (\`tasks_2_id\`) references \`tasks\` (\`id\`) on update cascade on delete cascade);`);
    this.addSql(`create index \`tasks_depends_on_tasks_1_id_index\` on \`tasks_depends_on\` (\`tasks_1_id\`);`);
    this.addSql(`create index \`tasks_depends_on_tasks_2_id_index\` on \`tasks_depends_on\` (\`tasks_2_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`tasks_depends_on\`;`);
  }

}
