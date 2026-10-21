import { createTheme } from "@mui/material/styles";

// Consolidate the local stylesheet's green, terracotta, warm surfaces,
// Inter body type and Georgia display type into the single MUI theme.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#285b3b", dark: "#1e472d", light: "#dcebdd", contrastText: "#ffffff" },
    secondary: { main: "#a34e2f", light: "#e8975e", contrastText: "#ffffff" },
    background: { default: "#f3f5ef", paper: "#ffffff" },
    text: { primary: "#17221b", secondary: "#536057" },
    divider: "#d7ddd2",
    error: { main: "#7c271d", light: "#f6dfda" },
    success: { main: "#174b2b", light: "#dcebdd" },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: "-0.045em" },
    h2: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: "-0.025em" },
    h3: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 },
    button: { fontWeight: 650, textTransform: "none" },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: {
      styleOverrides: { root: { minHeight: 44, borderRadius: 12, paddingInline: 18 } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #d7ddd2",
          boxShadow: "0 12px 36px rgb(30 52 37 / 8%)",
        },
      },
    },
    MuiTextField: { defaultProps: { fullWidth: true, size: "medium" } },
  },
});
