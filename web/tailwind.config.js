/** @type {import('tailwindcss').Config} */
// Design tokens for the HazardLink design system. See design-system/MASTER.md.
// Semantic colors are driven by CSS variables defined in src/index.css so the
// palette lives in one place; discipline accents + refined elevation live here.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--hl-primary) / <alpha-value>)',
          hover: 'rgb(var(--hl-primary-hover) / <alpha-value>)',
          fg: 'rgb(var(--hl-primary-fg) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--hl-accent) / <alpha-value>)',
          fg: 'rgb(var(--hl-accent-fg) / <alpha-value>)',
        },
        surface: 'rgb(var(--hl-surface) / <alpha-value>)',
        ink: 'rgb(var(--hl-ink) / <alpha-value>)',
        // Hairline border token (#E6EAF0), surfaced so utilities can use it too.
        hairline: 'rgb(var(--hl-border) / <alpha-value>)',
        // Dark navy sidebar shades (sidebar stays dark in the light app).
        sidebar: {
          DEFAULT: 'rgb(var(--hl-sidebar) / <alpha-value>)',
          active: 'rgb(var(--hl-sidebar-active) / <alpha-value>)',
        },
        // Discipline accents for section identity (sidebar switcher, badges).
        cleaning: '#0891B2',
        maintenance: '#D97706',
        security: '#4F46E5',
      },
      // Slate-tinted elevation scale (overrides Tailwind's neutral defaults so
      // every existing shadow-sm/md/lg picks up the refined, softer look).
      // sm matches the design target: 0 1px 2px / 0 1px 3px rgba(16,24,40,…).
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        sm: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        md: '0 4px 12px -2px rgb(16 24 40 / 0.08), 0 2px 6px -2px rgb(16 24 40 / 0.05)',
        lg: '0 12px 28px -6px rgb(16 24 40 / 0.12), 0 6px 12px -6px rgb(16 24 40 / 0.08)',
      },
    },
  },
  plugins: [],
};
