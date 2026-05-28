import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// bench-review#27 — community report/flag for a review.
//
// One row = one reader flagging one review. status lifecycle is
// `open` → admin → `dismissed` (false positive, no review change) or
// `actioned` (the review was edited or rejected as a result). Dismissed
// flags stay in the table for audit; they're filtered out of the
// active queue by the listing query.
//
// `userId` is nullable so anonymous (logged-out) reports are accepted —
// the action layer rate-limits those by IP. Identified reports carry
// the reporter's id so repeat-flagging from one user can be caught.
// The unique (judge_review_id, user_id) partial constraint that
// prevents double-flagging from one user is enforced at the action
// layer instead of the schema, since model `indexes` don't support
// partial `WHERE` clauses.
export default defineModel({
  name: 'ReviewFlag',
  table: 'review_flags',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'review_flags_status_idx', columns: ['status'] },
    { name: 'review_flags_review_idx', columns: ['judge_review_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['JudgeReview', 'User'],

  attributes: {
    reason: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(64),
      },
      factory: faker => faker.helpers.arrayElement(['spam', 'harassment', 'off_topic', 'misinformation', 'other']),
    },

    details: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(2000),
      },
      factory: faker => faker.lorem.sentence(),
    },

    status: {
      required: true,
      fillable: true,
      default: 'open',
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.helpers.arrayElement(['open', 'dismissed', 'actioned']),
    },

    moderatorId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number().positive(),
      },
    },

    moderatorNote: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(2000),
      },
    },
  },
} as const)
