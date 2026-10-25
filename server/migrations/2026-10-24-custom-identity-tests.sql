-- Explicit, separately approved operation. No rows are changed or deleted.
-- Run in a transaction with short lock/statement timeouts.
ALTER TABLE identity_generated_reports DROP CONSTRAINT identity_generated_reports_section_check;
ALTER TABLE identity_generated_reports ADD CONSTRAINT identity_generated_reports_section_check
  CHECK (section IN ('hogan','gallup') OR section ~ '^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
ALTER TABLE identity_report_uploads DROP CONSTRAINT identity_report_uploads_section_check;
ALTER TABLE identity_report_uploads ADD CONSTRAINT identity_report_uploads_section_check
  CHECK (section IN ('hogan','gallup') OR section ~ '^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
