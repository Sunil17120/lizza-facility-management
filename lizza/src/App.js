import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';
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

// Capacitor Native Bridge
import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');



// Scalable Protected Route component
const RoleRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useUser();

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Verifying Permissions...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/auth" replace />;
  
  return allowedRoles.includes(user.user_type.toLowerCase()) ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('userName');
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

function AppContent() {
  const { user } = useUser();

  useEffect(() => {
    AOS.init({ duration: 1200 });

    if (user && user.user_type === 'field_officer') {
      BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Lizza Facility Management is tracking your location to log site visits.",
          backgroundTitle: "Active Field Tracking",
          requestPermissions: true,
          stale: false,
          distanceFilter: 20 
        },
        (location, error) => {
          const email = localStorage.getItem('userEmail');
          if (location && email) {
            fetch('https://lizza-facility-management.vercel.app/api/user/update-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: email,
                lat: location.latitude,
                lon: location.longitude
              })
            });
          }
        }
      ).then((watcher_id) => {
        localStorage.setItem('geo_watcher_id', watcher_id);
      });
    }
  }, [user]);

  return (
    <div className="App d-flex flex-column min-vh-100">
      <Header />
      <div className="flex-grow-1">
        <Routes>
          <Route path="/" element={
            <>
              <Hero />
              <About />
              <Services />
            </>
          } />
          <Route path="/auth" element={<Auth />} />
          
          <Route path="/dashboard" element={
            <PrivateRoute>
              <UserDashboard />
            </PrivateRoute>
          } />
          
          <Route path="/manager" element={
            <RoleRoute allowedRoles={['manager']}>
              <ManagerDashboard />
            </RoleRoute>
          } />

          <Route path="/field-operations" element={
            <RoleRoute allowedRoles={['field_officer']}>
              <FieldOfficerDashboard />
            </RoleRoute>
          } />
          
          <Route path="/admin" element={
            <RoleRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </RoleRoute>
          } />
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