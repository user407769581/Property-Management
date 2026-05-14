import dotenv from 'dotenv'

import { createApp } from './app.js'
import { env } from './config/env.js'

dotenv.config()

const bootstrap = async () => {
  const app = createApp()
  app.listen(env.port, () => {
    console.log(`backend server listening on http://127.0.0.1:${env.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('backend bootstrap failed', error)
  process.exit(1)
})
