/** Full-precision USD ("$770,000") — deliberately NOT the shared compact
 *  `money` from vehicleDisplay.ts ("$1.25M"/"$50K"): the ROM quotation wants
 *  exact figures, the compact form is for customer-facing dashboard tiles.
 *  Formatter hoisted to module scope — constructing Intl.NumberFormat is not
 *  free and this renders many times per render across a full fleet. */
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export function fullUsd(n: number): string {
  return usdFormatter.format(n)
}
