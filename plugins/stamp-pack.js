const STAR = [
  '...#...',
  '...#...',
  '#######',
  '.#####.',
  '..###..',
  '.#####.',
  '##...##',
]

function stampStar(surface, centerX, centerY) {
  const size = STAR.length
  const half = size >> 1

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (STAR[row][column] === '#') {
        surface.plot(centerX + column - half, centerY + row - half)
      }
    }
  }
}

const stampTool = {
  id: 'stamp.star',
  name: 'はんこ',
  icon: 'star',
  key: 'k',
  order: 80,
  options: 'none',

  down(editor, point) {
    const surface = editor.beginEdit()

    if (!surface) return 'locked'

    stampStar(surface, point.x, point.y)

    return null
  },

  move(editor, point) {
    stampStar(editor.surface, point.x, point.y)
  },

  up(editor) {
    editor.commitEdit()
  },
}

function makePattern(id, name, rows) {
  const bits = new Uint8Array(64)

  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) bits[y * 8 + x] = (row >> (7 - x)) & 1
  })

  return { id, name, width: 8, height: 8, bits }
}

export default {
  id: 'sample.stamp-pack',
  name: 'はんこパック',
  version: '1.0.0',
  description: '星のはんこと、ギザギザのもようを足します',

  setup(api) {
    api.tools.register(stampTool)

    api.patterns.register(
      makePattern(
        'sample.zigzag',
        'ギザギザ',
        [0x18, 0x24, 0x42, 0x81, 0x18, 0x24, 0x42, 0x81],
      ),
    )

    api.commands.register({
      id: 'sample.count',
      name: 'ページの数を見る',
      icon: 'pages',

      run(editor) {
        api.toast(`${editor.pageCount} ページ`)
      },
    })

    api.panels.register({
      id: 'sample.panel',
      name: 'はんこ',
      icon: 'star',

      render(container) {
        container.textContent = 'ふでばこの「はんこ」で紙に星を押せます。'
      },
    })
  },
}
