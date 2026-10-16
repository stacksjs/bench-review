import type { Events } from '@stacksjs/types'

/**
 * **Events Configuration**
 *
 * This configuration defines all of your events. Because Stacks is fully-typed, you may
 * hover any of the options below and the definitions will be provided. In case you
 * have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  // eventName: ['Listener1', 'Listener2'] -> listeners default to ./app/actions/*
  'user:registered': ['SendWelcomeEmail', 'SendEmailVerification'],
  // 'user:created' is gone: stacks 0.75 closed the Events type over
  // AppEvents/AuthEvents instead of an open `[key: string]: string[]`, and
  // it is not one of them. Nothing in this app ever dispatched it, so the
  // NotifyUser listener was wired to an event that never fired.
} satisfies Events
