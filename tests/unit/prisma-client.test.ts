import { describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'

describe('generated Prisma client', () => {
  it('can be imported from @prisma/client', () => {
    expect(typeof PrismaClient).toBe('function')
  })

  it('includes the project data models from prisma/schema.prisma', () => {
    expect(Prisma.ModelName).toEqual({
      School: 'School',
      Class: 'Class',
      User: 'User',
      UserSession: 'UserSession',
      AuditLog: 'AuditLog',
      UserSchool: 'UserSchool',
      UserInvite: 'UserInvite',
      Student: 'Student',
      StudentContact: 'StudentContact',
      StudentCommentary: 'StudentCommentary',
      StudentEnrollment: 'StudentEnrollment',
      AssessmentType: 'AssessmentType',
      AssessmentLevel: 'AssessmentLevel',
      StudentAssessment: 'StudentAssessment',
      StudentParentReportLink: 'StudentParentReportLink',
    })
  })

  it('includes scalar field enums for important query surfaces', () => {
    expect(Prisma.StudentScalarFieldEnum).toMatchObject({
      id: 'id',
      name: 'name',
      studentNumber: 'studentNumber',
      schoolId: 'schoolId',
      classId: 'classId',
      deletedAt: 'deletedAt',
    })

    expect(Prisma.StudentEnrollmentScalarFieldEnum).toMatchObject({
      id: 'id',
      studentId: 'studentId',
      classId: 'classId',
      startedAt: 'startedAt',
      endedAt: 'endedAt',
    })

    expect(Prisma.AssessmentLevelScalarFieldEnum).toMatchObject({
      id: 'id',
      assessmentTypeId: 'assessmentTypeId',
      name: 'name',
      code: 'code',
      order: 'order',
    })
  })
})
