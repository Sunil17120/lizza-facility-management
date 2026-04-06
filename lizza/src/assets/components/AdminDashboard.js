import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Row, Col, Badge, Form, Button, Alert, Modal } from 'react-bootstrap';
import { MapPin, Camera, Navigation, UserPlus, CheckCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm';
import L from 'leaflet';

const FieldOfficerDashboard = () => {
  const [locations, setLocations] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const userEmail = localStorage.getItem('userEmail');

  const updateLocation = useCallback(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLoc({ lat: latitude, lon: longitude });
        const inside = locations.find(s => L.latLng(latitude, longitude).distanceTo([s.lat, s.lon]) <= (s.radius || 200));
        setActiveSite(inside);
        fetch(`/api/user/update-location?email=${userEmail}&lat=${latitude}&lon=${longitude}${inside ? `&current_site_id=${inside.id}` : ''}`, { method: 'POST' });
    });
  }, [locations, userEmail]);

  useEffect(() => {
    fetch('/api/admin/locations').then(res => res.json()).then(setLocations);
    const itv = setInterval(updateLocation, 5000); 
    return () => clearInterval(itv);
  }, [updateLocation]);

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between mb-4 align-items-center">
        <h2 className="fw-bold m-0"><Navigation className="text-primary me-2" />Field Operations</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus className="me-2"/>Onboard New Staff</Button>
      </div>

      <Row>
        <Col lg={8}>
          <Card className="shadow-sm overflow-hidden mb-4" style={{ height: '400px' }}>
            <MapContainer center={[22.5, 88.3]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {myLoc && <Marker position={[myLoc.lat, myLoc.lon]}><Popup>Your GPS</Popup></Marker>}
              {locations.map(s => <Circle key={s.id} center={[s.lat, s.lon]} radius={s.radius} />)}
            </MapContainer>
          </Card>
        </Col>
        <Col lg={4}>
            {activeSite ? (
                <Card className="p-3 border-success border-2 shadow">
                    <h5 className="fw-bold text-success"><CheckCircle size={20}/> Inside: {activeSite.name}</h5>
                    <Form onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.target);
                        fd.append('email', userEmail); fd.append('location_id', activeSite.id);
                        await fetch('/api/field-officer/log-visit', { method: 'POST', body: fd });
                        alert("Photo Logged!");
                    }}>
                        <Form.Select name="purpose" className="mb-2" required><option value="">Select Purpose...</option><option value="Inspection">Inspection</option><option value="Collection">Collection</option></Form.Select>
                        <Form.Control name="remarks" as="textarea" placeholder="Visit Remarks" className="mb-2" />
                        <Form.Control type="file" name="photo" accept="image/*" capture="environment" className="mb-2" required />
                        <Button type="submit" variant="success" className="w-100 fw-bold">UPLOAD PHOTO LOG</Button>
                    </Form>
                </Card>
            ) : <Alert variant="warning">Not inside any site geofence. Move closer to a site to log a visit.</Alert>}
        </Col>
      </Row>

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
          <Modal.Header closeButton><Modal.Title>Onboard Staff Directly from Field</Modal.Title></Modal.Header>
          <Modal.Body><EmployeeOnboardForm locations={locations} onSuccess={() => setShowAddEmp(false)} /></Modal.Body>
      </Modal>
    </Container>
  );
};
export default FieldOfficerDashboard;