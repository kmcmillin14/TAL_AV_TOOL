// What a project step shows before its project is ready: loading, or not found in this browser.

export default function ProjectLoadState({ loading, error, what }: { loading: boolean; error: string | null; what: string }) {
  if (loading) return <div className="app-shell"><div className="step2-loading">Loading {what}…</div></div>
  return (
    <div className="app-shell">
      <div className="step2-error">
        <div className="step2-error-tag">Not Found</div>
        <h1>Could not load project</h1>
        <p>{error ?? 'This project does not exist in your browser. Try importing the project file or creating a new project.'}</p>
      </div>
    </div>
  )
}
