import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// Judge right-of-reply. An official response from a judge (or their
// chambers) to a specific review of them — the fairness/legal safeguard
// the FAQ promises for a site that publishes reviews of named judges.
//
// Admin-mediated for now: judges don't have accounts yet, so an admin
// posts the response on the judge's behalf from the moderation surface.
// The row is structured (judge_review_id + judge_id) so a future
// judge-profile-claim flow can author the same records self-serve without
// a schema change. One response per review (enforced in the action via
// upsert); displayed prominently under the review, distinct from the
// community comment thread.
export default defineModel({
  name: 'JudgeResponse',
  table: 'judge_responses',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'judge_responses_review_idx', columns: ['judge_review_id'] },
    { name: 'judge_responses_judge_idx', columns: ['judge_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['JudgeReview', 'Judge'],

  attributes: {
    body: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(5000),
      },
      factory: faker => faker.lorem.paragraphs(2),
    },
  },
} as const)
