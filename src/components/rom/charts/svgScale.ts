/** Linear scale: map a value in [d0,d1] to [r0,r1]. */
export function linScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0)
}

/** Build an SVG polyline points string from [x,y] pairs. */
export function polyline(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}
