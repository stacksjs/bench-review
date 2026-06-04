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
    // bench-review#37 — admin verification queue ordering.
    // The credentials index page sorts by claimed_at and filters by
    // verified_at NULL; this composite makes that scan cheap.
    {
      name: 'users_credential_status_idx',
      columns: ['credential_verified_at', 'credential_claimed_at'],
    },
  ],

  traits: {
    useAuth: {
      usePasskey: true,
    },
    billable: true,
    useUuid: true,
    useTimestamps: true, // defaults to true, `timestampable` used as an alias
    // `useSearch` deliberately disabled (bench-review#41). Indexing
    // user rows would push email into a shared search service —
    // PII leak surface. Admin user-search uses the DB-side LIKE
    // query in `/admin/users` which is fine for moderation scale.
    // Reviewer public profile (#29) is the only viewer-facing path
    // and lands directly on /user/:id rather than going through a
    // search box. If a public reviewer-search ever ships, do it via
    // a separate read-projection (`name` only) into a sibling index.
    //
    // useSearch: {
    //   searchable: ['name'],
    //   displayable: ['id', 'name'],
    //   sortable: ['created_at'],
    //   filterable: [],
    // },

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

    // bench-review#36 — self-declared role classification used to
    // label anonymous reviewers ("Anonymous attorney" vs "Anonymous
    // clerk") and as a credibility signal on non-anonymous reviews.
    // NULLABLE so existing users aren't forced to backfill before
    // their next login.
    roleLabel: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(64),
      },
    },

    // bench-review#37 — self-declared credential claim + admin
    // verification. The CLAIM is tracked; proof (bar card, clerk ID,
    // court badge) lives out-of-band via admin verification against
    // external evidence. All NULLABLE so existing users aren't
    // forced into a backfill before they get a chance to declare.
    credentialType: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(64),
      },
    },

    credentialState: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(16),
      },
    },

    credentialClaimedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
    },

    credentialVerifiedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
    },

    credentialVerifiedByUserId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number().positive(),
      },
    },

    credentialRejectionNote: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(2000),
      },
    },

    // Email verification (launch trust gate). NULL = unverified; set to
    // an ISO timestamp once the user clicks the verification link. The
    // framework's email-verification flow (@stacksjs/auth) writes this
    // column; review submission is gated on it (SubmitReviewAction).
    // Nullable so existing rows aren't force-migrated — the backfill
    // seeder marks pre-launch accounts verified so only new signups
    // must verify.
    emailVerifiedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
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
