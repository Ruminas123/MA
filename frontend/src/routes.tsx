import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { User } from './pages/User';
import { Admin } from './pages/Admin/Admin';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: "/ma-app",
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute requiredRole={['user', 'admin']}>
            <Home />
          </ProtectedRoute>
        ),
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "admin",
        element: (
          <ProtectedRoute requiredRole={['admin']}>
            <Admin />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
