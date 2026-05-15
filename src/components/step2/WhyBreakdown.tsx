'use client'

import Icon from '@/src/design-system/components/Icon'
import type { GateResult, QualificationResult } from '@/src/calc/types'

interface WhyBreakdownProps {
  result: QualificationResult
}

function StatusBadge({ gate }: { gate: GateResult }) {
  if (gate.skipped) {
    return (
      <span style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
        <Icon name="info" size={11} /> Not evaluated
      </span>
    )
  }
  return gate.passed ? (
    <span style={{ color: 'var(--good)', display: 'flex', alignItems: 'center', gap: 3 }}>
      <Icon name="check" size={11} /> Pass
    </span>
  ) : (
    <span style={{ color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 3 }}>
      <Icon name="x" size={11} /> Fail
    </span>
  )
}

function reasonColor(gate: GateResult): string {
  if (gate.skipped) return 'var(--text-tertiary)'
  if (gate.passed) return 'var(--text-secondary)'
  return gate.severity === 'hard' ? 'var(--bad)' : 'var(--warn)'
}

function GateRow({ gate }: { gate: GateResult }) {
  return (
    <div className="why-row" style={gate.skipped ? { opacity: 0.6 } : undefined}>
      <div className="col-name">{gate.name}</div>
      <div className="col-vehicle">{gate.vehicleValue}</div>
      <div className="col-required">{gate.requiredValue}</div>
      <div className="col-status">
        <StatusBadge gate={gate} />
        {gate.reason && (
          <span style={{ color: reasonColor(gate), fontSize: 10, marginLeft: 6 }}>
            {gate.reason}
          </span>
        )}
      </div>
    </div>
  )
}

export default function WhyBreakdown({ result }: WhyBreakdownProps) {
  return (
    <div className="why-breakdown">
      <div
        className="why-row"
        style={{
          background: 'var(--bg-surface-3)',
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        <div className="col-name">Requirement</div>
        <div className="col-vehicle">Vehicle Spec</div>
        <div className="col-required">Your Requirement</div>
        <div className="col-status">Result</div>
      </div>

      {result.hardGates.length > 0 && (
        <>
          <div className="why-section-title">Hard Gates (must all pass)</div>
          {result.hardGates.map(g => <GateRow key={g.gateId} gate={g} />)}
        </>
      )}

      {result.softPreferences.length > 0 && (
        <>
          <div className="why-section-title">Soft Preferences (informational)</div>
          {result.softPreferences.map(g => <GateRow key={g.gateId} gate={g} />)}
        </>
      )}
    </div>
  )
}
