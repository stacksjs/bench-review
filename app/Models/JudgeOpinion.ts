import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

// bench-review#39 — recent rulings / public docket integration.
//
// Architectural foundation. The issue is parked on automated external
// integration (PACER costs, state-by-state patchwork, legal-publishing
// data-use review). This schema + the admin entry path let bench-review
// surface curated opinions today and plug an automated provider in
// later without touching the render surface.
//
// Columns map to the standard opinion shape across CourtListener,
// PACER, and most state docket APIs. `sourceProvider` is 'manual' by
// default; future refresh jobs use it to know which rows they own.
// `externalId` is the dedup-on-refresh key. The partial unique on
// (source_provider, external_id) WHERE external_id IS NOT NULL is
// enforced at the action layer (partial indexes aren't expressible
// in the model's `indexes` block).
//
// `status` deliberately omitted at MVP — opinions either exist or
// they don't. Add `status` if/when automated fetching lands.
export default defineModel({
  name: 'JudgeOpinion',
  table: 'judge_opinions',
  primaryKey: 'id',
  autoIncrement: true,

  indexes: [
    { name: 'judge_opinions_judge_date_idx', columns: ['judge_id', 'decision_date'] },
  ],

  traits: {
    useUuid: true,
    useTimestamps: true,
  },

  belongsTo: ['Judge'],

  attributes: {
    caseName: {
      required: true,
      fillable: true,
      validation: {
        rule: schema.string().min(1).max(500),
      },
      factory: faker => `${faker.person.lastName()} v. ${faker.person.lastName()}`,
    },

    citation: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(255),
      },
      factory: faker => `${faker.number.int({ min: 1, max: 999 })} F.${faker.helpers.arrayElement(['2d', '3d', '4th'])} ${faker.number.int({ min: 1, max: 999 })}`,
    },

    decisionDate: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.date.past({ years: 5 }).toISOString().slice(0, 10),
    },

    summary: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(5000),
      },
      factory: faker => faker.lorem.paragraph(),
    },

    outcomeLabel: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(64),
      },
      factory: faker => faker.helpers.arrayElement(['affirmed', 'reversed', 'remanded', 'dismissed', 'vacated']),
    },

    sourceUrl: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(500),
      },
      factory: faker => faker.internet.url(),
    },

    sourceProvider: {
      required: true,
      fillable: true,
      default: 'manual',
      validation: {
        rule: schema.string().max(64),
      },
      factory: faker => faker.helpers.arrayElement(['manual', 'courtlistener', 'pacer']),
    },

    externalId: {
      required: false,
      fillable: true,
      validation: {
        rule: schema.string().max(255),
      },
    },
  },
} as const)
