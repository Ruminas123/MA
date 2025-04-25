import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[]; // เปลี่ยนให้รับหลาย role
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated) {
    return <Navigate to="/ma-app/login" state={{ from: location }} replace />;
  }
  if (requiredRole && !requiredRole.includes(user?.role || '')) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
