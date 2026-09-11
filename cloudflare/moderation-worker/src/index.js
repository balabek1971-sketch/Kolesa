const MODEL = "@cf/facebook/detr-resnet-50";
const VEHICLE_LABELS = new Set(["car", "truck", "bus", "motorcycle", "motorbike", "vehicle"]);
const VIDEO_FRAME_POSITIONS = [0.1, 0.3, 0.5, 0.7, 0.9];
const MAX_ATTEMPTS = 3;

class RetryableError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "RetryableError";
    this.code = code;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function validUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

async function backendRequest(env, path, options = {}) {
  const response = await fetch(`${String(env.API_BASE_URL).replace(/\/+$/, "")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.API_SECRET}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new RetryableError("api_unavailable", `API ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function moderationRequest(env, listingID, action, parameters) {
  return backendRequest(env, `/v1/internal/moderation/${encodeURIComponent(listingID)}/${action}`, {
    method: "POST",
    body: JSON.stringify(parameters),
  });
}

async function loadListingMedia(env, listingID) {
  const payload = await backendRequest(
    env,
    `/v1/internal/moderation/${encodeURIComponent(listingID)}/media`,
  );
  return Array.isArray(payload?.media) ? payload.media : [];
}

function normalizedScore(detection) {
  const score = Number(detection?.score ?? detection?.confidence ?? 0);
  return score > 1 ? score / 100 : score;
}

export function selectBestVehicleDetection(detections, threshold = 0.55) {
  return (Array.isArray(detections) ? detections : [])
    .map((detection) => ({
      label: String(detection?.label || detection?.name || "").toLowerCase(),
      score: normalizedScore(detection),
      box: detection?.box || detection?.bounding_box || null,
    }))
    .filter((detection) => VEHICLE_LABELS.has(detection.label) && detection.score >= threshold)
    .sort((left, right) => right.score - left.score)[0] || null;
}

async function detectObjects(env, body, contentType = "application/octet-stream") {
  if (!body) throw new RetryableError("empty_image");
  const accountID = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(env.CLOUDFLARE_AI_API_TOKEN || "").trim();

  if (accountID && apiToken) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountID)}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": contentType || "application/octet-stream",
        },
        body,
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new RetryableError("workers_ai_unavailable", `Workers AI ${response.status}`);
    }
    return Array.isArray(payload.result) ? payload.result : [];
  }

  if (!env.AI) throw new RetryableError("workers_ai_not_configured");
  const image = new Uint8Array(await new Response(body).arrayBuffer());
  try {
    const result = await env.AI.run(MODEL, { image: [...image] });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    throw new RetryableError("workers_ai_unavailable", String(error?.message || error));
  }
}

function compactDetection(detection) {
  if (!detection) return null;
  return {
    label: detection.label,
    score: Number(detection.score.toFixed(4)),
    box: detection.box,
  };
}

async function inspectPhotos(env, photos, threshold) {
  const results = [];
  for (const photo of photos) {
    if (photo.provider !== "cloudflare_r2" || !photo.object_key) {
      results.push({ media_id: photo.id, error: "unsupported_photo_provider" });
      continue;
    }
    const object = await env.MEDIA.get(photo.object_key);
    if (!object) throw new RetryableError("photo_object_missing");
    const detections = await detectObjects(env, object.body, photo.mime_type || object.httpMetadata?.contentType);
    const vehicle = selectBestVehicleDetection(detections, threshold);
    results.push({ media_id: photo.id, vehicle: compactDetection(vehicle) });
    if (vehicle) return { passed: true, results };
  }
  return { passed: false, results };
}

export function buildVideoFrameURLs(media, customerCode, positions = VIDEO_FRAME_POSITIONS) {
  const duration = Number(media?.duration_seconds || 0);
  if (!duration) return [];
  let baseURL = media?.variants?.thumbnail || "";
  if (!baseURL && customerCode && media?.provider_asset_id) {
    baseURL = `https://customer-${customerCode}.cloudflarestream.com/${media.provider_asset_id}/thumbnails/thumbnail.jpg`;
  }
  if (!baseURL) return [];

  return [...new Set(positions.map((position) => Math.max(0.1, duration * position).toFixed(2)))].map((seconds) => {
    const url = new URL(baseURL);
    url.searchParams.set("time", `${seconds}s`);
    url.searchParams.set("width", "960");
    url.searchParams.set("fit", "clip");
    return url.toString();
  });
}

