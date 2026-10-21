export class ApiError extends Error {
  constructor(message, { kind, status = null, payload = null, cause = null }) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.payload = payload;
  }
}

export function errorDetail(payload, fallback) {
  const detail = payload?.detail ?? payload;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg : null))
      .filter(Boolean);
    if (messages.length) {
      return messages.join(". ");
    }
  }
  if (typeof detail?.message === "string" && detail.message.trim()) {
    return detail.message;
  }
  return fallback;
}

async function responsePayload(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createApiClient(
  fetchImplementation = globalThis.fetch,
  { onUnauthorized = () => {} } = {},
) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A Fetch API implementation is required");
  }

  async function request(path, options = {}) {
    const controller = options.signal ? null : new AbortController();
    const signal = options.signal ?? controller.signal;

    let response;
    try {
      response = await fetchImplementation(path, {
        ...options,
        credentials: "include",
        signal,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
      });
    } catch (cause) {
      if (signal.aborted || cause?.name === "AbortError") {
        throw cause;
      }
      throw new ApiError("No fue posible conectar con el backend.", {
        kind: "network",
        cause,
      });
    }

    if (response.status === 401) {
      try {
        onUnauthorized(response);
      } catch {
        // A UI callback must not replace the HTTP error from the server.
      }
    }

    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ApiError(errorDetail(payload, `HTTP ${response.status}`), {
        kind: "http",
        status: response.status,
        payload,
      });
    }
    return payload;
  }

  return Object.freeze({
    health: ({ signal } = {}) => request("/healthz", { signal }),
    session: ({ signal } = {}) => request("/api/v1/auth/session", { signal }),
    // La colección responde { items, next_cursor } y se recorre por cursor
    // opaco: `offset` repite y salta filas mientras otras personas crean
    // restaurantes. `q` la acota a un término del nombre.
    restaurants: ({ limit = 20, cursor, q, signal } = {}) => {
      const parameters = new URLSearchParams({ limit: String(limit) });
      if (q) {
        parameters.set("q", q);
      }
      if (cursor) {
        parameters.set("cursor", cursor);
      }
      return request(`/api/v1/restaurants?${parameters}`, { signal });
    },
    login: (credentials, { signal } = {}) =>
      request("/api/v1/auth/login", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      }),
    logout: ({ signal } = {}) => request("/api/v1/auth/logout", { method: "POST", signal }),
    feed: ({ limit = 20, cursor, signal } = {}) => {
      const parameters = new URLSearchParams({ limit: String(limit) });
      if (cursor) parameters.set("cursor", cursor);
      return request(`/api/v1/feed?${parameters}`, { signal });
    },
    review: (reviewId, { signal } = {}) =>
      request(`/api/v1/reviews/${encodeURIComponent(reviewId)}`, { signal }),
    visit: (visitId, { signal } = {}) =>
      request(`/api/v1/visits/${encodeURIComponent(visitId)}`, { signal }),
    evaluation: (evaluationId, { signal } = {}) =>
      request(`/api/v1/evaluations/${encodeURIComponent(evaluationId)}`, { signal }),
    photo: (photoId, { signal } = {}) =>
      request(`/api/v1/photos/${encodeURIComponent(photoId)}`, { signal }),
    push: {
      vapidKey: ({ signal } = {}) => request("/api/v1/push/vapid-key", { signal }),
      subscribe: (subscription, { signal } = {}) =>
        request("/api/v1/push/subscriptions", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        }),
      unsubscribe: (endpoint, { signal } = {}) =>
        request(`/api/v1/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, {
          method: "DELETE",
          signal,
        }),
    },
  });
}
