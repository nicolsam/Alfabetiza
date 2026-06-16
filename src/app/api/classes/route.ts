import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/audit'
import { parseAcademicYear } from '@/lib/enrollments'
import { forbiddenResponse, getAccessibleSchoolIds, isAuthFailure, isCoordinatorForSchool, requireAuth } from '@/lib/permissions'
import { buildPaginationMeta, hasPaginationParams, parsePaginationParams } from '@/lib/pagination'
import { getAccentInsensitiveSearchTokens } from '@/lib/server-search'

export const VALID_SHIFTS = ['Morning', 'Afternoon', 'Night']
export const VALID_GRADES = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano', '1ª Série', '2ª Série', '3ª Série']

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')
    const academicYear = parseAcademicYear(searchParams.get('academicYear'))
    const query = searchParams.get('q')?.trim()
    const searchedAcademicYear = query ? parseAcademicYear(query) : null
    const searchTokens = getAccentInsensitiveSearchTokens(query)
    const shouldPaginate = hasPaginationParams(searchParams)
    const paginationParams = parsePaginationParams(searchParams)

    const validSchoolIds = await getAccessibleSchoolIds(auth.user, schoolId)

    if (validSchoolIds.length === 0) {
      return NextResponse.json({
        classes: [],
        academicYears: [],
        ...(shouldPaginate ? {
          pagination: buildPaginationMeta({
            page: paginationParams.page,
            pageSize: paginationParams.pageSize,
            totalItems: 0,
          }),
        } : {}),
      })
    }

    const academicYearRows = await prisma.class.findMany({
      where: {
        schoolId: { in: validSchoolIds },
        deletedAt: null,
        school: { deletedAt: null },
      },
      select: { academicYear: true },
      orderBy: { academicYear: 'desc' },
    })
    const academicYears = Array.from(new Set(academicYearRows.map((row) => row.academicYear)))

    const where: Prisma.ClassWhereInput = {
      schoolId: { in: validSchoolIds },
      ...(academicYear ? { academicYear } : {}),
      deletedAt: null,
      school: { deletedAt: null },
      ...(searchTokens.length > 0 ? {
        AND: searchTokens.map((terms) => ({
          OR: [
            ...terms.map((term) => ({ grade: { contains: term, mode: 'insensitive' as const } })),
            ...terms.map((term) => ({ section: { contains: term, mode: 'insensitive' as const } })),
            ...terms.map((term) => ({ shift: { contains: term, mode: 'insensitive' as const } })),
            ...terms.map((term) => ({
              school: { name: { contains: term, mode: 'insensitive' as const }, deletedAt: null },
            })),
            ...(searchedAcademicYear ? [{ academicYear: searchedAcademicYear }] : []),
          ],
        })),
      } : {}),
    }
    const totalItems = shouldPaginate ? await prisma.class.count({ where }) : undefined
    const classes = await prisma.class.findMany({
      where,
      ...(shouldPaginate ? { skip: paginationParams.skip, take: paginationParams.take } : {}),
      include: { school: true },
      orderBy: [
        { academicYear: 'desc' },
        { grade: 'asc' },
        { section: 'asc' }
      ]
    })

    return NextResponse.json({
      classes,
      academicYears,
      ...(shouldPaginate && typeof totalItems === 'number' ? {
        pagination: buildPaginationMeta({
          page: paginationParams.page,
          pageSize: paginationParams.pageSize,
          totalItems,
        }),
      } : {}),
    })
  } catch (error) {
    console.error('Classes GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { grade, section, shift, schoolId, academicYear: rawAcademicYear } = await request.json()
    const academicYear = parseAcademicYear(rawAcademicYear)

    if (!grade || !section || !shift || !schoolId || !academicYear) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_SHIFTS.includes(shift)) {
      return NextResponse.json({ error: 'Invalid shift value' }, { status: 400 })
    }

    if (!VALID_GRADES.includes(grade)) {
      return NextResponse.json({ error: 'Invalid grade value' }, { status: 400 })
    }

    if (!isCoordinatorForSchool(auth.user, schoolId)) return forbiddenResponse()

    const existingClass = await prisma.class.findUnique({
      where: { schoolId_grade_section_shift_academicYear: { schoolId, grade, section, shift, academicYear } }
    })

    if (existingClass) {
      return NextResponse.json({ error: 'Class already exists' }, { status: 400 })
    }

    const newClass = await prisma.class.create({
      data: { grade, section, shift, schoolId, academicYear },
      include: { school: true }
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'CREATE_CLASS', { classId: newClass.id }, ipAddress)

    return NextResponse.json({ class: newClass })
  } catch (error) {
    console.error('Classes POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
