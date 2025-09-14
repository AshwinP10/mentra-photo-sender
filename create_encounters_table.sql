-- Create encounters table in Supabase
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    photo_id TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    photo_filename TEXT,
    photo_size INTEGER,
    photo_mime_type TEXT,
    session_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_encounters_user_id ON encounters(user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_timestamp ON encounters(timestamp);
CREATE INDEX IF NOT EXISTS idx_encounters_photo_id ON encounters(photo_id);

-- Enable Row Level Security
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all data
CREATE POLICY "Service role can access encounters" ON encounters
    FOR ALL USING (auth.role() = 'service_role');
