import { createTheme } from '@mui/material/styles';

// MUI theme mirrors the Tailwind orange + grey tokens so MUI components (Drawer,
// Menu, Dialog, Select, Snackbar, DatePicker, etc.) match the Tailwind-styled parts.
const theme = createTheme({
  palette: {
    primary: { main: '#EA580C', dark: '#C2410C', light: '#FDBA74', contrastText: '#ffffff' },
    secondary: { main: '#6B7280' },
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
    text: { primary: '#1F2937', secondary: '#6B7280' },
    background: { default: '#F9FAFB', paper: '#FFFFFF' },
    divider: '#E5E7EB'
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
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#1F2937', fontSize: 12 } } }
  }
});

export default theme;
