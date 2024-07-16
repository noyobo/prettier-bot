/**
 * The entrypoint for the action.
 */
import { run } from './main'

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run().catch(err => {
  console.error(err)
  process.exit(1)
})
