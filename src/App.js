import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard';
import { Container, Row, Col } from 'react-bootstrap';

// Protected Route Component for General Users
const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('userName');
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

// Protected Route Component for Admin
const AdminRoute = ({ children }) => {
  const userType = localStorage.getItem('userType');
  const isAuthenticated = localStorage.getItem('userName');
  
  // FIX: Added null check and case-insensitive comparison
  const isAdmin = isAuthenticated && userType?.toLowerCase() === 'admin';
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  useEffect(() => {
    AOS.init({ duration: 1200 });
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={
            <>
              <Header />
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
                <Header />
                <UserDashboard />
              </PrivateRoute>
            } 
          />

          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <Header />
                <AdminDashboard />
              </AdminRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;