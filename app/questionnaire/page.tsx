import QuestionnaireForm from '@/src/components/questionnaire/QuestionnaireForm'

export const metadata = { title: 'TAL — AV Questionnaire' }

export default function QuestionnairePage() {
  return (
    <div className="app-shell">
      <header className="q-brandbar">
        <div className="q-brandbar-inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand logo, static asset */}
          <img className="logo" src="/assets/TAL-Logo-Black.png" alt="TAL" />
          <span className="q-brandbar-divider" />
          <span className="q-brandbar-title">AV Questionnaire</span>
        </div>
      </header>
      <QuestionnaireForm />
    </div>
  )
}
