import React, { useEffect, useState, useCallback } from 'react';
// Removed 'Badge' as it was unused
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, InputGroup } from 'react-bootstrap';
// Removed 'MapIcon' and 'Navigation' as they were unused
import { UserCog, Save, Building2, UserPlus, Search, Trash2 } from 'lucide-react';
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
  const [empSearch, setEmpSearch] = useState('');
  const [locSearch, setLocSearch] = useState(''); // Now used in the filter below
  
  const [newLoc, setNewLoc] = useState({ name: '', lat: 22.5726, lon: 88.3639, radius: 200 });
  const [newEmp, setNewEmp] = useState({ name: '', email: '', pass: '', role: 'manager', locId: '' });
  
  const adminEmail = localStorage.getItem('userEmail');
  const adminId = localStorage.getItem('userId') || 1;

  const fetchData = useCallback(async () => {
    try {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`),
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (liveRes.ok) setLiveLocations(await liveRes.json());
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeleteEmployee = async (email) => {
    if (window.confirm(`Delete employee: ${email}?`)) {
      const res = await fetch(`/api/admin/delete-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'DELETE' });
      if (res.ok) { alert("Employee Deleted"); fetchData(); }
    }
  };

  const handleDeleteLocation = async (locId) => {
    if (window.confirm(`Delete branch ID ${locId}?`)) {
      const res = await fetch(`/api/admin/delete-location/${locId}?admin_email=${adminEmail}`, { method: 'DELETE' });
      if (res.ok) { alert("Branch Removed"); fetchData(); }
    }
  };

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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedData)
    });
    if (res.ok) { alert("Updated!"); fetchData(); }
  };

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/manager/add-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newEmp.name,
        email: newEmp.email,
        password: newEmp.pass,
        manager_id: parseInt(adminId), 
        user_type: newEmp.role,
        shift_start: "09:00",
        shift_end: "18:00",
        location_id: parseInt(newEmp.locId)
      })
    });
    if (res.ok) { alert("Success!"); setShowAddEmp(false); fetchData(); }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />System Admin</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/>Onboard Staff</Button>
      </div>

      <Row className="mb-5 g-4">
        <Col lg={4}>
          <Card className="border-0 shadow-sm p-4 h-100">
            <h5 className="fw-bold mb-3 d-flex align-items-center"><Building2 className="text-danger me-2" size={20} /> Office Branches</h5>
            
            {/* ADDED: Branch Search Input to use locSearch variable */}
            <InputGroup className="mb-3" size="sm">
              <InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text>
              <Form.Control 
                placeholder="Find branch..." 
                onChange={(e) => setLocSearch(e.target.value)} 
              />
            </InputGroup>

            <Form className="mb-4 bg-light p-3 rounded">
              <Form.Control className="mb-2" placeholder="Branch Name" onChange={e => setNewLoc({...newLoc, name: e.target.value})} />
              <Row>
                <Col><Form.Control className="mb-2" type="number" step="any" placeholder="Lat" onChange={e => setNewLoc({...newLoc, lat: parseFloat(e.target.value)})} /></Col>
                <Col><Form.Control className="mb-2" type="number" step="any" placeholder="Lon" onChange={e => setNewLoc({...newLoc, lon: parseFloat(e.target.value)})} /></Col>
              </Row>
              <Button variant="outline-danger" className="w-100 btn-sm fw-bold" onClick={() => fetch(`/api/admin/add-location?admin_email=${adminEmail}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newLoc) }).then(() => fetchData())}>ADD BRANCH</Button>
            </Form>
            
            <div className="overflow-auto" style={{maxHeight: '200px'}}>
                {/* USE locSearch to filter branch list */}
                {locations
                  .filter(l => l.name.toLowerCase().includes(locSearch.toLowerCase()))
                  .map(l => (
                    <div key={l.id} className="d-flex justify-content-between align-items-center border-bottom py-2 small">
                        <strong>{l.name}</strong>
                        <Button variant="link" className="text-danger p-0" onClick={() => handleDeleteLocation(l.id)}><Trash2 size={14}/></Button>
                    </div>
                ))}
            </div>
          </Card>
        </Col>

        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden h-100">
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <RecenterMap locations={liveLocations} />
                {liveLocations.map((loc) => (
                  <Marker key={loc.email} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}>
                    <Popup><strong>{loc.name}</strong><br/>{loc.email}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm p-4">
        <InputGroup style={{ maxWidth: '400px' }} className="mb-3">
          <InputGroup.Text className="bg-white border-end-0"><Search size={18} className="text-muted"/></InputGroup.Text>
          <Form.Control className="border-start-0 ps-0" placeholder="Search staff..." onChange={(e) => setEmpSearch(e.target.value)} />
        </InputGroup>
        <Table responsive hover className="align-middle border">
          <thead className="table-light">
            <tr className="small text-uppercase">
              <th>Full Name</th><th>Email</th><th>Branch</th><th>Shift & Role</th><th>Blockchain ID</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.filter(emp => emp.full_name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => (
              <tr key={emp.id}>
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
                <td><code className="small bg-light p-1">{emp.blockchain_id || 'N/A'}</code></td>
                <td>
                  <div className="d-flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => handleUpdateEmployee(emp.email, emp.id)}><Save size={14}/></Button>
                    <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmployee(emp.email)}><Trash2 size={14}/></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} centered>
        <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold">Onboard New Staff</Modal.Title></Modal.Header>
        <Modal.Body>
            <Form onSubmit={handleOnboardEmployee}>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Full Name</Form.Label><Form.Control required onChange={e => setNewEmp({...newEmp, name: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Email</Form.Label><Form.Control type="email" required onChange={e => setNewEmp({...newEmp, email: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2"><Form.Label className="small fw-bold">Initial Password</Form.Label><Form.Control type="password" required onChange={e => setNewEmp({...newEmp, pass: e.target.value})} /></Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label className="small fw-bold">Initial Role</Form.Label>
                  <Form.Select value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                    <option value="manager">Manager</option><option value="employee">Employee</option><option value="admin">Admin</option>
                  </Form.Select>
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