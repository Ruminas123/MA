import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import '../css/Login.css';

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
      const response = await api.post('/api/auth/login', formData, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && response.data.token) {
        const user = response.data.user;
        login(response.data.token, user);
        if (user.role === 'admin' || user.role === 'user') {
          navigate('/ma-app/', { replace: true });
        } else {
          const from = location.state?.from?.pathname || '/';
          navigate(from, { replace: true });
        }
      } else {
        setError('Invalid response from server');
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        const msg = err.response?.data?.message?.toLowerCase() || '';
        if (msg.includes('invalid')) {
          setError('กรุณากรอกชื่อผู้ใช้หรือรหัสผ่านให้ถูกต้อง');
        } else {
          setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        }
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">LOGIN</h2>
        <p className="login-title" style={{ color: 'red' }}>
          user: user , pass: abc@1234
        </p>
        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="personnel_username">USERNAME</label>
          <input
            type="text"
            id="personnel_username"
            name="personnel_username"
            value={formData.personnel_username}
            onChange={handleChange}
            required
            placeholder="username"
            autoComplete="off"
          />

          <label htmlFor="personnel_password">PASSWORD</label>
          <input
            type="password"
            id="personnel_password"
            name="personnel_password"
            value={formData.personnel_password}
            onChange={handleChange}
            required
            placeholder="password"
            autoComplete="off"
          />

          <button type="submit" disabled={isLoading}>
            {isLoading ? <div className="spinner" /> : null}
            {isLoading ? 'Signing in...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
