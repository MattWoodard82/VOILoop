/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // VOILoop Seahawks brand palette
        navy: {
          DEFAULT: '#002244',
          dark: '#001a33',
          deep: '#0d1f35',
          border: '#0a3560',
        },
        green: {
          DEFAULT: '#69BE28',
          hover: '#7dd932',
          muted: 'rgba(105,190,40,0.15)',
          border: 'rgba(105,190,40,0.3)',
        },
        wolf: {
          DEFAULT: '#A5ACAF',
          muted: 'rgba(165,172,175,0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
