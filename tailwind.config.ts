import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          blue: '#2563EB',
          purple: '#7C3AED',
          cyan: '#06B6D4',
        },
        surface: {
          canvas: '#F2F2F7',
          primary: '#FFFFFF',
          secondary: '#F8F8FA',
          tertiary: '#ECECF0',
          hover: '#F0F0F3',
        },
        text: {
          primary: '#111111',
          secondary: '#5E5E6A',
          muted: '#94949E',
        },
        border: {
          light: 'rgba(0,0,0,0.07)',
          medium: 'rgba(0,0,0,0.10)',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
        '5xl': '28px',
      },
      boxShadow: {
        'light': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card': '0 1px 3px rgba(0,0,0,0.05)',
        'hover': '0 4px 16px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
export default config;