async function inspectVideo(env, video, threshold) {
  if (!video) return { passed: null, results: [] };
  if (video.status !== "ready") throw new RetryableError("video_not_ready");
  if (video.provider !== "cloudflare_stream") {
    return { passed: false, results: [{ media_id: video.id, error: "video_provider_not_supported" }] };
  }

  const frameURLs = buildVideoFrameURLs(video, env.STREAM_CUSTOMER_CODE);
  if (!frameURLs.length) throw new RetryableError("video_thumbnail_unavailable");
  const requiredFrames = Math.max(1, Math.min(frameURLs.length, Number(env.VIDEO_REQUIRED_FRAMES || 2)));
  const results = [];
  let passedFrames = 0;

  for (let index = 0; index < frameURLs.length; index += 1) {
    const response = await fetch(frameURLs[index]);
    if (!response.ok || !response.body) throw new RetryableError("video_thumbnail_unavailable");
    const detections = await detectObjects(env, response.body, response.headers.get("Content-Type"));
    const vehicle = selectBestVehicleDetection(detections, threshold);
    if (vehicle) passedFrames += 1;
    results.push({ frame: index + 1, vehicle: compactDetection(vehicle) });
    if (passedFrames >= requiredFrames) return { passed: true, results };
    if (passedFrames + (frameURLs.length - index - 1) < requiredFrames) break;
  }
  return { passed: false, results };
}

async function completeModeration(env, listingID, revision, photo, video) {
  const approved = photo.passed && video.passed !== false;
  let reason = null;
  if (!photo.passed) reason = "Добавьте хотя бы одну чёткую фотографию автомобиля.";
  else if (video.passed === false) reason = "На видео автомобиль не распознан. Загрузите видео автомобиля или удалите видео.";

  await moderationRequest(env, listingID, "complete", {
    revision,
    approved,
    photo_passed: photo.passed,
    video_passed: video.passed,
    reason,
    result: {
      model: MODEL,
      photo: photo.results,
      video: video.results,
    },
  });
}

async function processModeration(env, message) {
  const listingID = String(message.listing_id || "");
  const revision = Number(message.revision || 0);
  if (!validUUID(listingID) || !Number.isInteger(revision) || revision < 1) return;

  const claim = await moderationRequest(env, listingID, "claim", { revision });
  if (!claim?.claimed) return;

  const media = await loadListingMedia(env, listingID);
  const photos = media.filter((item) => item.kind === "photo" && item.status === "ready");
  if (!photos.length) throw new RetryableError("ready_photo_required");
  const video = media.find((item) => item.kind === "video") || null;
  const threshold = Math.max(0.1, Math.min(0.99, Number(env.VEHICLE_CONFIDENCE || 0.55)));
  const photoResult = await inspectPhotos(env, photos, threshold);
  const videoResult = photoResult.passed
    ? await inspectVideo(env, video, threshold)
    : { passed: video ? false : null, results: [] };
  await completeModeration(env, listingID, revision, photoResult, videoResult);
}

async function handleQueueMessage(env, queueMessage) {
  const body = queueMessage.body || {};
  try {
    await processModeration(env, body);
    queueMessage.ack();
  } catch (error) {
    const code = String(error?.code || "moderation_failed").slice(0, 200);
    if (Number(queueMessage.attempts || 1) >= MAX_ATTEMPTS) {
      await moderationRequest(env, body.listing_id, "fail", {
        revision: Number(body.revision || 0),
        error_code: code,
      });
      queueMessage.ack();
      return;
    }
    await moderationRequest(env, body.listing_id, "retry", {
      revision: Number(body.revision || 0),
      error_code: code,
    });
    queueMessage.retry({ delaySeconds: code === "video_not_ready" ? 60 : 30 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return jsonResponse({ status: "ok", model: MODEL });
    }
    if (request.method !== "POST" || url.pathname !== "/enqueue") {
      return jsonResponse({ error: "not_found" }, 404);
    }
    const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!await sameSecret(token, env.DISPATCH_SECRET)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const payload = await request.json().catch(() => null);
    if (!validUUID(payload?.listing_id) || !Number.isInteger(payload?.revision) || payload.revision < 1) {
      return jsonResponse({ error: "invalid_job" }, 400);
    }
    await env.MODERATION_QUEUE.send({
      listing_id: payload.listing_id,
      revision: payload.revision,
      queued_at: new Date().toISOString(),
    });
    return jsonResponse({ queued: true }, 202);
  },

  async queue(batch, env) {
    await Promise.all(batch.messages.map((message) => handleQueueMessage(env, message)));
  },
};
