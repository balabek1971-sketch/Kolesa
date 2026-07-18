import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function fetchListings(filters = {}) {
  if (!supabase) return [];

  let query = supabase
    .from("listings")
    .select("*, listing_photos(storage_path)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (filters.city) query = query.eq("city", filters.city);
  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.yearFrom) query = query.gte("year", Number(filters.yearFrom));
  if (filters.yearTo) query = query.lte("year", Number(filters.yearTo));
  if (filters.priceFrom) query = query.gte("price_kzt", Number(filters.priceFrom));
  if (filters.priceTo) query = query.lte("price_kzt", Number(filters.priceTo));

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
