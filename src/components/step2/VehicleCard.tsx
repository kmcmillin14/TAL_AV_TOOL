'use client'

import { useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import WhyBreakdown from './WhyBreakdown'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

interface VehicleCardProps {
  vehicle: Vehicle
  result: QualificationResult
  unitSystem: UnitSystem
}

function formatPrice(minUsd: number, maxUsd: number): string {
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`
  return `${fmt(minUsd)} – ${fmt(maxUsd)}`
}

function PartnershipBadge({ partnership }: { partnership: Vehicle['display']['partnership'] }) {
  const cls = partnership === 'TAL Integrated' ? 'tal-integrated'
    : partnership === 'TAL 3rd Party' ? 'tal-3p'
    : 'oem'
  return <span className={`badge ${cls}`}>{partnership}</span>
}

// Procedural SVG silhouette per vehicle category (from Claude Design)
function VehicleSilhouette({ category, color }: { category: string; color: string }) {
  const c = color
  const id = category.replace(/\s+/g, '-').toLowerCase()

  return (
    <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.18"/>
          <stop offset="1" stopColor={c} stopOpacity="0.04"/>
        </linearGradient>
        <pattern id={`grid-${id}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity="0.06"/>
        </pattern>
      </defs>
      <rect width="320" height="200" fill={`url(#grid-${id})`}/>
      <rect width="320" height="200" fill={`url(#g-${id})`}/>
      {/* Floor line */}
      <line x1="20" y1="160" x2="300" y2="160" stroke={c} strokeOpacity="0.4" strokeDasharray="3 3"/>

      {category.includes('Counterbalance') && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="100" y="90" width="100" height="50" rx="6"/>
          <rect x="115" y="60" width="55" height="34" rx="4" fillOpacity="0.6"/>
          <rect x="200" y="120" width="60" height="6"/>
          <rect x="200" y="135" width="60" height="6"/>
          <circle cx="120" cy="155" r="10" fill="#1a1a1a" stroke={c}/>
          <circle cx="180" cy="155" r="10" fill="#1a1a1a" stroke={c}/>
          <rect x="195" y="55" width="6" height="80" fill={c} fillOpacity="0.5"/>
        </g>
      )}
      {(category.includes('Unit Load') || category.includes('Mini')) && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="100" y="105" width="120" height="40" rx="4"/>
          <rect x="105" y="80" width="110" height="20" rx="2" fillOpacity="0.5"/>
          <circle cx="120" cy="155" r="8" fill="#1a1a1a" stroke={c}/>
          <circle cx="200" cy="155" r="8" fill="#1a1a1a" stroke={c}/>
          <circle cx="160" cy="74" r="5" fill={c}/>
        </g>
      )}
      {(category.includes('Reach') || category.includes('Narrow')) && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="90" y="95" width="90" height="50" rx="4"/>
          <rect x="180" y="40" width="6" height="105" fill={c} fillOpacity="0.5"/>
          <rect x="186" y="115" width="60" height="5"/>
          <rect x="186" y="128" width="60" height="5"/>
          <circle cx="110" cy="155" r="9" fill="#1a1a1a" stroke={c}/>
          <circle cx="160" cy="155" r="9" fill="#1a1a1a" stroke={c}/>
        </g>
      )}
      {(category.includes('Tugger') || category.includes('Tow')) && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="80" y="100" width="80" height="48" rx="6"/>
          <rect x="180" y="115" width="60" height="25" rx="3" fillOpacity="0.5"/>
          <rect x="245" y="115" width="50" height="25" rx="3" fillOpacity="0.4"/>
          <line x1="160" y1="128" x2="180" y2="128" strokeWidth="3"/>
          <line x1="240" y1="128" x2="245" y2="128" strokeWidth="3"/>
          <circle cx="100" cy="158" r="8" fill="#1a1a1a" stroke={c}/>
          <circle cx="140" cy="158" r="8" fill="#1a1a1a" stroke={c}/>
          <circle cx="195" cy="148" r="6" fill="#1a1a1a"/>
          <circle cx="225" cy="148" r="6" fill="#1a1a1a"/>
        </g>
      )}
      {category.includes('Conveyor') && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="90" y="110" width="140" height="35" rx="3"/>
          <rect x="100" y="92" width="120" height="14" rx="2" fillOpacity="0.4"/>
          {[0,1,2,3,4,5].map(i => <circle key={i} cx={108+i*20} cy="100" r="3" fill={c}/>)}
          <circle cx="115" cy="155" r="7" fill="#1a1a1a" stroke={c}/>
          <circle cx="200" cy="155" r="7" fill="#1a1a1a" stroke={c}/>
        </g>
      )}
      {category.includes('Pallet') && !category.includes('Narrow') && (
        <g fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5">
          <rect x="100" y="115" width="120" height="30" rx="3"/>
          <rect x="145" y="80" width="30" height="40" rx="2" fillOpacity="0.5"/>
          <rect x="220" y="125" width="40" height="6"/>
          <rect x="220" y="138" width="40" height="6"/>
          <circle cx="125" cy="155" r="7" fill="#1a1a1a" stroke={c}/>
          <circle cx="195" cy="155" r="7" fill="#1a1a1a" stroke={c}/>
        </g>
      )}

      {/* ID badge */}
      <text x="20" y="30" fill="currentColor" fontFamily="var(--tal-font-numeric)" fontSize="10"
        fontWeight="600" opacity="0.45" letterSpacing="0.08em">
        {category.toUpperCase()} · ISO VIEW
      </text>
    </svg>
  )
}

