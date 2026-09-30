import { Migration } from '@mikro-orm/migrations';

export class Migration20260930004012_Migration20260930000000AddTasks extends Migration {

  override name = 'Migration20260930004012_Migration20260930000000AddTasks';

  override up(): void | Promise<void> {
    this.addSql(`create table \`tasks\` (\`id\` integer not null primary key autoincrement, \`column_id\` integer not null, \`name\` text not null, \`description\` text not null default '', \`position\` integer not null, \`claimed_by\` text not null default '', constraint \`tasks_column_id_foreign\` foreign key (\`column_id\`) references \`columns\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`tasks_column_id_index\` on \`tasks\` (\`column_id\`);`);
    this.addSql(`create index \`tasks_column_id_position_index\` on \`tasks\` (\`column_id\`, \`position\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`tasks\`;`);
  }

}
