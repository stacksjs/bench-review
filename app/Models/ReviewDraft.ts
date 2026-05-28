import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// bench-review#26 — server-side compose-draft autosave.
//
// One row per user. A user only has one draft-in-progress at a time
// (matches the localStorage behaviour the editor has today). On submit
// the draft row gets cleared; on return to /review (potentially on a
// different device) the draft is restored from the server.
//
// `judgeId` is nullable so a user can stash a draft before picking a
// judge — matches the localStorage shape, which also stores judge-less
// drafts. `rating` / `type` can be NULL too — the editor stores
// partial state commonly.
//
// One-draft-per-user is enforced by the unique index on user_id.
export default defineModel({
  name: 'ReviewDraft',
  table: 'review_drafts',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'review_drafts_user_unique', columns: ['user_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['User', 'Judge'],

  attributes: {
    title: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.lorem.sentence(),
    },

    content: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(20000),
      },
      factory: faker => faker.lorem.paragraphs(2),
    },

    rating: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number().min(1).max(5),
      },
      factory: faker => faker.number.int({ min: 1, max: 5 }),
    },

    type: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(16),
      },
      factory: faker => faker.helpers.arrayElement(['positive', 'negative', 'neutral']),
    },

    anonymized: {
      required: true,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0).max(1),
      },
      factory: () => 0,
    },
  },
} as const)
