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
      // bench-review#41 — Meilisearch index settings. Searchable
      // stays same-table for now (cross-table court_name search
      // waits on upstream stacksjs/stacks#1918 — toSearchableObject
      // doesn't follow belongsTo relations). practice_area is added
      // as filterable so the directory filter pills (#38) can use
      // the Meili facet API instead of client-side filter once the
      // SearchView migration lands.
      displayable: ['id', 'name', 'image_url', 'practice_area', 'court_house_id'],
      searchable: ['name'],
      sortable: ['created_at', 'updated_at'],
      filterable: ['practice_area', 'court_house_id'],
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

    // Practice-area category for the /reviews "Explore Categories"
    // sidebar. Lowercase tokens; UI capitalises for display. NULL is
    // allowed (unclassified) so this column is non-breaking for any
    // row inserted before the backfill.
    practiceArea: {
      required: false,
      order: 3,
      fillable: true,
      validation: {
        rule: schema.enum(['criminal', 'civil', 'family', 'probate', 'appellate', 'bankruptcy', 'other']),
        message: {
          enum: 'Practice area must be one of criminal, civil, family, probate, appellate, bankruptcy, other.',
        },
      },
      factory: faker => faker.helpers.arrayElement(['criminal', 'civil', 'family', 'probate', 'appellate', 'bankruptcy', 'other']),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)