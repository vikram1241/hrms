import { createTheme } from '@mui/material/styles';

// MUI theme mirrors the Tailwind teal tokens so MUI components (Drawer, Menu,
// Dialog, Select, Snackbar, DatePicker, etc.) match the Tailwind-styled parts.
const theme = createTheme({
  palette: {
    primary: { main: '#0D9488', dark: '#0F766E', light: '#5EEAD4', contrastText: '#ffffff' },
    secondary: { main: '#0EA5E9' },
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    text: { primary: '#134E4A', secondary: '#64748B' },
    background: { default: '#F4FBFA', paper: '#FFFFFF' },
    divider: '#E2E8F0'
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#134E4A', fontSize: 12 } } }
  }
});

export default theme;
