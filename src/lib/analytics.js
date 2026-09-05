import { recordBehaviorEvent } from "./supabase.js";

const anonymousKey = "qazauto_anonymous_id";
const sessionKey = "qazauto_session_id";
const consentKey = "qazauto_consent_v1";

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function persistedId(storage, key) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const next = createId();
    storage.setItem(key, next);
    return next;
  } catch {
    return createId();
  }
}

export function getAnalyticsContext() {
	const sessionId = persistedId(sessionStorage, sessionKey);
  return {
	anonymousId: personalizationAllowed() ? persistedId(localStorage, anonymousKey) : sessionId,
	sessionId,
  };
}

export function personalizationAllowed() {
	try {
		return JSON.parse(localStorage.getItem(consentKey) || "null")?.personalization === true;
	} catch {
		return false;
	}
}

export function getConsentChoice() {
	try {
		return JSON.parse(localStorage.getItem(consentKey) || "null");
	} catch {
		return null;
	}
}

export function saveConsentChoice(personalization) {
	const choice = { personalization: Boolean(personalization), policyVersion: "2026-09-05" };
	localStorage.setItem(consentKey, JSON.stringify(choice));
	window.dispatchEvent(new CustomEvent("qazauto-consent-changed", { detail: choice }));
	return choice;
}

export function trackBehavior(type, details = {}) {
	if (!personalizationAllowed()) return;
  const context = getAnalyticsContext();
  const event = {
    id: createId(),
    occurredAt: new Date().toISOString(),
    type,
    anonymousId: context.anonymousId,
    sessionId: context.sessionId,
    listingId: details.listingId || null,
    position: details.position,
    activeMilliseconds: details.activeMilliseconds,
    metadata: details.metadata || {},
  };

  recordBehaviorEvent(event).catch((error) => {
    if (import.meta.env.DEV) console.debug("Behavior event was not recorded", error);
  });
}
