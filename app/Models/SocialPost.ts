import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'SocialPost',
  table: 'social_posts',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSeeder: {
      count: 20,
    },
    useApi: {
      uri: 'social-posts',
      // SECURITY: read-only. The ORM auto-CRUD generator emits POST/PUT/DELETE
      // handlers with NO authentication — storage/framework/orm/routes.ts
      // resolves the authed user only to feed the optional `authedFill` hook,
      // and the 401 branch exists solely inside `if (own.enforced)`, which
      // requires an `ownership` config this model does not declare. Writes go
      // through explicit, gated Actions instead (see routes/api.ts).
      routes: ['index', 'show'],
    },
  },

  belongsTo: ['User'],

  attributes: {
    content: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(2000),
      },
      factory: faker => faker.lorem.paragraph(),
    },

    platform: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.enum(['twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube']),
      },
      factory: faker => faker.helpers.arrayElement(['twitter', 'facebook', 'instagram', 'linkedin', 'tiktok']),
    },

    status: {
      required: true,
      fillable: true,
      default: 'draft',
      validation: {
        rule: schema.enum(['draft', 'scheduled', 'published', 'failed']),
      },
      factory: faker => faker.helpers.arrayElement(['draft', 'scheduled', 'published', 'published', 'published']),
    },

    scheduledAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.timestamp(),
      },
      factory: (faker) => {
        return faker.date.soon({ days: 7 }).toISOString().slice(0, 19).replace('T', ' ')
      },
    },

    publishedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.timestamp(),
      },
      factory: (faker) => {
        if (faker.datatype.boolean()) {
          return faker.date.recent({ days: 14 }).toISOString().slice(0, 19).replace('T', ' ')
        }
        return null
      },
    },

    likes: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 5000 }),
    },

    shares: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 500 }),
    },

    comments: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 200 }),
    },

    reach: {
      required: false,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 50000 }),
    },

    imageUrl: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().url(),
      },
      factory: faker => faker.image.url(),
    },

    externalId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(255),
      },
      factory: faker => faker.string.alphanumeric(20),
    },
  },
} as const)
