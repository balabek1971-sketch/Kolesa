# Supabase schema

`schema-v2.sql` is the production foundation applied to the Supabase project on
2026-07-22. `hotfix-20260722-media-rls.sql` fixes public media/stat reads without
exposing protected listing columns.

Required dashboard configuration:

1. Enable phone OTP and connect the regional provider through a Send SMS Hook.
2. Keep the `service_role` key only in Railway variables.
3. Seed `vehicle_brands`, `vehicle_models`, and `locations` in separate migrations.
4. Create the first moderator role through a controlled administrative operation.

Cloudflare R2 is an external service. The SQL stores only object keys, dimensions,
durations, and processing states.

## Autolenta and chat

Apply `hotfix-20260905-autofeed-chat.sql` after the earlier production hotfixes.
It adds participant-only conversations, Realtime messages, consent-aware behavior
events, and a five-item personalized Autolenta RPC. The RPC contract is stable;
when traffic grows, a queue worker can materialize the same scores into
`user_preference_features` without changing the frontend.

Apply `hotfix-20260906-owner-favorites-autofeed.sql` afterward. It lets owners
save and view their own active listings in Autolenta while keeping owner events
and owner favorites out of public ranking counters.
