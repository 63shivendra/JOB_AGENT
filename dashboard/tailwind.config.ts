import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0c0a09',
        foreground: '#f5f5f4',
        card: '#1c1917',
        border: '#292524',
      },
    },
  },
  plugins: [],
};
export default config;
