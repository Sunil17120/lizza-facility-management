import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown, Spinner } from 'react-bootstrap';
import { UserCheck, LogOut, Settings, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoImg from './logo.png'; 

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: null, email: null });
  const [dbRole, setDbRole] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // FIX: Match 'userName' exactly as saved in Auth.js
    const storedName = localStorage.getItem('userName'); 
    const storedEmail = localStorage.getItem('userEmail');
    
    if (storedName && storedEmail) {
      setUser({ name: storedName, email: storedEmail });
      setLoading(true);
      
      fetch(`/api/user/profile?email=${storedEmail}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.user_type) setDbRole(data.user_type.toLowerCase());
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setUser({ name: null, email: null });
    navigate('/');
  };

  return (
    <Navbar bg="white" expand="lg" sticky="top" className="shadow-sm py-3">
      <Container>
        <Navbar.Brand onClick={() => navigate('/')} style={{cursor: 'pointer'}}>
          <img src={logoImg} height="50" alt="Lizza Logo" />
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="ms-auto me-4 fw-semibold custom-nav text-dark">
            <Nav.Link onClick={() => navigate('/')}>Home</Nav.Link>
            
          </Nav>
          {user.name ? (
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="fw-bold text-danger border-0">
                <UserCheck size={18} className="me-2" />
                {loading ? <Spinner size="sm"/> : `Hi, ${user.name.split(' ')[0]}`}
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow border-0">
                {dbRole === 'admin' && (
                  <Dropdown.Item onClick={() => navigate('/admin')}>
                    <Settings size={14} className="me-2" /> Admin Panel
                  </Dropdown.Item>
                )}
                <Dropdown.Item onClick={() => navigate('/dashboard')}>
                  <LayoutDashboard size={14} className="me-2" /> My Dashboard
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout} className="text-danger font-weight-bold">
                  <LogOut size={14} className="me-2" /> Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Button variant="danger" onClick={() => navigate('/auth')}>LOGIN</Button>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;