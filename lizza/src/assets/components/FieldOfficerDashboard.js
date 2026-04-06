import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Badge, Form, Button, Alert, Spinner, Table } from 'react-bootstrap';
import { MapPin, Camera, Navigation, CheckCircle, FileText } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

const FieldOfficerDashboard = () => {
  const [locations, setLocations] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const fileInputRef = useRef(null);
  const userEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      const [locRes, histRes] = await Promise.all([ fetch(`/api/admin/locations`), fetch(`/api/field-officer/my-visits?email=${userEmail}`) ]);
      if (locRes.ok) setLocations(await locRes.json());
      if (histRes.ok) setVisitHistory(await histRes.json());
    } catch (err) { console.error(err); }
  }, [userEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const updateLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLoc({ lat: latitude, lon: longitude });

        let insideSite = null;
        for (let site of locations) {
            if (getDistance(latitude, longitude, site.lat, site.lon) <= (site.radius || 200)) { insideSite = site; break; }
        }
        setActiveSite(insideSite);
        
        const siteParam = insideSite ? `&current_site_id=${insideSite.id}` : '';
        fetch(`/api/user/update-location?email=${userEmail}&lat=${latitude}&lon=${longitude}${siteParam}`, { method: 'POST' });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }, [locations, userEmail]);

  useEffect(() => {
    updateLocation();
    
    // CHANGED TO EVERY 5 SECONDS
    const interval = setInterval(updateLocation, 5000); 
    return () => clearInterval(interval);
  }, [updateLocation]);

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!photo) return alert("Capture a geotagged photo to log the visit.");
    if (!activeSite || !myLoc) return alert("Geofence error: Must be inside site boundary.");

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('email', userEmail); formData.append('location_id', activeSite.id); formData.append('purpose', purpose); formData.append('remarks', remarks); formData.append('lat', myLoc.lat); formData.append('lon', myLoc.lon); formData.append('photo', photo);

    try {
      const res = await fetch('/api/field-officer/log-visit', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
        setPurpose(''); setRemarks(''); setPhoto(null);
        if(fileInputRef.current) fileInputRef.current.value = "";
        fetchData();
      } else setAlertMsg({ type: 'danger', text: data.detail || 'Failed to log visit.' });
    } catch (err) { setAlertMsg({ type: 'danger', text: 'Network error.' }); }
    setIsSubmitting(false);
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4"><h2 className="fw-bold m-0"><Navigation className="text-primary me-2" />Field Operations</h2></div>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '400px' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {locations.map(site => (<Circle key={site.id} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: 'blue', fillOpacity: 0.2 }}><Popup>{site.name}</Popup></Circle>))}
              {myLoc && (<Marker position={[myLoc.lat, myLoc.lon]}><Popup>Your Location</Popup></Marker>)}
            </MapContainer>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <h5 className="fw-bold mb-3 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Current Status</h5>
              {activeSite ? (<Alert variant="success" className="d-flex align-items-center fw-bold"><CheckCircle className="me-2"/> At Site: {activeSite.name}</Alert>) : (<Alert variant="warning">Searching for nearby sites...</Alert>)}

              {activeSite && (
                <Form onSubmit={handleVisitSubmit} className="mt-4 border-top pt-3">
                  <h6 className="fw-bold mb-3"><FileText className="me-2" size={18}/>Log Visit Report</h6>
                  {alertMsg && <Alert variant={alertMsg.type} className="small">{alertMsg.text}</Alert>}
                  <Form.Group className="mb-2">
                    <Form.Select size="sm" value={purpose} onChange={e => setPurpose(e.target.value)} required><option value="">Select Purpose...</option><option value="Inspection">Site Inspection</option><option value="Maintenance">Maintenance</option><option value="Client Meeting">Client Meeting</option><option value="Delivery/Pickup">Delivery/Pickup</option></Form.Select>
                  </Form.Group>
                  <Form.Group className="mb-2"><Form.Control size="sm" as="textarea" rows={2} placeholder="Remarks..." value={remarks} onChange={e => setRemarks(e.target.value)} /></Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold"><Camera size={14} className="me-1"/> Live Photo</Form.Label>
                    <Form.Control type="file" size="sm" accept="image/*" capture="environment" ref={fileInputRef} onChange={e => setPhoto(e.target.files[0])} required />
                  </Form.Group>
                  <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>{isSubmitting ? <Spinner size="sm" /> : "SUBMIT REPORT"}</Button>
                </Form>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mt-4">
        <Card.Header className="bg-white py-3"><h6 className="fw-bold m-0">My Recent Visits</h6></Card.Header>
        <Table responsive hover className="align-middle mb-0 small">
          <thead className="table-light"><tr><th>Date & Time</th><th>Site</th><th>Purpose</th><th>Remarks</th></tr></thead>
          <tbody>
            {visitHistory.length === 0 ? (<tr><td colSpan="4" className="text-center py-4 text-muted">No visits logged.</td></tr>) : (
                visitHistory.map((v, i) => (<tr key={i}><td className="fw-bold">{v.visit_time}</td><td>{v.site_name}</td><td><Badge bg="info">{v.purpose}</Badge></td><td className="text-truncate" style={{maxWidth: '200px'}}>{v.remarks || '-'}</td></tr>))
            )}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
};
export default FieldOfficerDashboard;