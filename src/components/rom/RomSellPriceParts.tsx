/** Full-precision USD ("$770,000") — deliberately NOT the shared compact
 *  `money` from vehicleDisplay.ts ("$1.25M"/"$50K"): the ROM quotation wants
 *  exact figures, the compact form is for customer-facing dashboard tiles.
 *  Formatter hoisted to module scope — constructing Intl.NumberFormat is not
 *  free and this renders many times per render across a full fleet. */
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export function fullUsd(n: number): string {
  return usdFormatter.format(n)
}

/** One selectable, priced tag — the "hollow ring unpicked, filled accent disc
 *  picked" control Adders introduced (2026-10-09) and Accessories now reuses
 *  rather than re-declaring the same button markup a second time (2026-11-02).
 *  Both are "an id, a label, an amount, a toggle" — the only difference is
 *  which catalog and which selection state they read. */
export function TogglePill(
  { id, label, amount, on, note, onToggle }:
  { id: string; label: string; amount: number; on: boolean; note?: string; onToggle: (id: string) => void },
) {
  return (
    <button
      type="button" className={`q-adder${on ? ' is-on' : ''}`}
      aria-pressed={on} onClick={() => onToggle(id)} title={note}
    >
      <span className="q-adder-mark" aria-hidden="true" />
      <span className="q-adder-label">{label}</span>
      <span className="q-adder-amt mono">{fullUsd(amount)}</span>
    </button>
  )
}
