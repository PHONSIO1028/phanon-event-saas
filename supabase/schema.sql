-- Exécuter dans Supabase SQL Editor. Toutes les tables sont privées par utilisateur.
create extension if not exists pgcrypto;
create table public.clients(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,name text not null,phone text,email text,created_at timestamptz not null default now());
create table public.events(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,client_id uuid not null references public.clients(id) on delete cascade,name text not null,date date not null,amount numeric(12,0) not null default 0 check(amount>=0),status text not null default 'prospect',created_at timestamptz not null default now());
create table public.event_payments(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,event_id uuid not null references public.events(id) on delete cascade,amount numeric(12,0) not null check(amount>0),method text not null,created_at timestamptz not null default now());
create table public.subscriptions(user_id uuid primary key references auth.users(id) on delete cascade,plan text not null default 'free' check(plan in ('free','starter','pro','studio')),expires_at timestamptz,updated_at timestamptz not null default now());
create table public.subscription_payments(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,transaction_id text not null unique,plan text not null check(plan in ('starter','pro','studio')),amount integer not null check(amount>0),status text not null default 'pending' check(status in ('pending','accepted','refused')),created_at timestamptz not null default now(),accepted_at timestamptz);
create index on public.clients(user_id);create index on public.events(user_id);create index on public.event_payments(user_id);create index on public.subscription_payments(user_id);
-- Empêche de relier un client ou événement appartenant à un autre utilisateur.
create or replace function public.validate_event_owner() returns trigger language plpgsql set search_path=public as $$begin if not exists(select 1 from public.clients where id=new.client_id and user_id=new.user_id) then raise exception 'Client non autorisé';end if;return new;end$$;
create trigger check_event_owner before insert or update on public.events for each row execute function public.validate_event_owner();
create or replace function public.validate_payment_owner() returns trigger language plpgsql set search_path=public as $$begin if not exists(select 1 from public.events where id=new.event_id and user_id=new.user_id) then raise exception 'Événement non autorisé';end if;return new;end$$;
create trigger check_payment_owner before insert or update on public.event_payments for each row execute function public.validate_payment_owner();
alter table public.clients enable row level security;alter table public.events enable row level security;alter table public.event_payments enable row level security;alter table public.subscriptions enable row level security;alter table public.subscription_payments enable row level security;
create policy clients_owner on public.clients for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy events_owner on public.events for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy payments_owner on public.event_payments for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy subscriptions_read on public.subscriptions for select to authenticated using(user_id=auth.uid());
create policy subscription_payments_read on public.subscription_payments for select to authenticated using(user_id=auth.uid());
-- Appelé uniquement par le serveur après vérification du paiement CinetPay.
create or replace function public.activate_subscription_payment(p_transaction_id text) returns void language plpgsql security definer set search_path=public as $$declare p public.subscription_payments%rowtype;begin select * into p from public.subscription_payments where transaction_id=p_transaction_id for update;if not found then raise exception 'Transaction inconnue';end if;if p.status='accepted' then return;end if;if p.status<>'pending' then raise exception 'Transaction non payable';end if;update public.subscription_payments set status='accepted',accepted_at=now() where id=p.id;insert into public.subscriptions(user_id,plan,expires_at) values(p.user_id,p.plan,now()+interval '30 days') on conflict(user_id) do update set plan=excluded.plan,expires_at=greatest(coalesce(public.subscriptions.expires_at,now()),now())+interval '30 days',updated_at=now();end$$;
revoke all on function public.activate_subscription_payment(text) from public,anon,authenticated;
grant execute on function public.activate_subscription_payment(text) to service_role;

-- ==========================================================
-- Extension : profil pro, localisation événement, devis,
-- contrats et livraisons (écrans devis/contrats/livraison).
-- ==========================================================
alter table public.events add column if not exists location text not null default '';

create table public.profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default '',
  full_name text not null default '',
  phone text not null default '',
  address text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table public.quotes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'brouillon' check(status in ('brouillon','envoye','accepte','refuse')),
  created_at timestamptz not null default now()
);
create index on public.quotes(user_id);
create or replace function public.validate_quote_owner() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.events where id=new.event_id and user_id=new.user_id) then
    raise exception 'Événement non autorisé';
  end if;
  return new;
end$$;
create trigger check_quote_owner before insert or update on public.quotes for each row execute function public.validate_quote_owner();
alter table public.quotes enable row level security;
create policy quotes_owner on public.quotes for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table public.contracts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  template text not null default 'general' check(template in ('mariage','anniversaire','general')),
  status text not null default 'brouillon' check(status in ('brouillon','envoye','signe')),
  created_at timestamptz not null default now()
);
create index on public.contracts(user_id);
create or replace function public.validate_contract_owner() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.events where id=new.event_id and user_id=new.user_id) then
    raise exception 'Événement non autorisé';
  end if;
  return new;
end$$;
create trigger check_contract_owner before insert or update on public.contracts for each row execute function public.validate_contract_owner();
alter table public.contracts enable row level security;
create policy contracts_owner on public.contracts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table public.deliveries(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  link text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.deliveries(user_id);
create or replace function public.validate_delivery_owner() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.events where id=new.event_id and user_id=new.user_id) then
    raise exception 'Événement non autorisé';
  end if;
  return new;
end$$;
create trigger check_delivery_owner before insert or update on public.deliveries for each row execute function public.validate_delivery_owner();
alter table public.deliveries enable row level security;
create policy deliveries_owner on public.deliveries for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
