'use client'

import Icon from '@/src/design-system/components/Icon'
import type { QualificationResult } from '@/src/calc/types'

interface WhyBreakdownProps {
  result: QualificationResult
}

function StatusIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span style={{ color: 'var(--good)', display: 'flex', alignItems: 'center', gap: 3 }}>
      <Icon name="check" size={11} /> Pass
    </span>
  ) : (
    <span style={{ color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 3 }}>
      <Icon name="x" size={11} /> Fail
    </span>
  )
}

export default function WhyBreakdown({ result }: WhyBreakdownProps) {
  return (
    <div className="why-breakdown">
      {/* Header row */}
      <div className="why-row" style={{ background: 'var(--bg-surface-3)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        <div className="col-name">Requirement</div>
        <div className="col-vehicle">Vehicle Spec</div>
        <div className="col-required">Your Requirement</div>
        <div className="col-status">Result</div>
      </div>

      {result.hardGates.length > 0 && (
        <>
          <div className="why-section-title">Hard Gates (must all pass)</div>
          {result.hardGates.map((g, i) => (
            <div key={i} className="why-row">
              <div className="col-name">{g.name}</div>
              <div className="col-vehicle">{g.vehicleValue}</div>
              <div className="col-required">{g.requiredValue}</div>
              <div className="col-status">
                <StatusIcon passed={g.passed} />
                {g.reason && (
                  <span style={{ color: 'var(--bad)', fontSize: 10, marginLeft: 6 }}>{g.reason}</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {result.softPreferences.length > 0 && (
        <>
          <div className="why-section-title">Soft Preferences (informational)</div>
          {result.softPreferences.map((p, i) => (
            <div key={i} className="why-row">
              <div className="col-name">{p.name}</div>
              <div className="col-vehicle">{p.vehicleValue}</div>
              <div className="col-required">{p.requiredValue}</div>
              <div className="col-status">
                <StatusIcon passed={p.passed} />
                {p.reason && (
                  <span style={{ color: 'var(--warn)', fontSize: 10, marginLeft: 6 }}>{p.reason}</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
