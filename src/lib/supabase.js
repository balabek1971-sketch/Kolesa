import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

function getPublicPhotoUrl(storagePath) {
  if (!supabase || !storagePath) return "";
  return supabase.storage.from("listing-photos").getPublicUrl(storagePath).data.publicUrl;
}

export function mapListingRow(row) {
  const photos = [...(row.listing_photos || [])].sort(
    (first, second) => first.sort_order - second.sort_order
  );

  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    category: row.category,
    city: row.city,
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
    imageUrl: getPublicPhotoUrl(photos[0]?.storage_path),
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
    .select("*, listing_photos(storage_path, sort_order)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
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
    .select("*, listing_photos(storage_path, sort_order)")
    .single();

  if (error) throw error;
  return mapListingRow(data);
}
