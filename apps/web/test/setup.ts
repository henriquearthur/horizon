import '@testing-library/jest-dom/vitest'

// jsdom has no layout, so the router's scroll restoration would log on every navigation.
window.scrollTo = () => {}
