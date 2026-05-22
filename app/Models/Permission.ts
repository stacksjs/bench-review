import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * RBAC permission record. Same shape as Role — the framework's
 * `permissions` table mirrors `roles` (`rbac-store-bqb.ts:5-11`).
 * No admin UI ships for direct permission management yet; this model
 * exists so `Role.with(['permissions'])` and
 * `User.with(['permissions'])` resolve, and so future
 * permission-granular gating doesn't have to drop to raw SQL.
 */
export default defineModel({
  name: 'Permission',
  table: 'permissions',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    observe: false,
  },

  belongsToMany: [
    { model: 'User', pivotTable: 'user_permissions', firstForeignKey: 'permission_id', secondForeignKey: 'user_id' },
    { model: 'Role', pivotTable: 'role_permissions', firstForeignKey: 'permission_id', secondForeignKey: 'role_id' },
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
