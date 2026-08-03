import type { PostRequestType } from '@stacksjs/orm'
import { Action } from '@stacksjs/actions'
import { authors, posts } from '@stacksjs/cms'
import { response } from '@stacksjs/router'

// Original framework default imported `categories` from
// `'commerce/src/products'` — that module path doesn't exist in this
// install, so the import errored at startup and produced a
// `[Router] Failed to import action '.../PostStoreAction.ts'` entry on
// every `./buddy dev`. The category attach below is dropped to fix
// startup; bench-review doesn't use posts, so this action exists only
// to keep the framework's auto-registered POST /posts route from 404'ing.
// The tag attach was likewise dropped in the node_modules migration:
// published `@stacksjs/cms` bundles `findOrCreateMany` but does not export
// it (tree-shaken), so there is no resolvable import for it. Restore both
// the `findOrCreateByName`/`findOrCreateMany` helpers + the attach calls
// if posts ships for real.

export default new Action({
  name: 'Post Store',
  description: 'Post Store ORM Action',
  method: 'POST',
  requestFile: 'PostRequest',
  async handle(request: PostRequestType) {
    await request.validate()

    const author = await authors.findOrCreate({
      name: 'Current User',
      email: 'current@user.com',
    })

    const data = {
      author_id: author.id,
      title: request.get('title'),
      excerpt: request.get('excerpt'),
      slug: request.get('slug'),
      content: request.get('content'),
      status: request.get('status'),
      poster: request.get('poster'),
      views: 0,
      published_at: Date.now(),
    }

    const model = await posts.store(data)

    return response.json(model)
  },
})
