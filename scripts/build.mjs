import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'

const STATIC_FILES = ['manifest.webmanifest', 'sw.js']
const STYLES = ['tokens', 'base', 'overlay', 'mascot', 'home', 'editor']
const FONT_DIRECTORY = 'assets/fonts'
const FONT_WEIGHTS = [500, 700, 900]
const HOME_STYLES = [
  'src/ui/styles/tokens.css',
  'src/ui/styles/mascot.css',
  'site-src/styles/site.css',
]
const HOME_LANGUAGES = ['ja', 'en', 'es', 'fr', 'ru']

function fontFace(weight, source) {
  return `@font-face{font-family:'Zen Maru Gothic';font-weight:${weight};font-display:swap;src:url(${source}) format('woff2')}`
}

function fontPath(weight) {
  return join(FONT_DIRECTORY, `zen-maru-${weight}.woff2`)
}

async function bundleStyles() {
  const source = STYLES.map(name =>
    readFileSync(`src/ui/styles/${name}.css`, 'utf8'),
  ).join('\n')

  const result = await build({
    stdin: { contents: source, loader: 'css' },
    bundle: true,
    minify: true,
    write: false,
    logLevel: 'silent',
  })

  return result.outputFiles[0].text
}

async function bundleWorker() {
  const result = await build({
    entryPoints: ['src/worker/main.ts'],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    write: false,
    logLevel: 'warning',
  })

  return result.outputFiles[0].text
}

async function bundleScript(workerSource) {
  const result = await build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    write: false,
    logLevel: 'warning',
    define: { WORKER_SOURCE: JSON.stringify(workerSource) },
  })

  return result.outputFiles[0].text
}

function fontFaces() {
  return FONT_WEIGHTS.filter(weight => existsSync(fontPath(weight)))
    .map(weight => {
      const data = readFileSync(fontPath(weight)).toString('base64')

      return fontFace(weight, `data:font/woff2;base64,${data}`)
    })
    .join('')
}

function homeFontPath(weight) {
  const own = join(FONT_DIRECTORY, `site-zen-maru-${weight}.woff2`)

  return existsSync(own) ? own : fontPath(weight)
}

async function bundleHomeStyles() {
  const faces = FONT_WEIGHTS.map(weight =>
    fontFace(weight, `fonts/zen-maru-${weight}.woff2`),
  ).join('')
  const source = HOME_STYLES.map(path => readFileSync(path, 'utf8')).join('\n')
  const result = await build({
    stdin: { contents: faces + source, loader: 'css' },
    bundle: true,
    minify: true,
    write: false,
    logLevel: 'silent',
    external: ['fonts/*'],
  })

  return result.outputFiles[0].text
}

async function bundleHomeScript() {
  const result = await build({
    entryPoints: ['site-src/main.ts'],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    write: false,
    logLevel: 'warning',
  })

  return result.outputFiles[0].text
}

async function renderHomePages() {
  const result = await build({
    entryPoints: ['site-src/page.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    logLevel: 'warning',
  })
  const code = Buffer.from(result.outputFiles[0].text).toString('base64')
  const { renderPage } = await import(`data:text/javascript;base64,${code}`)

  return HOME_LANGUAGES.map(lang => [
    lang === 'ja' ? 'index.html' : `${lang}/index.html`,
    renderPage(lang),
  ])
}

export async function buildHome() {
  const [pages, script, styles] = await Promise.all([
    renderHomePages(),
    bundleHomeScript(),
    bundleHomeStyles(),
  ])
  const home = new Map(pages)

  for (const [, html] of pages) checkPagesLinks(html)

  home.set('site.js', script)
  home.set('site.css', styles)

  for (const weight of FONT_WEIGHTS) {
    home.set(
      `fonts/zen-maru-${weight}.woff2`,
      readFileSync(homeFontPath(weight)),
    )
  }

  return home
}

export async function buildSite() {
  const [script, styles] = await Promise.all([
    bundleWorker().then(bundleScript),
    bundleStyles(),
  ])
  const safeScript = script.replaceAll('</script', '<\\/script')

  const html = readFileSync('src/index.html', 'utf8')
    .replace('<link rel="stylesheet" href="app.css" />', () => {
      return `<style>${fontFaces()}${styles}</style>`
    })
    .replace('<script type="module" src="app.js"></script>', () => {
      return `<script type="module">${safeScript}</script>`
    })

  checkPagesLinks(html)

  const site = new Map([['index.html', html]])

  for (const name of STATIC_FILES) {
    site.set(name, readFileSync(join('src', name), 'utf8'))
  }

  return site
}

export function writeSite(site, directory) {
  mkdirSync(directory, { recursive: true })

  for (const [name, contents] of site) {
    const path = join(directory, name)

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
  }
}

function checkPagesLinks(html) {
  const rooted = html.match(/\s(?:href|src)="\/(?!\/)[^"]*"/)

  if (rooted) {
    throw new Error(`ページの外を指すリンクがあります:${rooted[0]}`)
  }
}

if (process.argv[1]?.endsWith('build.mjs')) {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, home: { type: 'string' } },
  })

  if (values.home) {
    const home = await buildHome()

    rmSync(values.home, { recursive: true, force: true })
    writeSite(home, values.home)
    console.log(`${home.size} files  → ${values.home}`)
    process.exit(0)
  }

  const site = await buildSite()
  const size = (site.get('index.html').length / 1024).toFixed(0)

  if (values.out) writeSite(site, values.out)

  console.log(`index.html  ${size} KB${values.out ? `  → ${values.out}` : ''}`)
}
