// API Configuration for Web App
// In production, this will use the environment variable set in Vercel/Netlify

export const API_URL = import.meta.env.VITE_API_URL || 'https://tanzalert-emergency-response.onrender.com/api';

export const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://tanzalert-emergency-response.onrender.com';
