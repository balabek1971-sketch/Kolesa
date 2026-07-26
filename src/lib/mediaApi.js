const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const mediaApiConfigured = Boolean(apiBaseUrl);

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

function uploadWithProgress(url, body, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
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

async function uploadPhoto(listingId, file, sortOrder, accessToken, onProgress) {
  const intent = await apiRequest(`/v1/listings/${listingId}/media/photos/upload-url`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      content_type: file.type,
      filename: file.name,
      size_bytes: file.size,
      sort_order: sortOrder,
    }),
  });

  await uploadWithProgress(
    intent.upload_url,
    file,
    { "Content-Type": file.type },
    (progress) => onProgress?.({ kind: "photo", index: sortOrder, progress }),
  );

  await apiRequest(`/v1/listings/${listingId}/media/${intent.media_id}/complete`, accessToken, {
    method: "POST",
    body: JSON.stringify({ upload_id: intent.upload_id }),
  });
}

async function uploadVideo(listingId, file, accessToken, onProgress) {
  const intent = await apiRequest(`/v1/listings/${listingId}/media/video/upload-url`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      content_type: file.type,
      filename: file.name,
      size_bytes: file.size,
      max_duration_seconds: 60,
    }),
  });

  await uploadWithProgress(
    intent.upload_url,
    file,
    { "Content-Type": file.type },
    (progress) => onProgress?.({ kind: "video", index: 0, progress }),
  );

  await apiRequest(`/v1/listings/${listingId}/media/${intent.media_id}/complete`, accessToken, {
    method: "POST",
    body: JSON.stringify({ upload_id: intent.upload_id }),
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
    uploadPhoto(listingId, file, index, accessToken, onProgress));

  if (video) {
    await uploadVideo(listingId, video, accessToken, onProgress);
  }
}
