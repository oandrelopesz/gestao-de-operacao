-- Create google_oauth_tokens table
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT google_oauth_tokens_user_id_key UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own google tokens' AND tablename = 'google_oauth_tokens') THEN
        CREATE POLICY "Users can view their own google tokens"
        ON public.google_oauth_tokens FOR SELECT
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own google tokens' AND tablename = 'google_oauth_tokens') THEN
        CREATE POLICY "Users can insert their own google tokens"
        ON public.google_oauth_tokens FOR INSERT
        WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own google tokens' AND tablename = 'google_oauth_tokens') THEN
        CREATE POLICY "Users can update their own google tokens"
        ON public.google_oauth_tokens FOR UPDATE
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own google tokens' AND tablename = 'google_oauth_tokens') THEN
        CREATE POLICY "Users can delete their own google tokens"
        ON public.google_oauth_tokens FOR DELETE
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_google_oauth_tokens_updated_at') THEN
        CREATE TRIGGER set_google_oauth_tokens_updated_at
        BEFORE UPDATE ON public.google_oauth_tokens
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;