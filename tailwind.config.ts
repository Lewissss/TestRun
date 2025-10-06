import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './app/renderer/**/*.{vue,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF2FF',
          100: '#CED6FF',
          200: '#AAB8FF',
          300: '#889AFF',
          400: '#6F82FF',
          500: '#5F5CFF',
          600: '#5046F8',
          700: '#4235E0',
          800: '#352ABD',
          900: '#2B2399',
        },
        accent: {
          400: '#3cf0c9',
          500: '#22E1B6',
          600: '#0fcaa1',
        },
        ink: {
          950: '#050813',
          900: '#070B1A',
          800: '#0D1429',
          700: '#151E3A',
          600: '#1F294B',
          500: '#2A3561',
        },
        surface: {
          50: '#F5F6FF',
          100: '#E6E8FE',
          200: '#C9CDFB',
          800: '#121A32',
          900: '#0B1224',
        },
        amberglass: '#FF9472',
      },
      fontFamily: {
        sans: ['"Manrope"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        display: ['"Manrope"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
