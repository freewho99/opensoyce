# Phase 2 Supabase migration — Slack Interactivity

This migration adds columns to the `exceptions` table to track the request lifecycle and Slack notifications metadata.

Run this SQL in your Supabase SQL Editor:

```sql
-- Phase 2: Add status, revoked_by, and slack_ts to exceptions table
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS revoked_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS slack_ts VARCHAR(100);

-- Update existing exceptions without status to 'approved'
UPDATE public.exceptions SET status = 'approved' WHERE status IS NULL;
```
