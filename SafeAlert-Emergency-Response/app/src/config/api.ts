// Replace 192.168.1.10 with your actual computer's IPv4 address!
// Find it by running 'ipconfig' (Windows) or 'ifconfig' (Mac) in your terminal.
// Do NOT use 'localhost', as the Expo Go app runs on your phone.

const LOCAL_IP = '192.168.1.10'; // <--- CHANGE THIS TO YOUR IP
const PORT = 5000;

export const BASE_URL = `http://${LOCAL_IP}:${PORT}`;
export const API_URL = `${BASE_URL}/api`;