const STORAGE_KEY = 'opensoyce_analytics';

export interface AnalyticsEvent {
  event: string;
  metadata?: Record<string, any>;
  timestamp: number;
  sessionId: string;
}

// Generate or retrieve session ID
function getSessionId(): string {
  let id = sessionStorage.getItem('opensoyce_session');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('opensoyce_session', id);
  }
  return id;
}

export function trackEvent(eventName: string, metadata?: Record<string, any>) {
  console.log('[OpenSoyce Analytics]', eventName, metadata || {});
  
  const event: AnalyticsEvent = {
    event: eventName,
    metadata: metadata || {},
    timestamp: Date.now(),
    sessionId: getSessionId(),
  };
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    existing.push(event);
    // Keep last 500 events max
    if (existing.length > 500) existing.splice(0, existing.length - 500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    // localStorage unavailable or quota exceeded — silent fail
  }
}

export function getAnalyticsEvents(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearAnalyticsEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
}
