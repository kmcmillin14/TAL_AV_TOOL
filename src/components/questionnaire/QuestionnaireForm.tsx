'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm, useFieldArray, Controller, type Control, type SubmitHandler, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import FormSection from '@/src/components/step1/FormSection'
import Icon from '@/src/design-system/components/Icon'
import VehiclePicker from './VehiclePicker'
import LoadTypePicker from './LoadTypePicker'
import AddressInput from './AddressInput'
import QuestionnaireNav, { type QSection } from './QuestionnaireNav'
import {
  partialProjectSchema, projectSchema, type PartialProjectFormData,
} from '@/src/lib/validations/schemas'
import {
  UNIT_LOAD_TYPE_OPTIONS, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS,
  SPECIALTY_APPLICATIONS, PROJECT_DRIVERS, PALLET_SUBTYPES,
  SUBMISSION_TYPES, CHARGING_STRATEGIES, SHARED_TRAFFIC_TYPES, GUIDANCE_TYPES,
  REST_API_OPTIONS, WMS_INTERFACE_TYPES, TAGGING_SCAN_METHODS,
} from '@/src/lib/constants/enums'
import { downloadQuestionnairePdf, exportQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
import { questionnaireJsonBlob } from '@/src/lib/questionnaire/questionnaireExport'
import { useQUnit, lbsToKg, kgToLbs, inToCm, cmToIn, ftToM, mToFt, sqftToM2, m2ToSqft, fToC, cToF } from '@/src/lib/questionnaire/useQUnit'

const DRAFT_KEY = 'tal:questionnaire-draft'

// Local display lists — mirror the constants in ApplicationForm (kept local to
// avoid coupling the standalone questionnaire to Step 1 internals).
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']
const FLOOR_CONDITIONS = ['Smooth', 'Standard', 'Rough']
const DUST_MOISTURE_OPTS = ['None', 'Dusty environment', 'Wash-down required', 'High humidity', 'Outdoor exposure']
const OPERATING_DAYS = ['Mon–Fri', 'Mon–Sat', 'Mon–Sun', 'Custom']
const PICK_DROP = ['Floor', 'Selective racking', 'Gravity flow rack', 'Pushback rack', 'Drive-in rack', 'Conveyor', 'Lift table', 'Trailer', 'Machine', 'Custom']
const HEIGHT_TRANSFER = new Set(TRANSFER_TYPE_OPTIONS.filter(o => o.needsHeight).map(o => o.value))

// Empty defaults — array fields seeded so chips/picker controllers start defined.
const EMPTY_VALUES: PartialProjectFormData = {
  projectDrivers: [], specialtyApplications: [], certifications: [], interlocks: [], vehiclesOfInterest: [],
  unitLoadTypes: [], sharedTrafficTypes: [],
}

// Three tiers: start light (who + what they're drawn to), then the application
// scoping an apps engineer actually needs, then commercial/context detail last.
const TIER_START = 'Getting started'
const TIER_APP = 'Your application'
const TIER_DETAILS = 'Project details'

// Single source for the section list — drives the rail, the anchors, and the
// per-section "started" progress meter.
const SECTIONS: readonly QSection[] = [
  { id: 'q-sec-01', num: '01', short: 'General Info', tier: TIER_START,
    fields: ['submissionType', 'projectName', 'customerName', 'facilityLocation', 'customerContactName', 'customerContactRole', 'customerContactEmail', 'dealershipName', 'dealerRep', 'partnerCompanyName', 'partnerRepContact', 'opportunityType', 'opportunityNumber'] },
  { id: 'q-sec-02', num: '02', short: 'Vehicles', tier: TIER_START,
    fields: ['vehiclesOfInterest', 'vehicleInMind'] },
  { id: 'q-sec-03', num: '03', short: 'What you move', tier: TIER_APP,
    fields: ['unitLoadTypes', 'typicalUnitType', 'otherUnitTypeDescription', 'maxLoadWeightLbs', 'loadLengthIn', 'loadWidthIn', 'loadHeightIn'] },
  { id: "q-sec-04", num: "04", short: "How it's moved", tier: TIER_APP,
    fields: ['pickContext', 'dropContext', 'transferType', 'transferHeightFt', 'dwellTimeSec', 'chargingStrategyPreference', 'topOfRollerHeightFt', 'maxLiftHeightFt', 'specialtyApplications'] },
  { id: 'q-sec-05', num: '05', short: 'Where it runs', tier: TIER_APP,
    fields: ['driveAisleWidthFt', 'pickingFromRacking', 'rackingAisleWidthFt', 'floorCondition', 'outdoorRequired', 'sharedTrafficTypes', 'guidanceType', 'rampRequired', 'maxRampGrade', 'rampDistanceFt', 'temperatureEnvironment', 'tempMinF', 'tempMaxF'] },
  { id: 'q-sec-06', num: '06', short: 'Site readiness', tier: TIER_APP,
    fields: ['facilitySizeSqFt', 'dockDoors', 'networkReady', 'siteWalkthroughAvailable', 'cadAvailable', 'cadNotes'] },
  { id: 'q-sec-07', num: '07', short: 'Throughput & flows', tier: TIER_APP,
    fields: ['requiredThroughputPerHour', 'peakThroughputPerHour', 'avgDistanceFt', 'distanceType', 'flows'] },
  { id: 'q-sec-08', num: '08', short: 'Schedule', tier: TIER_APP,
    fields: ['shiftsPerDay', 'hoursPerShift', 'operatingDaysPattern', 'breaksPerShift', 'breakDurationMin'] },
  { id: 'q-sec-09', num: '09', short: 'Certs & controls', tier: TIER_APP,
    fields: ['certifications', 'interlocks', 'hazardZoneClassification', 'barcodeScanningRequired', 'wmsRequired', 'wmsVendor', 'wmsInterfaceType', 'taggingScanMethod', 'restApiAvailable'] },
  { id: 'q-sec-10', num: '10', short: 'Commercial', tier: TIER_DETAILS,
    fields: ['projectStage', 'budgetStatus', 'budgetMin', 'budgetMax', 'roiTargetYears', 'isRfq', 'rfqNumber', 'rfqDueDate', 'decisionDate', 'targetGoLiveDate'] },
  { id: 'q-sec-11', num: '11', short: 'TAL / Toyota', tier: TIER_DETAILS,
    fields: ['toyotaRaymondPartnership', 'toyotaRaymondDealer', 'talHistory'] },
  { id: 'q-sec-12', num: '12', short: 'Why & today', tier: TIER_DETAILS,
    fields: ['projectDrivers', 'currentProcess', 'hasExistingAutomation', 'existingAutomation', 'existingAutomationInterop', 'currentHeadcount', 'volumeGrowthNote', 'seasonalityNote'] },
  { id: 'q-sec-13', num: '13', short: 'Notes', tier: TIER_DETAILS,
    fields: ['projectNotes'] },
]

/** Toggle a string in a string[] field (chip behavior). */
function toggle(list: string[] | undefined, value: string): string[] {
  const cur = list ?? []
  return cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
}

// RHF value coercion: empty selects emit "" and empty number inputs emit NaN —
// both fail Zod enum/number validation. Map empties to undefined so optional
// fields stay valid.
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)
const emptyToNum = (v: unknown) => {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

// Formatted number input: shows locale-formatted value (with commas) when blurred,
// raw digits when focused. Integers only unless allowDecimals is set.
function ThousandsInput({
  name, control, placeholder, className, allowDecimals = false,
}: {
  name: keyof PartialProjectFormData
  control: Control<PartialProjectFormData>
  placeholder?: string
  className?: string
  allowDecimals?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const raw = field.value as number | undefined | null
        const displayValue = focused
          ? (raw != null ? String(raw) : '')
          : (raw != null ? Number(raw).toLocaleString() : '')
        return (
          <input
            type="text"
            inputMode={allowDecimals ? 'decimal' : 'numeric'}
            className={className}
            placeholder={placeholder}
            value={displayValue}
            ref={field.ref}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); field.onBlur() }}
            onChange={(e) => {
              const stripped = e.target.value.replace(allowDecimals ? /[^0-9.]/g : /[^0-9]/g, '')
              field.onChange(stripped === '' ? undefined : Number(stripped))
            }}
          />
        )
      }}
    />
  )
}

