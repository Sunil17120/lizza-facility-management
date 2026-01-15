import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, User } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const handleToggle = () => setIsLogin(!isLogin);

  return (
    <div className="bg-light min-vh-100 d-flex align-items-center py-5">
      <Container>
        <Row className="justify-content-center">
          <Col md={6} lg={5} data-aos="fade-up">
            {/* Back to Home Navigation */}
            <Button 
              variant="link" 
              className="text-black mb-3 p-0 d-flex align-items-center text-decoration-none fw-bold hover-red"
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={18} className="me-2" /> Back to Home
            </Button>

            <Card className="border-0 shadow-lg p-4">
              <div className="text-center mb-4">
                <h2 className="fw-bold text-black">
                  {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-muted small">
                  {isLogin ? 'Access your LIZZA dashboard' : 'Join LIZZA Facility Management'}
                </p>
                <div className="bg-red mx-auto" style={{ width: '40px', height: '3px' }}></div>
              </div>

              <Form>
                {!isLogin && (
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Full Name</Form.Label>
                    <div className="position-relative">
                      <User className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} />
                      <Form.Control 
                        type="text" 
                        placeholder="Enter your name" 
                        className="ps-5 py-2 border-0 bg-light" 
                        style={{ borderRadius: '8px' }}
                      />
                    </div>
                  </Form.Group>
                )}

                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Email Address</Form.Label>
                  <div className="position-relative">
                    <Mail className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} />
                    <Form.Control 
                      type="email" 
                      placeholder="name@example.com" 
                      className="ps-5 py-2 border-0 bg-light" 
                      style={{ borderRadius: '8px' }}
                    />
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="small fw-bold">Password</Form.Label>
                  <div className="position-relative">
                    <Lock className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={18} />
                    <Form.Control 
                      type="password" 
                      placeholder="••••••••" 
                      className="ps-5 py-2 border-0 bg-light" 
                      style={{ borderRadius: '8px' }}
                    />
                  </div>
                </Form.Group>

                <Button className="btn-red w-100 py-2 fw-bold shadow-sm mb-3">
                  {isLogin ? 'LOG IN' : 'SIGN UP'}
                </Button>

                <div className="text-center">
                  <span className="text-muted small">
                    {isLogin ? "Don't have an account? " : "Already registered? "}
                  </span>
                  <Button 
                    variant="link" 
                    className="text-red p-0 small fw-bold text-decoration-none"
                    onClick={handleToggle}
                  >
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