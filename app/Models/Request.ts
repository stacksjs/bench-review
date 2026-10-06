import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'Request',
  table: 'requests',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useTimestamps: true,
    useSoftDeletes: true,
    useSeeder: {
      count: 50,
    },

    // SECURITY: no auto-generated routes at all.
    //
    // `useApi.routes` is opt-OUT, not opt-in: `useApi: true` (what this model
    // carried) makes the ORM generator emit index, show, store, update,
    // destroy AND a bulk-delete at /api/requests — and the generated write
    // handlers have no 401 path. `storage/framework/orm/routes.ts` resolves
    // the authed user only to feed the optional `authedFill` hook, and its
    // sole 401 branch sits inside `if (own.enforced)`, which needs an
    // `ownership` config this model does not declare.
    //
    // This table is request telemetry — it holds `ip_address`, `user_agent`,
    // `path` and `status_code`. Readable, that is an unmetered log of who
    // visited what, which on a site whose whole premise is anonymous reviews
    // is a de-anonymisation primitive: correlate an IP against a
    // POST /api/reviews hit and the "anonymous" author is named. Writable, it
    // lets anyone forge or wipe telemetry that the framework dashboard renders
    // (defaults/routes/dashboard.ts -> Dashboard/Infrastructure/RequestIndexAction).
    //
    // Nothing in this app reads or writes the table today, so there was no
    // live leak — but the endpoints were real. `routes: []` is the opt-out.
    useApi: {
      uri: 'requests',
      routes: [],
    },
  },

  attributes: {
    method: {
      fillable: true,
      validation: {
        rule: schema.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']),
        message: {
          enum: 'method must be a valid HTTP method',
          required: 'method is required',
        },
      },
      factory: faker => faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE']),
    },

    path: {
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          string: 'path must be a string',
          required: 'path is required',
        },
      },
      factory: faker => faker.internet.url(),
    },

    status_code: {
      fillable: true,
      validation: {
        rule: schema.number(),
        message: {
          number: 'status_code must be a number',
          required: 'status_code is required',
        },
      },
      factory: faker => faker.helpers.arrayElement([200, 201, 400, 401, 403, 404, 500]),
    },

    duration_ms: {
      fillable: true,
      validation: {
        rule: schema.number(),
        message: {
          number: 'duration_ms must be a number',
          required: 'duration_ms is required',
        },
      },
      factory: faker => faker.number.int({ min: 50, max: 1000 }),
    },

    ip_address: {
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          string: 'ip_address must be a string',
          required: 'ip_address is required',
        },
      },
      factory: faker => faker.internet.ip(),
    },

    memory_usage: {
      fillable: true,
      validation: {
        rule: schema.number(),
        message: {
          number: 'memory_usage must be a number in MB',
          required: 'memory_usage is required',
        },
      },
      factory: faker => faker.number.int({ min: 50, max: 512 }),
    },

    user_agent: {
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          string: 'user_agent must be a string',
        },
      },
      factory: faker => faker.internet.userAgent(),
    },

    error_message: {
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          string: 'error_message must be a string',
        },
      },
      factory: faker => faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.2 }),
    },
  },
} as const)
