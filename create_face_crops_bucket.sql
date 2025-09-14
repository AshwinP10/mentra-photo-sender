-- Phase 1: Face Cropping & Storage System
-- Run this SQL in your Supabase SQL Editor

-- Create face_crops storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('face_crops', 'face_crops', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage permissions for face_crops bucket
CREATE POLICY "Allow all access to face_crops for service role"
ON storage.objects 
FOR ALL
USING (bucket_id = 'face_crops' AND auth.role() = 'service_role');

-- Add metadata column to testphoto table for storing face crop info
ALTER TABLE public.testphoto 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index on metadata for better query performance
CREATE INDEX IF NOT EXISTS idx_testphoto_metadata 
ON public.testphoto USING GIN (metadata);

-- Create index on status for filtering face crops vs full photos
CREATE INDEX IF NOT EXISTS idx_testphoto_status 
ON public.testphoto (status);

-- Example queries to use after Phase 1 implementation:
-- 
-- Get all face crops:
-- SELECT * FROM testphoto WHERE status = 'face_crop';
-- 
-- Get face crops for a specific photo:
-- SELECT * FROM testphoto WHERE metadata->>'photo_request_id' = 'your_photo_id';
-- 
-- Get all temp persons:
-- SELECT DISTINCT metadata->>'temp_person_id' FROM testphoto WHERE status = 'face_crop';
