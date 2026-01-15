import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown } from 'react-bootstrap';
import { UserCheck, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: null, type: null });
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName && userEmail) {
      // Fetch latest type from DB
      fetch(`/api/admin/employees?admin_email=${userEmail}`)
        .then(res => res.json())
        .then(data => {
          const currentUser = data.find(emp => emp.email === userEmail);
          setUser({ 
            name: storedName, 
            type: currentUser ? currentUser.user_type.toLowerCase() : 'employee' 
          });
        })
        .catch(() => setUser({ name: storedName, type: 'employee' }));
    }
  }, [userEmail]);

  const handleLogout = () => {
    localStorage.clear();
    setUser({ name: null, type: null });
    navigate('/');
  };

  return (
    <Navbar bg="white" expand="lg" sticky="top" className="shadow-sm py-3">
      <Container>
        <Navbar.Brand onClick={() => navigate('/')} style={{cursor: 'pointer'}}>
          <span className="fw-bold fs-4 text-black">LIZZA</span>
        </Navbar.Brand>
        
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="ms-auto me-4 fw-semibold">
            <Nav.Link onClick={() => navigate('/')}>Home</Nav.Link>
          </Nav>
          
          {user.name ? (
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="fw-bold text-danger border-0">
                <UserCheck size={18} className="me-2" />
                Welcome, {user.name.split(' ')[0]}
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow border-0">
                {user.type === 'admin' && (
                  <Dropdown.Item onClick={() => navigate('/admin')}>
                    <Settings size={14} className="me-2" /> Admin Panel
                  </Dropdown.Item>
                )}
                <Dropdown.Item onClick={() => navigate('/dashboard')}>My Dashboard</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout} className="text-danger">
                  <LogOut size={14} className="me-2" /> Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Button className="btn-danger px-4" onClick={() => navigate('/auth')}>LOGIN</Button>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;