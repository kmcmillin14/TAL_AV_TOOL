'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm, useFieldArray, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import FormSection from './FormSection'
import Icon from '@/src/design-system/components/Icon'
import { projectSchema, type ProjectFormData } from '@/src/lib/validations/schemas'
import { formatImperialForDisplay, parseImperialInput, type UnitSystem } from '@/src/lib/utils/units'
import { createProject, updateProject, getProject } from '@/src/lib/storage'
import { TYPICAL_UNIT_TYPES, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS } from '@/src/lib/constants/enums'
import { FORM_SECTIONS, TIER_LABELS, sectionStatus } from '@/src/lib/constants/sections'
import SectionNav from './SectionNav'
import ProgressStrip from './ProgressStrip'



// Pallet dimension auto-fill (stored in inches)
const PALLET_AUTOFILL: Record<string, { l: number; w: number; h: number }> = {
  GMA:  { l: 48, w: 40, h: 5.7 },
  Euro: { l: 47.2, w: 31.5, h: 5.7 },
  CHEP: { l: 45.9, w: 45.9, h: 5.9 },
}

const PALLET_SUBTYPES = ['GMA (48×40)', 'Euro (47.2×31.5)', 'CHEP (45.9×45.9)', 'Custom']
const FLOOR_CONDITIONS = ['Smooth', 'Standard', 'Rough']
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']
const DUST_MOISTURE_OPTS = ['None', 'Dusty environment', 'Wash-down required', 'High humidity', 'Outdoor exposure']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  initialData?: Partial<ProjectFormData> & { createdAt?: string }
  projectId?: string
  unitSystem: UnitSystem
}

function toDateInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const newFlowId = () => 'f_' + Math.random().toString(36).slice(2, 10)
const newLoadId = () => 'l_' + Math.random().toString(36).slice(2, 10)

type LoadRow = NonNullable<ProjectFormData['loads']>[number]

const emptyLoadRow = (): LoadRow => ({ id: newLoadId(), unitType: '' })

/** Loads list for the form: declared loads, else one row synthesized from the
 *  legacy singular fields (projects predating the loads model), else one blank
 *  row — section 01 always shows at least one load block. */
function initialLoadRows(initialData?: Partial<ProjectFormData>): LoadRow[] {
  if (initialData?.loads?.length) return initialData.loads
  return [{
    id: newLoadId(),
    unitType: initialData?.typicalUnitType ?? '',
    lengthIn: initialData?.loadLengthIn,
    widthIn: initialData?.loadWidthIn,
    heightIn: initialData?.loadHeightIn,
    weightLbs: initialData?.maxLoadWeightLbs || undefined,
    palletSubtype: initialData?.palletBottomBoard,
    customDescription: initialData?.customPalletDescription,
    otherDescription: initialData?.otherUnitTypeDescription,
  }]
}

/** Mirror loads[0] into the legacy singular fields so every existing consumer
 *  (readiness meter, PDF rows, old-app parsers of new exports) keeps working.
 *  The gate engine itself reads the loads array. */
function mirrorFirstLoad(data: Partial<ProjectFormData>): Partial<ProjectFormData> {
  const l0 = data.loads?.[0]
  if (!l0) return data
  return {
    ...data,
    typicalUnitType: l0.unitType || undefined,
    loadLengthIn: l0.lengthIn,
    loadWidthIn: l0.widthIn,
    loadHeightIn: l0.heightIn,
    maxLoadWeightLbs: l0.weightLbs ?? undefined,
    palletBottomBoard: l0.palletSubtype,
    customPalletDescription: l0.customDescription,
    otherUnitTypeDescription: l0.otherDescription,
  }
}

/** Legacy projects captured one avgDistance + throughput pair instead of flows.
 *  Synthesize a single starter flow row from them (round-trip ÷ 2, same as the
 *  retired Step 3 seed button) — persisted only once the user edits the form. */
function initialFlowRows(initialData?: Partial<ProjectFormData>): ProjectFormData['flows'] {
  if (initialData?.flows?.length) return initialData.flows
  const thru = initialData?.requiredThroughputPerHour ?? 0
  const dist = initialData?.avgDistanceFt ?? 0
  if (thru <= 0 && dist <= 0) return []
  return [{
    id: newFlowId(),
    origin: '',
    destination: '',
    distanceFt: initialData?.distanceType === 'round_trip' ? dist / 2 : dist,
    thruPerHr: thru,
    routeLayout: 'medium',
    liftHeightFt: 0,
  }]
}

