import { runner } from './jobs.ts'
import { readRequest, type Reply, transferOf } from './protocol.ts'

function reply(message: Reply): void {
  const transfer = message.type === 'done' ? transferOf(message.result) : []

  self.postMessage(message, { transfer })
}

if (typeof window === 'undefined') {
  self.onmessage = event => {
    const request = readRequest(event.data)

    if (!request) return

    const { id, job } = request

    runner
      .run(job, ratio => reply({ id, type: 'progress', ratio }))
      .then(result => reply({ id, type: 'done', result }))
      .catch((error: unknown) => {
        console.error(error)
        reply({ id, type: 'failed', message: String(error) })
      })
  }
} else {
  globalThis.flipbookJobs = runner
}
