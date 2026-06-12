'use client'

interface Props {
  id: string
  num: string
  title: string
  /** Optional one-line framing shown beside the title. */
  sub?: string
  children: React.ReactNode
}

/** Full-width always-open section with a numbered header — visually the Step 1
 *  form section (same .form-section styles). Shared by the Fleet Engine and
 *  ROM dashboard scrolling layouts. */
export default function ScrollSection({ id, num, title, sub, children }: Props) {
  return (
    <section className="form-section engine-section" id={id} aria-label={title}>
      <div className="form-section-header">
        <h3>
          <span className="sec-num">{num}.</span> {title}
          {sub && <span className="engine-section-sub">{sub}</span>}
        </h3>
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  )
}
