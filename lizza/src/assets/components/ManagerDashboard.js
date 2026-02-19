import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Form, Button, Row, Col, Badge, Table, Modal, Spinner, InputGroup, Tabs, Tab, Alert } from 'react-bootstrap';
import { UserPlus, Map as MapIcon, ShieldCheck, Users, Search, MapPin, User as UserIcon, Briefcase, FileText } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const ManagerDashboard = () => {
  const [myEmployees, setMyEmployees] = useState([]);
  const [locations, setLocations] = useState([]); 
  const [liveStaff, setLiveStaff] = useState({}); 
  const [loading, setLoading] = useState(true);
  
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', dob: '', fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, prevCompany: '', prevRole: '',
    aadhar: '', pan: '', role: 'employee', locId: ''
  });
  
  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null });

  const managerId = localStorage.getItem('userId'); 

  useEffect(() => {
    const fetchGlobalData = async () => {
        try {
            const locRes = await fetch(`/api/admin/locations?_t=${Date.now()}`);
            if (locRes.ok) setLocations(await locRes.json());
        } catch (err) { console.error("Error loading locations:", err); }
    };
    fetchGlobalData();
  }, []);

  const fetchEmployees = useCallback(async () => {
    if (!managerId) { setLoading(false); return; }
    try {
        const cleanId = parseInt(managerId, 10);
        if (isNaN(cleanId)) return;
        const staffRes = await fetch(`/api/manager/my-employees?manager_id=${cleanId}`);
        if(staffRes.ok) setMyEmployees(await staffRes.json());
        setLoading(false);
    } catch (err) { setLoading(false); }
  }, [managerId]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    if (!managerId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/tracking/${managerId}`);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLiveStaff(prev => ({ ...prev, [data.email]: { ...data, time: new Date().toLocaleTimeString() } }));
    };
    return () => socket.close();
  }, [managerId]);

  const handleFileChange = (e, type) => {
    setFiles({ ...files, [type]: e.target.files[0] });
  };

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    if (!managerId) return alert("System Error: You are not logged in.");
    const locationId = parseInt(formData.locId, 10);
    if (!locationId) return alert("Please select a valid branch from the list.");

    const submitData = new FormData();
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('personal_email', formData.personalEmail);
    submitData.append('dob', formData.dob);
    submitData.append('father_name', formData.fatherName);
    submitData.append('mother_name', formData.motherName);
    submitData.append('blood_group', formData.bloodGroup);
    submitData.append('emergency_contact', formData.emergencyContact);
    submitData.append('designation', formData.designation);
    submitData.append('department', formData.department);
    submitData.append('experience_years', formData.experience || 0);
    submitData.append('prev_company', formData.prevCompany);
    submitData.append('prev_role', formData.prevRole);
    submitData.append('aadhar_number', formData.aadhar);
    submitData.append('pan_number', formData.pan);
    submitData.append('manager_id', parseInt(managerId, 10));
    submitData.append('user_type', formData.role);
    submitData.append('location_id', locationId);
    
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadhar) submitData.append('aadhar_photo', files.aadhar);
    if (files.pan) submitData.append('pan_photo', files.pan);

    try {
        const res = await fetch('/api/manager/add-employee', { method: 'POST', body: submitData });
        const data = await res.json();
        if(res.ok) {
            alert(`Success! Employee ID: ${data.blockchain_id}\nOfficial Email: ${data.official_email}`);
            setShowAddEmp(false);
            fetchEmployees(); 
        } else { alert(`Error: ${data.detail || "Failed to add employee"}`); }
    } catch (error) { alert("Network Error: Check internet connection."); }
  };

  const getBranchInfo = (locId) => locations.find(l => l.id === locId);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Users className="me-2 text-danger" />Manager Panel</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/>Onboard Staff</Button>
      </div>
      
      <Row className="g-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm overflow-hidden">
            <Card.Header className="bg-white fw-bold d-flex align-items-center justify-content-between">
              <span><MapIcon className="text-danger me-2" size={20} /> Live Site Monitor</span><Badge bg="danger">Live</Badge>
            </Card.Header>
            <div style={{ height: '450px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {locations.map(loc => (<Circle key={`fence-${loc.id}`} center={[loc.lat, loc.lon]} radius={loc.radius} pathOptions={{ color: 'red', fillColor: '#f8d7da', fillOpacity: 0.2 }}><Popup><strong>Site: {loc.name}</strong><br/>Radius: {loc.radius}m</Popup></Circle>))}
                {Object.entries(liveStaff).map(([email, data]) => (<Marker key={email} position={[data.lat, data.lon]}><Popup><div className="text-center"><strong>{data.name}</strong><br/><Badge bg={data.present ? "success" : "warning"}>{data.present ? "Inside Zone" : "Outside"}</Badge></div></Popup></Marker>))}
              </MapContainer>
            </div>
          </Card>
        </Col>

        <Col md={12}>
          <Card className="border-0 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold m-0 d-flex align-items-center"><ShieldCheck className="text-success me-2" size={20} /> Team Attendance</h5>
                <InputGroup style={{ maxWidth: '250px' }} size="sm"><InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text><Form.Control placeholder="Search..." onChange={(e) => setEmpSearch(e.target.value)} /></InputGroup>
            </div>
            
            <Table responsive hover className="align-middle">
              <thead className="table-light"><tr><th>Employee Name</th><th>Assigned Site</th><th>Shift</th><th>Live Status</th><th>Attendance</th></tr></thead>
              <tbody>
                {myEmployees.length === 0 ? (<tr><td colSpan="5" className="text-center">No employees assigned yet.</td></tr>) : (
                    myEmployees.filter(e => e.full_name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => {
                        const liveData = liveStaff[emp.email]; 
                        const branch = getBranchInfo(emp.location_id);
                        return (
                            <tr key={emp.id}>
                                <td className="fw-bold">{emp.full_name}</td>
                                <td>{branch ? <Badge bg="light" text="dark" className="border"><MapPin size={10} className="me-1"/>{branch.name}</Badge> : <span className="text-muted small">Unassigned</span>}</td>
                                <td className="small">{emp.shift_start} - {emp.shift_end}</td>
                                <td>{liveData ? <Badge bg={liveData.present ? "success" : "danger"}>{liveData.present ? "Inside Geofence" : "Outside Perimeter"}</Badge> : <Badge bg="secondary">Offline</Badge>}</td>
                                <td>{emp.is_present || (liveData && liveData.present) ? <span className="text-success fw-bold">Present</span> : <span className="text-danger">Absent</span>}</td>
                            </tr>
                        );
                    })
                )}
              </tbody>
            </Table>
          </Card>
        </Col>
      </Row>

      {/* --- ADD STAFF MODAL --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
        <Modal.Header closeButton className="border-0 bg-light"><Modal.Title className="fw-bold h5">Onboard New Talent</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
            <Form onSubmit={handleOnboardEmployee}>
                <Tabs defaultActiveKey="personal" className="mb-4">
                    <Tab eventKey="personal" title={<><UserIcon size={16} className="me-2"/>Personal</>}>
                        <Row className="mt-3">
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Profile Photo</Form.Label><Form.Control type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} /></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email</Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Date of Birth</Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Select onChange={e => setFormData({...formData, bloodGroup: e.target.value})}><option value="">Select...</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>O+</option><option>O-</option><option>AB+</option><option>AB-</option></Form.Select></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Emergency Contact</Form.Label><Form.Control placeholder="10-digit number" onChange={e => setFormData({...formData, emergencyContact: e.target.value})} /></Col>
                        </Row>
                    </Tab>
                    <Tab eventKey="professional" title={<><Briefcase size={16} className="me-2"/>Professional</>}>
                        <Row className="mt-3">
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation</Form.Label><Form.Control required onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Department</Form.Label><Form.Select onChange={e => setFormData({...formData, department: e.target.value})}><option>IT / Engineering</option><option>HR / Admin</option><option>Operations</option></Form.Select></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Role</Form.Label><Form.Select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}><option value="manager">Manager</option><option value="employee">Employee</option></Form.Select></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Assign Branch</Form.Label><Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select Branch...</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Experience (Yrs)</Form.Label><Form.Control type="number" step="0.1" required onChange={e => setFormData({...formData, experience: e.target.value})} /></Col>
                            
                            {formData.experience > 0 && (
                                <>
                                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Previous Company</Form.Label><Form.Control onChange={e => setFormData({...formData, prevCompany: e.target.value})} /></Col>
                                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Previous Role</Form.Label><Form.Control onChange={e => setFormData({...formData, prevRole: e.target.value})} /></Col>
                                </>
                            )}
                        </Row>
                    </Tab>
                    <Tab eventKey="documents" title={<><FileText size={16} className="me-2"/>Documents</>}>
                        <Alert variant="warning" className="small py-2 mt-3"><ShieldCheck size={14} className="me-2"/>Files and Numbers are securely processed and encrypted.</Alert>
                        <Row>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Aadhaar Number</Form.Label><Form.Control required placeholder="12-digit UID" maxLength="12" onChange={e => setFormData({...formData, aadhar: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">PAN Number</Form.Label><Form.Control required placeholder="10-digit PAN" maxLength="10" style={{textTransform: 'uppercase'}} onChange={e => setFormData({...formData, pan: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Upload Aadhaar (Image/PDF)</Form.Label><Form.Control type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'aadhar')} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Upload PAN (Image/PDF)</Form.Label><Form.Control type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'pan')} /></Col>
                        </Row>
                    </Tab>
                </Tabs>
                <div className="d-flex justify-content-end gap-2 mt-3 border-top pt-3">
                    <Button variant="light" onClick={() => setShowAddEmp(false)}>Cancel</Button>
                    <Button type="submit" variant="danger" className="px-4 fw-bold">Save Record & Send Email</Button>
                </div>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default ManagerDashboard;