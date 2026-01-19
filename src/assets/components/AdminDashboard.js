import React, { useEffect, useState, useCallback } from 'react';
import { Table, Badge, Form, Container, Card, Spinner, Button, Row, Col, Modal } from 'react-bootstrap';
import { UserCog, Map as MapIcon, Save, Navigation, Settings, Plus, Building2, UserPlus } from 'lucide-react'; 
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

const RecenterMap = ({ locations }) => {
  const map = useMap();
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [parseFloat(loc.lat), parseFloat(loc.lon)]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [locations, map]);
  return null;
};

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  
  // States for forms
  const [newLoc, setNewLoc] = useState({ name: '', lat: 22.5726, lon: 88.3639, radius: 200 });
  const [newEmp, setNewEmp] = useState({ name: '', email: '', pass: '', role: 'employee', locId: '' });
  
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`), // New endpoint for locations
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (liveRes.ok) setLiveLocations(await liveRes.json());
      
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleUpdateEmployee = async (originalEmail, id) => {
    const updatedData = {
      full_name: document.getElementById(`name-${id}`).value,
      new_email: document.getElementById(`email-${id}`).value,
      shift_start: document.getElementById(`start-${id}`).value,
      shift_end: document.getElementById(`end-${id}`).value,
      user_type: document.getElementById(`type-${id}`).value,
      location_id: document.getElementById(`loc-${id}`).value,
    };

    const res = await fetch(`/api/admin/update-employee?target_email=${originalEmail}&admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });

    if (res.ok) { alert("Updated!"); fetchData(); }
  };

  const handleAddLocation = async () => {
    const res = await fetch(`/api/admin/add-location?admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLoc)
    });
    if (res.ok) { alert("Location Added!"); fetchData(); }
  };

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/manager/add-employee`, { // Reusing manager onboarding logic
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newEmp.name,
        email: newEmp.email,
        password: newEmp.pass,
        manager_id: 1, // Default or select from list
        shift_start: "09:00",
        shift_end: "18:00",
        location_id: parseInt(newEmp.locId)
      })
    });
    if (res.ok) { setShowAddEmp(false); fetchData(); }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />System Admin</h2>
        <div className="d-flex gap-2">
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/>Onboard Staff</Button>
            <Badge bg="dark" className="p-2 px-3 d-flex align-items-center">Admin Mode</Badge>
        </div>
      </div>

      <Row className="mb-5 g-4">
        {/* Branch / Location Management */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm p-4 h-100">
            <h5 className="fw-bold mb-3 d-flex align-items-center">
              <Building2 className="text-danger me-2" size={20} /> Office Branches
            </h5>
            <Form className="mb-4 bg-light p-3 rounded">
              <Form.Control className="mb-2" placeholder="Branch Name" onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
              <Row>
                <Col><Form.Control className="mb-2" type="number" step="any" placeholder="Lat" onChange={e => setNewLoc({...newLoc, lat: parseFloat(e.target.value)})} /></Col>
                <Col><Form.Control className="mb-2" type="number" step="any" placeholder="Lon" onChange={e => setNewLoc({...newLoc, lon: parseFloat(e.target.value)})} /></Col>
              </Row>
              <Button variant="outline-danger" className="w-100 btn-sm fw-bold" onClick={handleAddLocation}>ADD BRANCH</Button>
            </Form>
            
            <div className="overflow-auto" style={{maxHeight: '200px'}}>
                {locations.map(l => (
                    <div key={l.id} className="d-flex justify-content-between border-bottom py-2 small">
                        <span><strong>{l.name}</strong> (ID: {l.id})</span>
                        <span className="text-muted">{l.radius}m</span>
                    </div>
                ))}
            </div>
          </Card>
        </Col>

        {/* Live Map Area */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden h-100">
            <Card.Header className="bg-white fw-bold d-flex align-items-center gap-2 pt-3">
              <MapIcon className="text-danger" size={20} /> Enterprise Live View
            </Card.Header>
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <RecenterMap locations={liveLocations} />
                {liveLocations.map((loc) => (
                  <Marker key={loc.email} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}>
                    <Popup>
                      <strong>{loc.name}</strong><br/>{loc.email}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Directory */}
      <Card className="border-0 shadow-sm p-4">
        <h5 className="fw-bold mb-4 d-flex align-items-center"><Navigation className="text-danger me-2" size={20} /> User Directory</h5>
        <Table responsive hover className="align-middle border">
          <thead className="table-light">
            <tr className="small text-uppercase">
              <th>Full Name</th>
              <th>Email Address</th>
              <th>Assigned Office (ID)</th>
              <th>Shift & Role</th>
              <th>Blockchain ID</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td><Form.Control size="sm" defaultValue={emp.full_name} id={`name-${emp.id}`} className="fw-bold border-0" /></td>
                <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} className="border-0" /></td>
                <td>
                  <Form.Select size="sm" defaultValue={emp.location_id} id={`loc-${emp.id}`} className="bg-light border-0 text-danger fw-bold">
                    <option value="">No Office</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name} (ID: {l.id})</option>)}
                  </Form.Select>
                </td>
                <td>
                  <div className="d-flex gap-1 mb-1">
                    <Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} className="text-center p-0" />
                    <Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} className="text-center p-0" />
                  </div>
                  <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} className="p-0 border-0 small text-muted">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </Form.Select>
                </td>
                <td><code className="small bg-light p-1">{emp.blockchain_id || 'N/A'}</code></td>
                <td className="text-center">
                  <Button variant="danger" size="sm" onClick={() => handleUpdateEmployee(emp.email, emp.id)}><Save size={14}/></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Onboarding Modal */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} centered>
        <Modal.Header closeButton className="border-0">
            <Modal.Title className="fw-bold">Onboard New Staff</Modal.Title>
        </Modal.Header>
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
                    <Form.Label className="small fw-bold">Initial Password</Form.Label>
                    <Form.Control type="password" required onChange={e => setNewEmp({...newEmp, pass: e.target.value})} />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Assign Primary Branch</Form.Label>
                    <Form.Select required onChange={e => setNewEmp({...newEmp, locId: e.target.value})}>
                        <option value="">Select Branch...</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Form.Select>
                </Form.Group>
                <Button type="submit" variant="danger" className="w-100 fw-bold">MINT IDENTITY & SAVE</Button>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;