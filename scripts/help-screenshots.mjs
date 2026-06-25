// Dev tooling (not shipped): capture real screenshots of each step for the Help
// guide. Seeds a representative demo project into localStorage, then drives the
// running dev server (http://localhost:3000) with the system Chrome via
// puppeteer-core. Output → public/images/help/stepN.png.
//
//   1) ensure `npm run dev` is up on :3000
//   2) npm i puppeteer-core --no-save   (system Chrome; no browser download)
//   3) node scripts/help-screenshots.mjs
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/images/help')
const BASE = 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROJECT_ID = 'demo-help'

// A representative project so every step shows real, populated UI.
const demo = {
  id: PROJECT_ID,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
  versionNumber: 'A',
  opportunityNumber: '10234',
  opportunityType: 'opportunity',
  customerName: 'Demo Logistics',
  projectName: 'Dock Replenishment',
  bastianRep: 'Kyle McMillin',
  facilityLocation: 'Columbus, OH',
  step1Complete: true,
  step2Complete: true,
  maxLoadWeightLbs: 2500,
  typicalUnitType: 'Pallet',
  loadLengthIn: 48, loadWidthIn: 40, loadHeightIn: 50,
  transferMethod: 'Lift',
  pickHeightFt: 0, dropHeightFt: 0,
  tempMinF: 60, tempMaxF: 80, minAisleWidthFt: 12,
  shiftsPerDay: 2, hoursPerShift: 8, breaksPerShift: 2, breakDurationMin: 15,
  operatingDaysPattern: 'Mon–Fri',
  operatorsPerShift: 3, numberOfOperators: 6,
  fullyBurdenedRateUsdPerYear: 65000,
  energyCostUsdPerKwh: 0.12, annualMaintenancePctOfCapex: 0.08, serviceLifeYears: 10,
  bufferPct: 0.10,
  loads: [{ id: 'l1', unitType: 'Pallet', lengthIn: 48, widthIn: 40, heightIn: 50, weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Receiving', destination: 'Rack A', distanceFt: 300, thruPerHr: 30, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: 'f2', origin: 'Rack A', destination: 'Shipping', distanceFt: 420, thruPerHr: 22, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: 'f3', origin: 'Staging', destination: 'Dock 4', distanceFt: 180, thruPerHr: 40, routeLayout: 'high', liftHeightFt: 0, vehicleId: '8tb50a' },
  ],
  flowGroups: [],
  certifications: [],
}

const STEPS = [
  { id: 0, wait: '.step0-fill, .start-cards, main' },
  { id: 1, wait: '.form-section, .workspace' },
  { id: 2, wait: '.veh-card, .vehicle-card, .workspace' },
  { id: 3, wait: '.flows-table, .engine-head, .workspace' },
  { id: 4, wait: '.rom2-shell, .rom2-bento, .workspace' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb'],
    defaultViewport: { width: 1440, height: 940, deviceScaleFactor: 2 },
  })
  const page = await browser.newPage()
  // Seed localStorage before any app script runs, on every navigation.
  await page.evaluateOnNewDocument((key, value) => {
    window.localStorage.setItem(key, value)
  }, 'tal:projects', JSON.stringify([demo]))

  for (const step of STEPS) {
    const url = `${BASE}/projects/${PROJECT_ID}/step${step.id}`
    process.stdout.write(`→ step${step.id} … `)
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    try { await page.waitForSelector(step.wait, { timeout: 8000 }) } catch { /* best effort */ }
    await sleep(1200) // let charts/animations settle
    const file = resolve(OUT, `step${step.id}.png`)
    await page.screenshot({ path: file })
    console.log('saved', file.replace(ROOT + '/', ''))
  }

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
