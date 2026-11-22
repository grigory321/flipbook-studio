import { newtPage, newtShots } from './art.ts'

const SIZES: Readonly<Record<string, readonly [number, number]>> = {
  free: [320, 240],
  dsi: [256, 192],
  '3ds': [155, 115],
}

export function startCovers(): void {
  const shots = newtShots()
  const look = shots.find(shot => shot.pose === 'look') ?? shots[0]
  const jump = shots.find(shot => shot.pose === 'jump') ?? shots[0]
  const nap = shots.find(shot => shot.pose === 'flat') ?? shots[0]

  for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
    '[data-cover-art]',
  )) {
    const kind = canvas.dataset.coverArt ?? 'free'
    const [width, height] = SIZES[kind] ?? SIZES.free
    const context = canvas.getContext('2d')

    canvas.width = width
    canvas.height = height

    if (!context) continue

    if (kind === 'free') {
      newtPage({ ...look, x: 0.5 }, 0)(context, width, height)
      continue
    }

    context.imageSmoothingEnabled = false

    const scratch = document.createElement('canvas')
    const scratchContext = scratch.getContext('2d')

    scratch.width = width
    scratch.height = height

    if (!scratchContext) continue

    newtPage(
      kind === 'dsi' ? { ...jump, x: 0.5 } : { ...nap, x: 0.5, sleep: 1 },
      0,
    )(scratchContext, width, height)

    const image = scratchContext.getImageData(0, 0, width, height)
    const data = image.data

    for (let index = 0; index < data.length; index += 4) {
      const light =
        data[index] * 0.3 + data[index + 1] * 0.59 + data[index + 2] * 0.11
      const isOrange =
        data[index] > 200 && data[index + 1] < 160 && data[index + 2] < 90

      if (kind === 'dsi') {
        const value = isOrange
          ? [232, 57, 47]
          : light < 205
            ? [20, 20, 20]
            : [255, 255, 255]

        data[index] = value[0]
        data[index + 1] = value[1]
        data[index + 2] = value[2]
      } else if (!isOrange && light > 200) {
        data[index] = 238
        data[index + 1] = 248
        data[index + 2] = 255
      }
    }

    context.putImageData(image, 0, 0)
  }
}
