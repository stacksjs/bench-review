import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'OauthAccessToken',
  description: 'An OAuth 2.0 access token for third-party applications',
  table: 'oauth_access_tokens',
  primaryKey: 'id',
  // Plain string entries — the migration generator's snake_case
  // helper crashes ("str.replace is not a function") on object literals
  // where it expects a model name. Default FK columns (`user_id`,
  // `oauth_client_id`) match the convention so no override is needed.
  belongsTo: ['User', 'OauthClient'],
  traits: {
    useTimestamps: true,
    useSeeder: {
      count: 10,
    },
  },

  attributes: {
    token: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.string().max(512),
        message: {
          string: 'token must be a string',
          required: 'token is required',
        },
      },
    },
    name: {
      fillable: true,
      validation: {
        rule: schema.string().max(512),
        message: {
          string: 'name must be a string',
          max: 'name must have a maximum of 191 characters',
        },
      },
    },

    scopes: {
      fillable: true,
      validation: {
        rule: schema.string().max(190),
        message: {
          string: 'scopes must be a string',
        },
      },
    },

    revoked: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.boolean(),
        message: {
          boolean: 'revoked must be a boolean',
          required: 'revoked is required',
        },
      },
      factory: () => false,
    },

    expiresAt: {
      fillable: true,
      validation: {
        rule: schema.datetime(),
        message: {
          date: 'expiresAt must be a valid date',
        },
      },
    },
  },
} as const)