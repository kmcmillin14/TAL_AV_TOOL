# Adding Vehicles to the Fleet Library

Vehicle data is the **single source of truth** in `src/content/vehicles/*.json`.

No code changes. No database migrations. Just create a JSON file.

## Steps

1. Create `src/content/vehicles/<vehicle-id>.json`
2. Follow the schema below exactly
3. Restart the dev server (Next.js will pick it up on next request)

## Schema

```json
{
  "id": "unique-slug",
  "name": "Display Name",
  "display": {
    "manufacturer": "Manufacturer Name",
    "partnership": "TAL Integrated | TAL 3rd Party | OEM | 3rd Party",
    "tHive": true,
    "fleetSoftware": "Software Name",
    "heroImage": "/images/vehicles/slug.jpg",
    "typicalLoad": "Standard Pallet | Tote | Cart | etc.",
    "category": "Counterbalance Forklift | Reach Truck | Tugger | ..."
  },
  "transferMethods": [
    {
      "method": "Fork | Tow / Tugger | Conveyor Interface | Lift Platform",
      "loadTimeSec": 5,
      "unloadTimeSec": 5
    }
  ],
  "calc": {
    "maxWeightLbs": 3968,
    "widthFt": 4.2,
    "maxLiftHeightFt": 14.7,
    "speedLoadedFps": 9.84,
    "batteryKwh": 25.6,
    "energyKwhPerFt": 0.019,
    "priceRange": {
      "minUsd": 165000,
      "maxUsd": 210000
    }
  },
  "specs": {
    "tempMinF": 14,
    "tempMaxF": 113,
    "outdoorCapable": true,
    "freezerCapable": false,
    "maxRampGrade": 10,
    "certifications": ["ISO 3691-4", "ANSI B56.5"]
  }
}
```

## Important Rules

- **All values are imperial**: lbs, ft, °F
- **transferMethods is an array** — a vehicle can have multiple methods
- **priceRange is min/max** — not a single price
- **maxLiftHeightFt = 0** for floor-level-only vehicles
- **certifications** must exactly match the strings used in Step 1
  - Supported: `ISO 3691-4`, `ANSI B56.5`, `RIA R15.08`, `Cleanroom`, `Food Grade`, `ATEX`, `IECEx`, `VDA 5050`

## Hard Gate Logic

The qualification engine will automatically apply these gates:
- Weight: `vehicle.calc.maxWeightLbs >= app.maxLoadWeightLbs` (no tolerance)
- Lift Height: `vehicle.calc.maxLiftHeightFt >= app.maxLiftHeightFt` (no tolerance)
- Transfer Method: vehicle must support the required method (array match)
- Certifications: all required certs must be in vehicle's list
- Temperature: vehicle must cover the required range
- Ramp Grade: vehicle must handle required grade

Aisle width is **NOT a hard gate** — it's a soft preference only.
