import React, { useEffect, useState } from 'react';
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
import ManagerDashboard from './assets/components/ManagerDashboard'; // Added ManagerDashboard import
import Footer from './assets/components/Footer'; 

// Protected Route for Admin - ALWAYS FETCHES FROM DB
const AdminRoute = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(null);
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) {
      setIsAdmin(false);
      return;
    }

    fetch(`/api/user/profile?email=${userEmail}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.user_type && data.user_type.toLowerCase() === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => setIsAdmin(false));
  }, [userEmail]);

  if (isAdmin === null) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Verifying Admin Permissions...</p>
    </div>
  );

  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

// NEW: Protected Route for Manager
const ManagerRoute = ({ children }) => {
  const [isManager, setIsManager] = useState(null);
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) {
      setIsManager(false);
      return;
    }

    fetch(`/api/user/profile?email=${userEmail}`)
      .then(res => res.json())
      .then(data => {
        // Verify user_type status from DB result 
        if (data && data.user_type && data.user_type.toLowerCase() === 'manager') {
          setIsManager(true);
        } else {
          setIsManager(false);
        }
      })
      .catch(() => setIsManager(false));
  }, [userEmail]);

  if (isManager === null) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Verifying Manager Permissions...</p>
    </div>
  );

  return isManager ? children : <Navigate to="/dashboard" replace />;
};

// Protected Route for Users
const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('userName');
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

function App() {
  useEffect(() => {
    AOS.init({ duration: 1200 });
  }, []);

  return (
    <Router>
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
            <Route 
              path="/dashboard" 
              element={
                <PrivateRoute>
                  <UserDashboard />
                </PrivateRoute>
              } 
            />
            {/* NEW: Added /manager route protected by ManagerRoute */}
            <Route 
              path="/manager" 
              element={
                <ManagerRoute>
                  <ManagerDashboard />
                </ManagerRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
}

export default App;