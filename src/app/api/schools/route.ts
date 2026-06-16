import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/audit'
import { forbiddenResponse, isAuthFailure, requireAuth, USER_SCHOOL_ROLES } from '@/lib/permissions'
import { buildPaginationMeta, hasPaginationParams, parsePaginationParams } from '@/lib/pagination'
import { getAccentInsensitiveSearchTokens } from '@/lib/server-search'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()
    const searchTokens = getAccentInsensitiveSearchTokens(query)
    const shouldPaginate = hasPaginationParams(searchParams)
    const paginationParams = parsePaginationParams(searchParams)
    const schoolWhere: Prisma.SchoolWhereInput = {
      deletedAt: null,
      ...(searchTokens.length > 0 ? {
        AND: searchTokens.map((terms) => ({
          OR: [
            ...terms.map((term) => ({ name: { contains: term, mode: 'insensitive' as const } })),
            ...terms.map((term) => ({ address: { contains: term, mode: 'insensitive' as const } })),
          ],
        })),
      } : {}),
    }

    if (auth.user.isGlobalAdmin) {
      const totalItems = shouldPaginate ? await prisma.school.count({ where: schoolWhere }) : undefined
      const schools = await prisma.school.findMany({
        where: schoolWhere,
        ...(shouldPaginate ? { skip: paginationParams.skip, take: paginationParams.take } : {}),
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({
        schools,
        ...(shouldPaginate && typeof totalItems === 'number' ? {
          pagination: buildPaginationMeta({
            page: paginationParams.page,
            pageSize: paginationParams.pageSize,
            totalItems,
          }),
        } : {}),
      })
    }

    const userSchoolWhere: Prisma.UserSchoolWhereInput = {
      userId: auth.user.id,
      school: schoolWhere,
    }
    const totalItems = shouldPaginate ? await prisma.userSchool.count({ where: userSchoolWhere }) : undefined
    const userSchools = await prisma.userSchool.findMany({
      where: userSchoolWhere,
      include: { school: true },
      ...(shouldPaginate ? { skip: paginationParams.skip, take: paginationParams.take } : {}),
      ...(shouldPaginate ? { orderBy: { school: { name: 'asc' } } } : {}),
    })

    const schools = userSchools.map((ts) => ts.school)
    return NextResponse.json({
      schools,
      ...(shouldPaginate && typeof totalItems === 'number' ? {
        pagination: buildPaginationMeta({
          page: paginationParams.page,
          pageSize: paginationParams.pageSize,
          totalItems,
        }),
      } : {}),
    })
  } catch (error) {
    console.error('Schools error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error
    if (!auth.user.isGlobalAdmin) return forbiddenResponse()

    const body = await request.json()
    const { name, address } = body

    if (!name) {
      return NextResponse.json({ error: 'School name required' }, { status: 400 })
    }

    const school = await prisma.school.create({
      data: { name, address },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'CREATE_SCHOOL', { schoolId: school.id, name, role: USER_SCHOOL_ROLES.COORDINATOR }, ipAddress)

    return NextResponse.json({ school })
  } catch (error) {
    console.error('Create school error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
