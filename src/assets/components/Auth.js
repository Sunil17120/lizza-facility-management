import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Auth = () => {
  // Public signup removed; isLogin is now a constant true
  const isLogin = true;
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Login logic remains consistent with existing system
    const endpoint = '/api/login';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        }),
      });
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (response.ok) {
          localStorage.clear();
          // Store user name and email for the session
          localStorage.setItem('userName', data.user);
          localStorage.setItem('userEmail', formData.email); 
          navigate('/dashboard'); 
        } else {
          alert(data.detail || "Authentication failed");
        }
      } else {
        const errorText = await response.text();
        console.error("Server Error Response:", errorText);
        alert("Server Error: Please check backend logs.");
      }
    } catch (error) {
      console.error("Auth Error:", error);
      alert("Connection error. Please try again later.");
    }
  };

  return (
    <div className="bg-light min-vh-100 d-flex align-items-center py-5">
      <Container>
        <Row className="justify-content-center">
          <Col md={6} lg={5}>
            <Button 
              variant="link" 
              className="text-black mb-3 p-0 d-flex align-items-center text-decoration-none fw-bold hover-red"
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={18} className="me-2" /> Back to Home
            </Button>

            <Card className="border-0 shadow-lg p-4">
              <div className="text-center mb-4">
                <h2 className="fw-bold text-black">Member Login</h2>
                <p className="text-muted small">Access your LIZZA dashboard</p>
                <div className="bg-danger mx-auto" style={{ width: '40px', height: '3px' }}></div>
              </div>

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Email Address</Form.Label>
                  <div className="position-relative">
                    <Mail className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} style={{zIndex: 10}} />
                    <Form.Control 
                      name="email"
                      type="email" 
                      placeholder="name@example.com" 
                      className="ps-5 py-2 border-0 bg-light" 
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="small fw-bold">Password</Form.Label>
                  <div className="position-relative">
                    <Lock className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} style={{zIndex: 10}} />
                    <Form.Control 
                      name="password"
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      className="ps-5 pe-5 py-2 border-0 bg-light" 
                      onChange={handleInputChange}
                      required
                    />
                    <div className="position-absolute top-50 end-0 translate-middle-y me-3 text-muted" onClick={togglePasswordVisibility} style={{ cursor: 'pointer', zIndex: 10 }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </div>
                  </div>
                </Form.Group>

                <Button type="submit" variant="danger" className="w-100 py-2 fw-bold shadow-sm mb-3">
                  LOG IN
                </Button>

                <div className="text-center p-3 bg-light rounded shadow-sm border">
                  <span className="text-muted small d-block mb-1">Public registration is restricted.</span>
                  <span className="text-danger small fw-bold">Please contact your Manager for credentials.</span>
                </div>
              </Form>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Auth;