import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'

export async function GET() {
  try {
    const levels = await prisma.assessmentLevel.findMany({
      where: {
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
        isActive: true,
      },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(levels)
  } catch (error) {
    console.error('Levels error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
