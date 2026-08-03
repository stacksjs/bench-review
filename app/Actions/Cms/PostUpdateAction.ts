import type { PostRequestType } from '@stacksjs/orm'
import { Action } from '@stacksjs/actions'
import { posts } from '@stacksjs/cms'
import { formatDate } from '@stacksjs/orm'
import { response } from '@stacksjs/router'

// Original framework default imported `categories` from
// `'commerce/src/products'` — that module path doesn't exist in this
// install, so the import errored at startup and produced a
// `[Router] Failed to import action '.../PostUpdateAction.ts'` entry on
// every `./buddy dev`. The category-sync branch below is dropped to fix
// startup; bench-review doesn't use posts, so this action exists only
// to keep the framework's auto-registered PATCH /posts/:id route from
// 404'ing. The tag-sync branch was likewise dropped in the node_modules
// migration: published `@stacksjs/cms` bundles `findOrCreateMany` but does
// not export it (tree-shaken). Restore both helpers + the sync calls if
// posts ships for real.

export default new Action({
  name: 'Post Update',
  description: 'Post Update ORM Action',
  method: 'PATCH',
  requestFile: 'PostRequest',
  async handle(request: PostRequestType) {
    await request.validate()

    const id = request.getParam('id')

    const data = {
      title: request.get('title'),
      excerpt: request.get('excerpt'),
      content: request.get('content'),
      status: request.get('status'),
      poster: request.get('poster'),
      updated_at: formatDate(new Date()),
    }

    const model = await posts.update(id, data)

    return response.json(model)
  },
})
