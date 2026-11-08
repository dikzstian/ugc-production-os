/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#110E0C',
        panel: '#1A1612',
        panelSoft: '#231D17',
        line: '#342B22',
        amberGold: '#EE9F27',
        amberBright: '#F7BE59',
        cream: '#F3ECE1',
        mutedWarm: '#A39583',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
