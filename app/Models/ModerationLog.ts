import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// Moderation audit trail. One row per admin moderation action — review
// publish/reject/delete, user delete, credential/judge-claim approve/reject.
// Defensibility: when a judge or reviewer disputes "why was this removed"
// (or "why is this still up"), there's an attributed, timestamped record of
// who did what and (for rejects) why. Append-only by convention; nothing in
// the app updates or deletes these rows.
export default defineModel({
  name: 'ModerationLog',
  table: 'moderation_logs',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'moderation_logs_target_idx', columns: ['target_type', 'target_id'] },
    { name: 'moderation_logs_actor_idx', columns: ['actor_user_id'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  attributes: {
    // The admin who performed the action.
    actorUserId: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.number().positive(),
      },
    },
    // Dotted verb, e.g. 'review.publish', 'review.reject', 'review.delete',
    // 'user.delete', 'credential.approve', 'credential.reject'.
    action: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(64),
      },
    },
    // What was acted on: 'review' | 'user' | 'credential'.
    targetType: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().max(32),
      },
    },
    targetId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.number(),
      },
    },
    // Optional context — rejection reason, deleted user's email, etc.
    note: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(2000),
      },
    },
  },
} as const)
