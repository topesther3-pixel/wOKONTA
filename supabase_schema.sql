-- WO Akontaa Supabase Schema

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    phone_number TEXT,
    is_setup_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT REFERENCES public.users(uid) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('income', 'expense')),
    amount NUMERIC NOT NULL DEFAULT 0,
    item TEXT,
    category TEXT DEFAULT 'business',
    quantity NUMERIC,
    unit TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Debts Table
CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT REFERENCES public.users(uid) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    paid_amount NUMERIC DEFAULT 0,
    status TEXT CHECK (status IN ('unpaid', 'paid')) DEFAULT 'unpaid',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

-- Create Policies (Allow all for now for testing, or restrict by uid)
-- Note: In a production app, you'd use auth.uid() = uid
-- Since we are using Firebase Auth and passing the UID manually, 
-- we'll allow all operations for the purpose of this diagnostic.

CREATE POLICY "Allow all on users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on debts" ON public.debts FOR ALL USING (true) WITH CHECK (true);
