const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

async function request(path) {
  const response = await fetch(`${baseUrl}/rest/v1${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

const listings = await request(
  "/listings?select=id,title,brand_name,model_name,status,expected_photo_count,expects_video,created_at,updated_at,published_at&deleted_at=is.null&order=created_at.desc&limit=12",
);
const listingIds = listings.map(({ id }) => id);
const media = listingIds.length
  ? await request(
    `/listing_media?select=id,listing_id,kind,provider,status,sort_order,mime_type,size_bytes,moderation_reason,created_at&deleted_at=is.null&listing_id=in.(${listingIds.join(",")})&order=created_at.asc`,
  )
  : [];
const mediaIds = media.map(({ id }) => id);
const uploads = mediaIds.length
  ? await request(
    `/media_uploads?select=id,media_id,created_at,expires_at,completed_at&media_id=in.(${mediaIds.join(",")})&order=created_at.asc`,
  )
  : [];

for (const listing of listings) {
  const listingMedia = media.filter(({ listing_id: listingId }) => listingId === listing.id);
  console.log(JSON.stringify({
    ...listing,
    media: listingMedia.map(({ listing_id: _listingId, ...item }) => ({
      ...item,
      uploads: uploads.filter(({ media_id: mediaId }) => mediaId === item.id),
    })),
  }));
}
