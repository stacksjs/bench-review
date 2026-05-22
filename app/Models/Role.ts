import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * RBAC role record. The table + pivot shape match what
 * `@stacksjs/auth`'s `hasAnyRole` / `assignRole` chain reads
 * (`storage/framework/core/auth/src/rbac-store-bqb.ts:5-11`) — those
 * helpers go through raw `db.insertInto('user_roles')` calls and stay
 * the source of truth for role assignment. This model is the ORM
 * counterpart: it lets `User.with(['roles'])` style eager-loading
 * skip the per-row `getUserRoles` fan-out, and gives downstream code
 * a `Role` type instead of an `any`.
 *
 * `useSeeder` is OFF — `database/seeders/RoleSeeder.ts` wraps
 * `seedDefaultRoles()` from `@stacksjs/auth` to produce the
 * `admin` / `dev` / `client` rows idempotently. Letting the factory
 * fire would either duplicate or conflict on the unique
 * `(name, guard_name)` index.
 */
export default defineModel({
  name: 'Role',
  table: 'roles',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    observe: false,
  },

  // Both sides of the M2M are declared so `Role.with(['users'])` and
  // `Role.with(['permissions'])` both work. `firstForeignKey` is the
  // OWNER side (this model), `secondForeignKey` is the related side
  // — see `BaseBelongsToMany` in
  // storage/framework/core/types/src/model.ts:46.
  belongsToMany: [
    { model: 'User', pivotTable: 'user_roles', firstForeignKey: 'role_id', secondForeignKey: 'user_id' },
    { model: 'Permission', pivotTable: 'role_permissions', firstForeignKey: 'role_id', secondForeignKey: 'permission_id' },
  ],

  attributes: {
    name: {
      required: true,
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(255),
      },
    },
    guard_name: {
      required: true,
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(64),
      },
    },
    description: {
      required: false,
      order: 3,
      fillable: true,
      validation: {
        rule: schema.string().max(1000),
      },
    },
  },
} as const)
