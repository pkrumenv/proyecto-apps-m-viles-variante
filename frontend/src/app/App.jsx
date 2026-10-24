import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  Checkbox,
  MenuItem,
  Select,
  Slider,
  Tabs,
  Tab,
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
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import PersonIcon from "@mui/icons-material/Person";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
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
import GoogleRestaurantMap from "./GoogleRestaurantMap.jsx";
import { createPushController, PUSH_STATES } from "../push.js";
import {
  buildOfflinePhotoUrlMap,
  cacheFeedPhotos,
  clearOtherUsers,
  getFeedSnapshot,
  saveFeedSnapshot,
} from "../offline-feed.js";
import { useSession } from "./session-context.jsx";
import CreateRestaurantPage from "./CreateRestaurantPage.jsx";

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
  const location = useLocation();
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
      <AppBar position="sticky" color="primary" elevation={0}>
        <Toolbar sx={{ width: "min(100% - 24px, 1100px)", mx: "auto", px: "0 !important", gap: 1 }}>
          <Typography component={RouterLink} to="/feed" variant="h6" color="primary.contrastText" sx={{ textDecoration: "none", mr: "auto" }}>
            Foodie
          </Typography>
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
      <BottomNavigation
        showLabels
        value={location.pathname.startsWith("/feed") ? "feed" : location.pathname.startsWith("/explore") || location.pathname.startsWith("/restaurants") ? "search" : location.pathname.startsWith("/notifications") ? "notifications" : location.pathname.startsWith("/profile") ? "profile" : false}
        sx={{ position: "fixed", inset: "auto 0 0", zIndex: (theme) => theme.zIndex.appBar, borderTop: 1, borderColor: "divider", bgcolor: "primary.light" }}
      >
        <BottomNavigationAction label="Feed" value="feed" icon={<DynamicFeedIcon />} onClick={() => navigate("/feed")} />
        <BottomNavigationAction label="Búsqueda" value="search" icon={<SearchIcon />} onClick={() => navigate("/explore")} />
        <BottomNavigationAction label="Check in" value="checkin" icon={<AddIcon />} disabled={!/^\/restaurants\/[^/]+$/.test(location.pathname)} onClick={() => navigate(`/restaurants/${location.pathname.split("/")[2]}/check-in`)} />
        <BottomNavigationAction label="Notificaciones" value="notifications" icon={<NotificationsNoneIcon />} onClick={() => navigate("/notifications")} />
        {location.pathname.startsWith("/profile") ? (
          <BottomNavigationAction label="Cerrar sesión" value="profile" icon={<LogoutIcon />} onClick={handleLogout} />
        ) : (
        <BottomNavigationAction label="Perfil" value="profile" icon={<PersonIcon />} onClick={() => navigate(`/profile/${state.session?.user?.handle ?? "me"}`)} />
        )}
      </BottomNavigation>
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
              <Button component={RouterLink} to="/register">Crear cuenta</Button>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

