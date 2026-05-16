'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'

interface Props {
  vehicle: Vehicle
  unitSystem: UnitSystem
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function lbsToKg(lbs: number): number { return Math.round(lbs * 0.453592) }
function ftToM(ft: number): number    { return +(ft * 0.3048).toFixed(1) }
function inToMm(inch: number): number { return Math.round(inch * 25.4) }
function fToC(f: number): number      { return Math.round((f - 32) * 5 / 9) }
function fpsToMps(fps: number): number { return +(fps * 0.3048).toFixed(1) }

function Row({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="spec-sheet-row">
      <span className="spec-sheet-k">{k}</span>
      <span className="spec-sheet-v">{v == null || v === '' ? '—' : v}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="spec-sheet-section">
      <div className="spec-sheet-title">{title}</div>
      <div className="spec-sheet-rows">{children}</div>
    </div>
  )
}

export default function VehicleSpecSheet({ vehicle, unitSystem }: Props) {
  const metric = unitSystem === 'metric'
  const { calc, specs, display, transferMethods, payloadTypes } = vehicle

  const weight = metric ? `${lbsToKg(calc.maxWeightLbs)} kg` : `${calc.maxWeightLbs.toLocaleString()} lbs`
  const width  = metric ? `${ftToM(calc.widthFt)} m` : `${calc.widthFt} ft`
  const length = calc.lengthFt == null ? null : (metric ? `${ftToM(calc.lengthFt)} m` : `${calc.lengthFt} ft`)
  const height = calc.heightFt == null ? null : (metric ? `${ftToM(calc.heightFt)} m` : `${calc.heightFt} ft`)
  const turning = calc.turningRadiusFt == null ? null : (metric ? `${ftToM(calc.turningRadiusFt)} m` : `${calc.turningRadiusFt} ft`)
  const lift = calc.maxLiftHeightFt == null ? 'None (non-lifting)' : (metric ? `${ftToM(calc.maxLiftHeightFt)} m` : `${calc.maxLiftHeightFt} ft`)

  const loadL = calc.maxLoadLengthIn == null ? null : (metric ? `${inToMm(calc.maxLoadLengthIn)} mm` : `${calc.maxLoadLengthIn} in`)
  const loadW = calc.maxLoadWidthIn  == null ? null : (metric ? `${inToMm(calc.maxLoadWidthIn)} mm`  : `${calc.maxLoadWidthIn} in`)
  const loadH = calc.maxLoadHeightIn == null ? null : (metric ? `${inToMm(calc.maxLoadHeightIn)} mm` : `${calc.maxLoadHeightIn} in`)

  const spLoad   = metric ? `${fpsToMps(calc.speedLoadedFps)} m/s` : `${calc.speedLoadedFps} ft/s`
  const spUnload = calc.speedUnloadedFps == null ? null : (metric ? `${fpsToMps(calc.speedUnloadedFps)} m/s` : `${calc.speedUnloadedFps} ft/s`)

  const tempMin = metric ? `${fToC(specs.tempMinF)}°C` : `${specs.tempMinF}°F`
  const tempMax = metric ? `${fToC(specs.tempMaxF)}°C` : `${specs.tempMaxF}°F`

  return (
    <div className="spec-sheet">
      <Section title="Physical">
        <Row k="Width" v={width} />
        <Row k="Length" v={length} />
        <Row k="Height" v={height} />
        <Row k="Turning radius" v={turning} />
      </Section>

      <Section title="Load Capacity">
        <Row k="Max payload" v={weight} />
        <Row k="Max lift height" v={lift} />
        <Row k="Max load length" v={loadL} />
        <Row k="Max load width" v={loadW} />
        <Row k="Max load height" v={loadH} />
        <Row k="Payload types" v={payloadTypes.join(', ') || '—'} />
      </Section>

      <Section title="Performance">
        <Row k="Speed (loaded)" v={spLoad} />
        <Row k="Speed (unloaded)" v={spUnload} />
        <Row k="Max ramp grade" v={`${specs.maxRampGrade}%`} />
      </Section>

      <Section title="Power &amp; Charging">
        <Row k="Battery" v={`${calc.batteryKwh} kWh`} />
        <Row k="Energy use" v={`${calc.energyKwhPerFt} kWh/ft`} />
        <Row k="Charger" v={calc.chargeKw == null ? null : `${calc.chargeKw} kW`} />
        <Row k="Charge time" v={calc.chargeTimeMin == null ? null : `${calc.chargeTimeMin} min`} />
        <Row k="Charging strategy" v={calc.chargerType ?? null} />
      </Section>

      <Section title="Environment">
        <Row k="Min temperature" v={tempMin} />
        <Row k="Max temperature" v={tempMax} />
        <Row k="Outdoor capable" v={specs.outdoorCapable ? 'Yes' : 'No'} />
        <Row k="Freezer capable" v={specs.freezerCapable ? 'Yes' : 'No'} />
      </Section>

      <Section title="Software &amp; Navigation">
        <Row k="Fleet software" v={display.fleetSoftware} />
        <Row k="Navigation" v={display.navigationType ?? null} />
        <Row k="T-Hive enabled" v={display.tHive ? 'Yes' : 'No'} />
      </Section>

      <Section title="Transfer Methods">
        {transferMethods.map(tm => (
          <Row
            key={tm.method}
            k={tm.method}
            v={`${tm.loadTimeSec}s load · ${tm.unloadTimeSec}s unload`}
          />
        ))}
      </Section>

      <Section title="Compliance">
        <Row k="Certifications" v={specs.certifications.join(', ') || 'None listed'} />
      </Section>

      <Section title="Commercial">
        <Row
          k="Price range"
          v={`${formatMoney(calc.priceRange.minUsd)} – ${formatMoney(calc.priceRange.maxUsd)}`}
        />
      </Section>
    </div>
  )
}
