'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm, Controller, type SubmitHandler, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import FormSection from '@/src/components/step1/FormSection'
import Icon from '@/src/design-system/components/Icon'
import {
  partialProjectSchema, projectSchema, type PartialProjectFormData,
} from '@/src/lib/validations/schemas'
import {
  TYPICAL_UNIT_TYPES, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS,
  SPECIALTY_APPLICATIONS, PROJECT_DRIVERS,
} from '@/src/lib/constants/enums'
import { downloadQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
import { questionnaireJsonBlob } from '@/src/lib/questionnaire/questionnaireExport'

const DRAFT_KEY = 'tal:questionnaire-draft'

// Local display lists — mirror the constants in ApplicationForm (kept local to
// avoid coupling the standalone questionnaire to Step 1 internals).
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']
const FLOOR_CONDITIONS = ['Smooth', 'Standard', 'Rough']
const DUST_MOISTURE_OPTS = ['None', 'Dusty environment', 'Wash-down required', 'High humidity', 'Outdoor exposure']
const OPERATING_DAYS = ['Mon–Fri', 'Mon–Sat', 'Mon–Sun', 'Custom']
const HEIGHT_TRANSFER = new Set(TRANSFER_TYPE_OPTIONS.filter(o => o.needsHeight).map(o => o.value))

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

// Friendly labels for the rare validation block (range-constrained fields).
const FIELD_LABELS: Record<string, string> = {
  shiftsPerDay: 'Shifts / day (1–3)',
  hoursPerShift: 'Hours / shift (4–12)',
  requiredThroughputPerHour: 'Required throughput (whole moves/hr)',
  breaksPerShift: 'Breaks / shift',
  breakDurationMin: 'Break duration',
}

function TierBand({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="form-tier-band">
      <span className="form-tier-label">{label}</span>
      {hint && <span className="form-tier-hint">{hint}</span>}
    </div>
  )
}

export default function QuestionnaireForm() {
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null)
  const { register, handleSubmit, control, reset, getValues, watch } = useForm<PartialProjectFormData>({
    resolver: zodResolver(projectSchema) as Resolver<PartialProjectFormData>,
    defaultValues: { projectDrivers: [], specialtyApplications: [], certifications: [], interlocks: [] },
  })

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

  // Branch flags (progressive disclosure).
  const isRfq = watch('isRfq')
  const cadAvailable = watch('cadAvailable')
  const budgetStatus = watch('budgetStatus')
  const transferType = watch('transferType')
  const networkReady = watch('networkReady')
  const wmsRequired = watch('wmsRequired')
  const unitType = watch('typicalUnitType')
  const showHeight = !!transferType && HEIGHT_TRANSFER.has(transferType)

  const onSubmit: SubmitHandler<PartialProjectFormData> = useCallback(async (values) => {
    setInvalidMsg(null); setBusy(true)
    try {
      await downloadQuestionnairePdf(values)
      setSubmitted(true)
    } finally { setBusy(false) }
  }, [])

  const onInvalid = useCallback((errors: Record<string, unknown>) => {
    setSubmitted(false)
    const names = Object.keys(errors).map(k => FIELD_LABELS[k] ?? k)
    setInvalidMsg(`Please check these fields: ${names.join(', ')}`)
  }, [])

  const downloadJson = useCallback(() => {
    const blob = questionnaireJsonBlob(getValues())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'questionnaire.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getValues])

  // Reusable chip multiselect (matches Step 1's .cert-grid / .chk).
  const Chips = ({ name, options }: { name: 'projectDrivers' | 'specialtyApplications' | 'certifications' | 'interlocks'; options: readonly string[] }) => (
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

  // Reusable No/Yes segmented toggle for a tri-state boolean.
  const YesNo = ({ name }: { name: 'isRfq' | 'cadAvailable' | 'networkReady' | 'siteWalkthroughAvailable' | 'wmsRequired' }) => (
    <Controller control={control} name={name} render={({ field }) => (
      <div className="seg-toggle">
        <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => field.onChange(false)}>No</button>
        <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => field.onChange(true)}>Yes</button>
      </div>
    )} />
  )

  return (
    <form className="workspace" onSubmit={handleSubmit(onSubmit, onInvalid)}>
      <div className="page-header">
        <div className="page-title">
          <span className="step-num">Customer Questionnaire</span>
          <h1>Tell us about your application</h1>
          <div className="desc">
            Fill in what you know — nothing is required. When you’re done, download the PDF and
            send it to your TAL engineer; it carries everything needed to size your fleet.
          </div>
        </div>
      </div>

      <TierBand label="Opportunity" hint="Who you are and where this stands" />

      <FormSection sectionNum="01" title="Your company & contact">
        <div className="fld-grid-3">
          <div className="fld"><label>Customer / company</label><input {...register('customerName')} /></div>
          <div className="fld"><label>Facility location</label><input {...register('facilityLocation')} placeholder="City, State" /></div>
          <div className="fld"><label>Your name</label><input {...register('customerContactName')} /></div>
          <div className="fld"><label>Your role</label><input {...register('customerContactRole')} /></div>
          <div className="fld"><label>Email</label><input type="email" {...register('customerContactEmail')} /></div>
          <div className="fld"><label>Phone</label><input {...register('customerContactPhone')} /></div>
          <div className="fld"><label>TAL representative</label><input {...register('talRepName')} /></div>
          <div className="fld"><label>TAL email</label><input type="email" {...register('talRepEmail')} /></div>
          <div className="fld"><label>TAL phone</label><input {...register('talRepPhone')} /></div>
          <div className="fld"><label>Dealer / OEM</label><input {...register('oemDealer')} /></div>
          <div className="fld"><label>Dealership name</label><input {...register('dealershipName')} /></div>
          <div className="fld"><label>Dealer rep</label><input {...register('dealerRep')} /></div>
        </div>
      </FormSection>

      <FormSection sectionNum="02" title="The opportunity">
        <div className="fld-grid-3">
          <div className="fld"><label>Project / opportunity name</label><input {...register('projectName')} /></div>
          <div className="fld"><label>Vehicle in mind</label><input {...register('vehicleInMind')} placeholder="Optional" /></div>
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
          <div className="fld"><label>Is there an RFQ?</label><YesNo name="isRfq" /></div>
          {isRfq && <div className="fld"><label>RFQ number</label><input {...register('rfqNumber')} /></div>}
          {isRfq && <div className="fld"><label>RFQ due date</label><input type="date" {...register('rfqDueDate')} /></div>}
          <div className="fld">
            <label>Budget status</label>
            <select {...register('budgetStatus', { setValueAs: emptyToUndef })} defaultValue="">
              <option value="">Select…</option>
              <option value="budgetary">Budgetary</option>
              <option value="firm">Firm</option>
              <option value="allocated">Allocated</option>
            </select>
          </div>
          {budgetStatus && <div className="fld"><label>Budget range</label><input {...register('budgetRange')} placeholder="$1–2M" /></div>}
          <div className="fld"><label>Decision date</label><input type="date" {...register('decisionDate')} /></div>
          <div className="fld"><label>Target go-live</label><input type="date" {...register('targetGoLiveDate')} /></div>
          <div className="fld"><label>CAD / drawings available?</label><YesNo name="cadAvailable" /></div>
          {cadAvailable && <div className="fld span-2"><label>CAD notes</label><input {...register('cadNotes')} placeholder="Format, what’s included…" /></div>}
        </div>
      </FormSection>

      <FormSection sectionNum="03" title="Drivers & current state">
        <div className="fld-grid-4">
          <div className="fld span-4">
            <label>Why are you automating?</label>
            <Chips name="projectDrivers" options={PROJECT_DRIVERS} />
          </div>
        </div>
        <div className="fld-grid-2">
          <div className="fld"><label>How is this done today?</label><textarea {...register('currentProcess')} placeholder="Manual forklifts, hand carts, …" /></div>
          <div className="fld"><label>Existing automation (brand / fleet)</label><textarea {...register('existingAutomation')} placeholder="Any AGVs/AMRs already on site" /></div>
          <div className="fld"><label>Volume growth</label><input {...register('volumeGrowthNote')} placeholder="e.g. +10%/yr" /></div>
          <div className="fld"><label>Seasonality</label><input {...register('seasonalityNote')} placeholder="e.g. Q4 peak" /></div>
        </div>
      </FormSection>

      <TierBand label="Application" hint="What the vehicles will do" />

      <FormSection sectionNum="04" title="What you move">
        <div className="fld-grid-4">
          <div className="fld">
            <label>Unit / load type</label>
            <select {...register('typicalUnitType', { setValueAs: emptyToUndef })} defaultValue="">
              <option value="">Select type…</option>
              {TYPICAL_UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {unitType === 'Other' && (
            <div className="fld"><label>Describe load type</label><input {...register('otherUnitTypeDescription')} /></div>
          )}
          <div className="fld">
            <label>Max load weight</label>
            <div className="input-with-unit">
              <input type="number" step="0.1" min="0" className="mono" placeholder="2000" {...register('maxLoadWeightLbs', { setValueAs: emptyToNum })} />
              <div className="unit">lbs</div>
            </div>
          </div>
        </div>
        <div className="fld-row-3">
          <div className="fld"><label>Load length (in)</label><input type="number" step="0.1" className="mono" placeholder="48" {...register('loadLengthIn', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Load width (in)</label><input type="number" step="0.1" className="mono" placeholder="40" {...register('loadWidthIn', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Load height (in)</label><input type="number" step="0.1" className="mono" placeholder="60" {...register('loadHeightIn', { setValueAs: emptyToNum })} /></div>
        </div>
      </FormSection>

      <FormSection sectionNum="05" title="How it’s transferred">
        <div className="fld-grid-2">
          <div className="fld">
            <label>Transfer type</label>
            <select {...register('transferType', { setValueAs: emptyToUndef })} defaultValue="">
              <option value="">Select…</option>
              {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {showHeight && (
            <div className="fld">
              <label>Transfer height</label>
              <div className="input-with-unit">
                <input type="number" step="0.1" min="0" className="mono" placeholder="0" {...register('transferHeightFt', { setValueAs: emptyToNum })} />
                <div className="unit">ft</div>
              </div>
              <div className="help">Height the load is picked / set above the floor</div>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection sectionNum="06" title="Specialty applications of interest">
        <div className="fld-grid-4">
          <div className="fld span-4">
            <Chips name="specialtyApplications" options={SPECIALTY_APPLICATIONS} />
            <div className="help">Select any that apply — trailer loading/unloading, high reach, etc.</div>
          </div>
        </div>
      </FormSection>

      <FormSection sectionNum="07" title="Where it runs">
        <div className="fld-grid-3">
          <div className="fld">
            <label>Min aisle width</label>
            <div className="input-with-unit">
              <input type="number" step="0.1" min="0" className="mono" placeholder="8" {...register('minAisleWidthFt', { setValueAs: emptyToNum })} />
              <div className="unit">ft</div>
            </div>
          </div>
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
                <button type="button" className={`seg-btn${field.value === false ? ' on' : ''}`} onClick={() => field.onChange(false)}>Indoor</button>
                <button type="button" className={`seg-btn${field.value === true ? ' on' : ''}`} onClick={() => field.onChange(true)}>Outdoor</button>
              </div>
            )} />
          </div>
          <div className="fld">
            <label>Temperature</label>
            <Controller control={control} name="temperatureEnvironment" render={({ field }) => (
              <div className="seg-toggle">
                {(['ambient', 'refrigerated', 'freezer'] as const).map(opt => (
                  <button key={opt} type="button" className={`seg-btn${field.value === opt ? ' on' : ''}`} onClick={() => field.onChange(opt)}>
                    {opt === 'ambient' ? 'Ambient' : opt === 'refrigerated' ? 'Refrigerated' : 'Freezer'}
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="fld"><label>Min temperature (°F)</label><input type="number" className="mono" {...register('tempMinF', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Max temperature (°F)</label><input type="number" className="mono" {...register('tempMaxF', { setValueAs: emptyToNum })} /></div>
          <div className="fld">
            <label>Dust / moisture</label>
            <select {...register('dustMoisture', { setValueAs: emptyToUndef })} defaultValue="">
              <option value="">Select…</option>
              {DUST_MOISTURE_OPTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="fld"><label>Facility size (sq ft)</label><input type="number" className="mono" {...register('facilitySizeSqFt', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Dock doors</label><input type="number" className="mono" {...register('dockDoors', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Network / WiFi ready?</label><YesNo name="networkReady" /></div>
          {networkReady && <div className="fld"><label>IT contact</label><input {...register('itContact')} /></div>}
          <div className="fld"><label>Site walkthrough available?</label><YesNo name="siteWalkthroughAvailable" /></div>
        </div>
      </FormSection>

      <FormSection sectionNum="08" title="Operating schedule">
        <div className="fld-grid-3">
          <div className="fld"><label>Shifts / day</label><input type="number" min="1" max="3" className="mono" {...register('shiftsPerDay', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Hours / shift</label><input type="number" min="4" max="12" className="mono" {...register('hoursPerShift', { setValueAs: emptyToNum })} /></div>
          <div className="fld">
            <label>Operating days</label>
            <select {...register('operatingDaysPattern', { setValueAs: emptyToUndef })} defaultValue="">
              <option value="">Select…</option>
              {OPERATING_DAYS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="fld"><label>Breaks / shift</label><input type="number" min="0" className="mono" {...register('breaksPerShift', { setValueAs: emptyToNum })} /></div>
          <div className="fld"><label>Break duration (min)</label><input type="number" min="0" className="mono" {...register('breakDurationMin', { setValueAs: emptyToNum })} /></div>
        </div>
      </FormSection>

      <FormSection sectionNum="09" title="Throughput">
        <div className="fld-grid-3">
          <div className="fld"><label>Required throughput</label>
            <div className="input-with-unit">
              <input type="number" min="0" className="mono" placeholder="60" {...register('requiredThroughputPerHour', { setValueAs: emptyToNum })} />
              <div className="unit">/hr</div>
            </div>
          </div>
          <div className="fld"><label>Average distance</label>
            <div className="input-with-unit">
              <input type="number" min="0" className="mono" placeholder="250" {...register('avgDistanceFt', { setValueAs: emptyToNum })} />
              <div className="unit">ft</div>
            </div>
          </div>
          <div className="fld">
            <label>Distance type</label>
            <Controller control={control} name="distanceType" render={({ field }) => (
              <div className="seg-toggle">
                <button type="button" className={`seg-btn${field.value === 'one_way' ? ' on' : ''}`} onClick={() => field.onChange('one_way')}>One-way</button>
                <button type="button" className={`seg-btn${field.value === 'round_trip' ? ' on' : ''}`} onClick={() => field.onChange('round_trip')}>Round-trip</button>
              </div>
            )} />
          </div>
        </div>
      </FormSection>

      <FormSection sectionNum="10" title="Certifications & controls">
        <div className="fld-grid-4">
          <div className="fld span-4"><label>Required certifications</label><Chips name="certifications" options={CERTIFICATIONS} /></div>
          <div className="fld span-4"><label>Equipment interlocks</label><Chips name="interlocks" options={INTERLOCKS} /></div>
        </div>
        <div className="fld-grid-2">
          <div className="fld"><label>WMS integration required?</label><YesNo name="wmsRequired" /></div>
          {wmsRequired && <div className="fld"><label>WMS vendor</label><input {...register('wmsVendor')} /></div>}
        </div>
      </FormSection>

      <FormSection sectionNum="11" title="Anything else">
        <div className="fld-grid-4">
          <div className="fld span-4"><label>Notes</label><textarea {...register('projectNotes')} placeholder="Anything that would help us understand the application" /></div>
        </div>
      </FormSection>

      <div className="q-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Preparing…' : 'Download questionnaire (PDF)'}
        </button>
        <button type="button" className="btn ghost" onClick={downloadJson}>Download JSON</button>
        {submitted && <span className="q-status q-status-ok"><Icon name="check" size={14} /> Downloaded — send the PDF to your TAL engineer.</span>}
        {invalidMsg && <span className="q-status q-status-bad"><Icon name="warn" size={14} /> {invalidMsg}</span>}
      </div>
    </form>
  )
}
