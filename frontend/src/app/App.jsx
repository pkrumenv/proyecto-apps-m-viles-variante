import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DynamicFeedIcon from "@mui/icons-material/DynamicFeed";
import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import {
  Link as RouterLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ApiError } from "../api.js";
import { createPushController, PUSH_STATES } from "../push.js";
import {
  buildOfflinePhotoUrlMap,
  cacheFeedPhotos,
  clearOtherUsers,
  getFeedSnapshot,
  saveFeedSnapshot,
} from "../offline-feed.js";
import { useSession } from "./session-context.jsx";

function BusyState({ label = "Cargando…" }) {
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 7 }} role="status" aria-live="polite">
      <CircularProgress aria-label={label} />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  );
}

function RouteGate() {
  const { state, refreshSession } = useSession();
  const location = useLocation();

  if (state.status === "loading") return <BusyState label="Verificando tu sesión…" />;
  if (state.status === "offline") {
    if (location.pathname !== "/feed") return <Navigate to="/feed" replace />;
    return <AppLayout />;
  }
  if (state.status === "unavailable") {
    return (
      <Container maxWidth="sm" className="page-content">
        <Alert severity="error" action={<Button onClick={() => refreshSession()}>Reintentar</Button>}>
          No fue posible verificar tu sesión. {state.message}
        </Alert>
      </Container>
    );
  }
  if (state.status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <AppLayout />;
}

function AppLayout() {
  const { state, logout } = useSession();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error?.message ?? "No fue posible cerrar la sesión.");
    }
  };

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0}>
        <Toolbar sx={{ width: "min(100% - 24px, 1100px)", mx: "auto", px: "0 !important", gap: 1 }}>
          <Typography component={RouterLink} to="/feed" variant="h6" color="primary.dark" sx={{ textDecoration: "none", mr: "auto" }}>
            Foodie
          </Typography>
          <Button component={RouterLink} to="/feed" startIcon={<DynamicFeedIcon />} color="inherit">
            Feed
          </Button>
          <Button component={RouterLink} to="/restaurants" startIcon={<RestaurantMenuIcon />} color="inherit">
            Restaurantes
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" }, ml: 1 }}>
            {state.session?.user?.name}
          </Typography>
          <IconButton aria-label="Cerrar sesión" color="primary" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      {logoutError && <Container maxWidth="md" sx={{ pt: 2 }}><Alert severity="error">{logoutError}</Alert></Container>}
      <Outlet />
    </>
  );
}

function LoginPage() {
  const { state, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") return <BusyState label="Verificando tu sesión…" />;
  if (state.status === "authenticated") return <Navigate to="/feed" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(credentials);
      const destination = location.state?.from;
      navigate(destination ? `${destination.pathname}${destination.search ?? ""}` : "/feed", { replace: true });
    } catch (cause) {
      setError(cause?.message ?? "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="sm" className="page-content">
      <Stack spacing={3}>
        <Box>
          <Typography color="secondary.main" variant="overline" fontWeight={700}>ICC4203 · Foodie</Typography>
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: "2.8rem", sm: "3.8rem" }, mt: 0.5 }}>
            Comparte tus lugares favoritos.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Inicia sesión para ver tu feed y descubrir restaurantes.</Typography>
        </Box>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Box component="form" onSubmit={submit} className="field-stack">
              <Typography variant="h2" component="h2" fontSize="1.65rem">Iniciar sesión</Typography>
              {error && <Alert severity="error" role="alert">{error}</Alert>}
              {state.message && <Alert severity="info">{state.message}</Alert>}
              <TextField
                label="Correo electrónico"
                type="email"
                autoComplete="username"
                required
                value={credentials.email}
                onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))}
              />
              <TextField
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                required
                value={credentials.password}
                onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              />
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? "Conectando…" : "Entrar"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

function HomeRedirect() {
  const { state } = useSession();
  return <Navigate to={state.status === "authenticated" ? "/feed" : "/login"} replace />;
}

