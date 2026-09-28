-- NovaTech final deployment RLS fixes.
-- Run this only in Supabase SQL Editor. It does not delete products or users.

-- Customers can manage only their own saved phones.
alter table public.saved_phones enable row level security;

drop policy if exists "Users can view their own saved phones" on public.saved_phones;
drop policy if exists "Users can save their own saved phones" on public.saved_phones;
drop policy if exists "Users can update their own saved phones" on public.saved_phones;
drop policy if exists "Users can delete their own saved phones" on public.saved_phones;

create policy "Users can view their own saved phones"
on public.saved_phones for select to authenticated
using (customer_id = auth.uid());

create policy "Users can save their own saved phones"
on public.saved_phones for insert to authenticated
with check (customer_id = auth.uid());

create policy "Users can update their own saved phones"
on public.saved_phones for update to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

create policy "Users can delete their own saved phones"
on public.saved_phones for delete to authenticated
using (customer_id = auth.uid());

-- Product catalogue should be readable by customers without requiring an admin login.
-- Admin-only INSERT/UPDATE/DELETE policies should remain in place.
alter table public.products enable row level security;

drop policy if exists "Public can view visible products" on public.products;
create policy "Public can view visible products"
on public.products for select to anon, authenticated
using (coalesce(is_hidden, false) = false);

-- Customers can mark their own notifications as read.
alter table public.notifications enable row level security;
drop policy if exists "Customers can update their own notifications" on public.notifications;
create policy "Customers can update their own notifications"
on public.notifications for update to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());