function RegisterPage() {
  const { api, refreshSession } = useSession();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ name: "", email: "", handle: "", nationality: "", password: "" });
  const [countries, setCountries] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); api.countries({ signal: controller.signal }).then(setCountries).catch((cause) => !controller.signal.aborted && setError(cause.message)); return () => controller.abort(); }, [api]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.register({ ...fields, handle: fields.handle.replace(/^@/, "") }); await refreshSession(); navigate("/feed", { replace: true }); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Container maxWidth="sm" className="page-content"><Stack spacing={2}><Typography variant="h1">Crear cuenta</Typography>{error && <Alert severity="error">{error}</Alert>}<Box component="form" onSubmit={submit} className="field-stack"><TextField label="Nombre" required value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} /><TextField label="Correo electrónico" type="email" required value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} /><TextField label="@Handle" required value={fields.handle} onChange={(e) => setFields({ ...fields, handle: e.target.value })} /><TextField select SelectProps={{ native: true }} label="Nacionalidad" required value={fields.nationality} onChange={(e) => setFields({ ...fields, nationality: e.target.value })}><option value="" />{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</TextField><TextField label="Contraseña (12 caracteres mínimo)" type="password" required inputProps={{ minLength: 12, maxLength: 128 }} value={fields.password} onChange={(e) => setFields({ ...fields, password: e.target.value })} /><Button type="submit" variant="contained" disabled={busy}>{busy ? "Creando cuenta…" : "Registrarme"}</Button><Button onClick={() => navigate("/login")}>Ya tengo cuenta</Button></Box></Stack></Container>;
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
          <Typography component={RouterLink} to={item.author?.handle ? "/profile/" + item.author.handle : "#"} variant="overline" color="secondary.main" fontWeight={700}>{author}</Typography>
          <Typography variant="h3" component="h2" fontSize="1.4rem">{title}</Typography>
          {activity.type === "review" && <Typography>{item.text}</Typography>}
          {activity.type === "evaluation" && item.comment && <Typography>{item.comment}</Typography>}
          {activity.type === "visit" && (
            <Typography color="text.secondary">Estuvo aquí {new Date(item.occurred_at).toLocaleString()}.</Typography>
          )}
          {photoUrl && <Box component="img" className="activity-photo" src={photoUrl} alt={photo?.caption || `Foto de ${title}`} />}
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="body2" color="text.secondary">
              {item.restaurant?.id ? <RouterLink to={"/restaurants/" + item.restaurant.id}>{item.restaurant.name}</RouterLink> : (item.restaurant?.name || "Foodie")}{date ? ` · ${new Date(date).toLocaleDateString()}` : ""}
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
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h1" component="h1" className="page-heading" fontSize={{ xs: "2.3rem", sm: "3rem" }}>Restaurantes</Typography><Button component={RouterLink} to="/restaurants/new" variant="contained">Crear restaurante</Button></Stack>
        {state.status === "loading" && <BusyState label="Buscando restaurantes…" />}
        {state.status === "empty" && <Alert severity="info">Todavía no hay restaurantes para mostrar.</Alert>}
        {state.status === "error" && <Alert severity="error" action={<Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>No se pudo cargar la lista. {state.error?.message}</Alert>}
        {state.status === "ready" && state.items.map((restaurant) => (
          <Card key={restaurant.id} component={RouterLink} to={`/restaurants/${restaurant.id}`} sx={{ textDecoration: "none" }}>
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

function RestaurantPage() {
  const { api } = useSession();
  const { id } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [tab, setTab] = useState("photos");
  const [photos, setPhotos] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRestaurant(null); setError("");
    api.restaurant(id, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) { setRestaurant(value); setFollowing(Boolean(value.viewer?.following)); } }).catch((e) => !controller.signal.aborted && setError(e.message));
    return () => controller.abort();
  }, [api, id]);
  useEffect(() => {
    const controller = new AbortController();
    if (tab === "photos" || tab === "reviews") api.restaurantGallery(id, { kind: tab === "reviews" ? "dish" : undefined, signal: controller.signal }).then((value) => !controller.signal.aborted && setPhotos(value.items || [])).catch((e) => !controller.signal.aborted && setError(e.message));
    if (tab === "evaluations") api.restaurantEvaluations(id, { signal: controller.signal }).then((value) => !controller.signal.aborted && setEvaluations(value.items || [])).catch((e) => !controller.signal.aborted && setError(e.message));
    return () => controller.abort();
  }, [api, id, tab]);
  const toggleFollow = async () => { try { if (following) await api.unfollowRestaurant(id); else await api.followRestaurant(id); setFollowing(!following); } catch (e) { setError(e.message); } };
  if (error && !restaurant) return <Container className="page-content"><Alert severity="error">No se pudo abrir el restaurante. {error}</Alert></Container>;
  if (!restaurant) return <BusyState label="Cargando ficha del restaurante…" />;
  return <Container maxWidth="md" className="page-content"><Stack spacing={2}><Button component={RouterLink} to="/explore" startIcon={<ArrowBackIcon />}>Volver a búsqueda</Button><Card><CardContent><Stack spacing={1}><Typography variant="h1">{restaurant.name}</Typography><Typography>{restaurant.address}</Typography><Typography>{restaurant.cuisine_styles.map((item) => item.name).join(" · ")}</Typography><Typography>★ {restaurant.ratings?.average?.toFixed(1) ?? "Sin evaluaciones"} · {restaurant.ratings?.total ?? 0} evaluaciones</Typography><Stack direction="row" gap={1}><Button variant={following ? "outlined" : "contained"} onClick={toggleFollow}>{following ? "Siguiendo" : "Seguir restaurante"}</Button><Button component={RouterLink} to={`/restaurants/${id}/upload`}>Subir fotos</Button><Button component={RouterLink} to={`/restaurants/${id}/evaluate`}>Evaluar</Button></Stack></Stack></CardContent></Card><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable"><Tab label="Fotos" value="photos" /><Tab label="Reseñas" value="reviews" /><Tab label="Evaluaciones" value="evaluations" /><Tab label="Personas" value="people" /></Tabs>{tab === "photos" && (photos.length ? photos.map((photo) => <Card key={photo.id} component={RouterLink} to={`/photos/${photo.id}`} sx={{ textDecoration: "none" }}><CardContent><Typography>{photo.author.name} · {photo.kind}</Typography><Box component="img" src={photo.content_url} alt="Foto del restaurante" className="activity-photo" /><Typography>{photo.comments_count} comentarios</Typography></CardContent></Card>) : <Alert severity="info">Sin resultados.</Alert>)}{tab === "reviews" && (() => { const reviewed = photos.filter((photo) => photo.review_id); return reviewed.length ? reviewed.map((photo) => <Card key={photo.review_id} component={RouterLink} to={`/reviews/${photo.review_id}`} sx={{ textDecoration: "none" }}><CardContent><Typography>{photo.author.name} · Reseña del plato</Typography><Typography>Ver reseña y calificación</Typography></CardContent></Card>) : <Alert severity="info">Sin reseñas todavía.</Alert>; })()}{tab === "evaluations" && (evaluations.length ? evaluations.map((evaluation) => <Card key={evaluation.id} component={RouterLink} to={`/evaluations/${evaluation.id}`} sx={{ textDecoration: "none" }}><CardContent><Typography>{evaluation.author?.name}</Typography><Typography>{evaluation.comment}</Typography><Typography>{evaluation.ratings?.map((rating) => `${rating.criterion}: ${rating.rating}/5`).join(" · ")}</Typography></CardContent></Card>) : <Alert severity="info">Sin evaluaciones todavía.</Alert>)}{tab === "people" && (restaurant.known_visitors?.items?.length ? restaurant.known_visitors.items.map((person) => <Card key={person.id} component={RouterLink} to={`/profile/${person.handle}`} sx={{ textDecoration: "none" }}><CardContent><Typography>@{person.handle} · última visita {new Date(person.last_visit_at).toLocaleDateString()}</Typography></CardContent></Card>) : <Alert severity="info">No hay visitas públicas de personas que sigues.</Alert>)}{error && <Alert severity="error">{error}</Alert>}</Stack></Container>;
}

function CheckInPage() {
  const { api } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [occurredAt, setOccurredAt] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const submit = async (event) => { event.preventDefault(); setError(""); try { await api.createVisit({ restaurant_id: id, visibility, ...(occurredAt ? { occurred_at: new Date(occurredAt).toISOString() } : {}) }); setSuccess(true); setTimeout(() => navigate(`/restaurants/${id}`), 900); } catch (e) { setError(e.message); } };
  return <Container maxWidth="sm" className="page-content"><Stack spacing={2}><Typography variant="h1">Check in</Typography>{success && <Alert severity="success">Check-in exitoso. Volviendo a la ficha…</Alert>}{error && <Alert severity="error">{error}</Alert>}<Box component="form" onSubmit={submit} className="field-stack"><TextField label="Fecha y hora de la visita (opcional)" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} InputLabelProps={{ shrink: true }} /><TextField select label="Visibilidad" value={visibility} onChange={(e) => setVisibility(e.target.value)}><MenuItem value="public">Pública</MenuItem><MenuItem value="private">Privada</MenuItem></TextField><Button variant="contained" type="submit" disabled={success}>Confirmar</Button></Box></Stack></Container>;
}

