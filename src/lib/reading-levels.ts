import {
  getAssessmentLevelStyle,
  isAttentionAssessmentLevel,
  isReadingLevelCode,
  READING_LEVEL_METADATA,
  type AssessmentLevelStyle as ReadingLevelStyle,
  type AssessmentLevelMetadata as ReadingLevelMetadata,
  type ReadingLevelCode,
} from '@/lib/assessments'

export { isReadingLevelCode, READING_LEVEL_METADATA }
export type { ReadingLevelCode, ReadingLevelMetadata, ReadingLevelStyle }

export function isAttentionReadingLevel(code: string | undefined): boolean {
  return isAttentionAssessmentLevel({ code })
}

export function getReadingLevelStyle(code: string | undefined): ReadingLevelStyle {
  return getAssessmentLevelStyle({ code })
}
