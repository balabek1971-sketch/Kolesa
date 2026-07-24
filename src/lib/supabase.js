import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const r2PublicUrl = String(import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/+$/, "");

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

function getPublicPhotoUrl(media) {
  if (!media) return "";

  const variants = media.variants || {};
  const variantUrl =
    variants.card ||
    variants.medium ||
    variants.thumbnail ||
    variants.original;

  if (typeof variantUrl === "string" && /^https?:\/\//.test(variantUrl)) {
    return variantUrl;
  }

  if (r2PublicUrl && media.object_key) {
    return `${r2PublicUrl}/${String(media.object_key).replace(/^\/+/, "")}`;
  }

  return "";
}

export function mapListingRow(row) {
  const photos = [...(row.listing_media || [])].filter(
    (media) => media.kind === "photo" && media.status === "ready"
  ).sort(
    (first, second) => first.sort_order - second.sort_order
  );

  return {
    id: row.id,
    title: row.title,
    brand: row.brand_name || row.brand,
    model: row.model_name || row.model,
    category: row.category,
    city: row.city_name || row.city,
    price: Number(row.price_kzt),
    year: row.year,
    mileage: row.mileage_km,
    condition: row.condition,
    body: row.body_type || "Не указан",
    gearbox: row.gearbox || "Не указана",
    originCountry: row.origin_country || "",
    engineType: row.engine_type || "",
    steering: row.steering || "",
    drivetrain: row.drivetrain || "",
    availability: row.availability || "in_stock",
    engineVolume: row.engine_volume ? Number(row.engine_volume) : 0,
    colorName: row.color_name || "",
    metallic: Boolean(row.metallic),
    isDealer: false,
    seller: row.seller_name || "Частный продавец",
    color: row.card_color || "#243b55",
    imageUrl: getPublicPhotoUrl(photos[0]),
    hasPhoto: Boolean(row.has_photo || photos.length),
    canFinance: Boolean(row.can_finance),
    cleared: Boolean(row.cleared),
    damaged: Boolean(row.damaged),
    score: row.score || 0,
    createdAt: row.created_at
  };
}

export async function fetchListings() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("listings")
    .select(`
      id,
      title,
      brand_name,
      model_name,
      city_name,
      category,
      price_kzt,
      year,
      mileage_km,
      condition,
      body_type,
      gearbox,
      origin_country,
      engine_type,
      steering,
      drivetrain,
      availability,
      engine_volume,
      color_name,
      metallic,
      can_finance,
      cleared,
      damaged,
      has_vehicle_history,
      status,
      published_at,
      created_at,
      listing_media(
        kind,
        provider,
        object_key,
        variants,
        status,
        sort_order
      )
    `)
    .eq("status", "active")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw error;
  return data.map(mapListingRow);
}

export async function createListing(listing, ownerId) {
  if (!supabase) throw new Error("Supabase не настроен.");
  if (!ownerId) throw new Error("Для публикации необходимо войти в аккаунт.");

  const payload = {
    owner_id: ownerId,
    title: listing.title,
    brand: listing.brand,
    model: listing.model,
    category: listing.category || "cars",
    city: listing.city,
    price_kzt: listing.price,
    year: listing.year,
    mileage_km: listing.mileage,
    condition: listing.condition,
    body_type: listing.body,
    gearbox: listing.gearbox,
    seller_name: listing.seller || "Частный продавец",
    card_color: listing.color || "#243b55",
    has_photo: false,
    can_finance: Boolean(listing.canFinance),
    cleared: Boolean(listing.cleared),
    damaged: Boolean(listing.damaged),
    score: listing.score || 0,
    status: "active"
  };

  const { data, error } = await supabase
    .from("listings")
    .insert(payload)
    .select("*, listing_media(kind, provider, object_key, variants, status, sort_order)")
    .single();

  if (error) throw error;
  return mapListingRow(data);
}
