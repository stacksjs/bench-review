import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'Team',
  table: 'teams',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'name', 'description', 'memberCount', 'createdAt'],
      searchable: ['name', 'description'],
      sortable: ['name', 'createdAt', 'updatedAt', 'memberCount'],
      filterable: ['status'],
    },

    useSeeder: {
      count: 5,
    },

    useApi: {
      uri: 'teams',
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
      order: 1,
      unique: true,
      fillable: true,
      validation: {
        rule: schema.string().required().min(2).max(100),
      },
      factory: faker => faker.company.name(),
    },

    description: {
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.company.catchPhrase(),
    },

    memberCount: {
      order: 3,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 1, max: 20 }),
    },

    status: {
      order: 4,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.helpers.arrayElement(['active', 'inactive']),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
