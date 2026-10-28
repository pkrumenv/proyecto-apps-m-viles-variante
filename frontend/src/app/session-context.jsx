import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError, createApiClient } from "../api.js";
import { clearOtherUsers, clearUserData, getLatestFeedSnapshot } from "../offline-feed.js";

const SessionContext = createContext(null);

const initialState = Object.freeze({ status: "loading", session: null, message: null });

/** Comparte sesión y API, valida identidad inicial y limpia recursos al salir. */
export function SessionProvider({ children }) {
  const [state, setState] = useState(initialState);
  const unauthorizedHandler = useRef(() => {});
  const api = useMemo(
    () =>
      createApiClient(globalThis.fetch, {
        onUnauthorized: () => unauthorizedHandler.current(),
      }),
    [],
  );

  // Devuelve a estado anónimo cuando una solicitud protegida responde 401.

  const invalidate = useCallback((message = "Tu sesión caducó. Inicia sesión nuevamente.") => {
    setState({ status: "anonymous", session: null, message });
  }, []);
  unauthorizedHandler.current = invalidate;

  // Acepta la identidad confirmada y elimina la copia offline de otras cuentas.

  const acceptSession = useCallback(async (session) => {
    if (session?.user?.id) {
      try {
        await clearOtherUsers(session.user.id);
      } catch (error) {
        console.warn("No se pudieron limpiar los datos offline de otras cuentas:", error);
      }
    }
    setState({ status: "authenticated", session, message: null });
    return session;
  }, []);

  // Verifica la sesión y recupera el último feed local únicamente si falla la red.

  const refreshSession = useCallback(async ({ signal } = {}) => {
    setState((current) => ({ ...current, status: "loading", message: null }));
    try {
      const session = await api.session({ signal });
      return await acceptSession(session);
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") return null;
      if (error instanceof ApiError && error.status === 401) {
        invalidate("Inicia sesión para continuar.");
        return null;
      }
      if (error instanceof ApiError && error.kind === "network") {
        try {
          const snapshot = await getLatestFeedSnapshot();
          if (snapshot && !signal?.aborted) {
            setState({
              status: "offline",
              session: { user: { id: snapshot.userId, name: "Modo sin conexión" } },
              message: "Mostrando la última copia guardada en este dispositivo.",
            });
            return null;
          }
        } catch {
          // The protected views below will show the unavailable state.
        }
      }
      setState({
        status: "unavailable",
        session: null,
        message: error?.message ?? "No fue posible verificar la sesión.",
      });
      return null;
    }
  }, [acceptSession, api, invalidate]);

  useEffect(() => {
    const controller = new AbortController();
    refreshSession({ signal: controller.signal });
    return () => controller.abort();
  }, [refreshSession]);

  // Inicia sesión y vuelve a consultar al backend antes de autenticar la interfaz.

  const login = useCallback(async (credentials) => {
    setState({ status: "loading", session: null, message: null });
    try {
      await api.login(credentials);
      const session = await api.session();
      return await acceptSession(session);
    } catch (error) {
      setState({ status: "anonymous", session: null, message: null });
      throw error;
    }
  }, [acceptSession, api]);

  // Revoca sesión, baja Push y borra los datos locales de la cuenta activa.

  const logout = useCallback(async () => {
    const userId = state.session?.user?.id;
    if (state.status === "offline") {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          await subscription?.unsubscribe();
        } catch (error) {
          console.warn("No se pudo desactivar la suscripción push local:", error);
        }
      }
      if (userId) {
        try {
          await clearUserData(userId);
        } catch (error) {
          console.warn("No se pudo limpiar IndexedDB al cerrar sesión:", error);
        }
      }
      setState({ status: "anonymous", session: null, message: "Copia offline eliminada." });
      return;
    }
    setState({ status: "loading", session: state.session, message: null });

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          try {
            await api.push.unsubscribe(subscription.endpoint);
          } finally {
            await subscription.unsubscribe();
          }
        }
      } catch (error) {
        console.warn("No se pudo quitar la suscripción push al cerrar sesión:", error);
      }
    }

    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setState((current) => ({
          ...current,
          status: "authenticated",
          message: error?.message ?? "No fue posible cerrar la sesión.",
        }));
        throw error;
      }
    }

    if (userId) {
      try {
        await clearUserData(userId);
      } catch (error) {
        console.warn("No se pudo limpiar IndexedDB al cerrar sesión:", error);
      }
    }
    setState({ status: "anonymous", session: null, message: "Sesión cerrada." });
  }, [api, state.session]);

  // Expone una única instancia del estado y las acciones comunes a todas las rutas.

  const value = useMemo(
    () => ({ state, api, login, logout, invalidate, refreshSession }),
    [api, invalidate, login, logout, refreshSession, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Devuelve el contexto de sesión; falla pronto si se usa fuera del proveedor. */
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de SessionProvider");
  return value;
}
