import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Form, Button, Row, Col, Badge, Table, Modal, Spinner, InputGroup } from 'react-bootstrap';
// REMOVED 'RefreshCcw' from imports to fix build error
import { UserPlus, Map as MapIcon, ShieldCheck, Users, Search, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet marker fix
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
  // --- STATE ---
  const [myEmployees, setMyEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveStaff, setLiveStaff] = useState({}); 
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // Form State
  const [newEmp, setNewEmp] = useState({ name: '', email: '', pass: '', role: 'employee', locId: '' });

  const managerId = localStorage.getItem('userId'); 
  // REMOVED unused 'managerEmail' variable to fix build error

  // --- 1. FETCH DATA (Locations & My Staff) ---
  const fetchData = useCallback(async () => {
    try {
        // Fetch Locations for the dropdown and Map Geofences
        const locRes = await fetch(`/api/admin/locations`); 
        const locData = await locRes.json();
        setLocations(locData);

        // Fetch My Assigned Employees
        const staffRes = await fetch(`/api/manager/my-employees?manager_id=${managerId}`);
        if(staffRes.ok) {
            setMyEmployees(await staffRes.json());
        }
        setLoading(false);
    } catch (err) {
        console.error("Error fetching data:", err);
        setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- 2. WEBSOCKET FOR LIVE TRACKING ---
  useEffect(() => {
    if (!managerId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/tracking/${managerId}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update the liveStaff map with latest coordinates
      setLiveStaff(prev => ({
        ...prev,
        [data.email]: { ...data, time: new Date().toLocaleTimeString() }
      }));
    };
    return () => socket.close();
  }, [managerId]);

  // --- 3. HANDLE ONBOARDING ---
  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    
    // Validate Location
    if (!newEmp.locId) {
        alert("Please assign a branch/site to the employee.");
        return;
    }

    const payload = {
        full_name: newEmp.name, 
        email: newEmp.email, 
        password: newEmp.pass, 
        manager_id: parseInt(managerId),
        user_type: 'employee',
        location_id: parseInt(newEmp.locId),
        shift_start: "09:00", 
        shift_end: "18:00"
    };

    const res = await fetch('/api/manager/add-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        const data = await res.json();
        alert(`Staff Onboarded Successfully!\nID: ${data.blockchain_id}`);
        setShowAddEmp(false);
        fetchData(); // Refresh list
    } else {
        alert("Failed to onboard. Email might exist.");
    }
  };

  // Helper: Find geofence info for a user
  const getBranchInfo = (locId) => locations.find(l => l.id === locId);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Users className="me-2 text-danger" />Manager Panel</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}>
            <UserPlus size={18} className="me-2"/>Onboard Staff
        </Button>
      </div>
      
      <Row className="g-4">
        {/* --- MAP SECTION --- */}
        <Col lg={12}>
          <Card className="border-0 shadow-sm overflow-hidden">
            <Card.Header className="bg-white fw-bold d-flex align-items-center justify-content-between">
              <span><MapIcon className="text-danger me-2" size={20} /> Live Site Monitor</span>
              <Badge bg="danger">Live</Badge>
            </Card.Header>
            <div style={{ height: '450px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={11} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                
                {/* 1. DRAW GEOFENCES (Circles) */}
                {locations.map(loc => (
                    <Circle 
                        key={`fence-${loc.id}`}
                        center={[loc.lat, loc.lon]}
                        radius={loc.radius}
                        pathOptions={{ color: 'red', fillColor: '#f8d7da', fillOpacity: 0.2 }}
                    >
                        <Popup>
                            <strong>Site: {loc.name}</strong><br/>
                            Radius: {loc.radius}m
                        </Popup>
                    </Circle>
                ))}

                {/* 2. DRAW LIVE EMPLOYEES */}
                {Object.entries(liveStaff).map(([email, data]) => (
                  <Marker key={email} position={[data.lat, data.lon]}>
                    <Popup>
                      <div className="text-center">
                        <strong>{data.name}</strong><br/>
                        <Badge bg={data.present ? "success" : "warning"}>
                          {data.present ? "Inside Zone" : "Outside"}
                        </Badge>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>

        {/* --- TEAM LIST SECTION --- */}
        <Col md={12}>
          <Card className="border-0 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold m-0 d-flex align-items-center">
                    <ShieldCheck className="text-success me-2" size={20} /> Team Attendance
                </h5>
                <InputGroup style={{ maxWidth: '250px' }} size="sm">
                    <InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text>
                    <Form.Control placeholder="Search..." onChange={(e) => setEmpSearch(e.target.value)} />
                </InputGroup>
            </div>
            
            <Table responsive hover className="align-middle">
              <thead className="table-light">
                <tr>
                  <th>Employee Name</th>
                  <th>Assigned Site</th>
                  <th>Shift</th>
                  <th>Live Status</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {myEmployees.length === 0 ? (
                    <tr><td colSpan="5" className="text-center">No employees assigned yet.</td></tr>
                ) : (
                    myEmployees.filter(e => e.full_name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => {
                        // Check if we have live data for this person
                        const liveData = liveStaff[emp.email]; 
                        const branch = getBranchInfo(emp.location_id);

                        return (
                            <tr key={emp.id}>
                                <td className="fw-bold">{emp.full_name}</td>
                                <td>
                                    {branch ? (
                                        <Badge bg="light" text="dark" className="border">
                                            <MapPin size={10} className="me-1"/>{branch.name}
                                        </Badge>
                                    ) : <span className="text-muted small">Unassigned</span>}
                                </td>
                                <td className="small">{emp.shift_start} - {emp.shift_end}</td>
                                <td>
                                    {liveData ? (
                                        <Badge bg={liveData.present ? "success" : "danger"}>
                                            {liveData.present ? "Inside Geofence" : "Outside Perimeter"}
                                        </Badge>
                                    ) : (
                                        <Badge bg="secondary">Offline</Badge>
                                    )}
                                </td>
                                <td>
                                    {/* Logic: If DB says present OR live data says present */}
                                    {emp.is_present || (liveData && liveData.present) ? 
                                        <span className="text-success fw-bold">Present</span> : 
                                        <span className="text-danger">Absent</span>
                                    }
                                </td>
                            </tr>
                        );
                    })
                )}
              </tbody>
            </Table>
          </Card>
        </Col>
      </Row>

      {/* --- ADD STAFF MODAL (Admin Style) --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} centered>
        <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold">Onboard New Staff</Modal.Title></Modal.Header>
        <Modal.Body>
            <Form onSubmit={handleOnboardEmployee}>
                <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Full Name</Form.Label>
                    <Form.Control required onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                </Form.Group>
                <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Email</Form.Label>
                    <Form.Control type="email" required onChange={e => setNewEmp({...newEmp, email: e.target.value})} />
                </Form.Group>
                <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Password</Form.Label>
                    <Form.Control type="password" required onChange={e => setNewEmp({...newEmp, pass: e.target.value})} />
                </Form.Group>
                
                <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Assign Site/Branch</Form.Label>
                    <Form.Select required onChange={e => setNewEmp({...newEmp, locId: e.target.value})}>
                        <option value="">Select Location...</option>
                        {locations.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Button type="submit" variant="danger" className="w-100 fw-bold">
                    <ShieldCheck size={18} className="me-2" /> CREATE & ASSIGN
                </Button>
            </Form>
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default ManagerDashboard;