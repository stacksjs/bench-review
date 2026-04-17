import { defineMiddleware, navigateTo } from '@stacksjs/stx'

export default defineMiddleware(async (ctx) => {
  // In SSG mode, there's no real session — always redirect.
  // The redirect page sends users to /login, where client-side
  // auth can check localStorage/cookies.
  const session = ctx.cookies.get('session')
  if (!session) {
    return navigateTo('/login')
  }
})
