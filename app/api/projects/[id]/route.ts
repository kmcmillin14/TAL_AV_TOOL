import { NextRequest } from 'next/server'
import { db } from '@/src/lib/db'
import { partialProjectSchema } from '@/src/lib/validations/schemas'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const project = await db.project.findUnique({ where: { id } })
    if (!project) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    return Response.json(project)
  } catch (err) {
    console.error('GET /api/projects/[id] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = partialProjectSchema.parse(body)

    // Auto-increment version number on save
    const existing = await db.project.findUnique({
      where: { id },
      select: { versionNumber: true },
    })
    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const nextVersion = incrementVersion(existing.versionNumber)

    const updated = await db.project.update({
      where: { id },
      data: {
        ...data,
        versionNumber: nextVersion,
        operatingDaysCustom: data.operatingDaysCustom ?? undefined,
        certifications: data.certifications ?? undefined,
        interlocks: data.interlocks ?? undefined,
      },
    })

    return Response.json({ id: updated.id, versionNumber: updated.versionNumber })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 422 })
    }
    console.error('PATCH /api/projects/[id] error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function incrementVersion(current: string): string {
  const match = current.match(/^v(\d+)\.(\d+)$/)
  if (!match) return 'v1.1'
  const major = parseInt(match[1], 10)
  const minor = parseInt(match[2], 10)
  if (minor >= 9) return `v${major + 1}.0`
  return `v${major}.${minor + 1}`
}
