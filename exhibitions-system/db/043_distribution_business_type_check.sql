-- 043_distribution_business_type_check.sql
-- Allow the 'distribution' business_type at the column-constraint level.
-- The create_tenant() CASE already accepted 'distribution' (migration 042),
-- but the tenants_business_type_check CHECK constraint still only permitted
-- retail/restaurant/manufacturing, so inserts/updates were rejected.
-- This drops and recreates the constraint to include 'distribution'.

alter table exhibitions.tenants
  drop constraint if exists tenants_business_type_check;

alter table exhibitions.tenants
  add constraint tenants_business_type_check
  check (business_type = any (array['retail','restaurant','manufacturing','distribution']));
