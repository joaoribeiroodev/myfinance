/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f5ebff",
          100: "#e9d4ff",
          200: "#d4acff",
          300: "#b878ff",
          400: "#9b43f5",
          500: "#8405e0",
          600: "#6e04ba",
          700: "#590499",
          800: "#44037a",
          900: "#2f0255",
          950: "#1d0137",
        },
        income: {
          50: "#e8fdf3",
          400: "#2ee6a6",
          500: "#0fd890",
          600: "#06b377",
        },
        expense: {
          50: "#ffeef0",
          400: "#ff7694",
          500: "#ff4066",
          600: "#e81a4a",
        },
        surface: {
          DEFAULT: "#ffffff",
          soft: "#f7f6fb",
          dark: "#0d0b14",
          darkcard: "#17141f",
          darkborder: "#2a2535",
        },
      },
      borderRadius: {
        "2xl": "1.1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,10,40,0.04), 0 8px 24px -8px rgba(80,20,150,0.12)",
        "card-dark": "0 8px 30px -10px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(132,5,224,0.15), 0 8px 30px -6px rgba(132,5,224,0.35)",
        nav: "0 -8px 24px -8px rgba(20,10,40,0.12)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #9b43f5 0%, #6e04ba 55%, #44037a 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, #f5ebff 0%, #e9d4ff 100%)",
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "pop": "pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        "shimmer": "shimmer 1.6s linear infinite",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pop: {
          "0%": { opacity: 0, transform: "scale(0.9)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-468px 0" },
          "100%": { backgroundPosition: "468px 0" },
        },
      },
    },
  },
  plugins: [],
};
