-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Locations Table
create table if not exists public.locations (
  id text primary key,
  name text not null,
  description text,
  icon text,
  type text
);

-- 2. App Users Table
create table if not exists public.app_users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password text not null, -- Note: Storing plain text for demo parity. Use Auth in production.
  name text not null,
  role text not null,
  branch_code text,
  branch_name text,
  accessible_branches text[]
);

-- Add accessible_branches if it doesn't exist (for existing tables)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='app_users' and column_name='accessible_branches') then
    alter table public.app_users add column accessible_branches text[];
  end if;
end $$;

-- 3. Inventory Items Table
create table if not exists public.inventory_items (
  id uuid primary key default uuid_generate_v4(),
  location_id text references public.locations(id) on delete cascade,
  name_en text not null,
  name_ar text not null,
  description text,
  category text not null,
  quantity numeric not null default 0,
  unit text not null,
  min_threshold numeric not null default 0,
  last_updated timestamp with time zone default now()
);

-- 4. Transactions Table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  transfer_group_id text,
  date timestamp with time zone default now(),
  type text not null,
  status text not null,
  from_location text,
  to_location text,
  item_name text not null,
  quantity numeric not null,
  unit text not null,
  performed_by text not null,
  notes text,
  rejection_reason text
);

-- Seed Data: Locations
INSERT INTO public.locations (id, name, description, icon, type) VALUES
('warehouse', 'Warehouse', 'Main storage facility for bulk items and raw materials.', 'warehouse', 'central'),
('mammal', 'Mammal', 'Production and processing unit.', 'factory', 'central')
ON CONFLICT (id) DO NOTHING;

-- Seed Data: Users
INSERT INTO public.app_users (username, password, name, role) VALUES
('admin', '123', 'System Administrator', 'admin'),
('warehouse', '123', 'Main Supervisor', 'warehouse_manager'),
('employee', '123', 'Mammal Staff', 'mammal_employee')
ON CONFLICT (username) DO NOTHING;

-- Seed Data: Warehouse Inventory (Only insert if table is empty to avoid duplicates on re-run)
INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'warehouse', 'Arabica Coffee Beans', 'بن قهوة أرابيكا', 'High-quality roasted arabica beans from Ethiopia.', 'Raw Material', 500, 'kg', 100
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'warehouse' AND name_en = 'Arabica Coffee Beans');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'warehouse', 'Paper Cups (12oz)', 'أكواب ورقية (12 أونصة)', 'Disposable eco-friendly paper cups for hot beverages.', 'Packaging', 5000, 'pcs', 1000
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'warehouse' AND name_en = 'Paper Cups (12oz)');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'warehouse', 'Caramel Syrup', 'شراب الكراميل', 'Premium caramel flavoring for coffee and lattes.', 'Ingredients', 45, 'bottles', 20
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'warehouse' AND name_en = 'Caramel Syrup');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'warehouse', 'Whole Milk (UHT)', 'حليب كامل الدسم (معقم)', 'Long-life full cream milk for steaming.', 'Ingredients', 200, 'liters', 50
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'warehouse' AND name_en = 'Whole Milk (UHT)');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'warehouse', 'Sugar Sticks', 'أصابع سكر', 'Individual 5g white sugar portions.', 'Ingredients', 10000, 'pcs', 2000
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'warehouse' AND name_en = 'Sugar Sticks');

-- Seed Data: Mammal Inventory
INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'mammal', 'Arabica Coffee Beans', 'بن قهوة أرابيكا', 'Daily supply of roasted beans for production.', 'Raw Material', 20, 'kg', 50
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'mammal' AND name_en = 'Arabica Coffee Beans');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'mammal', 'Paper Cups (12oz)', 'أكواب ورقية (12 أونصة)', 'Current batch of serving cups.', 'Packaging', 150, 'pcs', 200
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'mammal' AND name_en = 'Paper Cups (12oz)');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'mammal', 'Vanilla Syrup', 'شراب الفانيليا', 'Sweet vanilla extract for signature drinks.', 'Ingredients', 5, 'bottles', 2
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'mammal' AND name_en = 'Vanilla Syrup');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'mammal', 'Fresh Milk', 'حليب طازج', 'Locally sourced fresh milk for latte art.', 'Ingredients', 12, 'liters', 10
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'mammal' AND name_en = 'Fresh Milk');

INSERT INTO public.inventory_items (location_id, name_en, name_ar, description, category, quantity, unit, min_threshold)
SELECT 'mammal', 'Chocolate Sauce', 'صلصة الشوكولاتة', 'Rich dark chocolate syrup for mochas.', 'Ingredients', 8, 'bottles', 3
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = 'mammal' AND name_en = 'Chocolate Sauce');

-- Policies (Optional: Enable RLS and run these if you need security policies)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid "already exists" errors on re-run
DROP POLICY IF EXISTS "Public Access" ON public.locations;
DROP POLICY IF EXISTS "Public Access" ON public.app_users;
DROP POLICY IF EXISTS "Public Access" ON public.inventory_items;
DROP POLICY IF EXISTS "Public Access" ON public.transactions;

-- Create policies
CREATE POLICY "Public Access" ON public.locations FOR ALL USING (true);
CREATE POLICY "Public Access" ON public.app_users FOR ALL USING (true);
CREATE POLICY "Public Access" ON public.inventory_items FOR ALL USING (true);
CREATE POLICY "Public Access" ON public.transactions FOR ALL USING (true);
