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
          teal: '#0D9488',
          orange: '#EA580C',
          rose: '#E11D48',
        },
        surface: {
          canvas: '#FAFAF9',
          primary: '#FFFFFF',
          secondary: '#F5F4F1',
          tertiary: '#ECEBE7',
          hover: '#EDECEA',
        },
        text: {
          primary: '#141413',
          secondary: '#6E6D6A',
          muted: '#9A9996',
          disabled: '#C5C4C0',
        },
        border: {
          light: 'rgba(0,0,0,0.07)',
          medium: 'rgba(0,0,0,0.10)',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        brand: '#2563EB',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
        '5xl': '28px',
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0,0,0,0.04)',
        'light': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card': '0 1px 2px rgba(0,0,0,0.04)',
        'hover': '0 2px 8px rgba(0,0,0,0.06)',
        'modal': '0 4px 24px rgba(0,0,0,0.12)',
        'dropdown': '0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
export default config;
