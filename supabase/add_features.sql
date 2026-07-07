-- =============================================
-- Golf Tracker — Feature Update Migration
-- Run this in the Supabase SQL Editor
-- =============================================

-- Remove old group_number constraint so we can support 2-10 groups
ALTER TABLE public.foursomes DROP CONSTRAINT IF EXISTS foursomes_group_number_check;
ALTER TABLE public.foursomes ADD CONSTRAINT foursomes_group_number_check CHECK (group_number BETWEEN 1 AND 10);

-- Add new columns to rounds
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS round_name    text           DEFAULT 'Golf Round';
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS game_type     text           DEFAULT 'vegas';
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS stakes        numeric(10,2)  DEFAULT 1.00;
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS hole_pars     integer[]      DEFAULT ARRAY[5,3,4,5,4,4,4,4,5,4,3,5,4,3,4,5,3,4];
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS hole_handicaps integer[]     DEFAULT ARRAY[5,11,1,7,15,13,17,9,3,2,18,8,4,10,14,6,16,12];
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS num_groups    integer        DEFAULT 3;

-- Master player roster (reusable across rounds)
CREATE TABLE IF NOT EXISTS public.roster (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text           NOT NULL UNIQUE,
  default_handicap  numeric(4,1)   NOT NULL DEFAULT 0,
  created_at        timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read roster"   ON public.roster FOR SELECT USING (true);
CREATE POLICY "Public insert roster" ON public.roster FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update roster" ON public.roster FOR UPDATE USING (true);
CREATE POLICY "Public delete roster" ON public.roster FOR DELETE USING (true);

-- Seed the 12 guys
INSERT INTO public.roster (name) VALUES
  ('David'),('Colin'),('Daegwon'),('Forrest'),('Joel'),('Judd'),
  ('Tosh'),('Matt'),('Stevie'),('Tarek'),('Kevin'),('Chris')
ON CONFLICT (name) DO NOTHING;

-- Realtime for roster
ALTER PUBLICATION supabase_realtime ADD TABLE public.roster;
