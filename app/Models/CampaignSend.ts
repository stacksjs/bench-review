import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'CampaignSend',
  table: 'campaign_sends',
  primaryKey: 'id',
  autoIncrement: true,
  belongsTo: ['Campaign', 'Subscriber', 'EmailList'],

  traits: {
    useUuid: true,
    useTimestamps: true,
    useApi: {
      uri: 'campaign-sends',
      // SECURITY: routes [] for the same reason as Subscriber.ts — the ORM route
      // generator SILENTLY DROPS the `middleware` key below (it reads only
      // `uri` and `routes`), so these reads were fully unauthenticated despite
      // the declared intent. `GET /api/campaign-sends` exposed per-subscriber
      // delivery, open and click tracking — behavioural PII.
      // The middleware line is retained only to document intent for when the
      // generator is fixed.
      routes: [],
      // Per-recipient send records carry email + delivery status. Treat
      // as PII and require auth on all read paths. The transactional
      // owner-only views in the dashboard are gated separately.
      middleware: ['auth'],
    },
  },

  attributes: {
    campaignId: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.number(),
      },
      factory: faker => faker.number.int({ min: 1, max: 10 }),
    },

    subscriberId: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.number(),
      },
      factory: faker => faker.number.int({ min: 1, max: 100 }),
    },

    emailListId: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.number(),
      },
      factory: faker => faker.number.int({ min: 1, max: 8 }),
    },

    status: {
      required: true,
      fillable: true,
      default: 'queued',
      validation: {
        rule: schema.enum(['queued', 'sent', 'failed', 'bounced', 'complained']),
      },
      factory: faker => faker.helpers.arrayElement(['sent', 'sent', 'sent', 'queued', 'failed', 'bounced']),
    },

    providerMessageId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(255),
      },
      factory: faker => faker.string.uuid(),
    },

    error: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: () => null,
    },

    sentAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.timestamp(),
      },
      factory: faker => faker.date.recent({ days: 7 }).toISOString().slice(0, 19).replace('T', ' '),
    },

    openedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.timestamp(),
      },
      factory: () => null,
    },

    clickedAt: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.timestamp(),
      },
      factory: () => null,
    },
  },
} as const)
