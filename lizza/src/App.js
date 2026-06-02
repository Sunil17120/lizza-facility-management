import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { Updater } from '@capgo/capacitor-updater';

// Component Imports
import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import ManagerDashboard from './assets/components/ManagerDashboard'; 
import FieldOfficerDashboard from './assets/components/FieldOfficerDashboard'; 
import Footer from './assets/components/Footer'; 
import { UserProvider, useUser } from './assets/components/UserContext';

const RoleRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useUser();

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Verifying Permissions...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/auth" replace />;
  
  return (user.user_type && allowedRoles.includes(user.user_type.toLowerCase())) ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const { user, loading } = useUser();

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Loading...</p>
    </div>
  );
  
  return user ? children : <Navigate to="/auth" replace />;
};

function AppContent() {
  const [updateStatus, setUpdateStatus] = useState('');

  useEffect(() => {
    AOS.init({ duration: 1200 });

    const checkLiveUpdates = async () => {
      const update = await Updater.check().catch(() => null);
      
      if (update && update.url) {
        setUpdateStatus('Downloading new version...');
        
        const download = await Updater.download({
          version: update.version,
          url: update.url,
        }).catch(() => null);

        if (download) {
          setUpdateStatus('Applying update...');
          await Updater.set({ version: update.version }).catch(() => null);
          await Updater.reload().catch(() => null);
        }
      }
    };

    checkLiveUpdates();
  }, []);

  return (
    <div className="App d-flex flex-column min-vh-100">
      {updateStatus && (
        <div className="alert alert-info text-center m-0 fixed-top" style={{ zIndex: 9999 }}>
          System Update: {updateStatus}
        </div>
      )}
      <Header />
      <div className="flex-grow-1">
        <Routes>
          <Route path="/" element={<><Hero /><About /><Services /></>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<PrivateRoute><UserDashboard /></PrivateRoute>} />
          <Route path="/manager" element={<RoleRoute allowedRoles={['manager']}><ManagerDashboard /></RoleRoute>} />
          <Route path="/field-operations" element={<RoleRoute allowedRoles={['field_officer']}><FieldOfficerDashboard /></RoleRoute>} />
          <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><AdminDashboard /></RoleRoute>} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <Router>
        <AppContent />
      </Router>
    </UserProvider>
  );
}

export default App;