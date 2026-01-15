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
import UserDashboard from './assets/components/UserDashboard'; // <-- IMPORTED NEW COMPONENT
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
  
  if (!isAuthenticated || userType !== 'admin') {
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
          {/* Main Website Route */}
          <Route path="/" element={
            <>
              <Header />
              <Hero />
              {/* Stats Section */}
              <section className="bg-danger py-5 text-white overflow-hidden">
                <Container>
                  <Row className="text-center g-4">
                    <Col md={3} sm={6}>
                      <h2 className="fw-bold display-5 mb-0">500+</h2>
                      <p className="text-uppercase small fw-bold mt-2">Verified Staff</p>
                    </Col>
                    {/* ... other stats ... */}
                  </Row>
                </Container>
              </section>
              <About />
              <Services />
            </>
          } />

          {/* Login/Signup Route */}
          <Route path="/auth" element={<Auth />} />

          {/* USER DASHBOARD ROUTE - This was missing */}
          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <Header />
                <UserDashboard />
              </PrivateRoute>
            } 
          />

          {/* ADMIN CONSOLE ROUTE */}
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