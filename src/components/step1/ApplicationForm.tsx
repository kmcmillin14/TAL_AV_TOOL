'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import FormSection from './FormSection'
import Icon from '@/src/design-system/components/Icon'
import { projectSchema, type ProjectFormData } from '@/src/lib/validations/schemas'
import { formatImperialForDisplay, parseImperialInput, type UnitSystem } from '@/src/lib/utils/units'
import { createProject, updateProject, getProject } from '@/src/lib/storage'
import { deliveryPatternRequiresLift } from '@/src/calc/trafficLight'
import { TRANSFER_METHODS, TYPICAL_UNIT_TYPES } from '@/src/lib/constants/enums'
import { FORM_SECTIONS, sectionStatus } from '@/src/lib/constants/sections'
import SectionNav from './SectionNav'
import ProgressStrip from './ProgressStrip'



// Pallet dimension auto-fill (stored in inches)
const PALLET_AUTOFILL: Record<string, { l: number; w: number; h: number }> = {
  GMA:  { l: 48, w: 40, h: 5.7 },
  Euro: { l: 47.2, w: 31.5, h: 5.7 },
  CHEP: { l: 45.9, w: 45.9, h: 5.9 },
}

const PALLET_SUBTYPES = ['GMA (48×40)', 'Euro (47.2×31.5)', 'CHEP (45.9×45.9)', 'Custom']
const DELIVERY_PATTERNS = ['Floor-Floor', 'Floor-Height', 'Height-Floor', 'Height-Height', 'Conveyor-Conveyor']
const FLOOR_CONDITIONS = ['Smooth', 'Standard', 'Rough']
const CERTIFICATIONS = ['ISO 3691-4', 'ANSI B56.5', 'RIA R15.08', 'Cleanroom', 'Food Grade', 'ATEX', 'IECEx', 'VDA 5050']
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']
const DUST_MOISTURE_OPTS = ['None', 'Dusty environment', 'Wash-down required', 'High humidity', 'Outdoor exposure']

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

