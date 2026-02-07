/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zk: {
          bg: '#0a0a0b',
          surface: '#111113',
          card: '#18181b',
          inset: '#0e0e10',
          accent: '#34d399',
          'accent-dim': '#059669',
          'accent-hover': '#5eead4',
          text: '#ededef',
          muted: '#8b8b8e',
          dim: '#5c5c5f',
        },
      },
      fontFamily: {
        display: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
