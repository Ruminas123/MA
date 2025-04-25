import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login')) {
        alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        localStorage.removeItem('token');
        window.location.href = '/ma-app/login';
      }
    }
    
    return Promise.reject(error); // ส่งให้ component ไปจัดการ
  }
);

export default api;
