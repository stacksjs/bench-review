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
    // bench-review#36 — admin / moderation queries that segment by
    // "shown to public as anonymous" hit this index. Public read paths
    // already filter on `status='published'`; the anonymized flag is
    // additive.
    {
      name: 'judge_reviews_anonymized_idx',
      columns: ['anonymized'],
    },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      // bench-review#41 — Meilisearch index settings. Status filter
      // is load-bearing: every public search path queries
      // `status = 'published'`, so the index needs it as filterable.
      // judge_id + user_id are filterable so future "this judge's
      // reviews" + "this user's reviews" surfaces can hit the index.
      // anonymized is filterable so the public profile path (which
      // excludes anonymized — see bench-review#36) can be expressed
      // as a Meili filter when we migrate UserReviewsAction to the
      // index.
      displayable: ['id', 'title', 'content', 'rating', 'type', 'status', 'judge_id', 'user_id', 'anonymized', 'created_at'],
      searchable: ['title', 'content'],
      sortable: ['created_at', 'updated_at', 'rating'],
      filterable: ['rating', 'status', 'type', 'judge_id', 'user_id', 'anonymized'],
    },

    // `useSeeder` deliberately disabled. The ORM's factory-driven path
    // for `create()` has a snake_case → camelCase mapping gap that
    // silently drops fields like `judge_id` and `user_id`, so every
    // factory row lands with NULL foreign keys. The result: 10 lorem-
    // ipsum rows that don't tie to any judge — they fail the
    // `r.judge_id != null` filter in ReviewsFeed and the API's
    // `JudgeReview.where('judge_id', X)` lookups, so /reviews and
    // /judges/:id/reviews both render empty even when the table is
    // full. Use `database/seeders/ReviewSeeder.ts` for fixed data
    // (it uses raw `db.insertInto` and sets judge_id correctly).
    //
    // useSeeder: { count: 10 },

    useApi: {
      uri: 'judge-reviews',
      // SECURITY: auto-CRUD disabled. The generator emits UNAUTHENTICATED
      // routes and ignores middleware, so `GET /api/judge-reviews?status=pending`
      // would return unmoderated reviews WITH raw user_id (defeating anonymity
      // + joinable to /api/users emails), and `POST /api/judge-reviews` would
      // create a published review with no auth, no email gate, and no
      // sanitizeReviewHtml (stored XSS + moderation bypass). All review reads
      // /writes go through guarded Actions (Reviews/*, Me/*). Keep this [].
      routes: [],
    },

    // Wires `JudgeReview._likeable.{like,unlike,isLiked,likeCount,likedBy}`
    // off the `judge_reviews_likes` pivot table (default naming:
    // `<table>_likes`, FK `judge_review_id`). The pivot is the SINGLE
    // source of truth — there's no denormalised counter on this row.
    // Feed actions fan a single GROUP BY query over the visible page
    // via `app/Helpers/reviewLikes.ts:hydrateLikeData()` to surface
    // counts cheaply without the drift risk of keeping two stores in
    // lock-step.
    likeable: true,

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

    // bench-review#36 — anonymous-friendly review surface.
    // When set, public render paths substitute the author with
    // "Anonymous <role_label>" (or "Anonymous reviewer" if the user
    // has no role declared). Author still sees their own identity
    // on /my-reviews; admins still see the real author for moderation.
    // NOT a deletion mechanism — the user_id link stays intact.
    anonymized: {
      required: true,
      order: 8,
      fillable: true,
      default: 0,
      validation: {
        rule: schema.number().min(0).max(1),
      },
      factory: () => 0,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)