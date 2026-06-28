import QuestionnaireForm from '@/src/components/questionnaire/QuestionnaireForm'
import QuestionnaireBrandBar from '@/src/components/questionnaire/QuestionnaireBrandBar'

export const metadata = { title: 'TAL — AV Questionnaire' }

export default function QuestionnairePage() {
  return (
    <div className="app-shell">
      <QuestionnaireBrandBar />
      <QuestionnaireForm />
    </div>
  )
}
