import { publishListing, uploadListingPhoto, uploadListingVideo } from "./mediaApi.js";

const databaseName = "qazauto-submissions";
const storeName = "submissions";
const databaseVersion = 1;
const retryBaseMilliseconds = 15_000;
const retryMaximumMilliseconds = 5 * 60_000;

export const listingSubmissionEvent = "qazauto:listing-submission";

let databasePromise;
let activeProcessor;
let rerunRequested = false;
let latestContext;
let retryTimer;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Ошибка локального хранилища."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Ошибка локального хранилища."));
    transaction.onabort = () => reject(transaction.error || new Error("Локальное сохранение отменено."));
  });
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Фоновая загрузка не поддерживается этим браузером."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Не удалось открыть локальную очередь."));
      request.onblocked = () => reject(new Error("Закройте другие старые окна QazAuto и повторите."));
    });
  }
  return databasePromise;
}

async function putSubmission(submission) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put({ ...submission, updatedAt: Date.now() });
  await transactionDone(transaction);
}

async function deleteSubmission(id) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

async function listSubmissions(ownerId) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const done = transactionDone(transaction);
  const submissions = await requestResult(transaction.objectStore(storeName).getAll());
  await done;
  return submissions
    .filter((submission) => submission.ownerId === ownerId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

function storeFile(file) {
  if (!file) return null;
  return {
    blob: file.slice(0, file.size, file.type),
    lastModified: file.lastModified || Date.now(),
    name: file.name || "media",
    type: file.type || "application/octet-stream",
  };
}

function restoreFile(stored) {
  return new File([stored.blob], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified,
  });
}

function emitSubmission(detail) {
  window.dispatchEvent(new CustomEvent(listingSubmissionEvent, { detail }));
}

function retryDelay(attempts) {
  return Math.min(retryMaximumMilliseconds, retryBaseMilliseconds * (2 ** Math.min(attempts, 5)));
}

function scheduleRetry(delay) {
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    if (latestContext) void processListingSubmissions(latestContext);
  }, Math.max(1000, delay));
}

export async function enqueueListingSubmission({ listingId, ownerId, photos, video, publish }) {
  const submission = {
    id: typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    listingId,
    ownerId,
    photos: photos.map(storeFile),
    video: storeFile(video),
    publish: Boolean(publish),
    completedPhotos: [],
    videoCompleted: !video,
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await putSubmission(submission);
  emitSubmission({ listingId, state: "queued" });
  return submission.id;
}

async function processSubmission(submission, context) {
  const accessToken = await context.getAccessToken();
  if (!accessToken) throw new Error("Войдите в аккаунт, чтобы продолжить загрузку.");

  emitSubmission({ listingId: submission.listingId, state: "uploading", progress: 0 });
  const completedPhotos = new Set(submission.completedPhotos || []);
  const totalItems = submission.photos.length + (submission.video ? 1 : 0);
  let completedItems = completedPhotos.size + (submission.videoCompleted ? (submission.video ? 1 : 0) : 0);

  for (let index = 0; index < submission.photos.length; index += 1) {
    if (completedPhotos.has(index)) continue;
    await uploadListingPhoto(
      submission.listingId,
      restoreFile(submission.photos[index]),
      index,
      accessToken,
      ({ progress }) => emitSubmission({
        listingId: submission.listingId,
        state: "uploading",
        progress: (completedItems + progress) / Math.max(totalItems, 1),
      }),
    );
    completedPhotos.add(index);
    completedItems += 1;
    submission.completedPhotos = [...completedPhotos];
    await putSubmission(submission);
  }

  if (submission.video && !submission.videoCompleted) {
    await uploadListingVideo(
      submission.listingId,
      restoreFile(submission.video),
      accessToken,
      ({ progress }) => emitSubmission({
        listingId: submission.listingId,
        state: "uploading",
        progress: (completedItems + progress) / Math.max(totalItems, 1),
      }),
    );
    submission.videoCompleted = true;
    await putSubmission(submission);
  }

  if (submission.publish) {
    emitSubmission({ listingId: submission.listingId, state: "moderating", progress: 1 });
    await publishListing(submission.listingId, accessToken);
  }
  await deleteSubmission(submission.id);
  emitSubmission({ listingId: submission.listingId, state: "complete", progress: 1 });
}

async function processPass(context) {
  const submissions = await listSubmissions(context.ownerId);
  let earliestRetry = Infinity;

  for (const submission of submissions) {
    if (submission.nextAttemptAt > Date.now()) {
      earliestRetry = Math.min(earliestRetry, submission.nextAttemptAt);
      continue;
    }
    try {
      await processSubmission(submission, context);
    } catch (error) {
      const attempts = Number(submission.attempts || 0) + 1;
      const delay = retryDelay(attempts);
      submission.attempts = attempts;
      submission.nextAttemptAt = Date.now() + delay;
      submission.lastError = String(error?.message || error).slice(0, 500);
      await putSubmission(submission);
      earliestRetry = Math.min(earliestRetry, submission.nextAttemptAt);
      emitSubmission({
        listingId: submission.listingId,
        state: "retrying",
        error: submission.lastError,
      });
    }
  }

  if (Number.isFinite(earliestRetry)) scheduleRetry(earliestRetry - Date.now());
}

export function processListingSubmissions(context) {
  latestContext = context;
  rerunRequested = true;
  if (activeProcessor) return activeProcessor;

  activeProcessor = (async () => {
    while (rerunRequested) {
      rerunRequested = false;
      await processPass(latestContext);
    }
  })()
    .catch((error) => console.error("Не удалось обработать очередь объявлений", error))
    .finally(() => {
      activeProcessor = undefined;
      if (rerunRequested && latestContext) void processListingSubmissions(latestContext);
    });
  return activeProcessor;
}
