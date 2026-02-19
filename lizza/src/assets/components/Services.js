import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { Shield, Zap, Droplets, HardHat, Trees, Users } from 'lucide-react';

const serviceList = [
  { title: "Security Services", icon: <Shield size={32} />, desc: "Trained security personnel and advanced electronic surveillance systems." },
  { title: "Power Solutions", icon: <Zap size={32} />, desc: "Operation and maintenance of DG sets, UPS, and electrical grids." },
  { title: "Housekeeping", icon: <Droplets size={32} />, desc: "Premium soft services and deep cleaning for corporate environments." },
  { title: "Electro-Mechanical", icon: <HardHat size={32} />, desc: "Expert maintenance of HVAC, plumbing, and fire-fighting systems." },
  { title: "Horticulture", icon: <Trees size={32} />, desc: "Professional garden maintenance and landscaping solutions." },
  { title: "Staffing Solutions", icon: <Users size={32} />, desc: "Providing skilled and unskilled manpower for various operations." }
];

const Services = () => {
  return (
    <section className="py-5 bg-light" id="services">
      <Container className="py-5">
        <div className="text-center mb-5" data-aos="fade-up">
          <h6 className="text-blue fw-bold text-uppercase">Expertise</h6>
          <h2 className="fw-bold display-6">Our Core Services</h2>
          <div className="divider mx-auto bg-blue"></div>
        </div>
        
        <Row className="g-4">
          {serviceList.map((service, index) => (
            <Col lg={4} md={6} key={index} data-aos="zoom-in" data-aos-delay={index * 100}>
              <Card className="h-100 border-0 shadow-sm p-4 text-center service-card">
                <div className="icon-box-wrapper mb-3">
                  {service.icon}
                </div>
                <Card.Title className="fw-bold mb-3">{service.title}</Card.Title>
                <Card.Text className="text-muted small">
                  {service.desc}
                </Card.Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </section>
  );
};

export default Services;