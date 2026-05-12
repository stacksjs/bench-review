import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'CourtHouse',
  table: 'court_houses',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    {
      name: 'court_houses_name_index',
      columns: ['name'],
    },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'name', 'image'],
      searchable: ['name'],
      sortable: ['created_at', 'updated_at'],
      filterable: [],
    },

    useSeeder: {
      count: 10,
    },

    useApi: {
      uri: 'court-houses',
      routes: ['index', 'store', 'show'],
    },

    observe: true,
  },

  hasMany: ['Judge'],

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
      factory: faker => faker.company.name(),
    },

    image: {
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

    address: {
      required: true,
      order: 3,
      fillable: true,
      validation: {
        rule: schema.string().min(5).max(255),
        message: {
          min: 'Address must have a minimum of 5 characters',
          max: 'Address must have a maximum of 255 characters',
        },
      },
      factory: faker => faker.location.streetAddress(),
    },

    city: {
      required: true,
      order: 4,
      fillable: true,
      validation: {
        rule: schema.string().min(2).max(100),
        message: {
          min: 'City must have a minimum of 2 characters',
          max: 'City must have a maximum of 100 characters',
        },
      },
      factory: faker => faker.location.city(),
    },

    state: {
      required: true,
      order: 5,
      fillable: true,
      validation: {
        rule: schema.string().min(2).max(2),
        message: {
          min: 'State must be 2 characters',
          max: 'State must be 2 characters',
        },
      },
      factory: faker => faker.location.state({ abbreviated: true }),
    },

    zipCode: {
      required: true,
      order: 6,
      fillable: true,
      validation: {
        rule: schema.string().length(5),
        message: {
          length: 'Zip code must be 5 characters',
        },
      },
      factory: faker => faker.location.zipCode(),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)