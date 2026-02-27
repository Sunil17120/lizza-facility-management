import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Form, Button, Row, Col, Badge, Table, Modal, Spinner, InputGroup, Tabs, Tab, Alert } from 'react-bootstrap';
import { UserPlus, Map as MapIcon, ShieldCheck, Users, Search, MapPin, User as UserIcon, Briefcase, FileText, Clock, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const ManagerDashboard = () => {
  const [myEmployees, setMyEmployees] = useState([]);
  const [locations, setLocations] = useState([]); 
  const [liveStaff, setLiveStaff] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, prevCompany: '', prevRole: '',
    aadhar: '', pan: '', role: 'employee', locId: ''
  });
  
  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null, filledForm: null });

  const managerId = localStorage.getItem('userId'); 

  // --- 1. Fetch Manager-Specific Data & Locations ---
  const fetchDashboardData = useCallback(async () => {
    if (!managerId) {
        setLoading(false);
        return;
    }
    
    setFetchError(null);
    try {
        const cleanId = parseInt(managerId, 10);
        if (isNaN(cleanId)) {
            setFetchError("Invalid Manager ID session.");
            setLoading(false);
            return;
        }
        
        // Execute all fetches in parallel
        const [staffRes, liveRes, locRes] = await Promise.all([
            fetch(`/api/manager/my-employees?manager_id=${cleanId}&t=${Date.now()}`),
            fetch(`/api/manager/live-tracking?manager_id=${cleanId}&t=${Date.now()}`),
            fetch(`/api/admin/locations?_t=${Date.now()}`)
        ]);

        if (staffRes.ok) {
            const staffData = await staffRes.json();
            setMyEmployees(Array.isArray(staffData) ? staffData : []);
        }

        if (locRes.ok) {
            const locData = await locRes.json();
            setLocations(Array.isArray(locData) ? locData : []);
        }

        if (liveRes.ok) {
            const liveData = await liveRes.json();
            const liveMap = {};
            if (Array.isArray(liveData)) {
                liveData.forEach(loc => { 
                    liveMap[loc.email] = { ...loc, time: new Date().toLocaleTimeString() }; 
                });
            }
            setLiveStaff(liveMap);
        }
    } catch (err) { 
        console.error("Dashboard Fetch Error:", err);
        setFetchError("Connection error. Please check if your backend is running.");
    } finally {
        setLoading(false); 
    }
  }, [managerId]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    if (!managerId) return alert("System Error: No Session.");
    
    const submitData = new FormData();
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('personal_email', formData.personalEmail);
    submitData.append('phone_number', formData.phone);
    submitData.append('dob', formData.dob);
    submitData.append('designation', formData.designation);
    submitData.append('manager_id', parseInt(managerId, 10));
    submitData.append('location_id', formData.locId);
    
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    try {
        const res = await fetch('/api/manager/add-employee', { method: 'POST', body: submitData });
        const data = await res.json();
        if(res.ok) {
            alert(`Success! Employee onboarding initiated.`); 
            setShowAddEmp(false);
            fetchDashboardData(); 
        } else { alert(data.detail || "Error adding employee"); }
    } catch (error) { alert("Network Error."); }
  };

  if (loading) return (
    <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light">
        <Spinner animation="grow" variant="danger" />
        <h5 className="mt-3 fw-bold text-muted">Loading Team Dashboard...</h5>
    </div>
  );

  if (!managerId) return (
    <Container className="py-5">
        <Alert variant="danger" className="text-center shadow">
            <AlertTriangle size={48} className="mb-3" />
            <h3>Session Missing</h3>
            <p>We couldn't identify your Manager ID. Please log out and log back in.</p>
            <Button variant="danger" onClick={() => window.location.href='/auth'}>Return to Login</Button>
        </Alert>
    </Container>
  );

  return (
    <Container className="py-5 text-dark">
      {fetchError && <Alert variant="warning" className="small py-2 mb-4">{fetchError}</Alert>}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Users className="me-2 text-danger" />Manager Panel</h2>
        <Button variant="danger" className="fw-bold shadow-sm" onClick={() => setShowAddEmp(true)}>
            <UserPlus size={18} className="me-2"/> Onboard Staff
        </Button>
      </div>
      
      <Row className="g-4">
        {/* MAP SECTION */}
        <Col lg={12}>
          <Card className="border-0 shadow-sm overflow-hidden">
            <Card.Header className="bg-white fw-bold d-flex align-items-center justify-content-between py-3">
              <span><MapIcon className="text-danger me-2" size={20} /> Team Site Monitor</span>
              <Badge bg="danger" className="px-3">Live Status</Badge>
            </Card.Header>
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {/* BRANCH RADII */}
                {locations?.map(loc => (
                    <Circle key={loc.id} center={[loc.lat, loc.lon]} radius={loc.radius || 200} pathOptions={{ color: 'red', fillColor: '#f8d7da', fillOpacity: 0.2 }}>
                        <Popup><strong>{loc.name}</strong></Popup>
                    </Circle>
                ))}
                {/* STAFF MARKERS */}
                {liveStaff && Object.entries(liveStaff).map(([email, data]) => (
                    data.lat && data.lon && (
                      <Marker key={email} position={[data.lat, data.lon]}>
                          <Popup className="text-center">
                              <strong className="d-block mb-1">{data.name}</strong>
                              <Badge bg={data.present ? "success" : "warning"}>{data.present ? "Inside Zone" : "Outside"}</Badge>
                          </Popup>
                      </Marker>
                    )
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>

        {/* ATTENDANCE TABLE */}
        <Col md={12}>
          <Card className="border-0 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold m-0"><ShieldCheck className="text-success me-2" /> Team Attendance</h5>
                <InputGroup style={{ maxWidth: '280px' }} size="sm">
                    <InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text>
                    <Form.Control placeholder="Search by name..." onChange={(e) => setEmpSearch(e.target.value)} />
                </InputGroup>
            </div>
            
            <Table responsive hover className="align-middle mb-0">
              <thead className="table-light">
                <tr className="small text-uppercase">
                    <th>Employee Info</th><th>Verification</th><th>Site</th><th>Geofence</th><th>Duty</th>
                </tr>
              </thead>
              <tbody>
                {myEmployees.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-4 text-muted">No employees assigned to your team yet.</td></tr>
                ) : (
                    myEmployees
                    .filter(e => e.full_name?.toLowerCase().includes(empSearch.toLowerCase()))
                    .map(emp => (
                        <tr key={emp.id}>
                            <td className="fw-bold">
                                {emp.full_name} <br/>
                                <span className="text-muted extra-small font-monospace">{emp.blockchain_id || "ID PENDING"}</span>
                            </td>
                            <td>
                                <Badge bg={emp.is_verified ? "success" : "light"} text={emp.is_verified ? "white" : "dark"} className="border">
                                    {emp.is_verified ? "Verified" : "Pending"}
                                </Badge>
                            </td>
                            <td>
                                <small className="fw-bold">
                                  {locations?.find(l => l.id === emp.location_id)?.name || 'Unassigned'}
                                </small>
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

      {/* ONBOARDING MODAL */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title className="fw-bold">Team Onboarding</Modal.Title></Modal.Header>
        <Modal.Body>
            <Form onSubmit={handleOnboardEmployee}>
                <Row>
                    <Col md={6} className="mb-3"><Form.Label>First Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label>Last Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                    <Col md={12} className="mb-3"><Form.Label>Branch</Form.Label>
                      <Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}>
                        <option value="">Select Branch...</option>
                        {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </Form.Select>
                    </Col>
                    <Col md={12} className="mb-3"><Form.Label>Onboarding Form (PDF)</Form.Label><Form.Control type="file" accept=".pdf" required onChange={(e) => setFiles({...files, filledForm: e.target.files[0]})} /></Col>
                </Row>
                <div className="d-flex justify-content-end gap-2 pt-3">
                    <Button variant="light" onClick={() => setShowAddEmp(false)}>Cancel</Button>
                    <Button type="submit" variant="danger">Submit</Button>
                </div>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default ManagerDashboard;