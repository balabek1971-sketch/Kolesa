# Supabase schema

`schema-v2.sql` is the production foundation applied to the Supabase project on
2026-07-22. `hotfix-20260722-media-rls.sql` fixes public media/stat reads without
exposing protected listing columns.

Required dashboard configuration:

1. Enable phone OTP and connect the regional provider through a Send SMS Hook.
2. Keep the `service_role` key only in Railway variables.
3. Seed `vehicle_brands`, `vehicle_models`, and `locations` in separate migrations.
4. Create the first moderator role through a controlled administrative operation.

Cloudflare R2 buckets and Cloudflare Stream are external services. The SQL stores only
their object keys, asset IDs, dimensions, durations, and processing states.
