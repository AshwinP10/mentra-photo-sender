-- Phase 2: Face Embedding Generation System
-- Run this SQL in your Supabase SQL Editor

-- Enable the vector extension for storing embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing table if it exists (clean slate)
DROP TABLE IF EXISTS public.face_embeddings;

-- Create face_embeddings table (clean version)
CREATE TABLE public.face_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    face_crop_url TEXT, -- URL of the face crop image in storage
    embedding TEXT, -- 128-dimensional face embedding stored as JSON string
    confidence FLOAT, -- Confidence score of the embedding extraction
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata for future person matching
    temp_person_id TEXT, -- Links to the temp person ID from Phase 1
    is_processed BOOLEAN DEFAULT FALSE -- Flag for Phase 3 person matching
);

-- Create indexes for performance
CREATE INDEX idx_face_embeddings_temp_person_id 
ON public.face_embeddings (temp_person_id);

CREATE INDEX idx_face_embeddings_is_processed 
ON public.face_embeddings (is_processed);

-- Example queries for Phase 2 testing:
-- 
-- Get all embeddings for a specific face crop:
-- SELECT * FROM face_embeddings WHERE face_crop_record_id = 'your_face_crop_record_id';
-- 
-- Find similar faces using cosine similarity:
-- SELECT face_crop_record_id, 1 - (embedding <=> '[your_embedding_vector]') as similarity 
-- FROM face_embeddings 
-- ORDER BY embedding <=> '[your_embedding_vector]' 
-- LIMIT 10;
-- 
-- Get embeddings for a temp person:
-- SELECT * FROM face_embeddings WHERE temp_person_id = 'temp_person_123_face_1';
