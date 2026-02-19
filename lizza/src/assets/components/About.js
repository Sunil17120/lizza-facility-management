import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import aboutImage from './about.jpg'; 

const About = () => {
  return (
    <section className="py-5" id="about">
      <Container className="py-5">
        <Row className="align-items-center">
          <Col lg={6} data-aos="slide-right">
            <div className="about-img-wrap position-relative">
              <img src={aboutImage} alt="About Lizza" className="img-fluid rounded-3 shadow-lg" />
              <div className="experience-badge bg-red text-white p-4 rounded shadow">
                <h3 className="fw-bold mb-0">10+</h3>
                <p className="small mb-0">Years of Experience</p>
              </div>
            </div>
          </Col>
          <Col lg={6} className="ps-lg-5 mt-5 mt-lg-0" data-aos="fade-left">
            <h6 className="text-red fw-bold text-uppercase">Who We Are</h6>
            <h2 className="fw-bold mb-4 text-black">Your Trusted Partner in Facility Management</h2>
            <p className="text-muted mb-4">
              LIZZA Facility Management Services provides world-class facility solutions 
              tailored to the specific needs of corporate offices and industries.
            </p>
            <div className="d-flex flex-column gap-3">
              <div className="d-flex align-items-center gap-3">
                <div className="check-circle shadow-sm">✔</div>
                <p className="mb-0 fw-bold text-black">Verified & Background-Checked Staff</p>
              </div>
              <div className="d-flex align-items-center gap-3">
                <div className="check-circle shadow-sm">✔</div>
                <p className="mb-0 fw-bold text-black">24/7 Operations Support</p>
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </section>
  );
};

export default About;