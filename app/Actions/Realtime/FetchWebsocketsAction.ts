import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'

export default new Action({
  name: 'Websockets Index',
  description: 'Websockets Index ORM Action',
  method: 'GET',
  async handle() {
    const results = await Websocket.all()

    return response.json(results)
  },
})
