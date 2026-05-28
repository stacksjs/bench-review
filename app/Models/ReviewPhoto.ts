import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// bench-review#31 — photos attached to a review.
//
// Three URL columns track the resize ladder produced at upload time:
//   thumbUrl  — 200w, used in feed cards
//   cardUrl   — 800w, used in the article hero gallery
//   fullUrl   — 1600w, used in lightbox-on-click
// All point at relative paths under `storage/uploads/review-photos/...`.
// EXIF is stripped at upload time via stripMetadata() — the privacy
// gate is the action layer, not the schema.
//
// `orderIndex` controls gallery sequence (lowest first). Authors can
// reorder by re-uploading; multi-photo reorder UI is a follow-up.
//
// `useTimestamps` deliberately enabled but only `created_at` is
// surfaced — photos aren't edited in place, so `updated_at` rides
// along for parity but isn't queried.
export default defineModel({
  name: 'ReviewPhoto',
  table: 'review_photos',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'review_photos_review_idx', columns: ['judge_review_id', 'order_index'] },
    { name: 'review_photos_user_idx', columns: ['user_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['JudgeReview', 'User'],

  attributes: {
    thumbUrl: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.image.url(),
    },

    cardUrl: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.image.url(),
    },

    fullUrl: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.image.url(),
    },

    mime: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(64),
      },
      factory: faker => faker.helpers.arrayElement(['image/jpeg', 'image/png', 'image/webp']),
    },

    width: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number().positive(),
      },
      factory: faker => faker.number.int({ min: 200, max: 4000 }),
    },

    height: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number().positive(),
      },
      factory: faker => faker.number.int({ min: 200, max: 4000 }),
    },

    orderIndex: {
      required: true,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 5 }),
    },
  },
} as const)