function PushPreferences() {
  const { api, state: sessionState } = useSession();
  const [pushState, setPushState] = useState({ status: PUSH_STATES.IDLE, message: "" });
  const controllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    const controller = createPushController({
      api,
      onStateChange: (next) => active && setPushState(next),
    });
    controllerRef.current = controller;
    return () => {
      active = false;
      controllerRef.current = null;
    };
  }, [api]);

  const busy = [PUSH_STATES.SUBSCRIBING, PUSH_STATES.UNSUBSCRIBING].includes(pushState.status);
  const subscribed = pushState.status === PUSH_STATES.SUBSCRIBED;
  const unavailable = [PUSH_STATES.UNSUPPORTED, PUSH_STATES.DENIED].includes(pushState.status);

  if (sessionState.status === "offline") {
    return <Alert severity="info">Las notificaciones se pueden administrar cuando vuelva la conexión.</Alert>;
  }

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3" component="h2" fontSize="1.3rem">Notificaciones</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }} role="status" aria-live="polite">
              {pushState.message || "Recibe avisos de actividad de personas y restaurantes que sigues."}
            </Typography>
          </Box>
          {!unavailable && (
            <Button
              variant={subscribed ? "outlined" : "contained"}
              startIcon={subscribed ? <NotificationsOffIcon /> : <NotificationsActiveIcon />}
              disabled={busy}
              onClick={() => (subscribed ? controllerRef.current?.unsubscribe() : controllerRef.current?.subscribe())}
            >
              {busy ? "Actualizando…" : subscribed ? "Desactivar" : "Activar"}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function activityData(activity) {
  return activity?.[activity.type] ?? null;
}

function activityPath(activity) {
  const data = activityData(activity);
  if (!data) return "/feed";
  if (activity.type === "photo") {
    return data.photos?.[0]?.id ? `/photos/${data.photos[0].id}` : "/feed";
  }
  const route = { review: "reviews", visit: "visits", evaluation: "evaluations" }[activity.type];
  return route && data.id ? `/${route}/${data.id}` : "/feed";
}

function ActivityCard({ activity, offline, photoUrls }) {
  const item = activityData(activity);
  if (!item) return null;

  const title = {
    review: item.dish_name || "Reseña de plato",
    visit: `Visita a ${item.restaurant?.name || "un restaurante"}`,
    photo: item.photos?.[0]?.dish_name || "Fotos de restaurante",
    evaluation: `Evaluación de ${item.restaurant?.name || "un restaurante"}`,
  }[activity.type];
  const author = item.author?.name || "Actividad";
  const date = activity.published_at || item.created_at || item.occurred_at;
  const photo = activity.type === "review" ? item.photo : item.photos?.[0];
  const photoUrl = photo && (offline ? photoUrls.get(photo.content_url) : photo.content_url);

  return (
    <Card component="article">
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="overline" color="secondary.main" fontWeight={700}>{author}</Typography>
          <Typography variant="h3" component="h2" fontSize="1.4rem">{title}</Typography>
          {activity.type === "review" && <Typography>{item.text}</Typography>}
          {activity.type === "evaluation" && item.comment && <Typography>{item.comment}</Typography>}
          {activity.type === "visit" && (
            <Typography color="text.secondary">Estuvo aquí {new Date(item.occurred_at).toLocaleString()}.</Typography>
          )}
          {photoUrl && <Box component="img" className="activity-photo" src={photoUrl} alt={photo?.caption || `Foto de ${title}`} />}
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="body2" color="text.secondary">
              {item.restaurant?.name || "Foodie"}{date ? ` · ${new Date(date).toLocaleDateString()}` : ""}
            </Typography>
            <Button component={RouterLink} to={activityPath(activity)} size="small">Ver actividad</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function FeedPage() {
  const { api, state: session, refreshSession, invalidate } = useSession();
  const userId = session.session.user.id;
  const [searchParams] = useSearchParams();
  const activityFromNotification = searchParams.get("activity");
  const [retry, setRetry] = useState(0);
  const [feed, setFeed] = useState({ status: "loading", items: [], offline: false, updatedAt: null, photoUrls: new Map() });
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (session.status === "offline") refreshSession();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshSession, session.status]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrls = [];

    const loadFeed = async () => {
      setFeed((current) => ({ ...current, status: "loading", photoUrls: new Map() }));
      if (isOnline) {
        try {
          const data = await api.feed({ signal: controller.signal });
          if (controller.signal.aborted) return;
          const items = data.items || [];
          await saveFeedSnapshot(userId, items, data.next_cursor);
          await clearOtherUsers(userId);
          cacheFeedPhotos(userId, items, () => invalidate()).catch(() => {});
          setFeed({ status: items.length ? "ready" : "empty", items, offline: false, updatedAt: null, photoUrls: new Map() });
          return;
        } catch (error) {
          if (controller.signal.aborted || (error instanceof ApiError && error.status === 401)) return;
        }
      }

      try {
        const snapshot = await getFeedSnapshot(userId);
        if (controller.signal.aborted) return;
        if (!snapshot) {
          setFeed({ status: "empty", items: [], offline: !isOnline, updatedAt: null, photoUrls: new Map() });
          return;
        }
        const photoUrls = await buildOfflinePhotoUrlMap(snapshot.items);
        objectUrls = [...photoUrls.values()];
        if (controller.signal.aborted) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          objectUrls = [];
          return;
        }
        setFeed({
          status: snapshot.items.length ? "ready" : "empty",
          items: snapshot.items,
          offline: true,
          updatedAt: snapshot.updatedAt,
          photoUrls,
        });
      } catch {
        if (!controller.signal.aborted) {
          setFeed({ status: "error", items: [], offline: !isOnline, updatedAt: null, photoUrls: new Map() });
        }
      }
    };

    loadFeed();
    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [api, invalidate, isOnline, retry, userId]);

  const statusMessage = useMemo(() => {
    if (feed.offline) return `Copia local${feed.updatedAt ? ` guardada el ${new Date(feed.updatedAt).toLocaleString()}` : ""}.`;
    if (!isOnline) return "Sin conexión. No hay una copia offline disponible para esta cuenta.";
    return "No fue posible cargar el feed desde el servidor.";
  }, [feed.offline, feed.updatedAt, isOnline]);

  return (
    <Container maxWidth="md" className="page-content">
      <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" gap={2}>
          <Box>
            <Typography color="secondary.main" variant="overline" fontWeight={700}>Tu comunidad</Typography>
            <Typography variant="h1" component="h1" className="page-heading" fontSize={{ xs: "2.3rem", sm: "3rem" }}>Feed de actividad</Typography>
          </Box>
          <IconButton aria-label="Actualizar feed" color="primary" onClick={() => setRetry((value) => value + 1)}>
            <RefreshIcon />
          </IconButton>
        </Stack>
        {!isOnline && <Alert severity="warning">Estás sin conexión. El feed guardado se muestra en modo de solo lectura.</Alert>}
        {activityFromNotification && <Alert severity="info">Abriste esta vista desde una notificación. Aquí están las actividades recientes.</Alert>}
        <PushPreferences />
        {feed.status === "loading" && <BusyState label="Cargando el feed…" />}
        {feed.status === "error" && <Alert severity="error" action={<Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>{statusMessage}</Alert>}
        {feed.status === "empty" && (
          <Alert severity={feed.offline ? "warning" : "info"}>
            {feed.offline ? statusMessage : "Aún no hay actividad en tu feed. Sigue personas o restaurantes para ver sus publicaciones."}
          </Alert>
        )}
        {feed.status === "ready" && feed.offline && <Alert severity="warning">{statusMessage} Esta copia es de solo lectura.</Alert>}
        {feed.status === "ready" && feed.items.map((item, index) => (
          <ActivityCard key={`${item.type}-${item.published_at}-${index}`} activity={item} offline={feed.offline} photoUrls={feed.photoUrls} />
        ))}
      </Stack>
    </Container>
  );
}

function RestaurantsPage() {
  const { api } = useSession();
  const [state, setState] = useState({ status: "loading", items: [], error: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", items: [], error: null });
    api.restaurants({ limit: 20, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: data.items?.length ? "ready" : "empty", items: data.items || [], error: null });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: "error", items: [], error });
      });
    return () => controller.abort();
  }, [api, retry]);

  return (
    <Container maxWidth="md" className="page-content">
      <Stack spacing={2}>
        <Typography variant="h1" component="h1" className="page-heading" fontSize={{ xs: "2.3rem", sm: "3rem" }}>Restaurantes</Typography>
        {state.status === "loading" && <BusyState label="Buscando restaurantes…" />}
        {state.status === "empty" && <Alert severity="info">Todavía no hay restaurantes para mostrar.</Alert>}
        {state.status === "error" && <Alert severity="error" action={<Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>No se pudo cargar la lista. {state.error?.message}</Alert>}
        {state.status === "ready" && state.items.map((restaurant) => (
          <Card key={restaurant.id} component="article">
            <CardContent>
              <Typography variant="h3" component="h2" fontSize="1.35rem">{restaurant.name}</Typography>
              <Typography color="text.secondary">{restaurant.address}</Typography>
              {!!restaurant.cuisine_styles?.length && <Typography sx={{ mt: 1 }}>{restaurant.cuisine_styles.map((style) => style.name).join(" · ")}</Typography>}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}

function ActivityPage({ activityType }) {
  const { api } = useSession();
  const { id } = useParams();
  const type = activityType;
  const navigate = useNavigate();
  const [result, setResult] = useState({ status: "loading", data: null, error: null });
  const loader = useMemo(() => ({
    review: api.review,
    visit: api.visit,
    evaluation: api.evaluation,
    photo: api.photo,
  })[type], [api, type]);

  useEffect(() => {
    const controller = new AbortController();
    if (!loader) {
      setResult({ status: "error", data: null, error: new Error("Tipo de actividad desconocido") });
      return () => controller.abort();
    }
    setResult({ status: "loading", data: null, error: null });
    loader(id, { signal: controller.signal })
      .then((data) => !controller.signal.aborted && setResult({ status: "ready", data, error: null }))
      .catch((error) => !controller.signal.aborted && setResult({ status: "error", data: null, error }));
    return () => controller.abort();
  }, [id, loader]);

  const data = result.data;
  const title = type === "review" ? data?.dish_name : type === "visit" ? `Visita a ${data?.restaurant?.name || "un restaurante"}` : type === "evaluation" ? `Evaluación de ${data?.restaurant?.name || "un restaurante"}` : data?.dish_name || data?.caption || "Fotografía";
  const photo = type === "review" ? data?.photo : data;

  return (
    <Container maxWidth="md" className="page-content">
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Volver</Button>
      {result.status === "loading" && <BusyState label="Cargando actividad…" />}
      {result.status === "error" && <Alert severity="error">No fue posible abrir esta actividad. {result.error?.message}</Alert>}
      {result.status === "ready" && (
        <Card component="article">
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={2}>
              <Typography variant="overline" color="secondary.main" fontWeight={700}>{data.author?.name || "Foodie"} · {data.restaurant?.name || ""}</Typography>
              <Typography variant="h1" component="h1" fontSize={{ xs: "2.2rem", sm: "3rem" }}>{title || "Actividad"}</Typography>
              {type === "review" && <><Typography>Calificación: {data.rating}/5</Typography><Typography>{data.text}</Typography></>}
              {type === "evaluation" && <><Typography>{data.comment}</Typography><Divider />{data.ratings?.map((rating) => <Typography key={rating.criterion}>{rating.criterion}: {rating.rating}/5</Typography>)}</>}
              {type === "visit" && <Typography>Visita registrada el {new Date(data.occurred_at).toLocaleString()}.</Typography>}
              {photo?.content_url && <Box component="img" className="activity-photo" src={photo.content_url} alt={photo.caption || `Foto de ${title}`} />}
              {type === "evaluation" && data.photos?.map((image) => <Box key={image.id} component="img" className="activity-photo" src={image.content_url} alt="Foto asociada a la evaluación" />)}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

function NotFoundPage() {
  return (
    <Container maxWidth="sm" className="page-content">
      <Stack spacing={2}>
        <Typography variant="h1" component="h1" fontSize="2.5rem">Página no encontrada</Typography>
        <Button component={RouterLink} to="/feed" variant="contained">Ir al feed</Button>
      </Stack>
    </Container>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RouteGate />}>
        <Route index element={<HomeRedirect />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="restaurants" element={<RestaurantsPage />} />
        <Route path="reviews/:id" element={<ActivityPage activityType="review" />} />
        <Route path="visits/:id" element={<ActivityPage activityType="visit" />} />
        <Route path="evaluations/:id" element={<ActivityPage activityType="evaluation" />} />
        <Route path="photos/:id" element={<ActivityPage activityType="photo" />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
