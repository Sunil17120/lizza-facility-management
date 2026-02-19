import React from 'react';
import { Container, Button, Row, Col } from 'react-bootstrap';

const Hero = () => {
  return (
    <div className="hero-section d-flex align-items-center" id="home">
      <Container>
        <Row>
          <Col lg={8}>
            <div className="hero-content">
              {/* Animation: Fade Down */}
              <h6 className="text-red fw-bold text-uppercase mb-3 reveal-text" 
                  data-aos="fade-down" data-aos-delay="200" style={{ letterSpacing: '2px' }}>
                Welcome to Lizza Facility
              </h6>
              
              {/* Animation: Typed Effect Feel with Fade Right */}
              <h1 className="display-3 fw-bold text-white mb-4" 
                  data-aos="fade-right" data-aos-delay="400">
                Smart & Integrated <br/> 
                <span className="text-red animate-pulse-slow">Facility Solutions</span>
              </h1>
              
              {/* Animation: Fade Up */}
              <p className="lead text-white mb-5 opacity-90" 
                 data-aos="fade-up" data-aos-delay="600" style={{ maxWidth: '600px' }}>
                Delivering high-quality, background-verified staffing and 
                professional facility services to create safe, efficient, 
                and sustainable environments.
              </p>
              
              {/* Animation: Zoom In */}
              <div className="d-flex gap-3" data-aos="zoom-in" data-aos-delay="800">
                <Button className="btn-red btn-lg px-5 fw-bold shadow-lg hover-float">
                  Our Services
                </Button>
                <Button variant="outline-light" className="btn-lg px-5 fw-bold hover-glow">
                  About Us
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Hero;