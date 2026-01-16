import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleToggle = () => {
    setIsLogin(!isLogin);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isLogin && formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    const endpoint = isLogin ? '/api/login' : '/api/signup';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          password: formData.password
        }),
      });
      
      // FIX: Check for JSON content-type before parsing
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (response.ok) {
          if (isLogin) {
            localStorage.clear();
            localStorage.setItem('userName', data.user);
            localStorage.setItem('userEmail', formData.email); 
            navigate('/dashboard'); 
          } else {
            alert("Registration successful! Please login.");
            setIsLogin(true); 
            setFormData({ ...formData, password: '', confirmPassword: '' });
          }
        } else {
          alert(data.detail || "Authentication failed");
        }
      } else {
        // Handle HTML error pages (Status 500) gracefully
        const errorText = await response.text();
        console.error("Server Error Response:", errorText);
        alert("Server Error: Please check backend logs in Vercel.");
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
                <h2 className="fw-bold text-black">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="text-muted small">Access your LIZZA dashboard</p>
                <div className="bg-danger mx-auto" style={{ width: '40px', height: '3px' }}></div>
              </div>

              <Form onSubmit={handleSubmit}>
                {!isLogin && (
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Full Name</Form.Label>
                    <div className="position-relative">
                      <User className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} style={{zIndex: 10}} />
                      <Form.Control 
                        name="full_name"
                        type="text" 
                        placeholder="Enter your name" 
                        className="ps-5 py-2 border-0 bg-light" 
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </Form.Group>
                )}

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

                <Form.Group className="mb-3">
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

                {!isLogin && (
                  <Form.Group className="mb-4">
                    <Form.Label className="small fw-bold">Confirm Password</Form.Label>
                    <div className="position-relative">
                      <Lock className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} style={{zIndex: 10}} />
                      <Form.Control 
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        className="ps-5 pe-5 py-2 border-0 bg-light" 
                        onChange={handleInputChange}
                        required
                      />
                      <div className="position-absolute top-50 end-0 translate-middle-y me-3 text-muted" onClick={toggleConfirmPasswordVisibility} style={{ cursor: 'pointer', zIndex: 10 }}>
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </div>
                    </div>
                  </Form.Group>
                )}

                <Button type="submit" variant="danger" className="w-100 py-2 fw-bold shadow-sm mb-3">
                  {isLogin ? 'LOG IN' : 'SIGN UP'}
                </Button>

                <div className="text-center">
                  <span className="text-muted small">{isLogin ? "Don't have an account? " : "Already registered? "}</span>
                  <Button variant="link" className="text-danger p-0 small fw-bold text-decoration-none" onClick={handleToggle}>
                    {isLogin ? 'Register Now' : 'Sign In'}
                  </Button>
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