-- Keep the assessment that the application previously considered effective for each month.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'student_assessments' AND column_name = 'recorded_at'
  ) THEN
    DELETE FROM "student_assessments"
    WHERE "id" IN (
      SELECT "id"
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "student_id", "assessment_type_id", DATE_TRUNC('month', "recorded_at")
            ORDER BY "recorded_at" DESC, "created_at" DESC, "id" DESC
          ) AS duplicate_rank
        FROM "student_assessments"
      ) ranked_assessments
      WHERE duplicate_rank > 1
    );

    ALTER TABLE "student_assessments" ADD COLUMN IF NOT EXISTS "reference_month" DATE;
    UPDATE "student_assessments"
    SET "reference_month" = DATE_TRUNC('month', "recorded_at")::DATE
    WHERE "reference_month" IS NULL;
    ALTER TABLE "student_assessments" DROP COLUMN "recorded_at";
  END IF;
END $$;

ALTER TABLE "student_assessments"
  ALTER COLUMN "reference_month" SET NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "student_assessments_student_id_assessment_type_id_recorded_at_created_at_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "student_assessments_student_id_assessment_type_id_reference_month_key"
  ON "student_assessments"("student_id", "assessment_type_id", "reference_month");

CREATE INDEX IF NOT EXISTS "student_assessments_student_id_assessment_type_id_reference_month_created_at_idx"
  ON "student_assessments"("student_id", "assessment_type_id", "reference_month", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_assessments_reference_month_first_day_check'
  ) THEN
    ALTER TABLE "student_assessments"
      ADD CONSTRAINT "student_assessments_reference_month_first_day_check"
      CHECK (EXTRACT(DAY FROM "reference_month") = 1);
  END IF;
END $$;
