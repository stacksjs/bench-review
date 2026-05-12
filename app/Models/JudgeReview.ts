import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'JudgeReview',
  table: 'judge_reviews',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    {
      name: 'judge_reviews_title_index',
      columns: ['title'],
    },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'title', 'content', 'rating'],
      searchable: ['title', 'content'],
      sortable: ['created_at', 'updated_at', 'rating'],
      filterable: ['rating', 'status', 'type'],
    },

    useSeeder: {
      count: 10,
    },

    useApi: {
      uri: 'judge-reviews',
      routes: ['index', 'store', 'show'],
    },

    observe: true,
  },

  belongsTo: ['Judge', 'User'],

  attributes: {
    title: {
      required: true,
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().min(3).max(255),
        message: {
          min: 'Title must have a minimum of 3 characters',
          max: 'Title must have a maximum of 255 characters',
        },
      },
      factory: faker => faker.lorem.sentence(),
    },

    content: {
      required: true,
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().min(10).max(1000),
        message: {
          min: 'Content must have a minimum of 10 characters',
          max: 'Content must have a maximum of 1000 characters',
        },
      },
      factory: faker => faker.lorem.paragraphs(2),
    },

    rating: {
      required: true,
      order: 3,
      fillable: true,
      validation: {
        rule: schema.number().min(1).max(5),
        message: {
          min: 'Rating must be at least 1',
          max: 'Rating cannot exceed 5',
        },
      },
      factory: faker => faker.number.int({ min: 1, max: 5 }),
    },

    likes: {
      required: true,
      order: 4,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
        message: {
          min: 'Likes cannot be negative',
        },
      },
      factory: faker => faker.number.int({ min: 0, max: 100 }),
    },

    comments: {
      required: true,
      order: 5,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
        message: {
          min: 'Comments cannot be negative',
        },
      },
      factory: faker => faker.number.int({ min: 0, max: 50 }),
    },

    type: {
      required: true,
      order: 6,
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          required: 'Type is required',
        },
      },
      factory: faker => faker.helpers.arrayElement(['positive', 'negative', 'neutral']),
    },

    status: {
      required: true,
      order: 7,
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          required: 'Status is required',
        },
      },
      factory: faker => faker.helpers.arrayElement(['published', 'pending', 'rejected']),
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)