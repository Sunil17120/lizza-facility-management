// Build trigger IST 2026-04-10
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Badge, Form, Button, Alert, Spinner, Table } from 'react-bootstrap';
import { MapPin, Camera, Navigation, UserPlus, CheckCircle, FileText, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation'; // Added for background tracking
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import L from 'leaflet';

const FieldOfficerDashboard = () => {
  const [locations, setLocations] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  
  // State to hold sites sorted by distance
  const [nearbySites, setNearbySites] = useState([]);
  
  // Form State
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const fileInputRef = useRef(null);
  const userEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      const [locRes, histRes] = await Promise.all([
        fetch(`/api/admin/locations`),
        fetch(`/api/field-officer/my-visits?email=${userEmail}`)
      ]);
      if (locRes.ok) setLocations(await locRes.json());
      if (histRes.ok) setVisitHistory(await histRes.json());
    } catch (err) { console.error("Data fetch error", err); }
  }, [userEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Logic to process location data and update geofence status
  const processNewLocation = useCallback((lat, lon) => {
    setMyLoc({ lat, lon });

    let insideSite = null;
    const sitesWithDistance = locations.map(site => {
        const dist = getDistance(lat, lon, site.lat, site.lon);
        if (dist <= (site.radius || 200)) {
            insideSite = site;
        }
        return { ...site, distance: dist };
    });

    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);
    setActiveSite(insideSite);
    
    // Ping backend
    fetch(`/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });
  }, [locations, userEmail]);

  // NATIVE BACKGROUND TRACKING (Pings every 5 minutes)
  useEffect(() => {
    if (!userEmail) return;

    const startTracking = async () => {
      try {
        await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Lizza is tracking your site visits for attendance.",
            backgroundTitle: "Field Operations Active",
            requestPermissions: true,
            stale: false,
            // 300,000ms = 5 minutes
            interval: 300000, 
            // Ensures a ping even if stationary every 5 mins
            distanceFilter: 0 
          },
          (location, error) => {
            if (error) {
              console.error("Tracking Error:", error);
              return;
            }
            if (location) {
              processNewLocation(location.latitude, location.longitude);
            }
          }
        );
      } catch (err) {
        console.error("Could not start background tracking", err);
      }
    };

    startTracking();

    return () => {
      BackgroundGeolocation.removeWatcher();
    };
  }, [userEmail, processNewLocation]);

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!photo) return alert("You must capture a geotagged photo to log the visit.");
    if (!activeSite || !myLoc) return alert("Geofence error: You must be inside the site boundary.");

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('email', userEmail);
    formData.append('location_id', activeSite.id);
    formData.append('purpose', purpose);
    formData.append('remarks', remarks);
    formData.append('lat', myLoc.lat);
    formData.append('lon', myLoc.lon);
    formData.append('photo', photo);

    try {
      const res = await fetch('/api/field-officer/log-visit', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
        setPurpose(''); setRemarks(''); setPhoto(null);
        if(fileInputRef.current) fileInputRef.current.value = "";
        fetchData();
      } else {
        setAlertMsg({ type: 'danger', text: data.detail || 'Failed to log visit.' });
      }
    } catch (err) {
      setAlertMsg({ type: 'danger', text: 'Network error submitting report.' });
    }
    setIsSubmitting(false);
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Navigation className="text-primary me-2" />Field Operations</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus className="me-2" size={18}/>Onboard Staff</Button>
      </div>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '600px' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {locations.map(site => (
                <Circle key={site.id} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: 'blue', fillOpacity: 0.2 }}>
                  <Popup>{site.name}</Popup>
                </Circle>
              ))}
              {myLoc && (
                <Marker position={[myLoc.lat, myLoc.lon]}>
                  <Popup>Your Live Location</Popup>
                </Marker>
              )}
            </MapContainer>
          </Card>
        </Col>

        <Col lg={4}>
          <div className="d-flex flex-column gap-3 h-100">
            {/* CURRENT STATUS CARD */}
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5 className="fw-bold mb-3 d-flex align-items-center">
                  <MapPin className="me-2 text-danger"/> Current Status
                </h5>
                
                {activeSite ? (
                  <Alert variant="success" className="d-flex align-items-center fw-bold mb-0">
                    <CheckCircle className="me-2"/> At Site: {activeSite.name}
                  </Alert>
                ) : (
                  <Alert variant="warning" className="mb-0">Searching for nearby sites... Drive to a geofence to log a visit.</Alert>
                )}

                {activeSite && (
                  <Form onSubmit={handleVisitSubmit} className="mt-4 border-top pt-3">
                    <h6 className="fw-bold mb-3"><FileText className="me-2" size={18}/>Log Visit Report</h6>
                    {alertMsg && <Alert variant={alertMsg.type} className="small">{alertMsg.text}</Alert>}
                    
                    <Form.Group className="mb-2">
                      <Form.Select size="sm" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                        <option value="">Select Purpose...</option>
                        <option value="Inspection">Site visit</option>
                        <option value="Maintenance">Training</option>
                        <option value="Client Meeting">Client Meeting</option>
                        <option value="Delivery/Pickup">Attendance</option>
                        <option value="Bill Submission">Bill Submission</option>
                      </Form.Select>
                    </Form.Group>

                    <Form.Group className="mb-2">
                      <Form.Control size="sm" as="textarea" rows={2} placeholder="Visit remarks/findings..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold"><Camera size={14} className="me-1"/> Live Photo (Required)</Form.Label>
                      <Form.Control 
                          type="file" 
                          size="sm" 
                          accept="image/*" 
                          capture="environment" 
                          ref={fileInputRef}
                          onChange={e => setPhoto(e.target.files[0])} 
                          required 
                      />
                      <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>
                          *Photo will be geotagged using your current GPS coordinates.
                      </Form.Text>
                    </Form.Group>

                    <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner size="sm" /> : "SUBMIT REPORT"}
                    </Button>
                  </Form>
                )}
              </Card.Body>
            </Card>

            {/* NEARBY SITES DIRECTORY */}
            <Card className="border-0 shadow-sm flex-grow-1 d-flex flex-column">
              <Card.Header className="bg-white py-3 border-bottom-0">
                <h6 className="fw-bold m-0 d-flex align-items-center">
                  <MapIcon className="me-2 text-primary" size={18} /> 
                  Nearby Sites Directory
                </h6>
              </Card.Header>
              <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '250px' }}>
                <Table hover responsive className="mb-0 align-middle">
                  <tbody>
                    {nearbySites.length === 0 ? (
                      <tr><td className="text-center py-4 text-muted small">No sites available or waiting for GPS...</td></tr>
                    ) : (
                      nearbySites.map(site => (
                        <tr key={site.id}>
                          <td className="ps-3 border-0 border-bottom">
                            <div className="fw-bold">{site.name}</div>
                            <div className="text-muted small">
                              {site.distance < 1000 
                                ? `${Math.round(site.distance)} m away` 
                                : `${(site.distance / 1000).toFixed(1)} km away`}
                            </div>
                          </td>
                          <td className="text-end pe-3 border-0 border-bottom">
                            <Button 
                              variant="outline-primary" 
                              size="sm" 
                              className="rounded-pill px-3 fw-bold"
                              style={{fontSize: '0.8rem'}}
                              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lon}`, '_blank')}
                            >
                              Directions
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mt-4">
        <Card.Header className="bg-white py-3"><h6 className="fw-bold m-0">My Recent Visits</h6></Card.Header>
        <Table responsive hover className="align-middle mb-0 small">
          <thead className="table-light">
            <tr><th>Date & Time</th><th>Site</th><th>Purpose</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {visitHistory.length === 0 ? (
                <tr><td colSpan="4" className="text-center py-4 text-muted">No visits logged yet.</td></tr>
            ) : (
                visitHistory.map((v, i) => (
                    <tr key={i}>
                        <td className="fw-bold">{v.visit_time}</td>
                        <td>{v.site_name}</td>
                        <td><Badge bg="info">{v.purpose}</Badge></td>
                        <td className="text-truncate" style={{maxWidth: '200px'}}>{v.remarks || '-'}</td>
                    </tr>
                ))
            )}
          </tbody>
        </Table>
      </Card>

      {showAddEmp && (
          <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" style={{zIndex: 1050, overflowY: 'auto'}}>
              <Container className="py-5">
                  <Card className="border-0 shadow">
                      <Card.Header className="d-flex justify-content-between align-items-center bg-light">
                          <h5 className="fw-bold m-0">Onboard Staff</h5>
                          <Button variant="close" onClick={() => setShowAddEmp(false)}></Button>
                      </Card.Header>
                      <Card.Body>
                          <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => setShowAddEmp(false)} />
                      </Card.Body>
                  </Card>
              </Container>
          </div>
      )}
    </Container>
  );
};

export default FieldOfficerDashboard;