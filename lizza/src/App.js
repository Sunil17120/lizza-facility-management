import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Alert } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import Header from './assets/components/Header';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import HrDashboard from './assets/components/HrDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import ManagerDashboard from './assets/components/ManagerDashboard'; 
import FieldOfficerDashboard from './assets/components/FieldOfficerDashboard'; 
import Footer from './assets/components/Footer'; 
import { UserProvider, useUser } from './assets/components/UserContext';

const RoleRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useUser();
  if (loading) return <div className="text-center py-5">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return (user.user_type && allowedRoles.includes(user.user_type.toLowerCase())) ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const { user, loading } = useUser();
  if (loading) return <div className="text-center py-5">Loading...</div>;
  return user ? children : <Navigate to="/auth" replace />;
};

function AppContent() {
  const { pushMessage, pushMessageType } = useUser();

  useEffect(() => {
    AOS.init({ duration: 1200 });

    const checkLiveUpdates = async () => {
      if (Capacitor.isNativePlatform()) {
        const response = await fetch('https://lizza-facility-management.vercel.app/updates/version.json', { cache: 'no-store' });
        if (response.ok) {
            const latestUpdate = await response.json();
            const appInfo = await CapacitorApp.getInfo();
            const currentVersion = appInfo.version;
            if (latestUpdate.version !== currentVersion) {
              const shouldUpdate = window.confirm(`Update ${latestUpdate.version} is available! Click OK to download the new version.`);
              if (shouldUpdate) {
                await Browser.open({ url: latestUpdate.url });
              }
            }
        }
      }
    };

    checkLiveUpdates();
  }, []);

  return (
    <div className="App d-flex flex-column min-vh-100">
      {pushMessage && (
        <Alert variant={pushMessageType} className="text-center m-0 w-100" style={{ zIndex: 9998 }}>
          {pushMessage}
        </Alert>
      )}
      <Header />
      <div className="flex-grow-1">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<PrivateRoute><UserDashboard /></PrivateRoute>} />
          
          <Route path="/manager" element={<RoleRoute allowedRoles={['manager']}><ManagerDashboard /></RoleRoute>} />
          <Route path="/field-operations" element={<RoleRoute allowedRoles={['field_officer']}><FieldOfficerDashboard /></RoleRoute>} />
          
          <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><AdminDashboard /></RoleRoute>} />
          <Route path="/hr-panel" element={<RoleRoute allowedRoles={['hr']}><HrDashboard /></RoleRoute>} />
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