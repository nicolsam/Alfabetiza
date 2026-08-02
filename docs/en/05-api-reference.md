# API Reference

All protected routes expect:

```text
Authorization: Bearer <token>
```

Common error responses include `401 Unauthorized`, `401 Invalid token`, `403 Forbidden`, `404 Not found`, `400` validation errors, and `500 Internal error`.

## Auth

- `POST /api/auth`: register or login with `action`.
- `POST /api/auth/heartbeat`: refresh session activity for the current token.

## Dashboard

- `GET /api/dashboard`: returns total students, reading-level distribution, students needing attention, most common level, and monthly improvement count.
- Supports optional `schoolId` query filtering where implemented by the dashboard.

## Schools

- `GET /api/schools`: list schools assigned to the current teacher.
- `POST /api/schools`: create a school and assign it to the current teacher.
- `PUT /api/schools/[id]`: update school data when the teacher has access.
- `DELETE /api/schools/[id]`: soft delete a school.
- `PATCH /api/schools/[id]/restore`: restore a soft-deleted school.

## Classes

- `GET /api/classes`: list classes visible to the current teacher. Supports school filtering.
- `POST /api/classes`: create a class in an accessible school.
- `PUT /api/classes/[id]`: update grade, section, or shift.
- `DELETE /api/classes/[id]`: soft delete a class.
- `PATCH /api/classes/[id]/restore`: restore a soft-deleted class.

Class creation and updates validate grade, section, shift, teacher-school access, and duplicate class uniqueness.

## Students

- `GET /api/students`: list visible students. Supports school and class filtering.
- `POST /api/students`: create a student in an accessible class.
- `PUT /api/students/[id]`: update student data.
- `DELETE /api/students/[id]`: soft delete a student.
- `PATCH /api/students/[id]/restore`: restore a soft-deleted student.
- `PATCH /api/students/update`: create or replace a monthly reading level using `referenceMonth` (`MM/YYYY`). Existing months return `409 MONTH_ALREADY_RECORDED` until resent with `confirmReplace: true`.
- `GET /api/students/[id]/history`: return student details and reading history.

Student numbers are unique within a school.
Reading assessments are unique per student, assessment type, and reference month; exact assessment days are not stored.

## Reading Levels

- `GET /api/levels`: return ordered reading levels.

Reading levels are seeded reference data and should not be edited casually through application code.

## Admin

Admin routes require `isGlobalAdmin`.

- `GET /api/admin/stats`: aggregate admin dashboard stats.
- `GET /api/admin/logs`: audit logs.
- `GET /api/admin/sessions`: active session information.

## Route Implementation Notes

Route files live under `src/app/api`. Keep validation close to route boundaries, use Prisma through `src/lib/db.ts`, and preserve existing response shapes unless tests and frontend callers are updated together.
