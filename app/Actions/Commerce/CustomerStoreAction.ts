import type { CustomerRequestType } from '@stacksjs/orm'
import { Action } from '@stacksjs/actions'

import { customers } from '@stacksjs/commerce'

import { response } from '@stacksjs/router'

export default new Action({
  name: 'Customer Store',
  description: 'Customer Store ORM Action',
  method: 'POST',
  async handle(request: CustomerRequestType) {
    await request.validate()

    const data = {
      user_id: request.get<number>('user_id'),
      name: request.get('name'),
      email: request.get('email'),
      phone: request.get('phone'),
      status: request.get('status'),
    }

    const model = await customers.store(data)

    return response.json(model)
  },
})