const STATUS_COLORS: Record<string, string> = {
  GREEN:  '#5eea90',
  YELLOW: '#f5b341',
  RED:    '#f56565',
}

export default function VehicleCard({ vehicle, result, unitSystem }: VehicleCardProps) {
  const [showWhy, setShowWhy] = useState(false)
  const [imgError, setImgError] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  const capDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`

  const liftDisplay = vehicle.calc.maxLiftHeightFt > 0
    ? (unitSystem === 'metric'
        ? `${(vehicle.calc.maxLiftHeightFt * 0.3048).toFixed(1)} m`
        : `${vehicle.calc.maxLiftHeightFt} ft`)
    : 'Floor level'

  const widthDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.widthFt * 0.3048).toFixed(1)} m`
    : `${vehicle.calc.widthFt} ft`

  const silhouetteColor = STATUS_COLORS[status] ?? '#888'
  const hasRealImage = vehicle.display.heroImage && !imgError

  return (
    <div className="veh-card">
      <div className={`veh-status-bar ${statusCls}`} />

      {/* Image / silhouette area */}
      <div className="veh-img">
        {hasRealImage ? (
          <img
            src={vehicle.display.heroImage}
            alt={vehicle.name}
            className="veh-img-photo"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="veh-img-hatch" style={{ color: silhouetteColor }}>
            <VehicleSilhouette category={vehicle.display.category} color={silhouetteColor} />
          </div>
        )}
        <div className="veh-img-overlay">
          <span className="veh-img-label">{vehicle.display.category}</span>
        </div>
      </div>

      <div className="veh-body">
        {/* Header: name + traffic light */}
        <div className="veh-header">
          <div className="veh-name-block">
            <div className="name">{vehicle.name}</div>
            <div className="mfr">{vehicle.display.manufacturer}</div>
          </div>
          <TrafficLight status={status} />
        </div>

        {/* Badges */}
        <div className="veh-badges">
          <PartnershipBadge partnership={vehicle.display.partnership} />
          {vehicle.display.tHive && (
            <span className="badge thive">T-Hive</span>
          )}
        </div>

        {/* Key specs */}
        <div className="kv-list">
          <div className="kv">
            <span className="k">Capacity</span>
            <span className="v">{capDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Lift</span>
            <span className="v">{liftDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Width</span>
            <span className="v">{widthDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Software</span>
            <span className="v" style={{ fontSize: 10, textAlign: 'right' }}>{vehicle.display.fleetSoftware}</span>
          </div>
          <div className="kv" style={{ gridColumn: 'span 2' }}>
            <span className="k">Transfer</span>
            <span className="v">{vehicle.transferMethods.map(m => m.method).join(', ')}</span>
          </div>
          <div className="kv" style={{ gridColumn: 'span 2' }}>
            <span className="k">Price Range</span>
            <span className="v">{formatPrice(vehicle.calc.priceRange.minUsd, vehicle.calc.priceRange.maxUsd)}</span>
          </div>
        </div>

        {/* Footer: Why? */}
        <div className="veh-foot">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {vehicle.display.typicalLoad}
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowWhy(v => !v)}
          >
            {showWhy ? 'Hide ▲' : 'Why? ▼'}
          </button>
        </div>

        {showWhy && <WhyBreakdown result={result} />}
      </div>
    </div>
  )
}
