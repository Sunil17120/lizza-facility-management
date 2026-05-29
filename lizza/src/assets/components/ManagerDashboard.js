import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, InputGroup } from 'react-bootstrap';
import { Users, ShieldCheck, Search, UserPlus, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const getStatusIcon = (isPresent) => {
  return L.divIcon({
    html: `<div style="
      background-color: ${isPresent ? '#28a745' : '#dc3545'}; 
      width: 16px; 
      height: 16px; 
      border-radius: 50%; 
      border: 2px solid white; 
      box-shadow: 0 0 5px rgba(0,0,0,0.3);
    "></div>`,
    className: 'custom-status-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const ManagerDashboard = () => {
  const [myEmployees, setMyEmployees] = useState([]);
  const [locations, setLocations] = useState([]); 
  const [liveStaff, setLiveStaff] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const managerId = localStorage.getItem('userId'); 

  const fetchData = useCallback(async () => {
    if (!managerId) { 
        setLoading(false); 
        return; 
    }

    try {
        const cleanId = parseInt(managerId, 10);
        const [staffRes, liveRes, locRes] = await Promise.all([
            fetch(`/api/manager/my-employees?manager_id=${cleanId}`),
            fetch(`/api/manager/live-tracking?manager_id=${cleanId}`),
            fetch(`/api/admin/locations`)
        ]);

        if (staffRes.ok) {
            const data = await staffRes.json();
            setMyEmployees(Array.isArray(data) ? data : []);
        }
        
        if (locRes.ok) {
            const data = await locRes.json();
            setLocations(Array.isArray(data) ? data : []);
        }

        if (liveRes.ok) {
            const liveData = await liveRes.json();
            const liveMap = {};
            if (Array.isArray(liveData)) {
                liveData.forEach(loc => { 
                    if (loc.email) liveMap[loc.email] = loc; 
                });
            }
            setLiveStaff(liveMap);
        }
    } catch (err) { 
        console.error("Dashboard failed to load:", err); 
    } finally { 
        setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // VERCEL-SAFE HTTP POLLING (Replaces WebSockets)
  useEffect(() => {
    if (!managerId) return;
    const cleanId = parseInt(managerId, 10);

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/manager/live-tracking?manager_id=${cleanId}`);
            if (res.ok) {
                const liveData = await res.json();
                const liveMap = {};
                if (Array.isArray(liveData)) {
                    liveData.forEach(loc => { 
                        if (loc.email) liveMap[loc.email] = loc; 
                    });
                }
                setLiveStaff(liveMap);
            }
        } catch (e) {
            console.error("Live tracking sync failed", e);
        }
    }, 15000); // 15-second refresh

    return () => clearInterval(interval);
  }, [managerId]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (loading) {
      return (
          <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
              <Spinner animation="grow" variant="danger" />
              <h5 className="ms-3 text-muted fw-bold">Loading Team Data...</h5>
          </div>
      );
  }

  if (!managerId) {
      return (
          <Container className="py-5 text-center">
              <Alert variant="danger" className="shadow-sm">
                  <AlertTriangle size={40} className="mb-3" />
                  <h4>Session Missing</h4>
                  <p>Your Manager ID was not found. Please log out and log back in.</p>
                  <Button variant="danger" onClick={() => window.location.href='/auth'}>Return to Login</Button>
              </Alert>
          </Container>
      );
  }

  return (
    <Container className="py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Users className="me-2 text-danger" />Manager Panel</h2>
        <div className="d-flex gap-2">
            <InputGroup style={{ maxWidth: '250px' }}>
                <InputGroup.Text className="bg-white"><Search size={16}/></InputGroup.Text>
                <Form.Control 
                    placeholder="Search staff..." 
                    onChange={(e) => setEmpSearch(e.target.value)} 
                />
            </InputGroup>
            <Button variant="danger" onClick={() => setShowAddEmp(true)} className="fw-bold">
                <UserPlus size={18} className="me-2"/> Onboard Staff
            </Button>
        </div>
      </div>
      
      <Row className="g-4">
        {/* --- LIVE TRACKING MAP --- */}
        <Col lg={12}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '400px' }}>
            <Card.Header className="bg-dark text-white p-2">
              <h6 className="m-0 fw-bold">Live Team Tracking (Checked-In Only)</h6>
            </Card.Header>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              
              {locations?.map(loc => (loc.lat && loc.lon) && (
                  <Circle 
                    key={loc.id} 
                    center={[loc.lat, loc.lon]} 
                    radius={loc.radius || 200} 
                    pathOptions={{ color: 'red', fillColor: '#f8d7da', fillOpacity: 0.3 }} 
                  />
              ))}

              {/* STRICT FILTER: Only show team members who are present === true */}
              {Object.values(liveStaff)
                .filter(data => data?.lat && data?.lon && data?.present === true)
                .map(data => (
                    <Marker key={data.email} position={[data.lat, data.lon]} icon={getStatusIcon(data.present)}>
                        <Popup className="text-center">
                            <strong>{data.name || "Staff Member"}</strong><br/>
                            <Badge bg="success" className="mt-1">Active / Checked In</Badge>
                        </Popup>
                    </Marker>
                ))
              }
            </MapContainer>
          </Card>
        </Col>

        {/* --- TEAM ATTENDANCE TABLE --- */}
        <Col md={12}>
          <Card className="border-0 shadow-sm p-4">
            <h5 className="fw-bold mb-3"><ShieldCheck className="text-success me-2" /> Team Attendance</h5>
            <Table responsive hover className="align-middle mb-0">
              <thead className="table-light">
                <tr className="small text-uppercase">
                    <th>Employee</th><th>Assigned Site</th><th>Current Status</th><th>Duty</th>
                </tr>
              </thead>
              <tbody>
                {myEmployees.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-4 text-muted">No employees found in your team.</td></tr>
                ) : (
                    myEmployees
                    .filter(e => e.full_name?.toLowerCase().includes(empSearch.toLowerCase()))
                    .map(emp => (
                        <tr key={emp.id}>
                            <td className="fw-bold">{emp.full_name}</td>
                            <td>
                                {locations?.find(l => l.id === emp.location_id)?.name || (
                                    <span className="text-muted italic">Unassigned</span>
                                )}
                            </td>
                            <td>
                                {liveStaff?.[emp.email] ? (
                                    <Badge bg={liveStaff[emp.email].present ? "success" : "danger"}>
                                        {liveStaff[emp.email].present ? "Inside" : "Outside"}
                                    </Badge>
                                ) : <span className="text-muted small">Offline</span>}
                            </td>
                            <td>
                                <span className={emp.is_present ? "text-success fw-bold" : "text-danger"}>
                                    {emp.is_present ? "Present" : "Absent"}
                                </span>
                            </td>
                        </tr>
                    ))
                )}
              </tbody>
            </Table>
          </Card>
        </Col>
      </Row>

      {/* --- ONBOARDING MODAL --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered backdrop="static">
        <Modal.Header closeButton className="bg-light border-0">
            <Modal.Title className="h5 fw-bold">Team Onboarding</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
            <EmployeeOnboardForm 
                locations={locations} 
                onCancel={() => setShowAddEmp(false)} 
                onSuccess={() => { setShowAddEmp(false); fetchData(); }} 
            />
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default ManagerDashboard;