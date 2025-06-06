import type { Database } from '@stacksjs/database'
import { sql } from '@stacksjs/database'

export async function up(db: Database<any>) {
  await db.schema
    .createTable('email_subscriptions')
    .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
    .addColumn('email', 'varchar(255)', col => col.unique().notNull())
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql.raw('CURRENT_TIMESTAMP')))
    .addColumn('updated_at', 'timestamp')
    .addColumn('deleted_at', 'timestamp')
    .execute()
  await db.schema.createIndex('email_subscriptions_id_index').on('email_subscriptions').column('id').execute()
}