// Empty strings and NaN mean "the user cleared this field". Keep the key with
// `undefined` so the spread merge in updateProject removes the prior value
// (JSON.stringify drops undefined keys). Dropping the entry instead, as the
// previous code did, left ghost values in storage that Step 2 kept qualifying
// against. Flow rows get the same treatment one level down: a mid-edit NaN
// becomes undefined so the flowSchema `.default(0)` fills it — otherwise one
// half-typed distance would make the whole flows array fail validation and be
// dropped from that keystroke's save.
export function cleanFormData(data: Partial<ProjectFormData>): Partial<ProjectFormData> {
  const cleanValue = (v: unknown): unknown => {
    if (typeof v === 'number' && Number.isNaN(v)) return undefined
    if (v === '') return undefined
    return v
  }
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      if ((k === 'flows' || k === 'loads') && Array.isArray(v)) {
        return [k, v.map(row =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).map(([fk, fv]) =>
              // Keep empty strings inside rows (flow origin/destination default
              // '') — only numeric clears need the undefined treatment.
              [fk, typeof fv === 'number' && Number.isNaN(fv) ? undefined : fv],
            ),
          ),
        )]
      }
      return [k, cleanValue(v)]
    })
  ) as Partial<ProjectFormData>
}

function TierBand({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="form-tier-band">
      <span className="form-tier-label">{label}</span>
      {hint && <span className="form-tier-hint">{hint}</span>}
    </div>
  )
}