// Empty strings and NaN mean "the user cleared this field". Keep the key with
// `undefined` so the spread merge in updateProject removes the prior value
// (JSON.stringify drops undefined keys). Dropping the entry instead, as the
// previous code did, left ghost values in storage that Step 2 kept qualifying
// against.
function cleanFormData(data: Partial<ProjectFormData>): Partial<ProjectFormData> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      if (typeof v === 'number' && Number.isNaN(v)) return [k, undefined]
      if (v === '') return [k, undefined]
      return [k, v]
    })
  ) as Partial<ProjectFormData>
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
      outdoorRequired: initialData?.outdoorRequired ?? false,
      freezerCapable: initialData?.freezerCapable ?? false,
      wmsRequired: initialData?.wmsRequired ?? false,
      distanceType: initialData?.distanceType ?? 'one_way',
    },
  })

  const formValues = watch()
  const typicalUnitType = watch('typicalUnitType')
  const deliveryPattern = watch('deliveryPattern')
  const oemDealer = watch('oemDealer')
  const otherAGVs = watch('otherAGVs')
  const wmsRequired = watch('wmsRequired')
  const certifications = watch('certifications') || []
  const interlocks = watch('interlocks') || []
  const shiftsPerDay = watch('shiftsPerDay')
  const hoursPerShift = watch('hoursPerShift')

  const requiresLift = deliveryPatternRequiresLift(deliveryPattern)

  const isPallet = typicalUnitType === 'Standard Pallet'

  // Pallet subtype auto-fill
  const handlePalletSubtype = (subtype: string) => {
    const key = subtype.split(' ')[0] as keyof typeof PALLET_AUTOFILL
    if (PALLET_AUTOFILL[key]) {
      const d = PALLET_AUTOFILL[key]
      setValue('loadLengthIn', d.l, { shouldDirty: true })
      setValue('loadWidthIn', d.w, { shouldDirty: true })
      setValue('loadHeightIn', d.h, { shouldDirty: true })
    }
  }

  // Save synchronously on blur. The previous 2-second debounce raced router
  // navigation: clicking Continue scheduled the write, then router.push ran
  // immediately, so Step 2 mounted and read storage before the timer fired.
  const autoSave = useCallback((data: Partial<ProjectFormData>) => {
    if (!projectId) return
    const cleaned = cleanFormData(data)
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
    const cleaned = cleanFormData(data)
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
    const cleaned = cleanFormData(values)
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

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="page-header">
        <div className="page-title">
          <span className="step-num">Step 01 / 04</span>
          <h1>Application Requirements</h1>
          <div className="desc">
            Start with the essentials — load, transfer, schedule, and throughput. Expand the
            other sections for site, ramps, certifications, environment, and integration details.
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

        {/* ===== Section 1: What are you moving? ===== */}
        <FormSection
          sectionNum="01"
          title="What are you moving?"
          id={FORM_SECTIONS[0].id}
          status={sectionStatus(FORM_SECTIONS[0], formValues)}
        >
          <div className="fld-grid-4">
            <div className="fld">
              <label>Max Load Weight <span className="req">*</span></label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="2000"
                  className="mono"
                  defaultValue={dispW(initialData?.maxLoadWeightLbs)}
                  {...register('maxLoadWeightLbs', {
                    valueAsNumber: true,
                    setValueAs: v => parseImperialInput(String(v), 'lbs', unitSystem),
                    onBlur: onBlurSave,
                  })}
                />
                <div className="unit">{wLabel}</div>
              </div>
              {errors.maxLoadWeightLbs && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.maxLoadWeightLbs.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Unit / Load Type <span className="req">*</span></label>
              <select
                {...register('typicalUnitType', { onBlur: onBlurSave })}
                defaultValue={initialData?.typicalUnitType || ''}
              >
                <option value="" disabled>Select type…</option>
                {TYPICAL_UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {isPallet && (
              <div className="fld">
                <label>Pallet Subtype</label>
                <select
                  defaultValue={initialData?.palletBottomBoard || ''}
                  onChange={e => {
                    setValue('palletBottomBoard', e.target.value)
                    handlePalletSubtype(e.target.value)
                    onBlurSave()
                  }}
                >
                  <option value="" disabled>Select subtype…</option>
                  {PALLET_SUBTYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <div className="help">Selects standard dimensions</div>
              </div>
            )}

            {isPallet && watch('palletBottomBoard') === 'Custom' && (
              <div className="fld">
                <label>Custom Pallet Description</label>
                <input
                  type="text"
                  placeholder="48×40 double-faced block"
                  {...register('customPalletDescription', { onBlur: onBlurSave })}
                />
              </div>
            )}

            {typicalUnitType === 'Other' && (
              <div className="fld">
                <label>Describe Load Type</label>
                <input
                  type="text"
                  placeholder="Describe your load…"
                  {...register('otherUnitTypeDescription', { onBlur: onBlurSave })}
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
                defaultValue={dispIn(initialData?.loadLengthIn)}
                {...register('loadLengthIn', {
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
                defaultValue={dispIn(initialData?.loadWidthIn)}
                {...register('loadWidthIn', {
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
                defaultValue={dispIn(initialData?.loadHeightIn)}
                {...register('loadHeightIn', {
                  setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'in', unitSystem),
                  onBlur: onBlurSave,
                })}
              />
            </div>
          </div>
        </FormSection>

        {/* ===== Section 2: How is it transferred? ===== */}
        <FormSection
          sectionNum="02"
          title="How is it transferred?"
          id={FORM_SECTIONS[1].id}
          status={sectionStatus(FORM_SECTIONS[1], formValues)}
        >
          <div className="fld-grid-3">
            <div className="fld">
              <label>Transfer Method <span className="req">*</span></label>
              <select
                {...register('transferMethod', { onBlur: onBlurSave })}
                defaultValue={initialData?.transferMethod || ''}
              >
                <option value="" disabled>Select method…</option>
                {TRANSFER_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
              {errors.transferMethod && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.transferMethod.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Delivery Pattern <span className="req">*</span></label>
              <select
                {...register('deliveryPattern', { onBlur: onBlurSave })}
                defaultValue={initialData?.deliveryPattern || ''}
              >
                <option value="" disabled>Select pattern…</option>
                {DELIVERY_PATTERNS.map(p => <option key={p}>{p}</option>)}
              </select>
              <div className="help">e.g., Floor-Height = pick from floor, drop on rack</div>
            </div>

            {requiresLift && (
              <div className="fld">
                <label>Max Lift Height ({dLabel}) <span className="req">*</span></label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="14.7"
                    className="mono"
                    defaultValue={dispFt(initialData?.maxLiftHeightFt)}
                    {...register('maxLiftHeightFt', {
                      setValueAs: v => v === '' ? null : parseImperialInput(String(v), 'ft', unitSystem),
                      onBlur: onBlurSave,
                    })}
                  />
                  <div className="unit">{dLabel}</div>
                </div>
                <div className="help" style={{ color: 'var(--warn)' }}>
                  No tolerance — vehicle must meet or exceed this exactly
                </div>
              </div>
            )}
          </div>
        </FormSection>

        {/* ===== Section 3: Where does it operate? ===== */}
        <FormSection
          sectionNum="03"
          title="Where does it operate?"
          id={FORM_SECTIONS[2].id}
          status={sectionStatus(FORM_SECTIONS[2], formValues)}
          defaultOpen={false}
        >
          <div className="fld-grid-3">
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
                Informational only — not a hard gate. Engineer verifies on-site.
              </div>
              {errors.minAisleWidthFt && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.minAisleWidthFt.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Floor Condition <span className="req">*</span></label>
              <select
                {...register('floorCondition', { onBlur: onBlurSave })}
                defaultValue={initialData?.floorCondition || ''}
              >
                <option value="" disabled>Select condition…</option>
                {FLOOR_CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 4: Operating Schedule ===== */}
        <FormSection
          sectionNum="04"
          title="Operating Schedule"
          id={FORM_SECTIONS[3].id}
          status={sectionStatus(FORM_SECTIONS[3], formValues)}
        >
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

        {/* ===== Section 5: Throughput & Distance ===== */}
        <FormSection
          sectionNum="05"
          title="Throughput &amp; Distance"
          id={FORM_SECTIONS[4].id}
          status={sectionStatus(FORM_SECTIONS[4], formValues)}
        >
          <div className="fld-row-3">
            <div className="fld">
              <label>Required Throughput (peak) <span className="req">*</span></label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="1"
                  className="mono"
                  placeholder="60"
                  {...register('requiredThroughputPerHour', { valueAsNumber: true, onBlur: onBlurSave })}
                />
                <div className="unit">moves/hr</div>
              </div>
              <div className="help" style={{ color: 'var(--warn)' }}>
                Peak capacity — NOT average. Size for worst case.
              </div>
              {errors.requiredThroughputPerHour && (
                <div className="help" style={{ color: 'var(--bad)' }}>{errors.requiredThroughputPerHour.message}</div>
              )}
            </div>

            <div className="fld">
              <label>Average Travel Distance ({dLabel}) <span className="req">*</span></label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="1"
                  min="1"
                  className="mono"
                  placeholder="200"
                  defaultValue={dispFt(initialData?.avgDistanceFt)}
                  {...register('avgDistanceFt', {
                    valueAsNumber: true,
                    setValueAs: v => parseImperialInput(String(v), 'ft', unitSystem),
                    onBlur: onBlurSave,
                  })}
                />
                <div className="unit">{dLabel}</div>
              </div>
            </div>

            <div className="fld">
              <label>Distance Type <span className="req">*</span></label>
              <Controller
                name="distanceType"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button
                      type="button"
                      className={`seg-btn${field.value === 'one_way' ? ' on' : ''}`}
                      onClick={() => { field.onChange('one_way'); onBlurSave() }}
                    >
                      One-Way
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${field.value === 'round_trip' ? ' on' : ''}`}
                      onClick={() => { field.onChange('round_trip'); onBlurSave() }}
                    >
                      Round-Trip
                    </button>
                  </div>
                )}
              />
              <div className="help">Is the distance one direction or both legs?</div>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 6: Labor & ROI ===== */}
        <FormSection
          sectionNum="06"
          title="Labor &amp; ROI"
          id={FORM_SECTIONS[5].id}
          status={sectionStatus(FORM_SECTIONS[5], formValues)}
          defaultOpen={false}
        >
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
          </div>
        </FormSection>

        {/* ===== Section 7: Ramps & Inclines ===== */}
        <FormSection
          sectionNum="07"
          title="Ramps &amp; Inclines"
          id={FORM_SECTIONS[6].id}
          status={sectionStatus(FORM_SECTIONS[6], formValues)}
          defaultOpen={false}
        >
          <div className="fld-grid-4">
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
              <div className="help">0 if no ramps in the application</div>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 8: Dealer & Contact ===== */}
        <FormSection
          sectionNum="08"
          title="Dealer &amp; Contact"
          id={FORM_SECTIONS[7].id}
          status={sectionStatus(FORM_SECTIONS[7], formValues)}
          defaultOpen={false}
        >
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

        {/* ===== Section 9: Certifications ===== */}
        <FormSection
          sectionNum="09"
          title="Certifications &amp; Compliance"
          id={FORM_SECTIONS[8].id}
          status={sectionStatus(FORM_SECTIONS[8], formValues)}
          defaultOpen={false}
        >
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
                      onClick={() => toggleArrayItem('certifications', cert)}
                    >
                      <input type="checkbox" readOnly checked={on} />
                      <span className="box">
                        {on && <Icon name="check" size={10} />}
                      </span>
                      <span>{cert}</span>
                    </label>
                  )
                })}
              </div>
              <div className="help">
                Selected certifications become hard gates — vehicles missing them will be RED
              </div>
            </div>
          </div>
        </FormSection>

        {/* ===== Section 10: Equipment Integration ===== */}
        <FormSection
          sectionNum="10"
          title="Equipment Integration"
          id={FORM_SECTIONS[9].id}
          status={sectionStatus(FORM_SECTIONS[9], formValues)}
          defaultOpen={false}
        >
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
                      onClick={() => toggleArrayItem('interlocks', item)}
                    >
                      <input type="checkbox" readOnly checked={on} />
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
          </div>
        </FormSection>

        {/* ===== Section 11: Environment (collapsed) ===== */}
        <FormSection
          sectionNum="11"
          title="Environment"
          id={FORM_SECTIONS[10].id}
          status={sectionStatus(FORM_SECTIONS[10], formValues)}
          collapsible
          defaultOpen={false}
        >
          <div className="fld-row-3">
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
          <div className="fld-grid-4" style={{ marginTop: 14 }}>
            <div className="fld">
              <label>Outdoor Required?</label>
              <Controller
                name="outdoorRequired"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value ? ' on' : ''}`} onClick={() => { field.onChange(true); onBlurSave() }}>Yes</button>
                    <button type="button" className={`seg-btn${!field.value ? ' on' : ''}`} onClick={() => { field.onChange(false); onBlurSave() }}>No</button>
                  </div>
                )}
              />
            </div>
            <div className="fld">
              <label>Freezer Capable?</label>
              <Controller
                name="freezerCapable"
                control={control}
                render={({ field }) => (
                  <div className="seg-toggle">
                    <button type="button" className={`seg-btn${field.value ? ' on' : ''}`} onClick={() => { field.onChange(true); onBlurSave() }}>Yes</button>
                    <button type="button" className={`seg-btn${!field.value ? ' on' : ''}`} onClick={() => { field.onChange(false); onBlurSave() }}>No</button>
                  </div>
                )}
              />
            </div>
          </div>
        </FormSection>

        {/* ===== Section 12: Software (collapsed) ===== */}
        <FormSection
          sectionNum="12"
          title="Software Integration"
          id={FORM_SECTIONS[11].id}
          status={sectionStatus(FORM_SECTIONS[11], formValues)}
          collapsible
          defaultOpen={false}
        >
          <div className="fld-grid-4">
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

        {/* ===== Section 13: Project Notes (always visible) ===== */}
        <FormSection
          sectionNum="13"
          title="Project Notes"
          id={FORM_SECTIONS[12].id}
          status={sectionStatus(FORM_SECTIONS[12], formValues)}
          defaultOpen={false}
        >
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