function UploadPhotosPage() {
  const { api } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [kind, setKind] = useState("dish");
  const [dishName, setDishName] = useState("");
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!files.length) throw new Error("Selecciona al menos una fotografía.");
      const group = files.length > 1 ? crypto.randomUUID() : "";
      const created = [];
      for (const file of files) {
        const body = new FormData(); body.append("restaurant_id", id); body.append("kind", kind); body.append("visibility", visibility); body.append("photo", file);
        if (kind === "dish") body.append("dish_name", dishName.trim());
        if (caption.trim()) body.append("caption", caption.trim()); if (group) body.append("upload_group", group);
        created.push(await api.uploadPhoto(body));
      }
      navigate(kind === "dish" ? `/photos/${created[0].id}` : `/restaurants/${id}`, { replace: true });
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Container maxWidth="sm" className="page-content"><Stack spacing={2}><Button component={RouterLink} to={`/restaurants/${id}`} startIcon={<ArrowBackIcon />}>Volver a la ficha</Button><Typography variant="h1">Subir fotos</Typography>{error && <Alert severity="error">{error}</Alert>}<Box component="form" onSubmit={submit} className="field-stack"><TextField select label="Tipo" value={kind} onChange={(event) => setKind(event.target.value)}><MenuItem value="dish">Plato</MenuItem><MenuItem value="menu">Menú</MenuItem><MenuItem value="venue">Instalaciones</MenuItem></TextField>{kind === "dish" && <TextField label="¿Qué plato es?" required value={dishName} onChange={(event) => setDishName(event.target.value)} />}{kind !== "dish" && <TextField label="Descripción (opcional)" value={caption} onChange={(event) => setCaption(event.target.value)} /> }<Button component="label" variant="outlined">Seleccionar imágenes<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></Button><Typography>{files.map((file) => file.name).join(" · ") || "Sin imágenes seleccionadas"}</Typography><TextField select label="Visibilidad" value={visibility} onChange={(event) => setVisibility(event.target.value)}><MenuItem value="public">Pública</MenuItem><MenuItem value="private">Privada</MenuItem></TextField><Button variant="contained" type="submit" disabled={busy}>{busy ? "Publicando…" : "Publicar"}</Button></Box></Stack></Container>;
}