export default function ApplicationForm({ initialData, projectId, unitSystem }: Props) {
  const router = useRouter()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const [versionNumber, setVersionNumber] = useState(initialData ? 'loading…' : 'v1.0')
  const [proposalDate, setProposalDate] = useState(initialData?.createdAt || new Date().toISOString())
  const isNew = !projectId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, watch, setValue, control, getValues, formState: { errors } } = useForm<ProjectFormData, any, ProjectFormData>({
    resolver: zodResolver(projectSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      ...initialData,
      breaksPerShift: initialData?.breaksPerShift ?? 0,
      breakDurationMin: initialData?.breakDurationMin ?? 0,
      operatorsPerShift: initialData?.operatorsPerShift ?? 0,
      rampDistanceFt: initialData?.rampDistanceFt ?? 0,
      maxRampGrade: initialData?.maxRampGrade ?? 0,
      certifications: initialData?.certifications ?? [],
      interlocks: initialData?.interlocks ?? [],
      otherAGVs: initialData?.otherAGVs ?? false,
      // Tri-state environment fields — no default so nothing is pre-selected.
      outdoorRequired: initialData?.outdoorRequired,
      temperatureEnvironment: initialData?.temperatureEnvironment,
      rampRequired: initialData?.rampRequired,
      wmsRequired: initialData?.wmsRequired ?? false,
      distanceType: initialData?.distanceType ?? 'one_way',
      flows: initialFlowRows(initialData),
      loads: initialLoadRows(initialData),
    },
  })

  // Note: RHF's field snapshots overwrite `id` with its internal key (fine as a
  // React key); the flow's REAL id lives in form values — handlers must read it
  // via getValues, never from the snapshot.
  const { fields: flowFields, append: appendFlow, insert: insertFlow, remove: removeFlow } =
    useFieldArray({ control, name: 'flows' })

  const addFlowRow = () => {
    appendFlow({
      id: newFlowId(), origin: '', destination: '',
      distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0,
    })
    onBlurSave()
  }

  // Remount the form from storage so unit-converted inputs re-render through their
  // `defaultValue` transform. Programmatic injection (insert/setValue) otherwise
  // leaves the raw imperial number in a metric-labelled field, which then re-parses
  // (÷ factor) into a corrupted value on the next edit. The Step-1 page listens.
  const reloadForm = () => window.dispatchEvent(new Event('tal:form-reload'))
  const saveAndReload = () => { onBlurSave(); reloadForm() }

  const duplicateFlowRow = (i: number) => {
    const src = getValues(`flows.${i}`)   // form state is imperial — a faithful copy
    insertFlow(i + 1, { ...src, id: newFlowId() })
    saveAndReload()
  }

  const { fields: loadFields, append: appendLoad, remove: removeLoad } =
    useFieldArray({ control, name: 'loads' })
  const loadsValues = watch('loads')

  const addLoadRow = () => {
    appendLoad(emptyLoadRow())
    onBlurSave()
  }

  const formValues = watch()
  const transferTypeValue = watch('transferType')
  const showTransferHeight = transferTypeValue === 'forklift' || transferTypeValue === 'lift_table'
  const oemDealer = watch('oemDealer')
  const otherAGVs = watch('otherAGVs')
  const wmsRequired = watch('wmsRequired')
  const certifications = watch('certifications') || []
  const interlocks = watch('interlocks') || []
  const shiftsPerDay = watch('shiftsPerDay')
  const hoursPerShift = watch('hoursPerShift')
  const operatingDaysPattern = watch('operatingDaysPattern')
  const operatingDaysCustom = watch('operatingDaysCustom') || []
  const rampRequired = watch('rampRequired')

  const secProps = (id: string) => {
    const m = FORM_SECTIONS.find(s => s.id === id)!
    return { sectionNum: m.num, title: m.label, id: m.id, status: sectionStatus(m, formValues), defaultOpen: !m.startCollapsed, notMatched: m.notMatched }
  }

  // Pallet subtype auto-fill — the dimensions are imperial (inches). The registered
  // inputs parse their value as the CURRENT unit, so injecting via `setValue` would
  // re-parse the raw inches as mm (48 → 48/25.4). Instead we persist the current form,
  // write the exact imperial dims straight to storage (storage is imperial-first), and
  // remount — the inputs then re-render through their unit-aware `defaultValue`.
  const handlePalletSubtype = (i: number, subtype: string) => {
    onBlurSave()   // persist the subtype pick (+ any pending edits) first
    const key = subtype.split(' ')[0] as keyof typeof PALLET_AUTOFILL
    const d = PALLET_AUTOFILL[key]
    if (!d || !projectId) return   // e.g. "Custom" — no dimensions to fill
    const proj = getProject(projectId)
    const loads = [...(proj?.loads ?? [])]
    if (!loads[i]) return
    loads[i] = { ...loads[i], lengthIn: d.l, widthIn: d.w, heightIn: d.h }
    updateProject(projectId, { loads })
    reloadForm()
  }

  // Save synchronously on blur. The previous 2-second debounce raced router
  // navigation: clicking Continue scheduled the write, then router.push ran
  // immediately, so Step 2 mounted and read storage before the timer fired.
  const autoSave = useCallback((data: Partial<ProjectFormData>) => {
    if (!projectId) return
    const cleaned = mirrorFirstLoad(cleanFormData(data))
    try {
      const updated = updateProject(projectId, cleaned)
      if (updated) {
        setVersionNumber(updated.versionNumber)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    } catch {
      setSaveStatus('idle')
    }
  }, [projectId])

  // Load version on mount if editing
  useEffect(() => {
    if (projectId) {
      const proj = getProject(projectId)
      if (proj) setVersionNumber(proj.versionNumber)
    }
  }, [projectId])

  // Persist on every form change, not just on blur. macOS doesn't shift focus
  // (and so doesn't fire blur) when the user clicks a <button> like a step
  // dot in PersistentHeader — so a blur-only save would leak stale data into
  // Step 2 on step-dot navigation. Saving on every change keeps storage live.
  useEffect(() => {
    if (!projectId) return
    const subscription = watch(values => {
      autoSave(values as Partial<ProjectFormData>)
    })
    return () => subscription.unsubscribe()
  }, [watch, autoSave, projectId])

  const onBlurSave = () => {
    if (!projectId) return
    autoSave(watch())
  }

  const onSubmit: SubmitHandler<ProjectFormData> = (data) => {
    const cleaned = mirrorFirstLoad(cleanFormData(data))
    if (isNew) {
      const created = createProject(cleaned)
      router.push(`/projects/${created.id}/step2`)
    } else if (projectId) {
      autoSave(data)
      router.push(`/projects/${projectId}/step2`)
    }
  }

  const handleContinue = () => {
    const values = getValues()
    const cleaned = mirrorFirstLoad(cleanFormData(values))
    if (isNew) {
      try {
        const created = createProject(cleaned)
        router.push(`/projects/${created.id}/step2`)
      } catch (err) {
        setSaveStatus('idle')
        alert(`Could not save project: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    } else if (projectId) {
      autoSave(values)
      router.push(`/projects/${projectId}/step2`)
    }
  }

  // Display helpers
  const dispW = (lbs?: number | null) =>
    formatImperialForDisplay(lbs ?? null, 'lbs', unitSystem)
  const dispFt = (ft?: number | null) =>
    formatImperialForDisplay(ft ?? null, 'ft', unitSystem)
  const dispIn = (inches?: number | null) =>
    formatImperialForDisplay(inches ?? null, 'in', unitSystem)
  const dispF = (f?: number | null) =>
    formatImperialForDisplay(f ?? null, 'F', unitSystem)

  const wLabel = unitSystem === 'metric' ? 'kg' : 'lbs'
  const dLabel = unitSystem === 'metric' ? 'm' : 'ft'
  const iLabel = unitSystem === 'metric' ? 'mm' : 'in'
  const tLabel = unitSystem === 'metric' ? '°C' : '°F'

  const toggleArrayItem = (fieldName: 'certifications' | 'interlocks', value: string) => {
    const current = fieldName === 'certifications' ? certifications : interlocks
    const next = current.includes(value)
      ? current.filter(x => x !== value)
      : [...current, value]
    setValue(fieldName, next, { shouldDirty: true })
    onBlurSave()
  }

  const toggleCustomDay = (day: string) => {
    const next = operatingDaysCustom.includes(day)
      ? operatingDaysCustom.filter(d => d !== day)
      : [...operatingDaysCustom, day]
    // Canonical Mon→Sun order regardless of click order (PDF joins with ', ').
    next.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
    setValue('operatingDaysCustom', next, { shouldDirty: true })
    onBlurSave()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="page-header">
        <div className="page-title">
          <span className="step-num">Step 01 / 04</span>
          <h1>Application Requirements</h1>
          <div className="desc">
            The first tier is what qualifies vehicles — load, transfer, and environment.
            Sizing &amp; economics feed Steps 3–4; proposal details are optional.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className={`save-status${saveStatus === 'saved' ? ' saved' : ''}`}>
            {saveStatus === 'saved' ? 'Saved ✓' : versionNumber}
          </span>
          <span className="pill neutral">
            <Icon name="info" size={11} />
            {unitSystem === 'metric' ? 'Metric display · imperial stored' : 'Imperial units'}
          </span>
        </div>
      </div>

      <ProgressStrip values={formValues} />

      <div className="form-with-nav">
        <SectionNav values={formValues} />

      <div className="form-stack">

        <TierBand label={TIER_LABELS.qualification} />

        {/* ===== Section 01: What are you moving? — one block per load ===== */}
        <FormSection {...secProps('section-01')}>
          {loadFields.map((lf, i) => {
            const unitType = loadsValues?.[i]?.unitType ?? ''
            const isPalletRow = unitType === 'Standard Pallet'
            return (
              <div className={`step1-load${i > 0 ? ' step1-load-extra' : ''}`} key={lf.id}>
                {loadFields.length > 1 && (
                  <div className="step1-load-head">
                    <span className="step1-load-num mono">Load {i + 1}</span>
                    <button
                      type="button"
                      className="tbtn-icon"
                      aria-label={`Delete load ${i + 1}`}
                      title="Delete load"
                      onClick={() => { removeLoad(i); onBlurSave() }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                )}
                <div className="fld-grid-4">
                  <div className="fld">
                    <label>Max Load Weight {i === 0 && <span className="req">*</span>}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="2000"
                        className="mono"
                        defaultValue={dispW(lf.weightLbs)}
                        {...register(`loads.${i}.weightLbs`, {
                          setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'lbs', unitSystem),
                          onBlur: onBlurSave,
                        })}
                      />
                      <div className="unit">{wLabel}</div>
                    </div>
                  </div>

                  <div className="fld">
                    <label>Unit / Load Type {i === 0 && <span className="req">*</span>}</label>
                    <select
                      {...register(`loads.${i}.unitType`, { onBlur: onBlurSave })}
                      defaultValue={lf.unitType || ''}
                    >
                      <option value="" disabled>Select type…</option>
                      {TYPICAL_UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>

                  {isPalletRow && (
                    <div className="fld">
                      <label>Pallet Subtype</label>
                      <select
                        defaultValue={lf.palletSubtype || ''}
                        onChange={e => {
                          setValue(`loads.${i}.palletSubtype`, e.target.value, { shouldDirty: true })
                          handlePalletSubtype(i, e.target.value)
                        }}
                      >
                        <option value="" disabled>Select subtype…</option>
                        {PALLET_SUBTYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <div className="help">Selects standard dimensions</div>
                    </div>
                  )}

                  {isPalletRow && loadsValues?.[i]?.palletSubtype === 'Custom' && (
                    <div className="fld">
                      <label>Custom Pallet Description</label>
                      <input
                        type="text"
                        placeholder="48×40 double-faced block"
                        {...register(`loads.${i}.customDescription`, { onBlur: onBlurSave })}
                      />
                    </div>
                  )}

                  {unitType === 'Other' && (
                    <div className="fld">
                      <label>Describe Load Type</label>
                      <input
                        type="text"
                        placeholder="Describe your load…"
                        {...register(`loads.${i}.otherDescription`, { onBlur: onBlurSave })}
                      />
                    </div>
                  )}
                </div>

                <div className="fld-row-3" style={{ marginTop: 14 }}>
                  <div className="fld">
                    <label>Load Length ({iLabel})</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="48"
                      className="mono"
                      defaultValue={dispIn(lf.lengthIn)}
                      {...register(`loads.${i}.lengthIn`, {
                        setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'in', unitSystem),
                        onBlur: onBlurSave,
                      })}
                    />
                    <div className="help">Optional — auto-fills from pallet type</div>
                  </div>
                  <div className="fld">
                    <label>Load Width ({iLabel})</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="40"
                      className="mono"
                      defaultValue={dispIn(lf.widthIn)}
                      {...register(`loads.${i}.widthIn`, {
                        setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'in', unitSystem),
                        onBlur: onBlurSave,
                      })}
                    />
                  </div>
                  <div className="fld">
                    <label>Load Height ({iLabel})</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="60"
                      className="mono"
                      defaultValue={dispIn(lf.heightIn)}
                      {...register(`loads.${i}.heightIn`, {
                        setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'in', unitSystem),
                        onBlur: onBlurSave,
                      })}
                    />
                  </div>
                </div>
              </div>
            )
          })}
          {loadFields.length < 4 && (
            <button type="button" className="btn ghost step1-load-add" onClick={addLoadRow}>
              + Add another load type
            </button>
          )}
          {loadFields.length > 1 && (
            <div className="help" style={{ marginTop: 8 }}>
              Each load is qualified separately in Step 2 — a vehicle compatible with some
              (not all) loads shows YELLOW with the compatible loads named.
            </div>
          )}
        </FormSection>

        {/* ===== Section 02: How is it transferred? ===== */}
        <FormSection {...secProps('section-02')}>
          <div className="fld-grid-3">
            <div className="fld">
              <label>Transfer type <span className="req">*</span></label>
              <select
                {...register('transferType', { setValueAs: v => (v === '' ? null : v), onBlur: onBlurSave })}
                defaultValue={initialData?.transferType || ''}
              >
                <option value="" disabled>Select type…</option>
                {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="help">How the load is handled — drives which vehicles qualify in Step 2.</div>
            </div>

            {showTransferHeight && (
              <div className="fld">
                <label>Transfer height ({dLabel})</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    className="mono"
                    defaultValue={dispFt(initialData?.transferHeightFt)}
                    {...register('transferHeightFt', {
                      setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'ft', unitSystem),
                      onBlur: onBlurSave,
                    })}
                  />
                  <div className="unit">{dLabel}</div>
                </div>
                <div className="help">
                  {transferTypeValue === 'forklift'
                    ? 'Height the load is lifted to (e.g. onto racking).'
                    : 'The matched transfer height.'}
                </div>
              </div>
            )}
          </div>
        </FormSection>

        {/* ===== Section 03: Environment & site ===== */}
        <FormSection {...secProps('section-03')}>
          <div className="fld-row-3">
            <div className="fld">
              <label>Min Aisle Width ({dLabel}) <span className="req">*</span></label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="12.0"
                  className="mono"
                  defaultValue={dispFt(initialData?.minAisleWidthFt)}
                  {...register('minAisleWidthFt', {
                    valueAsNumber: true,
                    setValueAs: v => parseImperialInput(String(v), 'ft', unitSystem),
                    onBlur: onBlurSave,
                  })}
                />
                <div className="unit">{dLabel}</div>
              </div>
              <div className="help" style={{ color: 'var(--info)' }}>
                Informational only — doesn’t affect qualification. Engineer verifies on-site.
              </div>
              {errors.minAisleWidthFt && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.minAisleWidthFt.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Min Temperature ({tLabel})</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="1"
                  className="mono"
                  placeholder={unitSystem === 'metric' ? '-20' : '-4'}
                  defaultValue={dispF(initialData?.tempMinF)}
                  {...register('tempMinF', {
                    setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'F', unitSystem),
                    onBlur: onBlurSave,
                  })}
                />
                <div className="unit">{tLabel}</div>
              </div>
            </div>
            <div className="fld">
              <label>Max Temperature ({tLabel})</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="1"
                  className="mono"
                  placeholder={unitSystem === 'metric' ? '40' : '104'}
                  defaultValue={dispF(initialData?.tempMaxF)}
                  {...register('tempMaxF', {
                    setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'F', unitSystem),
                    onBlur: onBlurSave,
                  })}
                />
                <div className="unit">{tLabel}</div>
              </div>
            </div>
          </div>

          <div className="fld-grid-4" style={{ marginTop: 14 }}>
            <div className="fld">
              <label>Operating Environment</label>
              <Controller
                name="outdoorRequired"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => { field.onChange(false); onBlurSave() }}>Indoor</button>
                    <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => { field.onChange(true); onBlurSave() }}>Outdoor</button>
                  </div>
                )}
              />
              <div className="help">Outdoor red-flags vehicles not rated for it</div>
            </div>
            <div className="fld">
              <label>Temperature Environment</label>
              <Controller
                name="temperatureEnvironment"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    {(['ambient', 'refrigerated', 'freezer'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`seg-btn${field.value === opt ? ' on' : ''}`}
                        onClick={() => { field.onChange(opt); onBlurSave() }}
                      >
                        {opt === 'ambient' ? 'Ambient' : opt === 'refrigerated' ? 'Refrigerated' : 'Freezer'}
                      </button>
                    ))}
                  </div>
                )}
              />
              <div className="help">Refrigerated = review (yellow) · Freezer = required (red)</div>
            </div>
            <div className="fld">
              <label>Ramps on Site?</label>
              <Controller
                name="rampRequired"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => { field.onChange(false); onBlurSave() }}>No</button>
                    <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => { field.onChange(true); onBlurSave() }}>Yes</button>
                  </div>
                )}
              />
              <div className="help">Any ramp on site is a YELLOW review</div>
            </div>
            {rampRequired && (
              <>
                <div className="fld">
                  <label>Max Ramp Grade</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="30"
                      className="mono"
                      placeholder="0"
                      {...register('maxRampGrade', { valueAsNumber: true, onBlur: onBlurSave })}
                    />
                    <div className="unit">%</div>
                  </div>
                </div>
                <div className="fld">
                  <label>Ramp Distance ({dLabel})</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="mono"
                      placeholder="0"
                      defaultValue={dispFt(initialData?.rampDistanceFt)}
                      {...register('rampDistanceFt', {
                        valueAsNumber: true,
                        setValueAs: v => parseImperialInput(String(v), 'ft', unitSystem),
                        onBlur: onBlurSave,
                      })}
                    />
                    <div className="unit">{dLabel}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* ===== Section 04: Certifications ===== */}
        <FormSection {...secProps('section-04')}>
          <div className="fld-grid-4">
            <div className="fld span-4">
              <label>Required Certifications</label>
              <div className="cert-grid">
                {CERTIFICATIONS.map(cert => {
                  const on = certifications.includes(cert)
                  return (
                    <label
                      key={cert}
                      className={`chk${on ? ' on' : ''}`}
                    >
                      {/* Toggle on the input's change event only — an onClick on the
                          label fires twice per user click (the label forwards a second
                          click to its inner checkbox), which can re-toggle the value. */}
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleArrayItem('certifications', cert)}
                      />
                      <span className="box">
                        {on && <Icon name="check" size={10} />}
                      </span>
                      <span>{cert}</span>
                    </label>
                  )
                })}
              </div>
              <div className="help">
                Selected certifications are matched in Step 2 — vehicles missing them are flagged YELLOW for review
              </div>
            </div>
          </div>
        </FormSection>

        <TierBand label={TIER_LABELS.sizing} />

        {/* ===== Section 05: Operating schedule ===== */}
        <FormSection {...secProps('section-05')}>
          <div className="fld-row-3">
            <div className="fld">
              <label>Shifts per Day <span className="req">*</span></label>
              <input
                type="number"
                min="1"
                max="3"
                className="mono"
                placeholder="2"
                {...register('shiftsPerDay', { valueAsNumber: true, onBlur: onBlurSave })}
              />
              <div className="help">Integer, 1–3</div>
              {errors.shiftsPerDay && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.shiftsPerDay.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Hours per Shift <span className="req">*</span></label>
              <input
                type="number"
                min="4"
                max="12"
                step="0.5"
                className="mono"
                placeholder="8"
                {...register('hoursPerShift', { valueAsNumber: true, onBlur: onBlurSave })}
              />
              <div className="help">4–12, decimal OK (e.g. 8.5)</div>
            </div>

            <div className="fld">
              <label>Op. Hours / Day</label>
              <input
                readOnly
                className="mono"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--text-tertiary)' }}
                value={shiftsPerDay && hoursPerShift ? `${(shiftsPerDay * hoursPerShift).toFixed(1)} hr/day` : '—'}
              />
              <div className="help">Auto: shifts × hours</div>
            </div>
          </div>

          <div className="fld-row-3">
            <div className="fld">
              <label>Operating Days Pattern <span className="req">*</span></label>
              <Controller
                name="operatingDaysPattern"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    {['Mon–Fri', 'Mon–Sat', 'Mon–Sun', 'Custom'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`seg-btn${field.value === opt ? ' on' : ''}`}
                        onClick={() => { field.onChange(opt); onBlurSave() }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              />
              {operatingDaysPattern === 'Custom' && (
                <div className="cert-grid" style={{ marginTop: 8 }}>
                  {WEEKDAYS.map(day => {
                    const on = operatingDaysCustom.includes(day)
                    return (
                      <label key={day} className={`chk${on ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleCustomDay(day)}
                        />
                        <span className="box">
                          {on && <Icon name="check" size={10} />}
                        </span>
                        <span>{day}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="fld">
              <label>Breaks per Shift</label>
              <input
                type="number"
                min="0"
                max="4"
                className="mono"
                placeholder="1"
                {...register('breaksPerShift', { valueAsNumber: true, onBlur: onBlurSave })}
              />
            </div>

            <div className="fld">
              <label>Break Duration (min)</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="60"
                  className="mono"
                  placeholder="30"
                  {...register('breakDurationMin', { valueAsNumber: true, onBlur: onBlurSave })}
                />
                <div className="unit">min</div>
              </div>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 06: Throughput & distance — the same flows Step 3 sizes ===== */}
        <FormSection {...secProps('section-06')}>
          {flowFields.length > 0 && (
            <div className="step1-flows">
              {flowFields.map((f, i) => (
                <div className="step1-flow-row" key={f.id}>
                  <div className="fld">
                    <label>Origin</label>
                    <input
                      type="text"
                      placeholder="Dock A"
                      {...register(`flows.${i}.origin`, { onBlur: onBlurSave })}
                    />
                  </div>
                  <div className="fld">
                    <label>Destination</label>
                    <input
                      type="text"
                      placeholder="Storage 1"
                      {...register(`flows.${i}.destination`, { onBlur: onBlurSave })}
                    />
                  </div>
                  <div className="fld">
                    <label>Distance ({dLabel})</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="mono"
                        placeholder="200"
                        defaultValue={dispFt(f.distanceFt)}
                        {...register(`flows.${i}.distanceFt`, {
                          setValueAs: v => v === '' ? 0 : parseImperialInput(String(v), 'ft', unitSystem),
                          onBlur: onBlurSave,
                        })}
                      />
                      <div className="unit">{dLabel}</div>
                    </div>
                    <div className="help">One-way — the cycle adds the return leg</div>
                  </div>
                  <div className="fld">
                    <label>Throughput (peak)</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="mono"
                        placeholder="60"
                        {...register(`flows.${i}.thruPerHr`, { valueAsNumber: true, onBlur: onBlurSave })}
                      />
                      <div className="unit">moves/hr</div>
                    </div>
                  </div>
                  <div className="step1-flow-actions">
                    <button
                      type="button"
                      className="tbtn-icon"
                      aria-label="Duplicate flow"
                      title="Duplicate flow"
                      onClick={() => duplicateFlowRow(i)}
                    >
                      <Icon name="copy" size={13} />
                    </button>
                    <button
                      type="button"
                      className="tbtn-icon"
                      aria-label="Delete flow"
                      title="Delete flow"
                      onClick={() => { removeFlow(i); onBlurSave() }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn ghost step1-flow-add" onClick={addFlowRow}>
            + Add flow
          </button>
          <div className="help" style={{ marginTop: 8 }}>
            Material flows — one row per origin → destination movement. These are the same
            flows the Fleet Engine sizes in Step 3; vehicles are assigned there, never here.
            Throughput is peak capacity, not average.
          </div>
        </FormSection>

        {/* ===== Section 07: Labor ===== */}
        <FormSection {...secProps('section-07')}>
          <div className="fld-grid-4">
            <div className="fld">
              <label>Operators per Shift</label>
              <input
                type="number"
                min="0"
                className="mono"
                placeholder="3"
                {...register('operatorsPerShift', { valueAsNumber: true, onBlur: onBlurSave })}
              />
              <div className="help">Used for labor ROI calculation (optional)</div>
            </div>
            <div className="fld">
              <label>Fully-burdened rate / operator</label>
              <div className="fld-money">
                <span className="fld-money-sym" aria-hidden>$</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className="mono"
                  placeholder="65,000"
                  {...register('fullyBurdenedRateUsdPerYear', { valueAsNumber: true, onBlur: onBlurSave })}
                />
              </div>
              <div className="help">$/yr all-in (wage + benefits + overhead). Feeds Step 4 payback (default $65,000).</div>
            </div>
          </div>
        </FormSection>

        <TierBand label={TIER_LABELS.proposal} hint="Feeds the proposal PDF — pricing fields arrive in a future revision" />

        {/* ===== Section 08: Site details ===== */}
        <FormSection {...secProps('section-08')}>
          <div className="fld-grid-3">
            <div className="fld">
              <label>Floor Condition</label>
              <select
                {...register('floorCondition', { onBlur: onBlurSave })}
                defaultValue={initialData?.floorCondition || ''}
              >
                <option value="" disabled>Select condition…</option>
                {FLOOR_CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Dust / Moisture</label>
              <select
                {...register('dustMoisture', { onBlur: onBlurSave })}
                defaultValue={initialData?.dustMoisture || ''}
              >
                <option value="">None</option>
                {DUST_MOISTURE_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 09: Integration ===== */}
        <FormSection {...secProps('section-09')}>
          <div className="fld-grid-4">
            <div className="fld span-4">
              <label>Required Interlocks</label>
              <div className="cert-grid">
                {INTERLOCKS.map(item => {
                  const on = interlocks.includes(item)
                  return (
                    <label
                      key={item}
                      className={`chk${on ? ' on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleArrayItem('interlocks', item)}
                      />
                      <span className="box">
                        {on && <Icon name="check" size={10} />}
                      </span>
                      <span>{item}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="fld">
              <label>Other AGVs on Site?</label>
              <Controller
                name="otherAGVs"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button
                      type="button"
                      className={`seg-btn${field.value ? ' on' : ''}`}
                      onClick={() => { field.onChange(true); onBlurSave() }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${!field.value ? ' on' : ''}`}
                      onClick={() => { field.onChange(false); onBlurSave() }}
                    >
                      No
                    </button>
                  </div>
                )}
              />
            </div>

            {otherAGVs && (
              <div className="fld">
                <label>Other AGV Vendor(s)</label>
                <input
                  type="text"
                  placeholder="e.g. Linde, Jungheinrich"
                  {...register('otherAGVVendor', { onBlur: onBlurSave })}
                />
              </div>
            )}

            <div className="fld">
              <label>WMS Required?</label>
              <Controller
                name="wmsRequired"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value ? ' on' : ''}`} onClick={() => { field.onChange(true); onBlurSave() }}>Yes</button>
                    <button type="button" className={`seg-btn${!field.value ? ' on' : ''}`} onClick={() => { field.onChange(false); onBlurSave() }}>No</button>
                  </div>
                )}
              />
            </div>
            {wmsRequired && (
              <div className="fld">
                <label>WMS Vendor / System</label>
                <input
                  type="text"
                  placeholder="e.g. Manhattan, SAP EWM"
                  {...register('wmsVendor', { onBlur: onBlurSave })}
                />
              </div>
            )}
          </div>
        </FormSection>

        {/* ===== Section 10: Dealer & contact ===== */}
        <FormSection {...secProps('section-10')}>
          <div className="fld-grid-4">
            <div className="fld">
              <label>Facility Location</label>
              <input
                type="text"
                placeholder="e.g. Phoenix, AZ"
                {...register('facilityLocation', { onBlur: onBlurSave })}
              />
            </div>
            <div className="fld">
              <label>TAL Engineer</label>
              <input
                type="text"
                placeholder="e.g. M. Rodriguez"
                {...register('bastianRep', { onBlur: onBlurSave })}
              />
            </div>
            <div className="fld">
              <label>Proposal Date</label>
              <input
                type="date"
                className="mono"
                value={toDateInput(proposalDate)}
                onChange={e => {
                  const v = e.target.value
                  const iso = v ? new Date(v + 'T00:00:00').toISOString() : new Date().toISOString()
                  setProposalDate(iso)
                  if (projectId) updateProject(projectId, {}, { createdAt: iso })
                }}
              />
              <div className="help">Used on customer-facing proposal output</div>
            </div>
          </div>

          <div className="fld-grid-4" style={{ marginTop: 14 }}>
            <div className="fld">
              <label>OEM Dealer</label>
              <Controller
                name="oemDealer"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    {['Raymond', 'Toyota', 'Direct'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`seg-btn${field.value === opt ? ' on' : ''}`}
                        onClick={() => { field.onChange(field.value === opt ? '' : opt); onBlurSave() }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
            {oemDealer && oemDealer !== 'Direct' && (
              <>
                <div className="fld">
                  <label>Dealership Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Empire Forklift"
                    {...register('dealershipName', { onBlur: onBlurSave })}
                  />
                </div>
                <div className="fld">
                  <label>Dealer Representative</label>
                  <input
                    type="text"
                    placeholder="e.g. J. Smith"
                    {...register('dealerRep', { onBlur: onBlurSave })}
                  />
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* ===== Section 11: Timeline ===== */}
        <FormSection {...secProps('section-11')}>
          <div className="fld-grid-4">
            <div className="fld">
              <label>Desired Install Date</label>
              <input
                type="date"
                className="mono"
                defaultValue={initialData?.desiredInstallDate || ''}
                {...register('desiredInstallDate', { onBlur: onBlurSave })}
              />
              <div className="help">Customer&apos;s target go-live date</div>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 12: Project notes ===== */}
        <FormSection {...secProps('section-12')}>
          <div className="fld-grid-4">
            <div className="fld span-4">
              <label>Notes</label>
              <textarea
                rows={4}
                placeholder="Any additional context, constraints, or notes about this project…"
                {...register('projectNotes', { onBlur: onBlurSave })}
              />
              <div className="help">Visible to all steps. Not included in automated qualification.</div>
            </div>
          </div>
        </FormSection>

      </div>
      </div>{/* /form-with-nav */}

      {/* Step navigation */}
      <div className="step-nav">
        <button type="button" className="btn ghost" onClick={() => router.push('/')}>
          <Icon name="arrowL" size={13} /> Back to Projects
        </button>
        <div className="row">
          <span className="hint">Fill in any fields you have — you can return to complete later</span>
          <button
            type="button"
            className="btn primary"
            onClick={handleContinue}
          >
            Continue to Vehicles <Icon name="arrowR" size={13} />
          </button>
        </div>
      </div>
    </form>
  )
}
