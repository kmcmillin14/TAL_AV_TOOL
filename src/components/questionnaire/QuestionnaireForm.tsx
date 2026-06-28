'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm, Controller, type SubmitHandler, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import FormSection from '@/src/components/step1/FormSection'
import { partialProjectSchema, type PartialProjectFormData } from '@/src/lib/validations/schemas'
import {
  TYPICAL_UNIT_TYPES, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS,
  SPECIALTY_APPLICATIONS, PROJECT_DRIVERS,
} from '@/src/lib/constants/enums'
import { downloadQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
import { questionnaireJsonBlob } from '@/src/lib/questionnaire/questionnaireExport'

const DRAFT_KEY = 'tal:questionnaire-draft'

// Local display list — mirrors the INTERLOCKS const in ApplicationForm (not yet
// exported from enums.ts; kept local to avoid touching Step 1 in this feature).
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']

/** Toggle a string in a string[] field (chip behavior). */
function toggle(list: string[] | undefined, value: string): string[] {
  const cur = list ?? []
  return cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
}

// RHF `register` value coercion. Empty selects emit "" and empty number inputs
// emit NaN — both FAIL Zod enum/number validation in the resolver and would
// silently block submit. Map empties to `undefined` so optional fields stay valid.
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)
const emptyToNum = (v: unknown) => {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

export default function QuestionnaireForm() {
  const [submitted, setSubmitted] = useState(false)
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null)
  const { register, handleSubmit, control, reset, getValues, watch } = useForm<PartialProjectFormData>({
    resolver: zodResolver(partialProjectSchema) as Resolver<PartialProjectFormData>,
    defaultValues: { projectDrivers: [], specialtyApplications: [], certifications: [], interlocks: [] },
  })

  // Restore draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) reset(JSON.parse(raw))
    } catch { /* ignore corrupt draft */ }
  }, [reset])

  // Autosave draft (debounced via watch subscription).
  useEffect(() => {
    const sub = watch((values) => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)) } catch { /* quota */ }
    })
    return () => sub.unsubscribe()
  }, [watch])

  const onSubmit: SubmitHandler<PartialProjectFormData> = useCallback(async (values) => {
    setInvalidMsg(null)
    await downloadQuestionnairePdf(values)
    setSubmitted(true)
  }, [])

  // handleSubmit suppresses onSubmit when the schema rejects a value (e.g. hours/shift
  // outside 4–12). Surface a message + the offending fields so submit never fails silently.
  const onInvalid = useCallback((errors: Record<string, unknown>) => {
    setSubmitted(false)
    setInvalidMsg(`Please fix: ${Object.keys(errors).join(', ')}`)
  }, [])

  const downloadJson = useCallback(() => {
    const blob = questionnaireJsonBlob(getValues())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'questionnaire.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getValues])

  return (
    <form className="q-form" onSubmit={handleSubmit(onSubmit, onInvalid)}>
      <FormSection sectionNum="01" title="You & your company">
        <div className="fld"><label>Customer / company</label><input {...register('customerName')} /></div>
        <div className="fld"><label>Facility location</label><input {...register('facilityLocation')} /></div>
        <div className="fld"><label>Your name</label><input {...register('customerContactName')} /></div>
        <div className="fld"><label>Your role</label><input {...register('customerContactRole')} /></div>
        <div className="fld"><label>Email</label><input {...register('customerContactEmail')} /></div>
        <div className="fld"><label>Phone</label><input {...register('customerContactPhone')} /></div>
        <div className="fld"><label>TAL representative</label><input {...register('talRepName')} /></div>
        <div className="fld"><label>TAL email</label><input {...register('talRepEmail')} /></div>
        <div className="fld"><label>TAL phone</label><input {...register('talRepPhone')} /></div>
        <div className="fld"><label>Dealer / OEM</label><input {...register('oemDealer')} /></div>
        <div className="fld"><label>Dealership name</label><input {...register('dealershipName')} /></div>
        <div className="fld"><label>Dealer rep</label><input {...register('dealerRep')} /></div>
      </FormSection>

      <FormSection sectionNum="02" title="The opportunity">
        <div className="fld"><label>Project / opportunity name</label><input {...register('projectName')} /></div>
        <div className="fld"><label>Vehicle in mind</label><input {...register('vehicleInMind')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('isRfq')} /> This is an RFQ</label></div>
        <div className="fld"><label>RFQ number</label><input {...register('rfqNumber')} /></div>
        <div className="fld"><label>RFQ due date</label><input type="date" {...register('rfqDueDate')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('cadAvailable')} /> CAD / drawings available</label></div>
        <div className="fld"><label>CAD notes</label><input {...register('cadNotes')} /></div>
        <div className="fld"><label>Project stage</label>
          <select {...register('projectStage', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            <option value="exploring">Exploring</option>
            <option value="budgeting">Budgeting</option>
            <option value="approved">Approved</option>
            <option value="committed">Committed</option>
          </select>
        </div>
        <div className="fld"><label>Budget status</label>
          <select {...register('budgetStatus', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            <option value="budgetary">Budgetary</option>
            <option value="firm">Firm</option>
            <option value="allocated">Allocated</option>
          </select>
        </div>
        <div className="fld"><label>Budget range</label><input {...register('budgetRange')} /></div>
        <div className="fld"><label>Decision date</label><input type="date" {...register('decisionDate')} /></div>
        <div className="fld"><label>Target go-live</label><input type="date" {...register('targetGoLiveDate')} /></div>
      </FormSection>

      <FormSection sectionNum="03" title="Why & how today">
        <Controller control={control} name="projectDrivers" render={({ field }) => (
          <div className="fld">
            <label>Drivers</label>
            <div className="q-chips">
              {PROJECT_DRIVERS.map(d => (
                <button type="button" key={d}
                  className={`q-chip${(field.value ?? []).includes(d) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, d))}>{d}</button>
              ))}
            </div>
          </div>
        )} />
        <div className="fld"><label>How is this done today?</label><textarea {...register('currentProcess')} /></div>
        <div className="fld"><label>Volume growth</label><input {...register('volumeGrowthNote')} /></div>
        <div className="fld"><label>Seasonality</label><input {...register('seasonalityNote')} /></div>
        <div className="fld"><label>Existing automation (brand/fleet)</label><input {...register('existingAutomation')} /></div>
      </FormSection>

      <FormSection sectionNum="04" title="Specialty applications of interest">
        <Controller control={control} name="specialtyApplications" render={({ field }) => (
          <div className="fld">
            <div className="q-chips">
              {SPECIALTY_APPLICATIONS.map(a => (
                <button type="button" key={a}
                  className={`q-chip${(field.value ?? []).includes(a) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, a))}>{a}</button>
              ))}
            </div>
          </div>
        )} />
      </FormSection>

      <FormSection sectionNum="05" title="What you move">
        <div className="fld"><label>Unit / load type</label>
          <select {...register('typicalUnitType')}>
            <option value="">—</option>
            {TYPICAL_UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="fld"><label>Max load weight (lbs)</label><input type="number" {...register('maxLoadWeightLbs', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Length (in)</label><input type="number" {...register('loadLengthIn', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Width (in)</label><input type="number" {...register('loadWidthIn', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Height (in)</label><input type="number" {...register('loadHeightIn', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection sectionNum="06" title="How it is transferred">
        <div className="fld"><label>Transfer type</label>
          <select {...register('transferType', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="fld"><label>Transfer height (ft)</label><input type="number" {...register('transferHeightFt', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection sectionNum="07" title="Environment & site">
        <div className="fld"><label>Facility size (sq ft)</label><input type="number" {...register('facilitySizeSqFt', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Dock doors</label><input type="number" {...register('dockDoors', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label><input type="checkbox" {...register('networkReady')} /> Network / WiFi ready</label></div>
        <div className="fld"><label>IT contact</label><input {...register('itContact')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('siteWalkthroughAvailable')} /> Site walkthrough available</label></div>
        <div className="fld"><label>Min aisle width (ft)</label><input type="number" {...register('minAisleWidthFt', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Min temperature (°F)</label><input type="number" {...register('tempMinF', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Max temperature (°F)</label><input type="number" {...register('tempMaxF', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection sectionNum="08" title="Certifications & controls">
        <Controller control={control} name="certifications" render={({ field }) => (
          <div className="fld"><label>Certifications</label>
            <div className="q-chips">
              {CERTIFICATIONS.map(c => (
                <button type="button" key={c}
                  className={`q-chip${(field.value ?? []).includes(c) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, c))}>{c}</button>
              ))}
            </div>
          </div>
        )} />
        <Controller control={control} name="interlocks" render={({ field }) => (
          <div className="fld"><label>Equipment interlocks</label>
            <div className="q-chips">
              {INTERLOCKS.map(i => (
                <button type="button" key={i}
                  className={`q-chip${(field.value ?? []).includes(i) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, i))}>{i}</button>
              ))}
            </div>
          </div>
        )} />
        <div className="fld"><label><input type="checkbox" {...register('wmsRequired')} /> WMS integration required</label></div>
        <div className="fld"><label>WMS vendor</label><input {...register('wmsVendor')} /></div>
      </FormSection>

      <FormSection sectionNum="09" title="Schedule">
        <div className="fld"><label>Shifts / day</label><input type="number" {...register('shiftsPerDay', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Hours / shift</label><input type="number" {...register('hoursPerShift', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Operating days</label><input {...register('operatingDaysPattern')} /></div>
        <div className="fld"><label>Breaks / shift</label><input type="number" {...register('breaksPerShift', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Break duration (min)</label><input type="number" {...register('breakDurationMin', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection sectionNum="10" title="Throughput">
        <div className="fld"><label>Required throughput (moves/hr)</label><input type="number" {...register('requiredThroughputPerHour', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Average distance (ft)</label><input type="number" {...register('avgDistanceFt', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection sectionNum="11" title="Anything else">
        <div className="fld"><label>Notes</label><textarea {...register('projectNotes')} /></div>
      </FormSection>

      <div className="q-actions">
        <button type="submit" className="q-submit">Download questionnaire (PDF)</button>
        <button type="button" className="q-alt" onClick={downloadJson}>Download JSON</button>
        {submitted && <span className="q-done">Downloaded — send the PDF to your TAL engineer.</span>}
        {invalidMsg && <span className="q-invalid">{invalidMsg}</span>}
      </div>
    </form>
  )
}