function EvaluateRestaurantPage() {
  const { api } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [criteria, setCriteria] = useState([]);
  const [ratings, setRatings] = useState({});
  const [gallery, setGallery] = useState([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); api.evaluationCriteria({ signal: controller.signal }).then((items) => { if (!controller.signal.aborted) { setCriteria(items); setRatings(Object.fromEntries(items.map((item) => [item.slug, 3]))); } }).catch((cause) => !controller.signal.aborted && setError(cause.message)); return () => controller.abort(); }, [api]);
  useEffect(() => { const controller = new AbortController(); api.restaurantGallery(id, { limit: 50, signal: controller.signal }).then((page) => !controller.signal.aborted && setGallery((page.items || []).filter((photo) => photo.kind === "menu" || photo.kind === "venue"))).catch((cause) => !controller.signal.aborted && setError(cause.message)); return () => controller.abort(); }, [api, id]);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await api.createEvaluation({ restaurant_id: id, ratings, comment, visibility, photo_ids: selectedPhotoIds }); navigate(`/restaurants/${id}`, { replace: true }); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <Container maxWidth="sm" className="page-content"><Stack spacing={2}><Typography variant="h1">Evaluar restaurante</Typography>{error && <Alert severity="error">{error}</Alert>}<Box component="form" onSubmit={submit} className="field-stack">{criteria.map((criterion) => <Stack key={criterion.slug} direction="row" alignItems="center" justifyContent="space-between"><Typography>{criterion.name}</Typography><TextField select size="small" label="Puntaje" value={ratings[criterion.slug] ?? 3} onChange={(event) => setRatings((current) => ({ ...current, [criterion.slug]: Number(event.target.value) }))}>{[1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{"★".repeat(n)} {n}/5</MenuItem>)}</TextField></Stack>)}<TextField label="Comentario general" multiline minRows={3} required value={comment} onChange={(event) => setComment(event.target.value)} /><TextField select label="Visibilidad" value={visibility} onChange={(event) => setVisibility(event.target.value)}><MenuItem value="public">Pública</MenuItem><MenuItem value="private">Privada</MenuItem></TextField><Button variant="contained" type="submit" disabled={busy || !criteria.length}>{busy ? "Publicando…" : "Evaluar"}</Button></Box></Stack></Container>;
}

