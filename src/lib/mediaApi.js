const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const maxUncompressedPhotoBytes = 2 * 1024 * 1024;
const maxPhotoEdge = 1920;

export const mediaApiConfigured = Boolean(apiBaseUrl);

export async function publishListing(listingId, accessToken) {
  if (!mediaApiConfigured) {
    throw new Error("Сервис автоматической проверки ещё не подключён.");
  }
  return apiRequest(`/v1/listings/${listingId}/publish`, accessToken, {
    method: "POST",
    body: "{}",
  });
}

async function apiRequest(path, accessToken, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Ошибка загрузки медиа.");
  }
  return payload;
}

function uploadWithProgress(url, body, headers, onProgress, method = "PUT") {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    Object.entries(headers || {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("Облако не приняло файл."));
    };
    request.onerror = () => reject(new Error("Соединение прервалось во время загрузки."));
    request.send(body);
  });
}

async function preparePhotoForUpload(file) {
  if (file.size <= maxUncompressedPhotoBytes) return file;

  let bitmap;
  let objectUrl = "";
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } else {
    objectUrl = URL.createObjectURL(file);
    bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не удалось прочитать фотографию."));
      image.src = objectUrl;
    });
  }
  try {
    const scale = Math.min(1, maxPhotoEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Не удалось подготовить фотографию."))),
        "image/jpeg",
        0.88,
      );
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadListingPhoto(listingId, file, sortOrder, accessToken, onProgress) {
  const preparedFile = await preparePhotoForUpload(file);
  const intent = await apiRequest(`/v1/listings/${listingId}/media/photos/upload-url`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      content_type: preparedFile.type,
      filename: preparedFile.name,
      size_bytes: preparedFile.size,
      sort_order: sortOrder,
    }),
  });

  await uploadWithProgress(
    intent.upload_url,
    preparedFile,
    { "Content-Type": preparedFile.type },
    (progress) => onProgress?.({ kind: "photo", index: sortOrder, progress }),
  );

  await apiRequest(`/v1/listings/${listingId}/media/${intent.media_id}/complete`, accessToken, {
    method: "POST",
    body: JSON.stringify({ upload_id: intent.upload_id }),
  });
}

export async function uploadListingVideo(listingId, file, accessToken, onProgress) {
  const intent = await apiRequest(`/v1/listings/${listingId}/media/video/upload-url`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      content_type: file.type,
      filename: file.name,
      size_bytes: file.size,
      max_duration_seconds: 60,
    }),
  });

  const streamUpload = intent.provider === "cloudflare_stream";
  const uploadBody = streamUpload ? new FormData() : file;
  if (streamUpload) uploadBody.append("file", file, file.name);

  await uploadWithProgress(
    intent.upload_url,
    uploadBody,
    streamUpload ? {} : { "Content-Type": file.type },
    (progress) => onProgress?.({ kind: "video", index: 0, progress }),
    intent.upload_method || (streamUpload ? "POST" : "PUT"),
  );

  await apiRequest(`/v1/listings/${listingId}/media/${intent.media_id}/complete`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      upload_id: intent.upload_id || "",
      provider_asset_id: intent.provider_asset_id || "",
    }),
  });
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export async function uploadListingMedia({
  accessToken,
  listingId,
  onProgress,
  photos,
  video,
}) {
  if (!mediaApiConfigured) {
    throw new Error("API загрузки медиа ещё не подключён к Vercel.");
  }

  await runWithConcurrency(photos, 3, (file, index) =>
    uploadListingPhoto(listingId, file, index, accessToken, onProgress));

  if (video) {
    await uploadListingVideo(listingId, video, accessToken, onProgress);
  }
}
