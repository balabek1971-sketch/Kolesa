# QazAuto media moderation worker

The Worker accepts authenticated moderation jobs from the Go API, places them on Cloudflare Queues, checks R2 photos and Cloudflare Stream thumbnails with `@cf/facebook/detr-resnet-50`, and records the decision in Supabase.

## Cloudflare resources

```sh
npx wrangler queues create qazauto-media-moderation
npx wrangler queues create qazauto-media-moderation-dlq
```

The `MEDIA` R2 binding must point to the same bucket used by the Go upload API. If the production bucket is not named `qazauto-media`, update `wrangler.jsonc` before deployment.

Set Worker secrets without committing their values:

```sh
npx wrangler secret put API_SECRET --config cloudflare/moderation-worker/wrangler.jsonc
npx wrangler secret put DISPATCH_SECRET --config cloudflare/moderation-worker/wrangler.jsonc
npx wrangler secret put STREAM_CUSTOMER_CODE --config cloudflare/moderation-worker/wrangler.jsonc
npx wrangler deploy --config cloudflare/moderation-worker/wrangler.jsonc
```

`API_SECRET`, `DISPATCH_SECRET`, and Railway's `MODERATION_WORKER_SECRET` must contain the same random value. The Supabase service-role key remains only on Railway.
Workers AI is connected through the `AI` binding, so no separate AI API token is required.

Run `supabase/hotfix-20260909-automated-media-moderation.sql` before enabling the Go endpoint in production.
