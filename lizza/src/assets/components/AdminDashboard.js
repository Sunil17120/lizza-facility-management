import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, InputGroup, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lat: '', lon: '', radius: 200 });
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`),
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);
      if (empRes.ok && locRes.ok) {
        setEmployees(await empRes.json());
        setLocations(await locRes.json());
        if (liveRes.ok) setLiveLocations(await liveRes.json());
      }
      setLoading(false);
    } catch (err) { setLoading(false); }
  }, [adminEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleVerify = async (email) => {
      const res = await fetch(`/api/admin/verify-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'POST' });
      if (res.ok) { alert("Verified!"); setSelectedStaff(null); fetchData(); }
  };

  const handleInlineSave = async (emp) => {
    const res = await fetch('/api/admin/update-employee-inline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
    });
    if (res.ok) alert("Settings saved for " + emp.full_name);
  };

  const handleDeleteEmp = async (id) => {
    if(window.confirm("Permanently delete this employee?")) {
        await fetch(`/api/admin/delete-employee/${id}`, { method: 'DELETE' });
        fetchData();
    }
  };

  const pending = employees.filter(e => !e.is_verified && e.user_type !== 'admin');
  const verified = employees.filter(e => e.is_verified);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="text-danger me-2" />System Admin</h2>
        <div className="d-flex gap-2">
            <Button variant="light" className="position-relative border shadow-sm" onClick={() => setShowNotif(true)}>
                <Bell size={24} />
                {pending.length > 0 && <Badge bg="danger" pill className="position-absolute top-0 start-100 translate-middle">{pending.length}</Badge>}
            </Button>
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><Plus className="me-2"/>Onboard Staff</Button>
        </div>
      </div>

      <Row className="mb-4 text-center">
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small">TOTAL STAFF</div><h4 className="fw-bold">{employees.length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-primary">ASSIGNED</div><h4 className="fw-bold text-primary">{locations.length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-success">PRESENT</div><h4 className="fw-bold text-success">{employees.filter(e => e.is_present).length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-danger">ABSENT</div><h4 className="fw-bold text-danger">{employees.filter(e => !e.is_present).length}</h4></Card></Col>
      </Row>

      <Row>
        <Col md={4}>
          <Card className="border-0 shadow-sm p-3 mb-4">
            <h6 className="fw-bold mb-3"><Building2 size={18} className="me-2 text-danger"/>Office Branches</h6>
            <div style={{maxHeight: '180px', overflowY: 'auto'}}>
                {locations.map(loc => (
                    <div key={loc.id} className="d-flex justify-content-between align-items-center p-2 border-bottom small">
                        <span>{loc.name}</span>
                        <Trash2 size={14} className="text-danger" onClick={async () => {
                            if(window.confirm("Delete Branch?")) {
                                await fetch(`/api/admin/delete-location/${loc.id}`, { method: 'DELETE' });
                                fetchData();
                            }
                        }} style={{cursor: 'pointer'}}/>
                    </div>
                ))}
            </div>
          </Card>
        </Col>
        <Col md={8}>
          <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '380px' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {liveLocations.map(loc => loc.lat && (
                <Marker key={loc.email} position={[loc.lat, loc.lon]}>
                  <Popup>{loc.name} - {loc.present ? "Present" : "Outside"}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </Col>
        </Row>

      <Card className="border-0 shadow-sm">
        <Table responsive hover className="align-middle mb-0 small">
          <thead>
            <tr><th>Full Name</th><th>Email</th><th>Branch</th><th>Shift & Role</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {verified.map(emp => (
              <tr key={emp.id}>
                <td>{emp.full_name}</td>
                <td className="text-muted">{emp.email}</td>
                <td>
                  <Form.Select size="sm" value={emp.location_id || ''} onChange={e => {
                      const updated = [...employees];
                      updated.find(u => u.id === emp.id).location_id = parseInt(e.target.value);
                      setEmployees(updated);
                  }}>
                    <option value="">Select...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                    <Form.Control size="sm" type="time" value={emp.shift_start} onChange={e => {
                        const updated = [...employees];
                        updated.find(u => u.id === emp.id).shift_start = e.target.value;
                        setEmployees(updated);
                    }} />
                </td>
                <td><Badge bg={emp.is_present ? "success" : "secondary"}>{emp.is_present ? "Present" : "Absent"}</Badge></td>
                <td>
                    <Button variant="danger" size="sm" onClick={() => handleInlineSave(emp)}><Save size={14}/></Button>
                    <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmp(emp.id)} className="ms-1"><Trash2 size={14}/></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Admin Onboarding</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
            <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchData(); }} />
        </Modal.Body>
      </Modal>

      <Modal show={showNotif} onHide={() => setShowNotif(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title>Pending Approval</Modal.Title></Modal.Header>
        <Modal.Body>
          {pending.map(p => (
            <div key={p.id} className="p-3 border-bottom d-flex justify-content-between align-items-center">
              <div><h6>{p.full_name}</h6><small>{p.personal_email}</small></div>
              <Button variant="danger" size="sm" onClick={() => setSelectedStaff(p)}>REVIEW</Button>
            </div>
          ))}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;