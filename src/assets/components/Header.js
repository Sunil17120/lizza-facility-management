import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown } from 'react-bootstrap';
import { Phone, Mail, Clock, UserCheck, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoImg from './logo.png'; 

const Header = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(null);

  // Check login status on load
  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) {
      setUserName(storedName);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userName');
    setUserName(null);
    navigate('/');
  };

  return (
    <header>
      <div className="bg-black text-white py-2 d-none d-md-block">
        <Container className="d-flex justify-content-between align-items-center small">
          <div>
            <span className="me-4"><Phone size={14} className="me-1 text-red"/> +91 9731343937</span>
            <span><Mail size={14} className="me-1 text-red"/> infolizza@lizzafacility.com</span>
          </div>
          <div><Clock size={14} className="me-1 text-red"/> 24/7 Support</div>
        </Container>
      </div>

      <Navbar bg="white" expand="lg" sticky="top" className="shadow-sm py-3">
        <Container>
          <Navbar.Brand href="/" className="d-flex align-items-center">
            <img src={logoImg} height="50" className="me-2" alt="Lizza Logo" />
            <div className="lh-1">
              <span className="fw-bold fs-4 text-black">LIZZA</span><br/>
              <span className="small text-red fw-bold" style={{letterSpacing: '1px'}}>FACILITY MANAGEMENT</span>
            </div>
          </Navbar.Brand>
          
          <Navbar.Toggle aria-controls="main-nav" />
          <Navbar.Collapse id="main-nav">
            <Nav className="ms-auto me-4 fw-semibold custom-nav">
              <Nav.Link href="/">Home</Nav.Link>
              <Nav.Link href="#about">About</Nav.Link>
              <Nav.Link href="#services">Services</Nav.Link>
              <Nav.Link href="#contact">Contact</Nav.Link>
            </Nav>
            
            {userName ? (
              // Welcome Message & Logout for Logged-in Users
              <Dropdown align="end">
                <Dropdown.Toggle variant="light" className="d-flex align-items-center fw-bold text-red border-0">
                  <UserCheck size={18} className="me-2" />
                  Welcome, {userName.split(' ')[0]}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => navigate('/dashboard')}>Dashboard</Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={handleLogout} className="text-danger">
                    <LogOut size={14} className="me-2" /> Logout
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            ) : (
              // Standard Login Button
              <Button 
                className="btn-red px-4 py-2 fw-bold shadow-sm"
                onClick={() => navigate('/auth')}
              >
                LOGIN 
              </Button>
            )}
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;