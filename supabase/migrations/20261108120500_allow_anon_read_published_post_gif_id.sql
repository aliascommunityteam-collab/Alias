-- Allow anonymous visitors to read GIF IDs in published feed posts.
-- This preserves the existing RLS policies and onboarding requirements.
GRANT SELECT (gif_id) ON TABLE public.posts TO anon;
