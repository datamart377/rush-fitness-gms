-- Add fields to trainers to match members table:
--   emergency_phone_2  — second emergency contact
--   photo_url          — profile photo (data URL or external URL)
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS emergency_phone_2 TEXT,
  ADD COLUMN IF NOT EXISTS photo_url         TEXT;
