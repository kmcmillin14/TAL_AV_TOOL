'use client'

// 06 Export (owner, 2026-11-18): the last step. The customer presentation leads — its sections chosen
// in place, then Download presentation; the internal workbook and the re-importable revision sit beside
// it. The header's export menu stays on every step; this page is where the workflow ends.

import { downloadProject, type StoredProject } from '@/src/lib/storage'
import { downloadXlsx } from '@/src/lib/downloadXlsx'
import Icon from '@/src/design-system/components/Icon'
import PptxSectionPicker from './PptxSectionPicker'
import { pricingGate } from '@/src/lib/romComplexityFromProject'

export default function ExportPanel({ project }: { project: StoredProject }) {
  // The deck builds even when the project can't be priced — it withholds the numbers, as Pricing does.
  const gate = pricingGate(project)

  return (
    <div className="export-grid">
      <section className="rom-card export-deck" aria-labelledby="export-deck-h">
        <h2 id="export-deck-h" className="step-section-h">Customer presentation</h2>
        {gate.blocked && (
          <p className="rom-export-blocked">
            <Icon name="warn" size={14} />
            <span>
              Prices are withheld until these are answered on Step 1: {gate.missingAll.join(', ')}. The
              presentation still builds; investment, payback and TCO read &ldquo;Not priced&rdquo;.
            </span>
          </p>
        )}
        <PptxSectionPicker project={project} />
      </section>

      <aside className="export-side" aria-label="Other files">
        <button type="button" className="rom-export-btn rom-export-secondary" onClick={() => downloadXlsx(project)} title="Live-formula workbook for internal review">
          <Icon name="export" size={16} />
          <span><b>Internal model</b><small>Excel workbook, live formulas</small></span>
        </button>
        <button type="button" className="rom-export-btn rom-export-secondary" onClick={() => downloadProject(project.id)} title="Re-import it from Step 00 → Import previous revision">
          <Icon name="save" size={16} />
          <span><b>Save revision</b><small>Project file to re-import later (.json)</small></span>
        </button>
      </aside>
    </div>
  )
}
