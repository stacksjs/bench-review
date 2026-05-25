import type { Attributes } from '@stacksjs/types'
import { defineModel } from '@stacksjs/orm'
import { makeHash } from '@stacksjs/security'
// soon, these will be auto-imported
import { schema } from '@stacksjs/validation'

// Wrapped with `defineModel` so `@stacksjs/orm` registers a model
// class with `User.where(...)`, `User.create(...)`, etc. Without the
// wrapper the default export was a plain object literal and the auth
// flow blew up with `User.where is not a function` on every register
// / login attempt.
export default defineModel({
  name: 'User', // defaults to the sanitized file name
  table: 'users', // defaults to the lowercase, plural name of the model name (or the name of the model file)
  primaryKey: 'id', // defaults to `id`
  autoIncrement: true, // defaults to true

  // Define composite indexes
  indexes: [
    {
      name: 'users_email_name_index',
      columns: ['email', 'name'],
    },
  ],

  traits: {
    useAuth: {
      usePasskey: true,
    },
    billable: true,
    useUuid: true,
    useTimestamps: true, // defaults to true, `timestampable` used as an alias
    useSearch: {
      displayable: ['id', 'name', 'email'], // the fields to become d (defaults to all fields)
      searchable: ['name', 'email'], // the fields to become searchable (defaults to all fields)
      sortable: ['created_at', 'updated_at'], // the fields to become sortable (defaults to all fields)
      filterable: [], // the fields to become filterable (defaults to all fields)
      // options: {}, // you may pass options to the search engine
    },

    // `useSeeder` deliberately disabled. Auto-firing the factory on
    // every `./buddy migrate` minted 10 fresh faker users per run —
    // the table accumulated noise with unguessable bcrypt passwords
    // that no one can use. `database/seeders/UserSeeder.ts` owns the
    // explicit list of real test accounts (the project owner as
    // admin + a handful of regulars with a documented test password),
    // idempotent on email so re-runs are no-ops.
    //
    // useSeeder: { count: 10 },

    useApi: {
      uri: 'users', // your-url.com/api/users

      routes: ['index', 'store', 'show'],
    },

    observe: true,
  },

  hasOne: ['Driver', 'Author'],
  // Plain string entries match the framework default's expected shape
  // (see storage/framework/defaults/app/Models/User.ts). Object-form
  // entries (`{ model, foreignKey }`) crashed the migration generator
  // with "str.replace is not a function" because the model-name
  // resolver was being passed an object instead of a string.
  hasMany: ['PersonalAccessToken', 'OauthAccessToken'],
  // RBAC pivots. `roles` and `permissions` both live in many-to-many
  // tables (user_roles, user_permissions) whose shape is fixed by
  // `@stacksjs/auth`'s rbac-store-bqb adapter. Declaring them here
  // gives the ORM enough metadata to eager-load via
  // `User.with(['roles'])` and gives downstream code typed access to
  // the pivot instead of `getUserRoles(u.id)` per row. The runtime
  // `assignRole` / `removeRole` / `hasAnyRole` chain from
  // @stacksjs/auth keeps going through raw db (it's the source of
  // truth for writes); these declarations are read-side ergonomics.
  belongsToMany: [
    { model: 'Role', pivotTable: 'user_roles', firstForeignKey: 'user_id', secondForeignKey: 'role_id' },
    { model: 'Permission', pivotTable: 'user_permissions', firstForeignKey: 'user_id', secondForeignKey: 'permission_id' },
  ],

  attributes: {
    name: {
      required: true,
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().min(5).max(255),
        message: {
          min: 'Name must have a minimum of 3 characters',
          max: 'Name must have a maximum of 255 characters',
        },
      },

      factory: faker => faker.person.fullName(),
    },

    email: {
      unique: true,
      required: true,
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().email(),
        message: {
          email: 'Email must be a valid email address',
        },
      },

      factory: faker => faker.internet.email(),
    },
    password: {
      required: true,
      order: 3,
      hidden: true,
      fillable: true,
      validation: {
        rule: schema.string().min(6).max(255),
        message: {
          min: 'Password must have a minimum of 6 characters',
          max: 'Password must have a maximum of 255 characters',
        },
      },

      factory: faker => faker.internet.password(),
    },
  },
  get: {
    salutationName: (attributes: Attributes) => {
      return `Mr. ${attributes.name}`
    },
  },

  set: {
    password: async (attributes: Attributes) => {
      return await makeHash(attributes.password, { algorithm: 'bcrypt' })
    },
  },
  dashboard: {
    highlight: true,
  },
} as const)
