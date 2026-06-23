/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', '"Segoe UI"', 'Tahoma', 'Arial', 'sans-serif'],
      },
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        'bg-2': 'hsl(var(--bg-2) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
        'surface-3': 'hsl(var(--surface-3) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-hover': 'hsl(var(--primary-hover) / <alpha-value>)',
        text: 'hsl(var(--text) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
      },
      borderRadius: {
        xl: 'var(--radius-xl)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
};
