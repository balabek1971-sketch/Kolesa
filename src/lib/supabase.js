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

export const UNREAD_MESSAGES_CHANGED_EVENT = "qazauto:unread-messages-changed";

function notifyUnreadMessagesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_MESSAGES_CHANGED_EVENT));
  }
}

export function getPublicPhotoUrl(media) {
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

export function getPublicMediaUrl(media) {
  if (!media) return "";
  if (media.provider === "cloudflare_stream") {
    return media.variants?.hls || media.variants?.dash || "";
  }
  return getPublicPhotoUrl(media);
}

export function getMediaPosterUrl(media) {
  if (!media) return "";
  if (media.provider === "cloudflare_stream" && media.variants?.thumbnail) {
    return media.variants.thumbnail;
  }
  return media.poster_object_key
    ? getPublicPhotoUrl({ object_key: media.poster_object_key })
    : "";
}

function mapMediaItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    provider: item.provider,
    providerAssetId: item.provider_asset_id || "",
    mimeType: item.mime_type || "",
    sortOrder: Number(item.sort_order || 0),
	status: item.status || "ready",
    url: getPublicMediaUrl(item),
    posterUrl: getMediaPosterUrl(item),
  };
}

export function mapListingRow(row) {
  const photos = [...(row.listing_media || [])].filter(
    (media) => media.kind === "photo" && media.status === "ready"
  ).sort(
    (first, second) => first.sort_order - second.sort_order
  );

  const media = [...(row.listing_media || row.media || [])]
    .map(mapMediaItem)
    .filter((item) => item.url)
    .sort((first, second) => {
      if (first.kind !== second.kind) return first.kind === "video" ? -1 : 1;
      return first.sortOrder - second.sortOrder;
    });

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
	media,
	video: media.find((item) => item.kind === "video") || null,
	photos: media.filter((item) => item.kind === "photo"),
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
		id,
        kind,
        provider,
        object_key,
		provider_asset_id,
		poster_object_key,
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

export async function fetchListingById(listingId) {
  if (!supabase || !listingId) return null;

  const { data, error } = await supabase
    .rpc("get_public_listing_detail", { p_listing_id: listingId })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const media = (data.media || [])
	.map(mapMediaItem)
    .filter((item) => item.url);

  return {
    id: data.id,
    title: data.title,
    brand: data.brand_name,
    model: data.model_name,
    city: data.city_name,
    category: data.category,
    price: Number(data.price_kzt),
    year: data.year,
    mileage: data.mileage_km,
    condition: data.condition,
    body: data.body_type || "",
    gearbox: data.gearbox || "",
    originCountry: data.origin_country || "",
    engineType: data.engine_type || "",
    steering: data.steering || "",
    drivetrain: data.drivetrain || "",
    engineVolume: data.engine_volume ? Number(data.engine_volume) : 0,
    colorName: data.color_name || "",
    metallic: Boolean(data.metallic),
    cleared: Boolean(data.cleared),
    damaged: Boolean(data.damaged),
    hasVehicleHistory: Boolean(data.has_vehicle_history),
    description: data.description || "",
    phone: data.contact_phone_e164 || "",
    seller: data.seller_name || "Частный продавец",
    publishedAt: data.published_at,
    media,
    imageUrl: media.find((item) => item.kind === "photo")?.url || ""
  };
}

export async function fetchPersonalizedAutofeed({ anonymousId, sessionId, filters, offset = 0, limit = 5 }) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_personalized_autofeed", {
    p_anonymous_id: anonymousId,
    p_session_id: sessionId,
    p_limit: limit,
    p_offset: offset,
    p_filters: filters || {},
  });
	if (error?.code === "PGRST202") {
		let query = supabase
			.from("listings")
			.select(`
				id, title, brand_name, model_name, city_name, price_kzt, year, mileage_km,
				body_type, gearbox, engine_type, engine_volume, published_at,
				feed_video:listing_media!inner(id),
				listing_media(id, kind, provider, object_key, provider_asset_id, poster_object_key, variants, status, sort_order)
			`)
			.eq("status", "active")
			.eq("feed_video.kind", "video")
			.eq("feed_video.status", "ready")
			.order("published_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (filters?.brand) query = query.eq("brand_name", filters.brand);
		if (filters?.model) query = query.eq("model_name", filters.model);
		if (filters?.city) query = query.eq("city_name", filters.city);
		if (filters?.body) query = query.eq("body_type", filters.body);
		if (filters?.yearFrom) query = query.gte("year", Number(filters.yearFrom));
		if (filters?.yearTo) query = query.lte("year", Number(filters.yearTo));
		if (filters?.priceFrom) query = query.gte("price_kzt", Number(filters.priceFrom));
		if (filters?.priceTo) query = query.lte("price_kzt", Number(filters.priceTo));
		const fallback = await query;
		if (fallback.error) throw fallback.error;
		return (fallback.data || []).map(mapListingRow);
	}
	if (error) throw error;
  return (data || []).map((row) => mapListingRow({
    ...row,
    listing_media: row.media,
    score: Number(row.rank_score || 0),
  }));
}

