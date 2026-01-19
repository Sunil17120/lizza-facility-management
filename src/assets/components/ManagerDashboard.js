import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Row, Col, Badge } from 'react-bootstrap';
import { UserPlus, Map as MapIcon, ShieldCheck } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet marker configuration
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ 
    iconUrl: markerIcon, 
    shadowUrl: markerShadow, 
    iconSize: [25, 41], 
    iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

const ManagerDashboard = () => {
  const [formData, setFormData] = useState({ name: '', email: '', pass: '', start: '09:00', end: '18:00' });
  const [liveStaff, setLiveStaff] = useState({}); // Stores live locations by employee name
  const managerId = localStorage.getItem('userId'); 

  // --- LIVE TRACKING LOGIC (WebSocket) ---
  useEffect(() => {
    if (!managerId) return;

    // Establish WebSocket connection to the manager's specific channel
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/tracking/${managerId}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update state with new location for the specific employee
      setLiveStaff(prev => ({
        ...prev,
        [data.name]: { lat: data.lat, lon: data.lon, present: data.present }
      }));
    };

    return () => socket.close();
  }, [managerId]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/manager/add-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            full_name: formData.name, 
            email: formData.email, 
            password: formData.pass, 
            manager_id: parseInt(managerId),
            shift_start: formData.start, 
            shift_end: formData.end
        })
    });
    if(res.ok) {
      const data = await res.json();
      alert(`Staff Onboarded! Blockchain ID: ${data.blockchain_id}`);
    }
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4">Manager Control Panel</h2>
      
      <Row>
        {/* Onboarding Section */}
        <Col lg={4}>
          <Card className="p-4 border-0 shadow-sm mb-4">
            <h5 className="fw-bold mb-3"><UserPlus className="text-danger me-2"/> Onboard Staff</h5>
            <Form onSubmit={handleAddStaff}>
              <Form.Group className="mb-2">
                <Form.Control placeholder="Full Name" onChange={e => setFormData({...formData, name: e.target.value})} required />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Control type="email" placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Control type="password" placeholder="Password" onChange={e => setFormData({...formData, pass: e.target.value})} required />
              </Form.Group>
              <Button type="submit" variant="danger" className="fw-bold w-100">MINT EMPLOYEE ID</Button>
            </Form>
          </Card>
        </Col>

        {/* Live Tracking Section */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm mb-4 overflow-hidden">
            <Card.Header className="bg-white fw-bold d-flex align-items-center gap-2">
              <MapIcon className="text-danger" size={20} /> Team Live Tracking
            </Card.Header>
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={13} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {Object.entries(liveStaff).map(([name, pos]) => (
                  <Marker key={name} position={[pos.lat, pos.lon]}>
                    <Popup>
                      <div className="text-center">
                        <strong>{name}</strong><br/>
                        <Badge bg={pos.present ? "success" : "danger"}>
                          {pos.present ? "Inside Fence" : "Outside Fence"}
                        </Badge>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ManagerDashboard;