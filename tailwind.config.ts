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
          primary: '#FFFFFF',
          secondary: '#F7F7F8',
          tertiary: '#F4F4F5',
          hover: '#EFEFF0',
        },
        text: {
          primary: '#111111',
          secondary: '#6E6E73',
          muted: '#A1A1AA',
        },
        border: {
          light: 'rgba(0,0,0,0.06)',
          medium: 'rgba(0,0,0,0.08)',
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
        'light': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        'card': '0 1px 3px rgba(0,0,0,0.04)',
        'hover': '0 4px 12px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
export default config;
