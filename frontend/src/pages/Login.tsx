import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const API_BASE_URL = 'http://192.168.100.138:2000'; // Update this to match your server address

interface LoginForm {
  personnel_username: string;
  personnel_password: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState<LoginForm>({
    personnel_username: '',
    personnel_password: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, formData, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && response.data.token) {
        const user = response.data.user;
        login(response.data.token, user);
        console.log('user :>> ', user);
        // Check if the role is admin
        if (user.role === 'admin') {
          // If role is admin, navigate to Admin page
          navigate('/ma-app/admin', { replace: true });
        } else {
          // Otherwise, navigate to the original or home page
          const from = location.state?.from?.pathname || '/';
          navigate(from, { replace: true });
        }
      } else {
        setError('Invalid response from server');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">เข้าสู่ระบบ</h2>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="personnel_username">ชื่อผู้ใช้</label>
          <input
            type="text"
            id="personnel_username"
            name="personnel_username"
            value={formData.personnel_username}
            onChange={handleChange}
            required
            placeholder="ชื่อผู้ใช้"
            autoComplete="off"
          />

          <label htmlFor="personnel_password">รหัสผ่าน</label>
          <input
            type="password"
            id="personnel_password"
            name="personnel_password"
            value={formData.personnel_password}
            onChange={handleChange}
            required
            placeholder="รหัสผ่าน"
            autoComplete="off"
          />

          <button type="submit" disabled={isLoading}>
            {isLoading ? (
              <div className="spinner" />
            ) : null}
            {isLoading ? 'Signing in...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
