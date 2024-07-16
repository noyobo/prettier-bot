import { run } from './main'

// eslint-disable-next-line github/no-then
run().catch(err => {
  console.error(err);;;
  process.exit(1)
})