// Unit-aware number input. Displays in the user's chosen unit system; stores in
// imperial. toDisplay converts storage→display; toStorage converts display→storage.
// iDec/mDec: fixed decimal places for imperial/metric display (avoids floating-point drift on round-trips).
// commas: show thousands separators (uses text input so browser formatting is controlled).
function UnitInput({
  name, control, imperialUnit, metricUnit, toDisplay, toStorage,
  placeholder, step = '0.1', isMetric, iDec, mDec, commas,
}: {
  name: keyof PartialProjectFormData
  control: Control<PartialProjectFormData>
  imperialUnit: string
  metricUnit: string
  toDisplay: (v: number) => number
  toStorage: (v: number) => number
  placeholder?: string
  step?: string
  isMetric: boolean
  iDec?: number
  mDec?: number
  commas?: boolean
}) {
  const stepDec = step.includes('.') ? step.split('.')[1].length : 0
  const imperialDec = iDec ?? stepDec
  const metricDec   = mDec ?? Math.max(stepDec + 1, 1)

  return (
    <Controller name={name} control={control} render={({ field }) => {
      const stored = field.value as number | undefined | null
      const numVal = stored != null
        ? (isMetric ? +toDisplay(stored).toFixed(metricDec) : +stored.toFixed(imperialDec))
        : null

      const onChange = (raw: string) => {
        const stripped = raw.replace(/,/g, '')
        const n = stripped === '' ? undefined : Number(stripped)
        field.onChange(n == null || isNaN(n) ? undefined : (isMetric ? toStorage(n) : n))
      }

      if (commas) {
        const displayStr = numVal != null
          ? numVal.toLocaleString('en-US', { maximumFractionDigits: isMetric ? metricDec : imperialDec })
          : ''
        return (
          <div className="input-with-unit">
            <input
              type="text" inputMode="numeric" className="mono"
              placeholder={placeholder}
              value={displayStr}
              ref={field.ref}
              onChange={(e) => onChange(e.target.value)}
              onBlur={field.onBlur}
            />
            <div className="unit">{isMetric ? metricUnit : imperialUnit}</div>
          </div>
        )
      }

      return (
        <div className="input-with-unit">
          <input
            type="number" step={step} inputMode="decimal" className="mono"
            placeholder={placeholder}
            value={numVal ?? ''}
            ref={field.ref}
            onChange={(e) => {
              const raw = e.target.value === '' ? undefined : Number(e.target.value)
              field.onChange(raw == null || isNaN(raw) ? undefined : (isMetric ? toStorage(raw) : raw))
            }}
            onBlur={field.onBlur}
          />
          <div className="unit">{isMetric ? metricUnit : imperialUnit}</div>
        </div>
      )
    }} />
  )
}

// Friendly labels for the rare validation block (range-constrained fields).
const FIELD_LABELS: Record<string, string> = {
  shiftsPerDay: 'Shifts / day (1–3)',
  hoursPerShift: 'Hours / shift (4–12)',
  requiredThroughputPerHour: 'Average throughput (whole moves/hr)',
  peakThroughputPerHour: 'Peak throughput (whole moves/hr)',
  breaksPerShift: 'Breaks / shift',
  breakDurationMin: 'Break duration',
}

