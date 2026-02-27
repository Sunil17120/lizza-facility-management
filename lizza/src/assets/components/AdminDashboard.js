import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, InputGroup, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell, ShieldCheck, FileText, Briefcase, User as UserIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

  // --- ONBOARDING STATES (ALL DB FIELDS) ---
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', 
    fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, 
    prevCompany: '', prevRole: '', aadhar: '', pan: '', role: 'employee', 
    locId: '', shift_start: '09:00', shift_end: '18:00'
  });
  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null, filledForm: null });

  // --- BRANCH STATES ---
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

  const handleOnboardSubmit = async (e) => {
    e.preventDefault();
    const submitData = new FormData();
    // Map Frontend to Backend Keys 
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('personal_email', formData.personalEmail);
    submitData.append('phone_number', formData.phone);
    submitData.append('dob', formData.dob);
    submitData.append('father_name', formData.fatherName);
    submitData.append('mother_name', formData.motherName);
    submitData.append('blood_group', formData.bloodGroup);
    submitData.append('emergency_contact', formData.emergencyContact);
    submitData.append('designation', formData.designation);
    submitData.append('department', formData.department);
    submitData.append('experience_years', formData.experience);
    submitData.append('prev_company', formData.prevCompany);
    submitData.append('prev_role', formData.prevRole);
    submitData.append('aadhar_number', formData.aadhar);
    submitData.append('pan_number', formData.pan);
    submitData.append('user_type', formData.role);
    submitData.append('location_id', formData.locId);
    submitData.append('shift_start', formData.shift_start);
    submitData.append('shift_end', formData.shift_end);
    submitData.append('manager_id', localStorage.getItem('userId'));

    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadhar) submitData.append('aadhar_photo', files.aadhar);
    if (files.pan) submitData.append('pan_photo', files.pan);
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
    if (res.ok) { alert("Success! User onboarded."); setShowAddEmp(false); fetchData(); }
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

  // Filter pending vs verified 
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
              {liveLocations.map(loc => loc.lat && (
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
                      updated.find(u => u.id === emp.id).location_id = parseInt(e.target.value);
                      setEmployees(updated);
                  }}>
                    <option value="">Select...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                    <div className="d-flex gap-1 mb-1">
                        <Form.Control size="sm" type="time" value={emp.shift_start} onChange={e => {
                            const updated = [...employees];
                            updated.find(u => u.id === emp.id).shift_start = e.target.value;
                            setEmployees(updated);
                        }} />
                        <Form.Control size="sm" type="time" value={emp.shift_end} onChange={e => {
                            const updated = [...employees];
                            updated.find(u => u.id === emp.id).shift_end = e.target.value;
                            setEmployees(updated);
                        }} />
                    </div>
                    <Form.Select size="sm" value={emp.user_type} onChange={e => {
                        const updated = [...employees];
                        updated.find(u => u.id === emp.id).user_type = e.target.value;
                        setEmployees(updated);
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

      {/* --- MODAL: ADD STAFF (ALL DB FIELDS) --- */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
          <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Onboard New Employee</Modal.Title></Modal.Header>
          <Modal.Body className="p-4">
              <Form onSubmit={handleOnboardSubmit}>
                  <Tabs defaultActiveKey="personal" className="mb-4 custom-tabs">
                      <Tab eventKey="personal" title={<><UserIcon size={16} className="me-2"/>Personal</>}>
                          <Row className="mt-3">
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">DOB</Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Control placeholder="e.g. O+" onChange={e => setFormData({...formData, bloodGroup: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Personal Email</Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Emergency Contact</Form.Label><Form.Control required onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
                          </Row>
                      </Tab>
                      <Tab eventKey="professional" title={<><Briefcase size={16} className="me-2"/>Work Details</>}>
                          <Row className="mt-3">
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation</Form.Label><Form.Control required onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Department</Form.Label><Form.Select onChange={e => setFormData({...formData, department: e.target.value})}><option>IT / Engineering</option><option>HR</option><option>Admin</option><option>Operations</option></Form.Select></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Assign Branch</Form.Label><Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select...</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Shift Start</Form.Label><Form.Control type="time" value={formData.shift_start} onChange={e => setFormData({...formData, shift_start: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Shift End</Form.Label><Form.Control type="time" value={formData.shift_end} onChange={e => setFormData({...formData, shift_end: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Exp (Years)</Form.Label><Form.Control type="number" step="0.1" onChange={e => setFormData({...formData, experience: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Prev Company</Form.Label><Form.Control onChange={e => setFormData({...formData, prevCompany: e.target.value})} /></Col>
                              <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Prev Role</Form.Label><Form.Control onChange={e => setFormData({...formData, prevRole: e.target.value})} /></Col>
                          </Row>
                      </Tab>
                      <Tab eventKey="docs" title={<><FileText size={16} className="me-2"/>Docs & ID</>}>
                          <Row className="mt-3">
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Aadhar Number</Form.Label><Form.Control required maxLength="12" placeholder="12-digit number" onChange={e => setFormData({...formData, aadhar: e.target.value})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">PAN Number</Form.Label><Form.Control required maxLength="10" placeholder="PAN ID" onChange={e => setFormData({...formData, pan: e.target.value})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Aadhar Photo</Form.Label><Form.Control type="file" accept="image/*" onChange={e => setFiles({...files, aadhar: e.target.files[0]})} /></Col>
                              <Col md={6} className="mb-3"><Form.Label className="small fw-bold">PAN Photo</Form.Label><Form.Control type="file" accept="image/*" onChange={e => setFiles({...files, pan: e.target.files[0]})} /></Col>
                              <Col md={12} className="mb-3"><Form.Label className="small fw-bold text-danger">Onboarding Form (PDF Only)</Form.Label><Form.Control type="file" accept=".pdf" required onChange={e => setFiles({...files, filledForm: e.target.files[0]})} /></Col>
                          </Row>
                      </Tab>
                  </Tabs>
                  <div className="d-flex justify-content-end gap-2 border-top pt-3 mt-3">
                      <Button variant="light" onClick={() => setShowAddEmp(false)}>Cancel</Button>
                      <Button type="submit" variant="danger" className="px-4 fw-bold shadow-sm">SUBMIT VERIFICATION</Button>
                  </div>
              </Form>
          </Modal.Body>
      </Modal>

    </Container>
  );
};

export default AdminDashboard;