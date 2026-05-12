import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'Judge',
  table: 'judges',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    {
      name: 'judges_name_index',
      columns: ['name'],
    },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'name', 'imageUrl'],
      searchable: ['name'],
      sortable: ['created_at', 'updated_at'],
      filterable: [],
    },

    useSeeder: {
      count: 10,
    },

    useApi: {
      uri: 'judges',
      routes: ['index', 'store', 'show'],
    },

    observe: true,
  },

  belongsTo: ['CourtHouse'],

  attributes: {
    name: {
      required: true,
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().min(3).max(255),
        message: {
          min: 'Name must have a minimum of 3 characters',
          max: 'Name must have a maximum of 255 characters',
        },
      },
      factory: faker => faker.person.fullName(),
    },

    imageUrl: {
      required: true,
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().url(),
        message: {
          url: 'Image URL must be a valid URL',
        },
      },
      factory: faker => faker.image.url(),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)