import QuestionnaireForm from '@/src/components/questionnaire/QuestionnaireForm'

export const metadata = { title: 'TAL — Customer Questionnaire' }

export default function QuestionnairePage() {
  return (
    <main className="q-page">
      <header className="q-hero">
        <h1>Customer Questionnaire</h1>
        <p>Tell us about your application. When you're done, download the PDF and send it to
          your TAL engineer — it carries everything needed to size your fleet. Nothing is required;
          fill in what you know.</p>
      </header>
      <QuestionnaireForm />
    </main>
  )
}
