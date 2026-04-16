/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ssms: {
          bg: '#060913',
          sidebar: '#0b0f1f',
          toolbar: '#0d1226',
          border: 'rgba(255,255,255,0.08)',
          text: '#e2e8f0',
          textDim: '#64748b',
          accent: '#0078d4',
          accentHover: '#1d4ed8',
          panelBg: '#080c1a',
          inputBg: 'rgba(255,255,255,0.05)',
          success: '#34d399',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
