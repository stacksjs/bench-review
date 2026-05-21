import type { PostRequestType } from '@stacksjs/orm'
import { Action } from '@stacksjs/actions'
import { authors, posts } from '@stacksjs/cms'
import { response } from '@stacksjs/router'
import { findOrCreateMany } from '../../../storage/framework/core/cms/src/taggables/store'

// Original framework default imported `categories` from
// `'commerce/src/products'` — that module path doesn't exist in this
// install, so the import errored at startup and produced a
// `[Router] Failed to import action '.../PostStoreAction.ts'` entry on
// every `./buddy dev`. The category attach below is dropped to fix
// startup; bench-review doesn't use posts, so this action exists only
// to keep the framework's auto-registered POST /posts route from 404'ing.
// If/when a working `categories` helper is available, restore the
// findOrCreateByName + posts.attach('categorizable_models', ...) block.

export default new Action({
  name: 'Post Store',
  description: 'Post Store ORM Action',
  method: 'POST',
  requestFile: 'PostRequest',
  async handle(request: PostRequestType) {
    await request.validate()

    const tagNames = request.get('tags') as string[]

    const author = await authors.findOrCreate({
      name: 'Current User',
      email: 'current@user.com',
    })

    const tagIds = await findOrCreateMany(tagNames, 'posts')

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
    await posts.attach(model.id, 'taggable_models', tagIds)

    return response.json(model)
  },
})
