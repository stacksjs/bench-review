import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// bench-review#44 — comments under reviews.
//
// Separate from the framework default `comments` table (which is the
// polymorphic shape for CMS posts). Review commentary has its own
// lifecycle — auto-publishing on submit, community-flaggable, admin-
// rejectable. Keeping it single-purpose avoids entangling with the
// polymorphic `commentable_*` pattern.
//
// `anonymized` mirrors the same flag on JudgeReview so clerks /
// attorneys can post anonymous commentary the same way (#36).
// `judge_reviews.comments` stays as the denormalised counter so feed-
// card listings don't need a JOIN to count.
export default defineModel({
  name: 'ReviewComment',
  table: 'review_comments',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'review_comments_review_status_idx', columns: ['judge_review_id', 'status'] },
    { name: 'review_comments_user_idx', columns: ['user_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['JudgeReview', 'User'],

  attributes: {
    body: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(2000),
      },
      factory: faker => faker.lorem.paragraph(),
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

    status: {
      required: true,
      fillable: true,
      default: 'published',
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.helpers.arrayElement(['published', 'rejected']),
    },
  },
} as const)
