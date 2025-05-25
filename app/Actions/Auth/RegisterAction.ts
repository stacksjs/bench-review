import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Authentication, register } from '@stacksjs/auth'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

export default new Action({
  name: 'RegisterAction',
  description: 'Register a new user',
  method: 'POST',
  async handle(request: RequestInstance) {
    const email = request.get('email')
    const password = request.get('password')
    const name = request.get('name')
    const job_title = request.get('job_title')

    await request.validate({
      email: {
        rule: schema.string().email(),
        message: {
          email: 'Email must be a valid email address',
        },
      },

      password: {
        rule: schema.string().min(6).max(255),
        message: {
          min: 'Password must have a minimum of 6 characters',
          max: 'Password must have a maximum of 255 characters',
        },
      },

      name: {
        rule: schema.string().min(2).max(255),
        message: {
          min: 'Name must have a minimum of 2 characters',
          max: 'Name must have a maximum of 255 characters',
        },
      },
    })

    const result = await register({ email, password, name, job_title })

    if (result) {
      const user = await Authentication.getUserFromToken(result.token)

      return response.json({
        token: result.token,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.name,
          job_title: user?.job_title,
        },
      })
    }

    return response.error('Registration failed')
  },
})
