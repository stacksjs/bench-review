import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'EmailList',
  table: 'email_lists',
  primaryKey: 'id',
  autoIncrement: true,
  hasMany: ['EmailListSubscriber', 'Campaign', 'CampaignSend'],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: {
      count: 8,
    },
    useApi: {
      uri: 'email-lists',
      // SECURITY: read-only. The ORM auto-CRUD generator emits POST/PUT/DELETE
      // handlers with NO authentication — storage/framework/orm/routes.ts
      // resolves the authed user only to feed the optional `authedFill` hook,
      // and the 401 branch exists solely inside `if (own.enforced)`, which
      // requires an `ownership` config this model does not declare. Writes go
      // through explicit, gated Actions instead (see routes/api.ts).
      routes: ['index', 'show'],
    },
  },

  attributes: {
    name: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(2).max(100),
      },
      factory: faker => faker.helpers.arrayElement([
        'Newsletter Subscribers', 'VIP Customers', 'Product Updates',
        'Beta Testers', 'Blog Subscribers', 'Marketing List',
        'Enterprise Leads', 'Event Attendees',
      ]),
    },

    slug: {
      unique: true,
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(120),
      },
      factory: faker => faker.helpers.slugify(faker.lorem.words(2)).toLowerCase(),
    },

    description: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.lorem.sentence(),
    },

    subscriberCount: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 100, max: 25000 }),
    },

    activeCount: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 50, max: 20000 }),
    },

    unsubscribedCount: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 500 }),
    },

    bouncedCount: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 100 }),
    },

    status: {
      required: true,
      fillable: true,
      default: 'active',
      validation: {
        rule: schema.enum(['active', 'inactive', 'archived']),
      },
      factory: faker => faker.helpers.arrayElement(['active', 'active', 'active', 'inactive']),
    },

    isPublic: {
      required: false,
      fillable: true,
      default: 1,
      validation: {
        rule: schema.number(),
      },
      factory: faker => faker.number.int({ min: 0, max: 1 }),
    },

    doubleOptIn: {
      required: false,
      fillable: true,
      default: 1,
      validation: {
        rule: schema.number(),
      },
      factory: () => 1,
    },
  },
} as const)
