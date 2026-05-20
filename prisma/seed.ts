import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import { READING_ASSESSMENT_TYPE_CODE, READING_LEVEL_METADATA } from '../src/lib/assessments'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aleno?schema=public'
console.log('Connection URL:', DATABASE_URL)

const pool = new Pool({ connectionString: DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const readingAssessmentType = await prisma.assessmentType.upsert({
    where: { code: READING_ASSESSMENT_TYPE_CODE },
    update: {
      name: 'Reading',
      description: 'Reading level tracking',
      displayOrder: 1,
      isActive: true,
      monthlyTrackingEnabled: true,
    },
    create: {
      code: READING_ASSESSMENT_TYPE_CODE,
      name: 'Reading',
      description: 'Reading level tracking',
      displayOrder: 1,
      isActive: true,
      monthlyTrackingEnabled: true,
    },
  })

  const levels = [
    { code: 'DNI', name: 'Does Not Identify', order: 1, description: 'Student does not identify letters' },
    { code: 'LO', name: 'Letters Only', order: 2, description: 'Student recognizes letters only' },
    { code: 'SO', name: 'Syllables Only', order: 3, description: 'Student reads syllables only' },
    { code: 'RW', name: 'Reads Words', order: 4, description: 'Student reads simple words' },
    { code: 'RS', name: 'Reads Sentences', order: 5, description: 'Student reads sentences' },
    { code: 'RTS', name: 'Reads Text Syllabically', order: 6, description: 'Student reads text syllabically' },
    { code: 'RTF', name: 'Reads Text Fluently', order: 7, description: 'Student reads text fluently' },
  ]

  for (const level of levels) {
    const metadata = READING_LEVEL_METADATA[level.code as keyof typeof READING_LEVEL_METADATA]

    await prisma.assessmentLevel.upsert({
      where: {
        assessmentTypeId_code: {
          assessmentTypeId: readingAssessmentType.id,
          code: level.code,
        },
      },
      update: {
        ...level,
        isAttention: metadata.isAttention,
        color: metadata.style.color,
        backgroundColor: metadata.style.backgroundColor,
        textColor: metadata.style.textColor,
        isActive: true,
      },
      create: {
        ...level,
        assessmentTypeId: readingAssessmentType.id,
        isAttention: metadata.isAttention,
        color: metadata.style.color,
        backgroundColor: metadata.style.backgroundColor,
        textColor: metadata.style.textColor,
        isActive: true,
      },
    })
  }

  console.log('Reading levels seeded successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