function ReviewPhotoPage() {
  const { api } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); api.photo(id, { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) { setPhoto(value); setVisibility(value.visibility); } }).catch((e) => !controller.signal.aborted && setError(e.message)); return () => controller.abort(); }, [api, id]);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await api.createReview({ photo_id: id, rating, text, visibility }); navigate(`/photos/${id}`, { replace: true }); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Container maxWidth="sm" className="page-content"><Stack spacing={2}><Typography variant="h1">Reseñar {photo?.dish_name || "plato"}</Typography>{error && <Alert severity="error">{error}</Alert>}{photo?.content_url && <Box component="img" className="activity-photo" src={photo.content_url} alt={photo.caption || photo.dish_name || "Foto del plato"} />}<Box component="form" onSubmit={submit} className="field-stack"><TextField label="Cuéntanos tu experiencia" multiline minRows={3} required value={text} onChange={(e) => setText(e.target.value)} /><TextField select label="Calificación" value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{"★".repeat(n)} {n}/5</MenuItem>)}</TextField><TextField select label="Visibilidad" value={visibility} onChange={(e) => setVisibility(e.target.value)}>{(photo?.visibility === "private" ? ["private"] : ["public", "private"]).map((value) => <MenuItem key={value} value={value}>{value === "public" ? "Pública" : "Privada"}</MenuItem>)}</TextField><Button type="submit" variant="contained" disabled={busy || !photo}>{busy ? "Publicando…" : "Publicar reseña"}</Button></Box></Stack></Container>;
}