export async function recordBehaviorEvent(event) {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("record_behavior_event", {
    p_event_id: event.id,
    p_occurred_at: event.occurredAt,
    p_event_type: event.type,
    p_anonymous_id: event.anonymousId,
    p_session_id: event.sessionId,
    p_listing_id: event.listingId || null,
    p_position: Number.isInteger(event.position) ? event.position : null,
    p_active_milliseconds: Number.isFinite(event.activeMilliseconds) ? Math.round(event.activeMilliseconds) : null,
    p_metadata: event.metadata || {},
  });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchFavoriteIds() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("favorites").select("listing_id");
  if (error) throw error;
  return (data || []).map((item) => item.listing_id);
}

export async function setFavorite(listingId, favorite) {
  if (!supabase) return;
  if (favorite) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("Войдите, чтобы сохранять объявления.");
    const { error } = await supabase.from("favorites").upsert({ user_id: userId, listing_id: listingId });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("favorites").delete().eq("listing_id", listingId);
  if (error) throw error;
}

export async function startListingConversation(listingId) {
  if (!supabase) throw new Error("Supabase не настроен.");
  const { data, error } = await supabase.rpc("start_listing_conversation", { p_listing_id: listingId });
  if (error) throw error;
  return data;
}

export async function fetchConversations() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_my_conversations");
  if (error) throw error;
  return (data || []).map((item) => ({
    id: item.id,
    listingId: item.listing_id,
    listingTitle: item.listing_title,
    listingPrice: Number(item.listing_price_kzt || 0),
    imageUrl: getPublicPhotoUrl({ object_key: item.listing_photo_object_key }),
    otherUserId: item.other_user_id,
    otherDisplayName: item.other_display_name,
    lastMessage: item.last_message_body || "Диалог создан",
    lastMessageAt: item.last_message_at,
    unreadCount: Number(item.unread_count || 0),
  }));
}

export async function fetchUnreadMessageCount(userId) {
  if (!supabase || !userId) return 0;
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_id", userId)
    .is("read_at", null)
    .is("deleted_at", null);
  if (error) throw error;
  return Number(count || 0);
}

export async function fetchConversationMessages(conversationId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_conversation_messages", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data || [];
}

export async function sendConversationMessage(conversationId, body) {
  if (!supabase) throw new Error("Supabase не настроен.");
  const { data, error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId) {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  notifyUnreadMessagesChanged();
}

export async function createListing(listing) {
  if (!supabase) throw new Error("Supabase не настроен.");

  const payload = {
    title: listing.title,
    brand_name: listing.brand,
    model_name: listing.model,
    city_name: listing.city,
    price_kzt: listing.price,
    year: listing.year,
    mileage_km: listing.mileage,
    condition: listing.condition,
    body_type: listing.body,
    gearbox: listing.gearbox,
    origin_country: listing.originCountry || "",
    engine_type: listing.engineType || "",
    steering: listing.steering || "",
    drivetrain: listing.drivetrain || "",
    engine_volume: listing.engineVolume,
    color_name: listing.colorName || "",
    metallic: Boolean(listing.metallic),
    cleared: Boolean(listing.cleared),
    damaged: Boolean(listing.damaged),
    has_vehicle_history: Boolean(listing.hasVehicleHistory),
    description: listing.description || ""
  };

  const { data, error } = await supabase
    .rpc("save_listing_draft", {
      p_listing_id: null,
      p_payload: payload
    });

  if (error) throw error;
  return data;
}

export async function publishListing(listingId) {
  if (!supabase) throw new Error("Supabase не настроен.");

  const { error } = await supabase.rpc("publish_own_listing", {
    p_listing_id: listingId
  });

  if (error?.code === "23505" || error?.message?.includes("listings_owner_active_duplicate_idx")) {
    throw new Error("Этот автомобиль уже опубликован в вашем аккаунте. Измените существующее объявление или удалите его.");
  }

  if (error) throw error;
}

export async function deleteOwnListing(listingId) {
  if (!supabase) throw new Error("Supabase не настроен.");

  const { error } = await supabase.rpc("delete_own_listing", {
    p_listing_id: listingId
  });

  if (error) throw error;
}

export async function fetchOwnListings() {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_own_listings");
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    brand: row.brand_name,
    model: row.model_name,
    city: row.city_name,
    price: Number(row.price_kzt),
    year: row.year,
    mileage: row.mileage_km,
    condition: row.condition,
    body: row.body_type || "Не указан",
    status: row.status,
    rejectionReason: row.rejection_reason || "",
    imageUrl: getPublicPhotoUrl({ object_key: row.cover_object_key }),
    photoCount: Number(row.photo_count || 0),
    videoCount: Number(row.video_count || 0),
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}
