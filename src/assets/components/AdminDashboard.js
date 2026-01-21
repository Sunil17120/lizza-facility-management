import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, InputGroup, Badge } from 'react-bootstrap';
import { UserCog, Save, Building2, UserPlus, Search, Trash2, Users, UserCheck, UserX, MapPin, Crosshair, Target } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- LEAFLET ICON FIX ---
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ 
    iconUrl: markerIcon, 
    shadowUrl: markerShadow, 
    iconSize: [25, 41], 
    iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- MAP CONTROLLER ---
// Handles zooming and flying to locations programmatically
const MapController = ({ focusTarget }) => {
  const map = useMap();
  useEffect(() => {
    if (focusTarget) {
      // Zoom 16 for branches (to see area), 18 for specific people (close up)
      const zoomLevel = focusTarget.zoom || 16;
      map.flyTo([focusTarget.lat, focusTarget.lon], zoomLevel, {
        animate: true,
        duration: 1.5
      });
    }
  }, [focusTarget, map]);
  return null;
};

const AdminDashboard = () => {
  // --- STATE ---
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [locSearch, setLocSearch] = useState('');
  
  // **FILTER & FOCUS STATE**
  // selectedBranchId: If not null, we only calculate stats for this branch
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [mapFocus, setMapFocus] = useState(null); // { lat, lon, zoom }
  
  // Forms
  const [newLoc, setNewLoc] = useState({ name: '', lat: 22.5726, lon: 88.3639, radius: 200 });
  const [newEmp, setNewEmp] = useState({ name: '', email: '', pass: '', role: 'manager', locId: '' });
  
  const adminEmail = localStorage.getItem('userEmail');
  const adminId = localStorage.getItem('userId') || 1;

  // --- DATA FETCHING ---
  const fetchData = useCallback(async () => {
    try {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`),
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);

      if (empRes.ok && locRes.ok && liveRes.ok) {
          setEmployees(await empRes.json());
          setLocations(await locRes.json());
          setLiveLocations(await liveRes.json());
          setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [adminEmail]); 

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- CALCULATE STATS DYNAMICALLY ---
  // We calculate this on every render based on selectedBranchId
  const filteredEmployees = selectedBranchId 
    ? employees.filter(e => e.location_id === selectedBranchId)
    : employees;

  const stats = {
      total: filteredEmployees.length,
      assigned: filteredEmployees.filter(e => e.location_id).length,
      present: filteredEmployees.filter(e => e.is_present).length,
      absent: filteredEmployees.length - filteredEmployees.filter(e => e.is_present).length
  };

  // --- ACTIONS ---

  // Action 1: Locate Specific Employee
  const handleLocateEmployee = (employee) => {
    // 1. Focus stats on their branch (if they have one)
    if (employee.location_id) setSelectedBranchId(employee.location_id);
    else setSelectedBranchId(null);

    // 2. Find coordinates (Live priority -> then Office)
    const isLive = liveLocations.find(l => l.email === employee.email);
    const branch = locations.find(l => l.id === employee.location_id);

    if (isLive) {
        setMapFocus({ lat: parseFloat(isLive.lat), lon: parseFloat(isLive.lon), zoom: 18 });
    } else if (branch) {
        setMapFocus({ lat: branch.lat, lon: branch.lon, zoom: 18 });
    } else {
        alert("No location data available for this user.");
        return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Action 2: Locate Branch (The new feature)
  const handleBranchLocate = (loc) => {
    // 1. Filter Stats to this branch only
    setSelectedBranchId(loc.id);
    
    // 2. Fly map to branch center
    setMapFocus({ lat: loc.lat, lon: loc.lon, zoom: 16 });
    
    // 3. Scroll up
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Action 3: Reset View
  const handleResetView = () => {
      setSelectedBranchId(null);
      // Optional: Reset map to default center, or just leave it
  };

  // ... (Existing CRUD handlers) ...
  const handleDeleteEmployee = async (email) => {
    if (window.confirm(`Delete ${email}?`)) {
      await fetch(`/api/admin/delete-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleDeleteLocation = async (locId) => {
    if (window.confirm(`Delete branch?`)) {
      await fetch(`/api/admin/delete-location/${locId}?admin_email=${adminEmail}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleUpdateEmployee = async (originalEmail, id) => {
    // Collect data from DOM inputs for simplicity
    const updatedData = {
      full_name: document.getElementById(`name-${id}`).value,
      new_email: document.getElementById(`email-${id}`).value,
      shift_start: document.getElementById(`start-${id}`).value,
      shift_end: document.getElementById(`end-${id}`).value,
      user_type: document.getElementById(`type-${id}`).value,
      location_id: document.getElementById(`loc-${id}`).value,
    };
    await fetch(`/api/admin/update-employee?target_email=${originalEmail}&admin_email=${adminEmail}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedData)
    });
    fetchData();
  };

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    const currentAdminUser = employees.find(emp => emp.email === adminEmail);
    let mgrId = currentAdminUser ? currentAdminUser.id : (parseInt(adminId) || 1);
    const locIdParsed = parseInt(newEmp.locId);

    const payload = {
      full_name: newEmp.name,
      email: newEmp.email,
      password: newEmp.pass,
      manager_id: mgrId, 
      user_type: newEmp.role,
      location_id: isNaN(locIdParsed) ? null : locIdParsed 
    };

    const res = await fetch(`/api/manager/add-employee`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (res.ok) { 
        alert("Employee Added!"); setShowAddEmp(false); fetchData(); 
    } else {
        alert("Failed to add employee.");
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />System Admin</h2>
        <div>
            {selectedBranchId && (
                <Button variant="secondary" className="me-2 shadow-sm" onClick={handleResetView}>
                    Reset Global View
                </Button>
            )}
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/>Onboard Staff</Button>
        </div>
      </div>

      {/* --- DYNAMIC STATS CARDS --- */}
      <Row className="mb-4 g-3">
        <Col md={3} xs={6}>
            <Card className={`border-0 shadow-sm p-3 text-center h-100 ${selectedBranchId ? 'bg-light border border-primary' : ''}`}>
                <div className="text-muted small fw-bold text-uppercase mb-1">
                    {selectedBranchId ? 'Branch Staff' : 'Total Staff'}
                </div>
                <h3 className="fw-bold m-0 text-dark"><Users size={24} className="me-2"/>{stats.total}</h3>
            </Card>
        </Col>
        <Col md={3} xs={6}>
            <Card className="border-0 shadow-sm p-3 text-center h-100">
                <div className="text-muted small fw-bold text-uppercase mb-1">Assigned</div>
                <h3 className="fw-bold m-0 text-primary"><MapPin size={24} className="me-2"/>{stats.assigned}</h3>
            </Card>
        </Col>
        <Col md={3} xs={6}>
            <Card className="border-0 shadow-sm p-3 text-center h-100">
                <div className="text-muted small fw-bold text-uppercase mb-1">Present</div>
                <h3 className="fw-bold m-0 text-success"><UserCheck size={24} className="me-2"/>{stats.present}</h3>
            </Card>
        </Col>
        <Col md={3} xs={6}>
            <Card className="border-0 shadow-sm p-3 text-center h-100">
                <div className="text-muted small fw-bold text-uppercase mb-1">Absent</div>
                <h3 className="fw-bold m-0 text-danger"><UserX size={24} className="me-2"/>{stats.absent}</h3>
            </Card>
        </Col>
      </Row>

      <Row className="mb-5 g-4">
        {/* --- BRANCH LIST (LEFT) --- */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm p-4 h-100">
            <h5 className="fw-bold mb-3 d-flex align-items-center"><Building2 className="text-danger me-2" size={20} /> Office Branches</h5>
            
            <InputGroup className="mb-3" size="sm">
              <InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text>
              <Form.Control placeholder="Find branch..." onChange={(e) => setLocSearch(e.target.value)} />
            </InputGroup>

            {/* Add Branch Form */}
            <Form className="mb-4 bg-light p-3 rounded">
              <Form.Control className="mb-2" placeholder="Name" onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
              <Row>
                <Col><Form.Control className="mb-2" type="number" placeholder="Lat" onChange={e => setNewLoc({...newLoc, lat: parseFloat(e.target.value)})} /></Col>
                <Col><Form.Control className="mb-2" type="number" placeholder="Lon" onChange={e => setNewLoc({...newLoc, lon: parseFloat(e.target.value)})} /></Col>
              </Row>
              <Button variant="outline-danger" className="w-100 btn-sm fw-bold" onClick={() => fetch(`/api/admin/add-location?admin_email=${adminEmail}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newLoc) }).then(() => fetchData())}>ADD BRANCH</Button>
            </Form>
            
            <div className="overflow-auto" style={{maxHeight: '200px'}}>
                {locations.filter(l => l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                    <div key={l.id} className={`d-flex justify-content-between align-items-center border-bottom py-2 small ${selectedBranchId === l.id ? 'bg-primary bg-opacity-10' : ''}`}>
                        
                        {/* 1. Branch Name (Clickable) */}
                        <strong style={{cursor:'pointer'}} onClick={() => handleBranchLocate(l)}>
                            {l.name}
                        </strong>
                        
                        <div className="d-flex gap-2">
                            {/* 2. NEW TARGET BUTTON */}
                            <Button 
                                variant={selectedBranchId === l.id ? "primary" : "outline-primary"} 
                                size="sm" 
                                className="p-1 px-2"
                                title="Visualize Branch & Filter Stats"
                                onClick={() => handleBranchLocate(l)}
                            >
                                <Target size={14}/>
                            </Button>

                            <Button variant="link" className="text-danger p-0" onClick={() => handleDeleteLocation(l.id)}>
                                <Trash2 size={14}/>
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
          </Card>
        </Col>

        {/* --- MAP (RIGHT) --- */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden h-100">
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController focusTarget={mapFocus} />
                
                {/* Geofences (Blue if selected, Red otherwise) */}
                {locations.map(loc => (
                    <Circle 
                        key={`circle-${loc.id}`}
                        center={[loc.lat, loc.lon]}
                        radius={loc.radius}
                        pathOptions={{ 
                            color: selectedBranchId === loc.id ? '#0d6efd' : 'red', 
                            fillColor: selectedBranchId === loc.id ? '#0d6efd' : 'red', 
                            fillOpacity: 0.1 
                        }}
                    >
                        <Popup>
                            <strong>{loc.name}</strong><br/>
                            Total Assigned: {employees.filter(e => e.location_id === loc.id).length}
                        </Popup>
                    </Circle>
                ))}

                {/* Office Markers */}
                {locations.map((loc) => (
                  <Marker key={`office-${loc.id}`} position={[loc.lat, loc.lon]}>
                    <Popup>🏢 {loc.name}</Popup>
                  </Marker>
                ))}

                {/* Live Workers */}
                {liveLocations.map((loc) => (
                  <Marker key={`worker-${loc.email}`} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}>
                    <Popup>
                        <strong>👷 {loc.name}</strong><br/>
                        <Badge bg="success">Live Now</Badge>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* --- EMPLOYEE TABLE --- */}
      <Card className="border-0 shadow-sm p-4">
        <InputGroup style={{ maxWidth: '400px' }} className="mb-3">
          <InputGroup.Text className="bg-white border-end-0"><Search size={18} className="text-muted"/></InputGroup.Text>
          <Form.Control className="border-start-0 ps-0" placeholder="Search staff..." onChange={(e) => setEmpSearch(e.target.value)} />
        </InputGroup>
        
        <Table responsive hover className="align-middle border">
          <thead className="table-light">
            <tr className="small text-uppercase">
              <th>Full Name</th><th>Email</th><th>Branch</th><th>Shift & Role</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.filter(emp => emp.full_name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => (
              <tr 
                key={emp.id} 
                // Dim rows that don't belong to the selected branch
                className={selectedBranchId && emp.location_id !== selectedBranchId ? "opacity-25" : ""}
              >
                <td><Form.Control size="sm" defaultValue={emp.full_name} id={`name-${emp.id}`} className="border-0 fw-bold" /></td>
                <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} className="border-0" /></td>
                <td>
                  <Form.Select size="sm" defaultValue={emp.location_id} id={`loc-${emp.id}`} className="bg-light border-0">
                    <option value="">No Office</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                  <div className="d-flex gap-1 mb-1">
                    <Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} className="text-center p-0" />
                    <Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} className="text-center p-0" />
                  </div>
                  <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} className="p-0 border-0 small text-muted">
                    <option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option>
                  </Form.Select>
                </td>
                <td>
                    {emp.is_present ? <Badge bg="success">Present</Badge> : <Badge bg="secondary">Absent</Badge>}
                </td>
                <td>
                  <div className="d-flex gap-2">
                    {/* NEW CROSSHAIR BUTTON to locate individual employee */}
                    <Button 
                        variant="info" size="sm" className="text-white"
                        title="Locate Employee on Map"
                        onClick={() => handleLocateEmployee(emp)}
                    >
                        <Crosshair size={14}/>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleUpdateEmployee(emp.email, emp.id)}><Save size={14}/></Button>
                    <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmployee(emp.email)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      
      {/* --- ADD USER MODAL --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} centered>
        <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold">Onboard New Staff</Modal.Title></Modal.Header>
        <Modal.Body>
            <Form onSubmit={handleOnboardEmployee}>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Full Name</Form.Label><Form.Control required onChange={e => setNewEmp({...newEmp, name: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Email</Form.Label><Form.Control type="email" required onChange={e => setNewEmp({...newEmp, email: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Password</Form.Label><Form.Control type="password" required onChange={e => setNewEmp({...newEmp, pass: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Role</Form.Label>
                    <Form.Select value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                        <option value="manager">Manager</option><option value="employee">Employee</option><option value="admin">Admin</option>
                    </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Assign Branch</Form.Label>
                    <Form.Select required onChange={e => setNewEmp({...newEmp, locId: e.target.value})}>
                        <option value="">Select Branch...</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Form.Select>
                </Form.Group>
                <Button type="submit" variant="danger" className="w-100 fw-bold">SAVE STAFF</Button>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;