import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { User } from './pages/User';
import { Admin } from './pages/Admin';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: "/ma-app",
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute>
            {/* <Home /> */}
            <User />
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
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        ),
      },
      {
        path: "home",
        element: (
            <Home />
        ),
      },
    ],
  },
]);