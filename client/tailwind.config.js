/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Teal + Emerald palette. `primary` drives buttons/links/active nav.
        primary: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488', // brand
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
          950: '#042F2E'
        },
        // Sidebar / deep surfaces.
        sidebar: {
          DEFAULT: '#0F2E2B',
          hover: '#15403B',
          active: '#0D9488'
        },
        ink: '#134E4A', // primary text
        muted: '#64748B', // secondary text
        surface: '#F4FBFA', // app background
        card: '#FFFFFF',
        line: '#E2E8F0', // borders
        success: { DEFAULT: '#16A34A', soft: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', soft: '#FEF3C7' },
        danger: { DEFAULT: '#DC2626', soft: '#FEE2E2' },
        info: { DEFAULT: '#0EA5E9', soft: '#E0F2FE' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 46, 43, 0.04), 0 1px 3px 0 rgba(15, 46, 43, 0.08)',
        elevated: '0 10px 30px -10px rgba(15, 46, 43, 0.18)'
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