function downloadJson(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  // Defer revoke: some browsers dispatch the download async after click() returns,
  // and revoking synchronously can cancel it (esp. with a second download in the same tick).
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function QuestionnaireFormInner({ onRequestRemount }: { onRequestRemount: () => void }) {
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null)
  const [today] = useState(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
  // Volume can be given as overall averages OR per-flow detail — they're redundant, so pick one.
  const [thruMode, setThruMode] = useState<'avg' | 'flows'>('avg')
  const { unit, setUnit, isMetric } = useQUnit()
  const { register, handleSubmit, control, reset, watch, setValue, getValues } = useForm<PartialProjectFormData>({
    resolver: zodResolver(projectSchema) as Resolver<PartialProjectFormData>,
    defaultValues: EMPTY_VALUES,
  })
  const { fields: flowFields, append: appendFlow, remove: removeFlow } = useFieldArray({ control, name: 'flows' })
  const addFlow = () => appendFlow({
    id: 'f_' + Math.random().toString(36).slice(2, 10),
    origin: '', destination: '', distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0,
    distanceType: 'one_way',
  })
  const copyFlow = (i: number) => {
    const src = getValues(`flows.${i}`)
    appendFlow({
      origin: '', destination: '', distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0,
      ...src,
      id: 'f_' + Math.random().toString(36).slice(2, 10),
    })
  }

  // Restore a previously-saved draft (validated; corrupt/stale shapes dropped).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const parsed = partialProjectSchema.safeParse(JSON.parse(raw))
      if (parsed.success) reset(parsed.data)
    } catch { /* ignore corrupt draft */ }
  }, [reset])

  // Autosave draft to its own key (never touches the app's tal:projects).
  useEffect(() => {
    const sub = watch((values) => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)) } catch { /* quota */ }
    })
    return () => sub.unsubscribe()
  }, [watch])

  const values = watch()

  // Branch flags (progressive disclosure).
  const isRfq = values.isRfq
  const cadAvailable = values.cadAvailable
  const transferType = values.transferType
  const wmsRequired = values.wmsRequired
  const certs = values.certifications ?? []
  const showHazardZone = certs.includes('ATEX') || certs.includes('IECEx')
  const unitLoadTypes = values.unitLoadTypes ?? []
  const showOtherUnit = unitLoadTypes.includes('Other')
  const submissionType = values.submissionType
  const showHeight = !!transferType && HEIGHT_TRANSFER.has(transferType)
  const isLiftTable = transferType === 'lift_table'
  const isForklift = transferType === 'forklift'
  const specialties = values.specialtyApplications ?? []
  const isVNA = specialties.includes('VNA')
  const isOutdoor = values.outdoorRequired === true
  const tempEnv = values.temperatureEnvironment
  const showTempRange = tempEnv === 'refrigerated' || tempEnv === 'freezer'
  const hasExistingAutomation = values.hasExistingAutomation === true

  // Keep legacy singular typicalUnitType in sync with the multi-select's first
  // choice so the main app's calc/import (which reads the singular field) works.
  useEffect(() => {
    setValue('typicalUnitType', unitLoadTypes[0] ?? undefined)
  }, [setValue, unitLoadTypes])

  // Keep legacy minAisleWidthFt (main-app informational) = narrower of the two.
  useEffect(() => {
    const d = values.driveAisleWidthFt, r = values.rackingAisleWidthFt
    const nums = [d, r].filter((n): n is number => typeof n === 'number')
    setValue('minAisleWidthFt', nums.length ? Math.min(...nums) : undefined)
  }, [setValue, values.driveAisleWidthFt, values.rackingAisleWidthFt])

  const onSubmit: SubmitHandler<PartialProjectFormData> = useCallback(async (v) => {
    setInvalidMsg(null)
    if (!v.submissionType) {
      setInvalidMsg("Please choose how you're submitting (Section 01) before exporting.")
      document.getElementById('q-sec-01')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const certList = v.certifications ?? []
    if ((certList.includes('ATEX') || certList.includes('IECEx')) && !v.hazardZoneClassification?.trim()) {
      setInvalidMsg('Hazard zone classification is required for ATEX / IECEx (Section 09).')
      document.getElementById('q-sec-09')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setBusy(true)
    try {
      await downloadQuestionnairePdf(v, unit)  // PDF has JSON embedded as attachment
      setSubmitted(true)
    } finally { setBusy(false) }
  }, [unit])

  const onInvalid = useCallback((errors: Record<string, unknown>) => {
    setSubmitted(false)
    const names = Object.keys(errors).map(k => FIELD_LABELS[k] ?? k)
    setInvalidMsg(`Please check these fields: ${names.join(', ')}`)
  }, [])

  const onSendToEngineer = useCallback(async (v: PartialProjectFormData) => {
    setInvalidMsg(null)
    if (!v.submissionType) {
      setInvalidMsg("Please choose how you're submitting (Section 01) before sending.")
      document.getElementById('q-sec-01')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setBusy(true)
    try {
      await downloadQuestionnairePdf(v, unit)  // PDF has JSON embedded — attach this to the email
      const subject = encodeURIComponent(`TAL AV Questionnaire — ${v.customerName || v.projectName || 'New Opportunity'}`)
      const body = encodeURIComponent(
        `Hi,\n\nPlease find the attached AV questionnaire PDF for ${v.customerName || 'the customer below'}.\n\n` +
        `Customer: ${v.customerName || '—'}\n` +
        `Project: ${v.projectName || '—'}\n` +
        `Facility: ${v.facilityLocation || '—'}\n` +
        `Submitted by: ${v.talRepName || '—'}\n\n` +
        `The PDF has been downloaded — please attach it to this email. ` +
        `It contains embedded project data that can be imported directly into the TAL Fleet Calculator.\n\nThank you`
      )
      window.open(`mailto:AppsEngineering@bastiansolutions.com?subject=${subject}&body=${body}`, '_self')
      setSubmitted(true)
    } finally { setBusy(false) }
  }, [unit])

  const clearAll = useCallback(() => {
    if (!window.confirm('Clear all answers? This cannot be undone.')) return
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    // Remount the form for a guaranteed-pristine state (reset() alone leaves
    // uncontrolled selects with their defaultValue). Draft already cleared, so
    // the fresh mount starts blank.
    onRequestRemount()
  }, [onRequestRemount])

  // The export/clear icons live in the brand-bar header (a sibling component);
  // they reach the form via window events.
  useEffect(() => {
    const onExport = () => handleSubmit(onSubmit, onInvalid)()
    const onClear = () => clearAll()
    window.addEventListener('tal:q-export', onExport)
    window.addEventListener('tal:q-clear', onClear)
    return () => {
      window.removeEventListener('tal:q-export', onExport)
      window.removeEventListener('tal:q-clear', onClear)
    }
  }, [handleSubmit, onSubmit, onInvalid, clearAll])

  // Reusable chip multiselect (matches Step 1's .cert-grid / .chk).
  const Chips = ({ name, options }: { name: 'projectDrivers' | 'specialtyApplications' | 'certifications' | 'interlocks' | 'unitLoadTypes' | 'sharedTrafficTypes' | 'dustMoisture'; options: readonly string[] }) => (
    <Controller control={control} name={name} render={({ field }) => (
      <div className="cert-grid">
        {options.map(opt => {
          const on = (field.value ?? []).includes(opt)
          return (
            <label key={opt} className={`chk${on ? ' on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => field.onChange(toggle(field.value, opt))} />
              <span className="box">{on && <Icon name="check" size={10} />}</span>
              <span>{opt}</span>
            </label>
          )
        })}
      </div>
    )} />
  )

  // Reusable No/Yes segmented toggle for a tri-state boolean. Clicking the
  // already-selected option clears it back to unanswered (undefined).
  const YesNo = ({ name }: { name: 'isRfq' | 'cadAvailable' | 'networkReady' | 'siteWalkthroughAvailable' | 'wmsRequired' | 'rampRequired' | 'barcodeScanningRequired' | 'hasExistingAutomation' | 'pickingFromRacking' | 'toyotaRaymondPartnership' | 'palletHasBottomBoard' }) => (
    <Controller control={control} name={name} render={({ field }) => (
      <div className="seg-toggle">
        <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => field.onChange(field.value === false ? undefined : false)}>No</button>
        <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => field.onChange(field.value === true ? undefined : true)}>Yes</button>
      </div>
    )} />
  )

  return (
    <form className="workspace q-form" onSubmit={handleSubmit(onSubmit, onInvalid)}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault() }}>
      <div className="page-header">
        <div className="page-title">
          <span className="step-num">AV Questionnaire · {today}</span>
          <h1>
            {values.customerName?.trim() || 'New Questionnaire'}
            {values.projectName?.trim() && <span className="q-title-project"> — {values.projectName.trim()}</span>}
          </h1>
        </div>
      </div>

      <div className="form-with-nav q-page-nav">
        <QuestionnaireNav sections={SECTIONS} values={values} />

        <div className="form-stack">
          {/* ── Getting started ── */}
          <FormSection id="q-sec-01" sectionNum="01" title="General Info">
            <div className="fld-grid-3">
              <div className="fld span-3">
                <label>Submission channel <span className="req-star" aria-hidden>*</span></label>
                <Controller control={control} name="submissionType" render={({ field }) => (
                  <div className="seg-toggle">
                    {SUBMISSION_TYPES.map(o => (
                      <button key={o.value} type="button" className={`seg-btn${field.value === o.value ? ' on' : ''}`} onClick={() => field.onChange(field.value === o.value ? undefined : o.value)}>{o.label}</button>
                    ))}
                  </div>
                )} />
              </div>
              <div className="fld"><label>Project name</label><input {...register('projectName')} placeholder="e.g. Distribution Center Phase 2" /></div>
              <div className="fld"><label>Customer / company</label><input {...register('customerName')} /></div>
              <div className="fld span-3">
                <label>Facility location</label>
                <Controller control={control} name="facilityLocation" render={({ field }) => (
                  <AddressInput value={field.value ?? ''} onChange={field.onChange} placeholder="Start typing an address…" />
                )} />
              </div>
              <div className="fld"><label>Your name</label><input {...register('customerContactName')} /></div>
              <div className="fld"><label>Your job title</label><input {...register('customerContactRole')} placeholder="e.g. Operations Manager" /></div>
              <div className="fld"><label>Your email</label><input type="email" {...register('customerContactEmail')} /></div>
              <div className="fld"><label>TAL representative</label><input {...register('talRepName')} /></div>
              {submissionType === 'dealer' && (<>
                <div className="fld"><label>Dealership name</label><input {...register('dealershipName')} /></div>
                <div className="fld"><label>Dealer rep</label><input {...register('dealerRep')} /></div>
              </>)}
              {submissionType === 'partner' && (<>
                <div className="fld"><label>Partner company</label><input {...register('partnerCompanyName')} /></div>
                <div className="fld"><label>Partner rep / contact</label><input {...register('partnerRepContact')} /></div>
              </>)}
              {submissionType === 'internal' && (<>
                <div className="fld">
                  <label>Lead or opportunity?</label>
                  <Controller control={control} name="opportunityType" render={({ field }) => (
                    <div className="seg-toggle">
                      <button type="button" className={`seg-btn${field.value === 'lead' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'lead' ? undefined : 'lead')}>Lead</button>
                      <button type="button" className={`seg-btn${field.value === 'opp' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'opp' ? undefined : 'opp')}>Opp</button>
                    </div>
                  )} />
                </div>
                <div className="fld"><label>Lead / Opp number</label><input {...register('opportunityNumber')} placeholder="e.g. OPP-12345" /></div>
              </>)}
            </div>
          </FormSection>

          <FormSection id="q-sec-02" sectionNum="02" title="Vehicles you're interested in">
            <div className="fld-grid-4">
              <div className="fld span-4">
                <Controller control={control} name="vehiclesOfInterest" render={({ field }) => (
                  <VehiclePicker value={field.value ?? []} onChange={field.onChange} />
                )} />
              </div>
              <div className="fld span-2"><label>Other vehicle / not listed</label><input {...register('vehicleInMind')} placeholder="Anything specific in mind" /></div>
            </div>
          </FormSection>

          {/* ── Your application ── */}
          <FormSection id="q-sec-03" sectionNum="03" title="What you're moving">
            <div className="fld-grid-4">
              <div className="fld span-4">
                <label>Unit / load type(s)</label>
                <Controller control={control} name="unitLoadTypes" render={({ field }) => (
                  <LoadTypePicker value={field.value ?? []} onChange={field.onChange} />
                )} />
                <div className="help">Select all that apply.</div>
              </div>
              {unitLoadTypes.includes('Standard Pallet') && (<>
                <div className="fld span-2">
                  <label>Pallet subtype</label>
                  <select
                    {...register('palletBottomBoard', { setValueAs: emptyToUndef })}
                    defaultValue=""
                    onChange={(e) => {
                      const sub = e.target.value
                      register('palletBottomBoard').onChange(e)
                      const AUTOFILL: Record<string, { l: number; w: number }> = {
                        GMA:  { l: 48, w: 40 },
                        Euro: { l: 47.2, w: 31.5 },
                        CHEP: { l: 45.9, w: 45.9 },
                      }
                      const d = AUTOFILL[sub.split(' ')[0]]
                      if (d) {
                        setValue('loadLengthIn', d.l, { shouldDirty: true })
                        setValue('loadWidthIn', d.w, { shouldDirty: true })
                      }
                    }}
                  >
                    <option value="">Select subtype…</option>
                    {PALLET_SUBTYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <div className="help">Fills in standard dimensions automatically</div>
                </div>
                <div className="fld span-2">
                  <label>Pallet bottom board / entry</label>
                  <select {...register('palletEntryType', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    <option value="stringer">Stringer (2-way entry)</option>
                    <option value="block">Block (4-way entry)</option>
                    <option value="not_sure">Not sure</option>
                  </select>
                  <div className="help">Affects vehicle compatibility — block pallets work with more vehicles</div>
                </div>
                <div className="fld span-2">
                  <label>Bottom board present?</label>
                  <YesNo name="palletHasBottomBoard" />
                </div>
                <div className="fld span-2">
                  <label>Pallet material</label>
                  <select {...register('palletMaterial', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    <option value="wooden">Wooden</option>
                    <option value="plastic">Plastic</option>
                    <option value="metal">Metal</option>
                    <option value="cardboard">Cardboard</option>
                  </select>
                </div>
              </>)}
              {showOtherUnit && (
                <div className="fld"><label>Describe load type</label><input {...register('otherUnitTypeDescription')} /></div>
              )}
              <div className="fld">
                <label>Max load weight</label>
                <UnitInput name="maxLoadWeightLbs" control={control} isMetric={isMetric}
                  imperialUnit="lbs" metricUnit="kg"
                  toDisplay={lbsToKg} toStorage={kgToLbs}
                  placeholder={isMetric ? '900' : '2000'} step="1" iDec={0} mDec={1} />
              </div>
            </div>
            <div className="fld-row-3">
              <div className="fld">
                <label>Load length ({isMetric ? 'cm' : 'in'})</label>
                <UnitInput name="loadLengthIn" control={control} isMetric={isMetric}
                  imperialUnit="in" metricUnit="cm" toDisplay={inToCm} toStorage={cmToIn}
                  placeholder={isMetric ? '122' : '48'} iDec={1} mDec={1} />
              </div>
              <div className="fld">
                <label>Load width ({isMetric ? 'cm' : 'in'})</label>
                <UnitInput name="loadWidthIn" control={control} isMetric={isMetric}
                  imperialUnit="in" metricUnit="cm" toDisplay={inToCm} toStorage={cmToIn}
                  placeholder={isMetric ? '102' : '40'} iDec={1} mDec={1} />
              </div>
              <div className="fld">
                <label>Load height ({isMetric ? 'cm' : 'in'})</label>
                <UnitInput name="loadHeightIn" control={control} isMetric={isMetric}
                  imperialUnit="in" metricUnit="cm" toDisplay={inToCm} toStorage={cmToIn}
                  placeholder={isMetric ? '152' : '60'} iDec={1} mDec={1} />
              </div>
            </div>
          </FormSection>

          <FormSection id="q-sec-04" sectionNum="04" title="How it's moved">
            <div className="fld-grid-2">
              <div className="fld">
                <label>Pick loads up from</label>
                <select {...register('pickContext', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {PICK_DROP.map(o => <option key={o}>{o}</option>)}
                </select>
                {values.pickContext === 'Custom' && (
                  <input style={{ marginTop: 6 }} {...register('pickContextCustom')} placeholder="Describe pick location…" />
                )}
                <div className="help">Where the vehicle takes the load from</div>
              </div>
              <div className="fld">
                <label>Set loads down at</label>
                <select {...register('dropContext', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {PICK_DROP.map(o => <option key={o}>{o}</option>)}
                </select>
                {values.dropContext === 'Custom' && (
                  <input style={{ marginTop: 6 }} {...register('dropContextCustom')} placeholder="Describe drop location…" />
                )}
                <div className="help">Where the vehicle delivers the load</div>
              </div>
              <div className="fld">
                <label>Type of handling</label>
                <select {...register('transferType', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {showHeight && (
                <div className="fld">
                  <label>Transfer height</label>
                  <UnitInput name="transferHeightFt" control={control} isMetric={isMetric}
                    imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} placeholder="0" iDec={1} mDec={2} />
                  <div className="help">How high the load is raised to pick / place</div>
                </div>
              )}
              {isLiftTable && (
                <div className="fld">
                  <label>Top-of-roller height</label>
                  <UnitInput name="topOfRollerHeightFt" control={control} isMetric={isMetric}
                    imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} iDec={1} mDec={2} />
                </div>
              )}
              {isForklift && (
                <div className="fld">
                  <label>Max lift height</label>
                  <UnitInput name="maxLiftHeightFt" control={control} isMetric={isMetric}
                    imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} iDec={1} mDec={2} />
                </div>
              )}
              <div className="fld">
                <label>Dwell / queue time at pick &amp; drop</label>
                <div className="input-with-unit">
                  <input type="number" step="1" min="0" inputMode="numeric" className="mono" {...register('dwellTimeSec', { setValueAs: emptyToNum })} />
                  <div className="unit">sec</div>
                </div>
                <div className="help">Estimated wait per pick/drop</div>
              </div>
              <div className="fld">
                <label>Charging strategy</label>
                <select {...register('chargingStrategyPreference', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {CHARGING_STRATEGIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="fld-grid-4">
              <div className="fld span-4">
                <label>Specialty applications</label>
                <Chips name="specialtyApplications" options={SPECIALTY_APPLICATIONS} />
                <div className="help">Trailer loading/unloading, high reach, etc.</div>
              </div>
            </div>
          </FormSection>

          <FormSection id="q-sec-05" sectionNum="05" title="Where it runs">
            <div className="fld-grid-3">
              <div className="fld">
                <label>Drive aisle width ({isMetric ? 'm' : 'ft'})</label>
                <UnitInput name="driveAisleWidthFt" control={control} imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} placeholder={isMetric ? '2.4' : '8'} isMetric={isMetric} iDec={1} mDec={2} />
              </div>
              <div className="fld">
                <label>Picking from racking?</label>
                <YesNo name="pickingFromRacking" />
              </div>
              {values.pickingFromRacking && (
                <div className="fld">
                  <label>Racking aisle width ({isMetric ? 'm' : 'ft'})</label>
                  <UnitInput name="rackingAisleWidthFt" control={control} imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} placeholder={isMetric ? '1.8' : '6'} isMetric={isMetric} iDec={1} mDec={2} />
                  {isVNA && <div className="help" style={{ fontWeight: 600 }}>VNA selected — racking aisle width is critical for fit.</div>}
                </div>
              )}
              <div className="fld">
                <label>Floor condition</label>
                <select {...register('floorCondition', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {FLOOR_CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="fld">
                <label>Indoor / outdoor</label>
                <Controller control={control} name="outdoorRequired" render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => field.onChange(field.value === false ? undefined : false)}>Indoor</button>
                    <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => field.onChange(field.value === true ? undefined : true)}>Outdoor</button>
                  </div>
                )} />
              </div>
              <div className="fld">
                <label>Temperature</label>
                <Controller control={control} name="temperatureEnvironment" render={({ field }) => (
                  <div className="seg-toggle">
                    {(['ambient', 'refrigerated', 'freezer'] as const).map(opt => (
                      <button key={opt} type="button" className={`seg-btn${field.value === opt ? ' on' : ''}`} onClick={() => field.onChange(field.value === opt ? undefined : opt)}>
                        {opt === 'ambient' ? 'Ambient' : opt === 'refrigerated' ? 'Refrigerated' : 'Freezer'}
                      </button>
                    ))}
                  </div>
                )} />
              </div>
              {showTempRange && (<>
                <div className="fld"><label>Min temperature ({isMetric ? '°C' : '°F'})</label><UnitInput name="tempMinF" control={control} imperialUnit="°F" metricUnit="°C" toDisplay={fToC} toStorage={cToF} placeholder={isMetric ? '-20' : '-5'} step="1" isMetric={isMetric} iDec={0} mDec={1} /></div>
                <div className="fld"><label>Max temperature ({isMetric ? '°C' : '°F'})</label><UnitInput name="tempMaxF" control={control} imperialUnit="°F" metricUnit="°C" toDisplay={fToC} toStorage={cToF} placeholder={isMetric ? '38' : '100'} step="1" isMetric={isMetric} iDec={0} mDec={1} /></div>
              </>)}
              <div className="fld span-3">
                <label>Environment variables</label>
                <Chips name="dustMoisture" options={DUST_MOISTURE_OPTS} />
              </div>
              <div className="fld span-3">
                <label>Shared traffic in the area</label>
                <Chips name="sharedTrafficTypes" options={SHARED_TRAFFIC_TYPES} />
              </div>
              {isVNA && (
                <div className="fld">
                  <label>VNA guidance type</label>
                  <select {...register('guidanceType', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select&hellip;</option>
                    {GUIDANCE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div className="fld">
                <label>Ramps / grades present?</label>
                <YesNo name="rampRequired" />
              </div>
              {values.rampRequired && (<>
                <div className="fld">
                  <label>Max grade</label>
                  <div className="input-with-unit">
                    <input type="number" step="0.1" min="0" inputMode="decimal" className="mono" {...register('maxRampGrade', { setValueAs: emptyToNum })} />
                    <div className="unit">%</div>
                  </div>
                </div>
                <div className="fld">
                  <label>Ramp length ({isMetric ? 'm' : 'ft'})</label>
                  <UnitInput name="rampDistanceFt" control={control} imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} placeholder={isMetric ? '3' : '10'} isMetric={isMetric} iDec={1} mDec={2} />
                </div>
              </>)}
            </div>
          </FormSection>

          <FormSection id="q-sec-06" sectionNum="06" title="Site readiness">
            <div className="fld-grid-3">
              <div className="fld"><label>Facility size ({isMetric ? 'm²' : 'sq ft'})</label><UnitInput name="facilitySizeSqFt" control={control} imperialUnit="sq ft" metricUnit="m²" toDisplay={sqftToM2} toStorage={m2ToSqft} placeholder={isMetric ? '4,650' : '50,000'} step="1" isMetric={isMetric} iDec={0} mDec={0} commas /></div>
              <div className="fld"><label>Dock doors</label><input type="number" inputMode="numeric" className="mono" {...register('dockDoors', { setValueAs: emptyToNum })} /></div>
              <div className="fld"><label>Network / WiFi ready?</label><YesNo name="networkReady" /></div>
              <div className="fld"><label>Site walkthrough available?</label><YesNo name="siteWalkthroughAvailable" /></div>
              <div className="fld"><label>CAD / drawings available?</label><YesNo name="cadAvailable" /></div>
              {cadAvailable && <div className="fld span-2"><label>CAD notes</label><input {...register('cadNotes')} placeholder="Format, what's included…" /></div>}
            </div>
          </FormSection>

          <FormSection id="q-sec-07" sectionNum="07" title="Throughput & flows">
            <div className="fld-grid-4">
              <div className="fld span-4">
                <label>How would you like to describe volume?</label>
                <div className="seg-toggle">
                  <button type="button" className={`seg-btn${thruMode === 'avg' ? ' on' : ''}`} onClick={() => setThruMode('avg')}>Overall averages</button>
                  <button type="button" className={`seg-btn${thruMode === 'flows' ? ' on' : ''}`} onClick={() => setThruMode('flows')}>Per-flow detail</button>
                </div>
                <div className="help">Give simple averages, or list each origin → destination flow — whichever is easier.</div>
              </div>
            </div>
            {thruMode === 'avg' && (
            <div className="fld-grid-4">
              <div className="fld"><label>Average throughput</label>
                <div className="input-with-unit">
                  <input type="number" min="0" inputMode="numeric" className="mono" placeholder="60" {...register('requiredThroughputPerHour', { setValueAs: emptyToNum })} />
                  <div className="unit">/hr</div>
                </div>
                <div className="help">Typical loads moved per hour</div>
              </div>
              <div className="fld"><label>Peak throughput</label>
                <div className="input-with-unit">
                  <input type="number" min="0" inputMode="numeric" className="mono" placeholder="90" {...register('peakThroughputPerHour', { setValueAs: emptyToNum })} />
                  <div className="unit">/hr</div>
                </div>
                <div className="help">Busiest-hour rate</div>
              </div>
              <div className="fld"><label>Average distance ({isMetric ? 'm' : 'ft'})</label>
                <UnitInput name="avgDistanceFt" control={control} imperialUnit="ft" metricUnit="m" toDisplay={ftToM} toStorage={mToFt} placeholder={isMetric ? '75' : '250'} step="1" isMetric={isMetric} iDec={0} mDec={1} />
              </div>
              <div className="fld">
                <label>Distance type</label>
                <Controller control={control} name="distanceType" render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value === 'one_way' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'one_way' ? undefined : 'one_way')}>One-way</button>
                    <button type="button" className={`seg-btn${field.value === 'round_trip' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'round_trip' ? undefined : 'round_trip')}>Round-trip</button>
                  </div>
                )} />
              </div>
            </div>
            )}

            {thruMode === 'flows' && (
            <div className="fld span-4" style={{ marginTop: 18 }}>
              <label>Material flows</label>
              {flowFields.length > 0 && (
                <div className="step1-flows">
                  {flowFields.map((f, i) => (
                    <div className="step1-flow-row" key={f.id}>
                      <div className="fld"><label>Origin</label><input type="text" placeholder="Dock A" {...register(`flows.${i}.origin`)} /></div>
                      <div className="fld"><label>Destination</label><input type="text" placeholder="Storage 1" {...register(`flows.${i}.destination`)} /></div>
                      <div className="fld"><label>Distance (ft)</label>
                        <div className="input-with-unit">
                          <input type="number" min="0" inputMode="numeric" className="mono" placeholder="200" {...register(`flows.${i}.distanceFt`, { setValueAs: v => (v === '' || v == null ? 0 : Number(v)) })} />
                          <div className="unit">ft</div>
                        </div>
                      </div>
                      <div className="fld"><label>Throughput</label>
                        <div className="input-with-unit">
                          <input type="number" min="0" inputMode="numeric" className="mono" placeholder="60" {...register(`flows.${i}.thruPerHr`, { setValueAs: v => (v === '' || v == null ? 0 : Number(v)) })} />
                          <div className="unit">/hr</div>
                        </div>
                      </div>
                      <div className="fld">
                        <label>Distance type</label>
                        <Controller control={control} name={`flows.${i}.distanceType`} render={({ field }) => (
                          <div className="seg-toggle">
                            <button type="button" className={`seg-btn${field.value === 'one_way' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'one_way' ? undefined : 'one_way')}>One-way</button>
                            <button type="button" className={`seg-btn${field.value === 'round_trip' ? ' on' : ''}`} onClick={() => field.onChange(field.value === 'round_trip' ? undefined : 'round_trip')}>Round-trip</button>
                          </div>
                        )} />
                      </div>
                      <div className="step1-flow-actions">
                        <button type="button" className="tbtn-icon" aria-label="Copy flow" title="Copy flow" onClick={() => copyFlow(i)}>
                          <Icon name="copy" size={13} />
                        </button>
                        <button type="button" className="tbtn-icon" aria-label="Delete flow" title="Delete flow" onClick={() => removeFlow(i)}>
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="btn ghost step1-flow-add" onClick={addFlow}>+ Add flow</button>
              <div className="help" style={{ marginTop: 8 }}>One row per origin → destination move. These are the same flows your TAL engineer sizes in Step 3.</div>
            </div>
            )}
          </FormSection>

          <FormSection id="q-sec-08" sectionNum="08" title="Operating schedule">
            <div className="fld-grid-3">
              <div className="fld"><label>Shifts / day</label><input type="number" min="1" max="3" inputMode="numeric" className="mono" {...register('shiftsPerDay', { setValueAs: emptyToNum })} /></div>
              <div className="fld"><label>Hours / shift</label><input type="number" min="4" max="12" inputMode="numeric" className="mono" {...register('hoursPerShift', { setValueAs: emptyToNum })} /></div>
              <div className="fld">
                <label>Operating days</label>
                <select {...register('operatingDaysPattern', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {OPERATING_DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="fld"><label>Breaks / shift</label><input type="number" min="0" inputMode="numeric" className="mono" {...register('breaksPerShift', { setValueAs: emptyToNum })} /></div>
              <div className="fld"><label>Break duration (min)</label><input type="number" min="0" inputMode="numeric" className="mono" {...register('breakDurationMin', { setValueAs: emptyToNum })} /></div>
            </div>
          </FormSection>

          <FormSection id="q-sec-09" sectionNum="09" title="Certifications & controls">
            <div className="fld-grid-4">
              <div className="fld span-4"><label>Required certifications</label><Chips name="certifications" options={CERTIFICATIONS} /></div>
              {showHazardZone && (
                <div className="fld span-4">
                  <label>Hazard zone classification <span className="req-star" aria-hidden>*</span></label>
                  <input {...register('hazardZoneClassification')} placeholder="e.g. Zone 1 / Class I Div 1" />
                  <div className="help">Required for ATEX / IECEx applications.</div>
                </div>
              )}
              <div className="fld span-4"><label>Equipment interlocks</label><Chips name="interlocks" options={INTERLOCKS} /></div>
            </div>
            <div className="fld-grid-2">
              <div className="fld"><label>Barcode scanning required?</label><YesNo name="barcodeScanningRequired" /></div>
              <div className="fld"><label>WMS integration required?</label><YesNo name="wmsRequired" /></div>
              {wmsRequired && (<>
                <div className="fld"><label>WMS vendor</label><input {...register('wmsVendor')} /></div>
                <div className="fld">
                  <label>WMS interface type</label>
                  <select {...register('wmsInterfaceType', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {WMS_INTERFACE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>REST API available?</label>
                  <select {...register('restApiAvailable', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {REST_API_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>Tagging / scan method</label>
                  <select {...register('taggingScanMethod', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {TAGGING_SCAN_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>)}
            </div>
          </FormSection>

          {/* ── Project details (commercial / context) ── */}
          <FormSection id="q-sec-10" sectionNum="10" title="Commercial">
            <div className="fld-grid-3">
              <div className="fld">
                <label>Project stage</label>
                <select {...register('projectStage', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  <option value="exploring">Exploring</option>
                  <option value="budgeting">Budgeting</option>
                  <option value="approved">Approved</option>
                  <option value="committed">Committed</option>
                </select>
              </div>
              <div className="fld">
                <label>Budget status</label>
                <select {...register('budgetStatus', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  <option value="budgetary">Budgetary</option>
                  <option value="firm">Firm</option>
                  <option value="allocated">Allocated</option>
                </select>
              </div>
              <div className="fld span-2">
                <label>Budget range</label>
                <div className="fld-budget-range">
                  <div className="fld-money">
                    <span className="fld-money-sym">$</span>
                    <ThousandsInput name="budgetMin" control={control} placeholder="500,000" className="mono" />
                  </div>
                  <span className="fld-range-sep">—</span>
                  <div className="fld-money">
                    <span className="fld-money-sym">$</span>
                    <ThousandsInput name="budgetMax" control={control} placeholder="2,000,000" className="mono" />
                  </div>
                </div>
              </div>
              <div className="fld"><label>ROI target (yrs)</label><input type="number" min="1" max="20" inputMode="numeric" className="mono" {...register('roiTargetYears', { setValueAs: emptyToNum })} placeholder="e.g. 3" /></div>
              <div className="fld"><label>Is there an RFQ?</label><YesNo name="isRfq" /></div>
              {isRfq && <div className="fld"><label>RFQ number</label><input {...register('rfqNumber')} /></div>}
              {isRfq && <div className="fld"><label>RFQ due date</label><input type="date" {...register('rfqDueDate')} /></div>}
              <div className="fld"><label>Decision date</label><input type="date" {...register('decisionDate')} /></div>
              <div className="fld"><label>Target go-live</label><input type="date" {...register('targetGoLiveDate')} /></div>
            </div>
          </FormSection>

          <FormSection id="q-sec-11" sectionNum="11" title="TAL / Toyota">
            <div className="fld-grid-2">
              <div className="fld"><label>TMH or Raymond dealership existing relationship?</label><YesNo name="toyotaRaymondPartnership" /></div>
              {values.toyotaRaymondPartnership && (
                <div className="fld"><label>Dealership name</label><input {...register('toyotaRaymondDealer')} placeholder="Dealer name / location" /></div>
              )}
            </div>
            <div className="fld-grid-2">
              <div className="fld span-2"><label>Notes</label><textarea {...register('talHistory')} placeholder="Existing fleet, prior projects, current relationship…" /></div>
            </div>
          </FormSection>

          <FormSection id="q-sec-12" sectionNum="12" title="Why & how it's done today">
            <div className="fld-grid-4">
              <div className="fld span-4">
                <label>Why are you automating?</label>
                <Chips name="projectDrivers" options={PROJECT_DRIVERS} />
              </div>
            </div>
            <div className="fld-grid-2">
              <div className="fld"><label>How is this done today?</label><textarea {...register('currentProcess')} placeholder="Manual forklifts, hand carts, …" /></div>
              <div className="fld"><label>Per shift operator headcount</label><input type="number" min="0" inputMode="numeric" className="mono" {...register('currentHeadcount', { setValueAs: emptyToNum })} /></div>
              <div className="fld"><label>Operators doing this task per shift</label><input type="number" min="0" inputMode="numeric" className="mono" {...register('operatorsPerShift', { setValueAs: emptyToNum })} /></div>
              <div className="fld">
                <label>Fully burdened rate ($/yr per operator)</label>
                <div className="fld-money">
                  <span className="fld-money-sym">$</span>
                  <ThousandsInput name="fullyBurdenedRateUsdPerYear" control={control} placeholder="65,000" className="mono" />
                </div>
              </div>
              <div className="fld"><label>Existing AGV / AMR on site?</label><YesNo name="hasExistingAutomation" /></div>
              {hasExistingAutomation && (<>
                <div className="fld"><label>Existing automation (brand / fleet)</label><textarea {...register('existingAutomation')} placeholder="Any AGVs/AMRs already on site" /></div>
                <div className="fld"><label>Do the new and existing AV fleet paths cross at any point?</label><input {...register('existingAutomationInterop')} placeholder="Shared traffic, handoffs, controls…" /></div>
              </>)}
              <div className="fld"><label>Volume growth</label><input {...register('volumeGrowthNote')} placeholder="e.g. +10%/yr" /></div>
              <div className="fld"><label>Seasonality</label><input {...register('seasonalityNote')} placeholder="e.g. Q4 peak" /></div>
            </div>
          </FormSection>

          <FormSection id="q-sec-13" sectionNum="13" title="Anything else">
            <div className="fld-grid-4">
              <div className="fld span-4"><label>Notes</label><textarea {...register('projectNotes')} placeholder="Anything that would help us understand the application" /></div>
            </div>
          </FormSection>
        </div>
      </div>

      <div className="q-actions">
        <div className="q-actions-btns">
          <button type="submit" className="btn primary q-export-btn" disabled={busy} aria-label="Export PDF">
            <Icon name="export" size={16} />
            {busy ? 'Preparing…' : 'Export PDF'}
          </button>
          <button
            type="button"
            className="btn q-send-btn"
            disabled={busy}
            aria-label="Send to TAL Engineer"
            onClick={() => handleSubmit(onSendToEngineer, onInvalid)()}
          >
            <Icon name="mail" size={16} />
            Send to TAL Engineer
          </button>
        </div>
        <div className="q-actions-status">
          {!submitted && !invalidMsg && <span className="q-actions-note">Export a PDF (with embedded project data), or send directly to your TAL applications engineer.</span>}
          {submitted && <span className="q-status q-status-ok"><Icon name="check" size={14} /> PDF downloaded — attach it to the email that just opened.</span>}
          {invalidMsg && <span className="q-status q-status-bad"><Icon name="warn" size={14} /> {invalidMsg}</span>}
        </div>
      </div>
    </form>
  )
}

export default function QuestionnaireForm() {
  // A Clear remounts the inner form (key bump) for a guaranteed-pristine state.
  const [formKey, setFormKey] = useState(0)
  return <QuestionnaireFormInner key={formKey} onRequestRemount={() => setFormKey(k => k + 1)} />
}
