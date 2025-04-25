import { AuthProvider } from './contexts/AuthContext';
import { Outlet } from 'react-router-dom';
import './css/App.css';

function App() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default App;