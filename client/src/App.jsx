import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ServerDetail from './pages/ServerDetail';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-text-dim font-['JetBrains_Mono'] text-xs">initializing<span className="animate-pulse">_</span></div>;
  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/servers" element={<PrivateRoute><Layout><Servers /></Layout></PrivateRoute>} />
      <Route path="/servers/:id" element={<PrivateRoute><Layout><ServerDetail /></Layout></PrivateRoute>} />
      <Route path="/projects" element={<PrivateRoute><Layout><Projects /></Layout></PrivateRoute>} />
      <Route path="/projects/:id" element={<PrivateRoute><Layout><ProjectDetail /></Layout></PrivateRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0A0A0A',
              color: '#F1F1F1',
              border: '1px solid #2f2f2f',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00FF88', secondary: '#0A0A0A' } },
            error: { iconTheme: { primary: '#FF4444', secondary: '#0A0A0A' } },
          }}
        />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
