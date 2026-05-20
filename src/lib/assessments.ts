export const READING_ASSESSMENT_TYPE_CODE = 'READING'

export type ReadingLevelCode = 'DNI' | 'LO' | 'SO' | 'RW' | 'RS' | 'RTS' | 'RTF'

export interface AssessmentLevelStyle {
  color: string
  backgroundColor: string
  textColor: string
}

export interface AssessmentLevelMetadata {
  isAttention: boolean
  style: AssessmentLevelStyle
}

export interface AssessmentLevelLike {
  code?: string | null
  isAttention?: boolean | null
  color?: string | null
  backgroundColor?: string | null
  textColor?: string | null
}

const FALLBACK_STYLE: AssessmentLevelStyle = {
  color: '#6B7280',
  backgroundColor: '#F3F4F6',
  textColor: '#374151',
}

export const READING_LEVEL_METADATA: Record<ReadingLevelCode, AssessmentLevelMetadata> = {
  DNI: {
    isAttention: true,
    style: { color: '#DC2626', backgroundColor: '#FEE2E2', textColor: '#991B1B' },
  },
  LO: {
    isAttention: true,
    style: { color: '#DC2626', backgroundColor: '#FEE2E2', textColor: '#991B1B' },
  },
  SO: {
    isAttention: true,
    style: { color: '#DC2626', backgroundColor: '#FEE2E2', textColor: '#991B1B' },
  },
  RW: {
    isAttention: false,
    style: { color: '#F97316', backgroundColor: '#FFEDD5', textColor: '#9A3412' },
  },
  RS: {
    isAttention: false,
    style: { color: '#EAB308', backgroundColor: '#FEF9C3', textColor: '#854D0E' },
  },
  RTS: {
    isAttention: false,
    style: { color: '#84CC16', backgroundColor: '#ECFCCB', textColor: '#3F6212' },
  },
  RTF: {
    isAttention: false,
    style: { color: '#16A34A', backgroundColor: '#DCFCE7', textColor: '#166534' },
  },
}

export function isReadingLevelCode(code: string): code is ReadingLevelCode {
  return code in READING_LEVEL_METADATA
}

export function getAssessmentLevelStyle(level: AssessmentLevelLike | undefined): AssessmentLevelStyle {
  if (level?.color && level.backgroundColor && level.textColor) {
    return {
      color: level.color,
      backgroundColor: level.backgroundColor,
      textColor: level.textColor,
    }
  }

  if (level?.code && isReadingLevelCode(level.code)) {
    return READING_LEVEL_METADATA[level.code].style
  }

  return FALLBACK_STYLE
}

export function isAttentionAssessmentLevel(level: AssessmentLevelLike | undefined): boolean {
  if (typeof level?.isAttention === 'boolean') return level.isAttention
  return !!level?.code && isReadingLevelCode(level.code) && READING_LEVEL_METADATA[level.code].isAttention
}

export function getReadingAssessmentLevelFilter() {
  return { assessmentType: { code: READING_ASSESSMENT_TYPE_CODE } }
}
