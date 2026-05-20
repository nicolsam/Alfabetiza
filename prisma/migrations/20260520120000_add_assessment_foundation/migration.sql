-- CreateTable
CREATE TABLE "assessment_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "monthly_tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_levels" (
    "id" TEXT NOT NULL,
    "assessment_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "is_attention" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "background_color" TEXT NOT NULL DEFAULT '#F3F4F6',
    "text_color" TEXT NOT NULL DEFAULT '#374151',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_assessments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "assessment_type_id" TEXT NOT NULL,
    "assessment_level_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "student_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_code_key" ON "assessment_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_levels_assessment_type_id_code_key" ON "assessment_levels"("assessment_type_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_levels_assessment_type_id_order_key" ON "assessment_levels"("assessment_type_id", "order");

-- CreateIndex
CREATE INDEX "student_assessments_student_id_assessment_type_id_recorded_at_created_at_idx" ON "student_assessments"("student_id", "assessment_type_id", "recorded_at", "created_at");

-- CreateIndex
CREATE INDEX "student_assessments_assessment_type_id_assessment_level_id_idx" ON "student_assessments"("assessment_type_id", "assessment_level_id");

-- AddForeignKey
ALTER TABLE "assessment_levels" ADD CONSTRAINT "assessment_levels_assessment_type_id_fkey" FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_assessment_type_id_fkey" FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_assessment_level_id_fkey" FOREIGN KEY ("assessment_level_id") REFERENCES "assessment_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assessments" ADD CONSTRAINT "student_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the only currently enabled tracking type.
INSERT INTO "assessment_types" (
    "id",
    "code",
    "name",
    "description",
    "display_order",
    "updated_at"
) VALUES (
    'assessment-type-reading',
    'READING',
    'Reading',
    'Reading level tracking',
    1,
    CURRENT_TIMESTAMP
) ON CONFLICT ("code") DO NOTHING;

-- Copy existing reading levels into the generic level table while preserving IDs.
INSERT INTO "assessment_levels" (
    "id",
    "assessment_type_id",
    "name",
    "code",
    "order",
    "description",
    "is_attention",
    "color",
    "background_color",
    "text_color"
)
SELECT
    "reading_levels"."id",
    "assessment_types"."id",
    "reading_levels"."name",
    "reading_levels"."code",
    "reading_levels"."order",
    "reading_levels"."description",
    "reading_levels"."code" IN ('DNI', 'LO', 'SO'),
    CASE
        WHEN "reading_levels"."code" IN ('DNI', 'LO', 'SO') THEN '#DC2626'
        WHEN "reading_levels"."code" = 'RW' THEN '#F97316'
        WHEN "reading_levels"."code" = 'RS' THEN '#EAB308'
        WHEN "reading_levels"."code" = 'RTS' THEN '#84CC16'
        WHEN "reading_levels"."code" = 'RTF' THEN '#16A34A'
        ELSE '#6B7280'
    END,
    CASE
        WHEN "reading_levels"."code" IN ('DNI', 'LO', 'SO') THEN '#FEE2E2'
        WHEN "reading_levels"."code" = 'RW' THEN '#FFEDD5'
        WHEN "reading_levels"."code" = 'RS' THEN '#FEF9C3'
        WHEN "reading_levels"."code" = 'RTS' THEN '#ECFCCB'
        WHEN "reading_levels"."code" = 'RTF' THEN '#DCFCE7'
        ELSE '#F3F4F6'
    END,
    CASE
        WHEN "reading_levels"."code" IN ('DNI', 'LO', 'SO') THEN '#991B1B'
        WHEN "reading_levels"."code" = 'RW' THEN '#9A3412'
        WHEN "reading_levels"."code" = 'RS' THEN '#854D0E'
        WHEN "reading_levels"."code" = 'RTS' THEN '#3F6212'
        WHEN "reading_levels"."code" = 'RTF' THEN '#166534'
        ELSE '#374151'
    END
FROM "reading_levels"
CROSS JOIN "assessment_types"
WHERE "assessment_types"."code" = 'READING'
ON CONFLICT ("assessment_type_id", "code") DO NOTHING;

-- Copy existing reading history into the generic assessment table while preserving IDs.
INSERT INTO "student_assessments" (
    "id",
    "student_id",
    "enrollment_id",
    "assessment_type_id",
    "assessment_level_id",
    "user_id",
    "recorded_at",
    "created_at",
    "notes"
)
SELECT
    "student_reading_history"."id",
    "student_reading_history"."student_id",
    "student_reading_history"."enrollment_id",
    "assessment_types"."id",
    "student_reading_history"."reading_level_id",
    "student_reading_history"."user_id",
    "student_reading_history"."recorded_at",
    "student_reading_history"."created_at",
    "student_reading_history"."notes"
FROM "student_reading_history"
CROSS JOIN "assessment_types"
WHERE "assessment_types"."code" = 'READING'
ON CONFLICT ("id") DO NOTHING;
