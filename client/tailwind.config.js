/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Orange + Grey palette. `primary` (orange) drives buttons/links/active nav.
        primary: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C', // brand
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
          950: '#431407'
        },
        // Sidebar / deep surfaces (charcoal grey).
        sidebar: {
          DEFAULT: '#1F2937',
          hover: '#374151',
          active: '#EA580C'
        },
        ink: '#1F2937', // primary text (dark grey)
        muted: '#6B7280', // secondary text (grey)
        surface: '#F9FAFB', // app background (light grey)
        card: '#FFFFFF',
        line: '#E5E7EB', // borders (grey)
        success: { DEFAULT: '#16A34A', soft: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', soft: '#FEF3C7' },
        danger: { DEFAULT: '#DC2626', soft: '#FEE2E2' },
        info: { DEFAULT: '#0EA5E9', soft: '#E0F2FE' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(31, 41, 55, 0.04), 0 1px 3px 0 rgba(31, 41, 55, 0.08)',
        elevated: '0 10px 30px -10px rgba(31, 41, 55, 0.18)'
      },
      borderRadius: {
        xl: '0.875rem'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'slide-in': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s ease-out'
      }
    }
  },
  plugins: []
};
