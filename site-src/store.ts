type Listener = () => void

interface Drawing {
  layers: HTMLCanvasElement[]
  inked: boolean[]
}

const listeners = new Set<Listener>()

export const drawing: Drawing = { layers: [], inked: [] }

export function inkedPages(): HTMLCanvasElement[] {
  return drawing.layers.filter((_, index) => drawing.inked[index])
}

export function changed(): void {
  for (const listener of listeners) listener()
}

export function onDrawingChange(listener: Listener): void {
  listeners.add(listener)
}
