// src/utils/api.ts
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

// สร้าง API instance
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
      const isVoluntaryLogout = localStorage.getItem('voluntaryLogout') === 'true';
    
      if (!isVoluntaryLogout) {
        alert('session หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่');
        localStorage.removeItem('token');
        window.location.href = '/ma-app/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;