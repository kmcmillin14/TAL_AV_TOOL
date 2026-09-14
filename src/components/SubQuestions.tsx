import type { ReactNode } from 'react'

/** Follow-up fields that only exist because of the answer directly above them.
 *
 *  Render these INSIDE the parent's `.fld`, never as sibling grid cells. Both
 *  forms used to emit conditional children as peers in the same grid, so they
 *  flowed wherever the grid had room — in a two-column grid a parent sitting
 *  in column 2 pushed its children onto the next row starting at column 1,
 *  directly beneath an unrelated question. "WMS vendor" read as a follow-up to
 *  "Barcode scanning required?" purely because of grid arithmetic.
 *
 *  Nesting fixes that structurally: a child cannot drift away from its parent,
 *  and revealing one no longer reflows unrelated fields — only the parent's
 *  own cell grows taller. The indent and left rule carry the "belongs to the
 *  answer above" meaning without needing extra copy.
 *
 *  Shared by the Step 1 intake form and the customer questionnaire so the two
 *  can't drift apart again. */
export default function SubQuestions({ children }: { children: ReactNode }) {
  return <div className="sub-questions">{children}</div>
}

/** Marks a question whose answer reveals follow-ups, so the expansion is
 *  anticipated rather than a surprise and a customer can gauge how long the
 *  form really is. Needed as an explicit marker because when the parent is
 *  unanswered its children aren't rendered at all — CSS can't infer it. */
export function FollowUpMarker() {
  return (
    <span className="followup-marker" title="Answering this reveals follow-up questions" aria-hidden>
      +
    </span>
  )
}
