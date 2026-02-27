import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, InputGroup, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- VERIFICATION STATES ---
  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  // --- UI STATES ---
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

  // --- ACTIONS: EMPLOYEES ---
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

  // --- ACTIONS: BRANCHES ---
  const handleAddBranch = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/add-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoc)
    });
    setNewLoc({ name: '', lat: '', lon: '', radius: 200 });
    fetchData();
  };

  const deleteLoc = async (id) => {
    if(window.confirm("Delete Branch?")) {
        await fetch(`/api/admin/delete-location/${id}`, { method: 'DELETE' });
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

      {/* --- STATS CARDS --- */}
      <Row className="mb-4 text-center">
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small">TOTAL STAFF</div><h4 className="fw-bold"><Users size={20} className="me-2"/>{employees.length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-primary">ASSIGNED</div><h4 className="fw-bold text-primary"><MapPin size={20} className="me-2"/>{locations.length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-success">PRESENT</div><h4 className="fw-bold text-success"><UserCheck size={20} className="me-2"/>{employees.filter(e => e.is_present).length}</h4></Card></Col>
        <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-danger">ABSENT</div><h4 className="fw-bold text-danger"><UserX size={20} className="me-2"/>{employees.filter(e => !e.is_present).length}</h4></Card></Col>
      </Row>

      <Row>
        {/* --- BRANCH MANAGEMENT SIDEBAR --- */}
        <Col md={4}>
          <Card className="border-0 shadow-sm p-3 mb-4">
            <h6 className="fw-bold mb-3"><Building2 size={18} className="me-2 text-danger"/>Office Branches</h6>
            <Form onSubmit={handleAddBranch} className="mb-3">
              <Form.Control size="sm" className="mb-2" placeholder="Branch Name" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} required />
              <div className="d-flex gap-2">
                <Form.Control size="sm" placeholder="Lat" value={newLoc.lat} onChange={e => setNewLoc({...newLoc, lat: e.target.value})} required />
                <Form.Control size="sm" placeholder="Lon" value={newLoc.lon} onChange={e => setNewLoc({...newLoc, lon: e.target.value})} required />
              </div>
              <Button type="submit" variant="outline-danger" size="sm" className="w-100 mt-2 fw-bold">ADD BRANCH</Button>
            </Form>
            <div style={{maxHeight: '180px', overflowY: 'auto'}}>
                {locations.map(loc => (
                    <div key={loc.id} className="d-flex justify-content-between align-items-center p-2 border-bottom small">
                        <span>{loc.name}</span>
                        <Trash2 size={14} className="text-danger" onClick={() => deleteLoc(loc.id)} style={{cursor: 'pointer'}}/>
                    </div>
                ))}
            </div>
          </Card>
        </Col>

        {/* --- LIVE MAP --- */}
        <Col md={8}>
          <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '380px' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {liveLocations.map(loc => (loc.lat && loc.lon) && (
                <Marker key={loc.email} position={[loc.lat, loc.lon]}>
                  <Popup>{loc.name} - {loc.present ? "Present" : "Outside"}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </Card>
        </Col>
      </Row>

      {/* --- INLINE EMPLOYEE EDITOR TABLE --- */}
      <Card className="border-0 shadow-sm">
        <Table responsive hover className="align-middle mb-0 small">
          <thead className="table-light text-uppercase">
            <tr><th>Full Name</th><th>Email</th><th>Branch</th><th>Shift & Role</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {verified.map(emp => (
              <tr key={emp.id}>
                <td><div className="fw-bold">{emp.full_name}</div></td>
                <td className="text-muted">{emp.email}</td>
                <td>
                  <Form.Select size="sm" value={emp.location_id || ''} onChange={e => {
                      const updated = [...employees];
                      const target = updated.find(u => u.id === emp.id);
                      if (target) {
                        target.location_id = parseInt(e.target.value);
                        setEmployees(updated);
                      }
                  }}>
                    <option value="">Select...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                    <div className="d-flex gap-1 mb-1">
                        <Form.Control size="sm" type="time" value={emp.shift_start} onChange={e => {
                            const updated = [...employees];
                            const target = updated.find(u => u.id === emp.id);
                            if (target) {
                              target.shift_start = e.target.value;
                              setEmployees(updated);
                            }
                        }} />
                        <Form.Control size="sm" type="time" value={emp.shift_end} onChange={e => {
                            const updated = [...employees];
                            const target = updated.find(u => u.id === emp.id);
                            if (target) {
                              target.shift_end = e.target.value;
                              setEmployees(updated);
                            }
                        }} />
                    </div>
                    <Form.Select size="sm" value={emp.user_type} onChange={e => {
                        const updated = [...employees];
                        const target = updated.find(u => u.id === emp.id);
                        if (target) {
                          target.user_type = e.target.value;
                          setEmployees(updated);
                        }
                    }}>
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </Form.Select>
                </td>
                <td><Badge bg={emp.is_present ? "success" : "secondary"}>{emp.is_present ? "Present" : "Absent"}</Badge></td>
                <td>
                    <div className="d-flex gap-1">
                        <Button variant="info" size="sm" className="text-white" title="Quick View"><Search size={14}/></Button>
                        <Button variant="danger" size="sm" onClick={() => handleInlineSave(emp)} title="Save Updates"><Save size={14}/></Button>
                        <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmp(emp.id)}><Trash2 size={14}/></Button>
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* --- MODAL: PENDING APPROVAL LIST --- */}
      <Modal show={showNotif} onHide={() => setShowNotif(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Pending Approval</Modal.Title></Modal.Header>
        <Modal.Body className="p-0">
          {pending.length === 0 ? <div className="p-4 text-center text-muted">No pending approvals.</div> : 
           pending.map(p => (
            <div key={p.id} className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
              <div><h6 className="mb-0 fw-bold">{p.full_name}</h6><small className="text-muted">{p.personal_email}</small></div>
              <Button variant="danger" size="sm" onClick={() => setSelectedStaff(p)}>REVIEW</Button>
            </div>
          ))}
        </Modal.Body>
      </Modal>

      {/* --- MODAL: VERIFICATION REVIEW WINDOW --- */}
      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered>
        <Modal.Header closeButton className="bg-dark text-white"><Modal.Title className="h6">Reviewing: {selectedStaff?.full_name}</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light p-4">
          <Row>
            <Col md={4}>
              <Card className="p-3 shadow-sm border-0 mb-3">
                <p><strong>Phone:</strong> {selectedStaff?.phone_number}</p>
                <p><strong>DOB:</strong> {selectedStaff?.dob}</p>
                <p><strong>Designation:</strong> {selectedStaff?.designation}</p>
                <Button variant="success" className="w-100 fw-bold mt-3" onClick={() => handleVerify(selectedStaff.email)}>APPROVE & ACTIVATE</Button>
              </Card>
            </Col>
            <Col md={8}>
              <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '70vh' }}>
                <iframe src={selectedStaff?.filled_form_path} width="100%" height="100%" title="Verification PDF" />
              </Card>
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      {/* --- MODAL: SHARED ONBOARDING FORM --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
          <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Onboard New Employee</Modal.Title></Modal.Header>
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

export default AdminDashboard;