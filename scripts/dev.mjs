import { readFileSync, watch } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { buildHome, buildSite } from './build.mjs'

const PORT = Number(process.env.PORT ?? 5173)
const BASE = new URL(JSON.parse(readFileSync('package.json', 'utf8')).homepage)
  .pathname

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function buildAll() {
  const [app, home] = await Promise.all([buildSite(), buildHome()])

  for (const [name, contents] of home) app.set(`site/${name}`, contents)

  return app
}

let site = await buildAll()
let timer = null

function rebuild() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    buildAll()
      .then(next => {
        site = next
      })
      .catch(error => console.error(error.message))
  }, 120)
}

watch('src', { recursive: true }, rebuild)
watch('site-src', { recursive: true }, rebuild)

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname)

  if (!path.startsWith(BASE)) {
    response.writeHead(302, { Location: BASE })
    response.end()

    return
  }

  const relative = path.slice(BASE.length)
  const file =
    !relative || relative.endsWith('/') ? `${relative}index.html` : relative

  if (!site.has(file) && site.has(`${file}/index.html`)) {
    response.writeHead(301, { Location: `${path}/` })
    response.end()

    return
  }
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
