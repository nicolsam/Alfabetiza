import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAdmin } from '@/lib/admin'

export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) return auth.error

    const totalSchools = await prisma.school.count({ where: { deletedAt: null } })
    const totalStudents = await prisma.student.count({ where: { deletedAt: null, school: { deletedAt: null } } })
    const totalAssessments = await prisma.studentAssessment.count()
    
    // Active sessions within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const activeSessions = await prisma.userSession.count({
      where: { lastActiveAt: { gte: fiveMinutesAgo } }
    })

    return NextResponse.json({
      stats: {
        totalSchools,
        totalStudents,
        totalAssessments,
        activeSessions
      }
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
