import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'OauthClient',
  description: 'An OAuth 2.0 client application',
  table: 'oauth_clients',
  primaryKey: 'id',
  autoIncrement: true,
  belongsTo: ['User'],
  hasMany: ['OauthAccessToken'],
  traits: {
    useTimestamps: true,
    // `useSeeder` is deliberately disabled. The framework default trait
    // would auto-seed 10 fake OAuth client rows on every `./buddy seed`,
    // and (more importantly) interact with the personal-access-client
    // setup in a way that can invalidate live user sessions. We
    // recovered from one such incident: a `./buddy seed` mid-session
    // caused every `Authorization: Bearer <token>` request to fail
    // validation because the secret used to encrypt the token's ID
    // half had been rotated under the token. Users see
    // "Unauthorized. Invalid token." with no obvious cause.
    //
    // The personal-access-client (id=1) is created exactly once by
    // `./buddy auth:setup`, and the dev-grade fake rows the factory
    // generates here aren't used for anything. Skipping the trait
    // entirely is the safe choice. If you need test clients, write a
    // class seeder in `database/seeders/` and gate it on `id=1 NOT
    // EXISTS` or similar.
    //
    // useSeeder: { count: 10 },
  },

  attributes: {
    name: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.string().max(191),
        message: {
          string: 'name must be a string',
          required: 'name is required',
          max: 'name must have a maximum of 191 characters',
        },
      },
    },

    secret: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.string().max(100),
        message: {
          string: 'secret must be a string',
          required: 'secret is required',
          max: 'secret must have a maximum of 100 characters',
        },
      },
    },

    provider: {
      fillable: true,
      validation: {
        rule: schema.string().max(191),
        message: {
          string: 'provider must be a string',
          max: 'provider must have a maximum of 191 characters',
        },
      },
    },

    redirect: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.string().max(191),
        message: {
          string: 'redirect must be a string',
          required: 'redirect is required',
          max: 'redirect must have a maximum of 191 characters',
        },
      },
    },

    personalAccessClient: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.boolean(),
        message: {
          boolean: 'personalAccessClient must be a boolean',
          required: 'personalAccessClient is required',
        },
      },
      factory: () => false,
    },

    passwordClient: {
      fillable: true,
      required: true,
      validation: {
        rule: schema.boolean(),
        message: {
          boolean: 'passwordClient must be a boolean',
          required: 'passwordClient is required',
        },
      },
      factory: () => false,
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
  },
} as const)