import { mascot } from '../src/ui/mascot.ts'
import { startCorners } from './corner.ts'
import { startCovers } from './covers.ts'
import { startDevices } from './devices.ts'
import { startFilm } from './film.ts'
import { startHero } from './hero.ts'
import { startMotion, whenVisible } from './motion.ts'
import { startPads } from './pads.ts'
import { startStudio } from './studio.ts'
import { startToy } from './toy.ts'

function startNewt(): void {
  const host = document.querySelector<HTMLElement>('[data-newt]')

  if (!host) return

  let newt: ReturnType<typeof mascot> | null = null

  whenVisible(host, visible => {
    if (visible && !newt) {
      newt = mascot()
      host.append(newt.element)
    } else if (!visible && newt) {
      newt.dispose()
      newt.element.remove()
      newt = null
    }
  })
}

document.documentElement.classList.add('is-live')
startMotion()
startHero()
startStudio()
startToy()
startFilm()
startPads()
startCovers()
startDevices()
startCorners()
startNewt()
