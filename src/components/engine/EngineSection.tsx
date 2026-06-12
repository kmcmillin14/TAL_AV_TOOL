'use client'

interface Props {
  id: string
  num: string
  title: string
  /** One-line framing of what this stage models (engineering / physics / policy). */
  sub: string
  children: React.ReactNode
}

/** Full-width engine section with a numbered header — visually the Step 1 form
 *  section (same .form-section styles), always open (the whole point of the
 *  scrolling layout is that no stage is hidden). */
export default function EngineSection({ id, num, title, sub, children }: Props) {
  return (
    <section className="form-section engine-section" id={id} aria-label={title}>
      <div className="form-section-header">
        <h3>
          <span className="sec-num">{num}.</span> {title}
          <span className="engine-section-sub">{sub}</span>
        </h3>
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  )
}
