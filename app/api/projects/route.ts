import { NextRequest } from 'next/server'
import { db } from '@/src/lib/db'
import { partialProjectSchema } from '@/src/lib/validations/schemas'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = partialProjectSchema.parse(body)

    const project = await db.project.create({
      data: {
        projectName:              data.projectName              ?? 'Untitled Project',
        customerName:             data.customerName             ?? '',
        facilityLocation:         data.facilityLocation,
        bastianRep:               data.bastianRep,
        maxLoadWeightLbs:         data.maxLoadWeightLbs         ?? 0,
        typicalUnitType:          data.typicalUnitType          ?? '',
        palletBottomBoard:        data.palletBottomBoard,
        customPalletDescription:  data.customPalletDescription,
        otherUnitTypeDescription: data.otherUnitTypeDescription,
        loadLengthIn:             data.loadLengthIn,
        loadWidthIn:              data.loadWidthIn,
        loadHeightIn:             data.loadHeightIn,
        transferMethod:           data.transferMethod           ?? '',
        deliveryPattern:          data.deliveryPattern          ?? '',
        maxLiftHeightFt:          data.maxLiftHeightFt,
        minAisleWidthFt:          data.minAisleWidthFt          ?? 0,
        floorCondition:           data.floorCondition           ?? '',
        shiftsPerDay:             data.shiftsPerDay             ?? 1,
        hoursPerShift:            data.hoursPerShift            ?? 8,
        operatingDaysPattern:     data.operatingDaysPattern     ?? '',
        operatingDaysCustom:      data.operatingDaysCustom      ?? undefined,
        breaksPerShift:           data.breaksPerShift           ?? 0,
        breakDurationMin:         data.breakDurationMin         ?? 0,
        requiredThroughputPerHour: data.requiredThroughputPerHour ?? 0,
        avgDistanceFt:            data.avgDistanceFt            ?? 0,
        distanceType:             data.distanceType             ?? 'one_way',
        operatorsPerShift:        data.operatorsPerShift        ?? 0,
        rampDistanceFt:           data.rampDistanceFt           ?? 0,
        maxRampGrade:             data.maxRampGrade             ?? 0,
        oemDealer:                data.oemDealer,
        dealershipName:           data.dealershipName,
        dealerRep:                data.dealerRep,
        certifications:           data.certifications           ?? [],
        interlocks:               data.interlocks               ?? [],
        otherAGVs:                data.otherAGVs                ?? false,
        otherAGVVendor:           data.otherAGVVendor,
        tempMinF:                 data.tempMinF,
        tempMaxF:                 data.tempMaxF,
        outdoorRequired:          data.outdoorRequired          ?? false,
        freezerCapable:           data.freezerCapable           ?? false,
        dustMoisture:             data.dustMoisture,
        wmsRequired:              data.wmsRequired              ?? false,
        wmsVendor:                data.wmsVendor,
        projectNotes:             data.projectNotes,
        versionNumber:            'v1.0',
      },
    })

    return Response.json({ id: project.id, versionNumber: project.versionNumber }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 422 })
    }
    console.error('POST /api/projects error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const projects = await db.project.findMany({
      select: {
        id: true,
        projectName: true,
        customerName: true,
        facilityLocation: true,
        versionNumber: true,
        bastianRep: true,
        step1Complete: true,
        step2Complete: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    return Response.json(projects)
  } catch (err) {
    console.error('GET /api/projects error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
