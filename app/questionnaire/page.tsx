import QuestionnaireForm from '@/src/components/questionnaire/QuestionnaireForm'

export const metadata = { title: 'TAL — AV Questionnaire' }

export default function QuestionnairePage() {
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div className="app-shell">
      <header className="q-brandbar">
        <div className="q-brandbar-inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand logo, static asset */}
          <img className="logo" src="/assets/TAL-Logo-Black.png" alt="TAL" />
          <span className="q-brandbar-divider" />
          <span className="q-brandbar-title">AV Questionnaire</span>
          <span className="q-brandbar-date">{today}</span>
        </div>
      </header>
      <QuestionnaireForm />
    </div>
  )
}
