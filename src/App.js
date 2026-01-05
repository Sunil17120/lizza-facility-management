import React, { useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import { Container, Row, Col } from 'react-bootstrap';

function App() {
  useEffect(() => {
    AOS.init({
      duration: 1200, // Smoother longer duration
      easing: 'ease-in-out-back', // Bouncy feel
      once: false, // Set to false so it re-animates when scrolling back up
      mirror: true,
    });
  }, []);

  return (
    <div className="App">
      <Header />
      <Hero />
      
      {/* Stats Section with Individual Animation Delays */}
      <section className="bg-red py-5 text-white overflow-hidden">
        <Container>
          <Row className="text-center g-4">
            <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="100">
              <div className="stat-item p-3">
                <h2 className="fw-bold display-5 mb-0">500+</h2>
                <p className="text-uppercase small fw-bold mt-2">Verified Staff</p>
              </div>
            </Col>
            <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="300">
              <div className="stat-item p-3">
                <h2 className="fw-bold display-5 mb-0">150+</h2>
                <p className="text-uppercase small fw-bold mt-2">Active Sites</p>
              </div>
            </Col>
            <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="500">
              <div className="stat-item p-3">
                <h2 className="fw-bold display-5 mb-0">10+</h2>
                <p className="text-uppercase small fw-bold mt-2">Years Experience</p>
              </div>
            </Col>
            <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="700">
              <div className="stat-item p-3">
                <h2 className="fw-bold display-5 mb-0">100%</h2>
                <p className="text-uppercase small fw-bold mt-2">Compliance</p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <div className="section-separator"></div>

      <About />
      
      {/* Services Section with "Slide Up" staggered grid */}
      <Services />

      {/* Footer / CTA with parallax-like entry */}
      <section className="py-5 bg-black text-white text-center position-relative">
        <Container data-aos="zoom-out-up">
          <h2 className="fw-bold mb-4">Ready to Secure Your Facility?</h2>
          <p className="mb-4 opacity-75">Join our 100+ satisfied corporate clients today.</p>
          <button className="btn btn-red btn-lg px-5 fw-bold pulse-infinite">Contact Us Now</button>
        </Container>
      </section>

      <footer className="bg-black text-white py-4 text-center border-top border-secondary">
        <Container>
          <p className="mb-0 small opacity-50">
            &copy; {new Date().getFullYear()} LIZZA FACILITY MANAGEMENT PVT. LTD.
          </p>
        </Container>
      </footer>
    </div>
  );
}

export default App;