function ExplorePage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  queryRef.current = query.trim();
  const [searchVersion, setSearchVersion] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreControllerRef = useRef(null);
  const [advanced, setAdvanced] = useState(false);
  const [styles, setStyles] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [locationMode, setLocationMode] = useState("current");
  const [coordinates, setCoordinates] = useState(null);
  const [radius, setRadius] = useState(10);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [state, setState] = useState({ status: "idle", items: [], error: "" });
  useEffect(() => { const controller = new AbortController(); api.cuisineStyles({ signal: controller.signal }).then(setCatalogue).catch((e) => !controller.signal.aborted && setState({ status: "error", items: [], error: e.message })); return () => controller.abort(); }, [api]);
  useEffect(() => {
    const term = query.trim();
    moreControllerRef.current?.abort();
    setLoadingMore(false);
    setNextCursor(null);
    if (term.length < 2) {
      setState({ status: "idle", items: [], error: "" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: "loading", items: [], error: "" });
    const timer = setTimeout(async () => {
      try {
        const page = await api.restaurants({ q: term, limit: 20, signal: controller.signal });
        if (!controller.signal.aborted && queryRef.current === term) {
          setState({ status: page.items.length ? "ready" : "empty", items: page.items || [], error: "" });
          setNextCursor(page.next_cursor || null);
        }
      } catch (error) {
        if (!controller.signal.aborted && queryRef.current === term) setState({ status: "error", items: [], error: error.message });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, searchVersion]);
  const locate = () => {
    if (!navigator.geolocation) { setState({ status: "error", items: [], error: "Este navegador no permite consultar la ubicación." }); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => { setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setMapCenter({ lat: coords.latitude, lng: coords.longitude }); setLocationMode("current"); }, () => { setCoordinates(null); setState({ status: "error", items: [], error: "Sin permiso de ubicación: activa el permiso o busca por nombre." }); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const searchNearby = async () => {
    setNextCursor(null);
    setState({ status: "loading", items: [], error: "" });
    try {
      if (!coordinates) throw new Error("Permite el acceso a tu ubicación antes de buscar por cercanía.");
      const result = await api.nearby({ ...coordinates, radius: radius * 1000, cuisineStyles: styles });
      setState({ status: result.items.length ? "ready" : "empty", items: result.items, error: result.truncated ? "Hay más resultados; reduce el radio o selecciona más estilos." : "" });
      setMapCenter({ lat: coordinates.latitude, lng: coordinates.longitude });
      setMapVisible(true);
    } catch (error) { setState({ status: "error", items: [], error: error.message }); }
  };
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const term = query.trim();
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    try {
      const page = await api.restaurants({ q: term, cursor: nextCursor, limit: 20, signal: controller.signal });
      if (!controller.signal.aborted && queryRef.current === term) {
        setState((current) => ({ ...current, status: "ready", items: [...current.items, ...page.items] }));
        setNextCursor(page.next_cursor || null);
      }
    } catch (error) {
      if (!controller.signal.aborted && queryRef.current === term) setState((current) => ({ ...current, status: "error", error: error.message }));
    } finally {
      if (moreControllerRef.current === controller) { moreControllerRef.current = null; setLoadingMore(false); }
    }
  };
  const submitSearch = (event) => { event.preventDefault(); if (query.trim().length >= 2) setSearchVersion((version) => version + 1); };
  const acceptMapResults = (items) => { setNextCursor(null); setState({ status: items.length ? "ready" : "empty", items, error: "" }); };
  return <Container maxWidth="md" className="page-content"><Stack spacing={2}><Typography variant="h1" className="page-heading">Explorar</Typography><Box component="form" onSubmit={submitSearch} className="field-stack"><TextField label="Buscar restaurante por nombre" value={query} onChange={(e) => setQuery(e.target.value)} helperText="Escribe al menos dos caracteres; los resultados se actualizan mientras escribes." /><Button type="submit" variant="contained" disabled={query.trim().length < 2}>Buscar</Button></Box><Button onClick={() => setAdvanced((value) => !value)}>{advanced ? "Ocultar búsqueda avanzada" : "Búsqueda avanzada"}</Button>{advanced && <Card><CardContent><Stack spacing={2}><FormControl fullWidth><Typography variant="body2">Estilos de comida</Typography><Select multiple value={styles} onChange={(e) => setStyles(e.target.value)}>{catalogue.map((style) => <MenuItem key={style.slug} value={style.slug}>{style.name}</MenuItem>)}</Select></FormControl><Typography>Ubicación: {locationMode === "current" ? "mi ubicación actual" : "dirección añadida"}</Typography><Button onClick={locate}>Usar mi ubicación actual</Button><TextField label="Dirección" disabled={!coordinates} helperText="La búsqueda por dirección requiere geocodificación; por ahora usa tu ubicación actual." /><Typography>Radio: {radius} km</Typography><Slider min={1} max={50} value={radius} onChange={(_, value) => setRadius(value)} aria-label="Radio de búsqueda en kilómetros" /><Button variant="contained" disabled={!coordinates} onClick={searchNearby}>Buscar cerca</Button></Stack></CardContent></Card>}<Button variant="outlined" onClick={() => setMapVisible((visible) => !visible)}>{mapVisible ? "Ocultar mapa" : "Explorar el mapa"}</Button>{mapVisible && <GoogleRestaurantMap api={api} restaurants={state.items} center={mapCenter} onBoundsResults={acceptMapResults} onOpenRestaurant={(id) => navigate(`/restaurants/${id}`)} />}{state.status === "loading" && <BusyState label="Buscando restaurantes…" />}{state.status === "empty" && <Alert severity="info">Sin resultados.</Alert>}{state.status === "error" && <Alert severity="warning">{state.error}</Alert>}{state.items.map((restaurant) => <Card key={restaurant.id} onClick={() => navigate(`/restaurants/${restaurant.id}`)} sx={{ cursor: "pointer" }}><CardContent><Typography variant="h3">{restaurant.name}</Typography><Typography color="text.secondary">{restaurant.address}{restaurant.distance_m ? ` · ${(restaurant.distance_m / 1000).toFixed(1)} km` : ""}</Typography><Typography>{restaurant.cuisine_styles?.map((style) => style.name).join(" · ")}</Typography></CardContent></Card>)}{nextCursor && <Button variant="outlined" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más restaurantes"}</Button>}</Stack></Container>;
}

function ProfilePage() {
  const { api } = useSession();
  const { handle } = useParams();
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); setProfile(null); Promise.all([api.profile(handle, { signal: controller.signal }), api.userActivity(handle, { signal: controller.signal })]).then(([person, activity]) => { if (!controller.signal.aborted) { setProfile(person); setItems(activity.items || []); } }).catch((e) => !controller.signal.aborted && setError(e.message)); return () => controller.abort(); }, [api, handle]);
  const toggleFollow = async () => { setBusy(true); try { if (following || profile.viewer?.following) await api.unfollowUser(handle); else await api.followUser(handle); setFollowing(!(following || profile.viewer?.following)); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Container maxWidth="md" className="page-content"><Stack spacing={2}>{error && <Alert severity="error">{error}</Alert>}{!profile && !error && <BusyState label="Cargando perfil…" />}{profile && <><Typography variant="h1">@{profile.handle}</Typography><Typography>{profile.name} · {profile.nationality?.name || ""}</Typography><Typography>{profile.counters?.followers} seguidores · {profile.counters?.following} siguiendo</Typography>{!profile.viewer?.is_self && <Button variant="contained" disabled={busy} onClick={toggleFollow}>{(following || profile.viewer?.following) ? "Dejar de seguir" : "Seguir"}</Button>}{items.length === 0 ? <Alert severity="info">Sin publicaciones para mostrar.</Alert> : items.map((activity, index) => <ActivityCard key={`${activity.type}-${activity.published_at}-${index}`} activity={activity} offline={false} photoUrls={new Map()} />)}</>}</Stack></Container>;
}

function NotificationsPage() {
  const { api } = useSession();
  const [query, setQuery] = useState("");
  const queryRef = useRef(""); queryRef.current = query.trim();
  const [searchVersion, setSearchVersion] = useState(0);
  const [state, setState] = useState({ status: "idle", users: [], error: "" });
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreControllerRef = useRef(null);
  useEffect(() => {
    const term = query.trim();
    moreControllerRef.current?.abort(); setLoadingMore(false); setNextCursor(null);
    if (term.length < 2) { setState({ status: "idle", users: [], error: "" }); return undefined; }
    const controller = new AbortController();
    setState({ status: "loading", users: [], error: "" });
    const timer = setTimeout(async () => {
      try {
        const page = await api.users({ q: term, limit: 20, signal: controller.signal });
        if (!controller.signal.aborted && queryRef.current === term) {
          setState({ status: page.items.length ? "ready" : "empty", users: page.items || [], error: "" });
          setNextCursor(page.next_cursor || null);
        }
      } catch (error) { if (!controller.signal.aborted && queryRef.current === term) setState({ status: "error", users: [], error: error.message }); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, searchVersion]);
  const search = (event) => { event.preventDefault(); if (query.trim().length >= 2) setSearchVersion((version) => version + 1); };
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const term = query.trim(); const controller = new AbortController(); moreControllerRef.current = controller; setLoadingMore(true);
    try {
      const page = await api.users({ q: term, cursor: nextCursor, limit: 20, signal: controller.signal });
      if (!controller.signal.aborted && queryRef.current === term) {
        setState((current) => ({ ...current, status: "ready", users: [...current.users, ...page.items] }));
        setNextCursor(page.next_cursor || null);
      }
    } catch (error) { if (!controller.signal.aborted && queryRef.current === term) setState((current) => ({ ...current, status: "error", error: error.message })); }
    finally { if (moreControllerRef.current === controller) { moreControllerRef.current = null; setLoadingMore(false); } }
  };
  return <Container maxWidth="md" className="page-content"><Stack spacing={2}><Typography variant="h1">Notificaciones</Typography><PushPreferences /><Typography variant="h2">Buscar personas</Typography><Box component="form" onSubmit={search} className="field-stack"><TextField label="Buscar por @handle" value={query} onChange={(e) => setQuery(e.target.value)} required inputProps={{ minLength: 2 }} helperText="Los resultados aparecen mientras escribes; ingresa al menos dos caracteres." /><Button variant="contained" type="submit" disabled={query.trim().length < 2}>Buscar</Button></Box>{state.status === "loading" && <BusyState label="Buscando personas…" />}{state.status === "empty" && <Alert severity="info">@{query} no encontrado.</Alert>}{state.status === "error" && <Alert severity="error">{state.error}</Alert>}{state.users.map((person) => <Card key={person.id} component={RouterLink} to={`/profile/${person.handle}`} sx={{ textDecoration: "none" }}><CardContent><Typography variant="h3">@{person.handle}</Typography><Typography color="text.secondary">{person.name}</Typography></CardContent></Card>)}{nextCursor && <Button variant="outlined" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más personas"}</Button>}</Stack></Container>;
}

function ActivityPage({ activityType }) {
  const { api, state: session } = useSession();
  const { id } = useParams();
  const type = activityType;
  const navigate = useNavigate();
  const [result, setResult] = useState({ status: "loading", data: null, error: null });
  const [threads, setThreads] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [commentError, setCommentError] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
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

  useEffect(() => {
    if (type !== "photo") return undefined;
    const controller = new AbortController();
    api.comments(id, { signal: controller.signal }).then((page) => !controller.signal.aborted && setThreads(page.items || [])).catch((error) => !controller.signal.aborted && setCommentError(error.message));
    return () => controller.abort();
  }, [api, id, type]);

  const submitComment = async (event) => {
    event.preventDefault(); setCommentBusy(true); setCommentError("");
    try {
      await api.createComment(id, { text: commentText.trim(), ...(replyTo ? { parent_id: replyTo.comment.id } : {}) });
      const page = await api.comments(id); setThreads(page.items || []); setCommentText(""); setReplyTo(null);
    } catch (error) { setCommentError(error.message); }
    finally { setCommentBusy(false); }
  };

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
              {type === "photo" && data.kind === "dish" && !data.review_id && data.author?.id === session.session?.user?.id && <Button component={RouterLink} to={`/photos/${id}/review`} variant="contained">Calificar plato</Button>}
              {type === "evaluation" && data.photos?.map((image) => <Box key={image.id} component="img" className="activity-photo" src={image.content_url} alt="Foto asociada a la evaluación" />)}
              {type === "photo" && <>
                <Typography variant="h2" fontSize="1.4rem">Comentarios</Typography>
                {commentError && <Alert severity="error">{commentError}</Alert>}
                {threads.map((thread) => <Card variant="outlined" key={thread.comment.id}><CardContent><Stack direction="row" spacing={1.5}><Avatar>{thread.comment.author.name.slice(0, 1)}</Avatar><Box sx={{ flex: 1 }}><Typography component={RouterLink} to={`/profile/${thread.comment.author.handle}`} fontWeight={700}>@{thread.comment.author.handle}</Typography><Typography>{thread.comment.text}</Typography><Button size="small" onClick={() => { setReplyTo(thread); setCommentText(`@${thread.comment.author.handle} `); }}>Responder</Button>{thread.replies?.map((reply) => <Box key={reply.id} sx={{ ml: 2, mt: 1, pl: 2, borderLeft: 1, borderColor: "divider" }}><Typography component={RouterLink} to={`/profile/${reply.author.handle}`} fontWeight={700}>@{reply.author.handle}</Typography><Typography>{reply.text}</Typography><Button size="small" onClick={() => { setReplyTo(thread); setCommentText(`@${reply.author.handle} `); }}>Responder</Button></Box>)}</Box></Stack></CardContent></Card>)}
                <Box component="form" onSubmit={submitComment} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}><Avatar>YO</Avatar><TextField multiline minRows={1} maxRows={4} placeholder={replyTo ? `Respondiendo a @${replyTo.comment.author.handle}` : "Añade un comentario..."} value={commentText} onChange={(event) => setCommentText(event.target.value)} required inputProps={{ maxLength: 2000 }} /><Button type="submit" disabled={commentBusy}>{commentBusy ? "Enviando…" : "Publicar"}</Button></Box>
              </>}
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
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RouteGate />}>
        <Route index element={<HomeRedirect />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile/:handle" element={<ProfilePage />} />
        <Route path="restaurants" element={<RestaurantsPage />} />
        <Route path="restaurants/new" element={<CreateRestaurantPage />} />
        <Route path="restaurants/:id" element={<RestaurantPage />} />
        <Route path="restaurants/:id/check-in" element={<CheckInPage />} />
        <Route path="restaurants/:id/upload" element={<UploadPhotosPage />} />
        <Route path="restaurants/:id/evaluate" element={<EvaluateRestaurantPage />} />
        <Route path="photos/:id/review" element={<ReviewPhotoPage />} />
        <Route path="reviews/:id" element={<ActivityPage activityType="review" />} />
        <Route path="visits/:id" element={<ActivityPage activityType="visit" />} />
        <Route path="evaluations/:id" element={<ActivityPage activityType="evaluation" />} />
        <Route path="photos/:id" element={<ActivityPage activityType="photo" />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
