import { readFileSync, watch } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { buildSite } from './build.mjs'

const PORT = Number(process.env.PORT ?? 5173)
const BASE = new URL(JSON.parse(readFileSync('package.json', 'utf8')).homepage)
  .pathname

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

let site = await buildSite()
let timer = null

watch('src', { recursive: true }, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    buildSite()
      .then(next => {
        site = next
      })
      .catch(error => console.error(error.message))
  }, 120)
})

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname)

  if (!path.startsWith(BASE)) {
    response.writeHead(302, { Location: BASE })
    response.end()

    return
  }

  const file = path.slice(BASE.length) || 'index.html'
  const contents = site.get(file)

  if (contents === undefined) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('404')

    return
  }

  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  response.end(contents)
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}${BASE}`)
})
