import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, InputGroup, Badge, Tab, Tabs, Alert } from 'react-bootstrap';
import { UserCog, Save, Building2, UserPlus, Search, Trash2, Users, UserCheck, UserX, MapPin, Crosshair, Target, FileText, Briefcase, User as UserIcon, ShieldCheck } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const MapController = ({ focusTarget }) => {
  const map = useMap();
  useEffect(() => {
    if (focusTarget) {
      const zoomLevel = focusTarget.zoom || 16;
      map.flyTo([focusTarget.lat, focusTarget.lon], zoomLevel, { animate: true, duration: 1.5 });
    }
  }, [focusTarget, map]);
  return null;
};

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [locSearch, setLocSearch] = useState('');
  
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  
  const [newLoc, setNewLoc] = useState({ name: '', lat: 22.5726, lon: 88.3639, radius: 200 });
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, prevCompany: '', prevRole: '',
    aadhar: '', pan: '', role: 'employee', locId: ''
  });

  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null, filledForm: null });
  const [previews, setPreviews] = useState({ profile: null, aadhar: null, pan: null });
  
  const adminEmail = localStorage.getItem('userEmail');
  const adminId = localStorage.getItem('userId') || 1;

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
    } catch (err) { setLoading(false); }
  }, [adminEmail]); 

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredEmployees = selectedBranchId ? employees.filter(e => e.location_id === selectedBranchId) : employees;
  const stats = {
      total: filteredEmployees.length, assigned: filteredEmployees.filter(e => e.location_id).length,
      present: filteredEmployees.filter(e => e.is_present).length, absent: filteredEmployees.length - filteredEmployees.filter(e => e.is_present).length
  };

  const handleLocateEmployee = (employee) => {
    if (employee.location_id) setSelectedBranchId(employee.location_id);
    else setSelectedBranchId(null);
    const isLive = liveLocations.find(l => l.email === employee.email);
    const branch = locations.find(l => l.id === employee.location_id);
    if (isLive) setMapFocus({ lat: parseFloat(isLive.lat), lon: parseFloat(isLive.lon), zoom: 18 });
    else if (branch) setMapFocus({ lat: branch.lat, lon: branch.lon, zoom: 18 });
    else return alert("No location data available for this user.");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBranchLocate = (loc) => {
    setSelectedBranchId(loc.id); setMapFocus({ lat: loc.lat, lon: loc.lon, zoom: 16 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetView = () => setSelectedBranchId(null);

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
    const updatedData = {
      full_name: document.getElementById(`name-${id}`).value, new_email: document.getElementById(`email-${id}`).value,
      shift_start: document.getElementById(`start-${id}`).value, shift_end: document.getElementById(`end-${id}`).value,
      user_type: document.getElementById(`type-${id}`).value, location_id: document.getElementById(`loc-${id}`).value,
    };
    await fetch(`/api/admin/update-employee?target_email=${originalEmail}&admin_email=${adminEmail}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedData)
    });
    fetchData();
  };

  // --- NEW: Verify Employee & View Documents ---
  const handleVerifyEmployee = async (targetEmail) => {
      if(window.confirm(`Are you sure you want to verify ${targetEmail}?\n\nThis will generate their Blockchain ID and send them an email with login credentials.`)) {
          try {
              const res = await fetch(`/api/admin/verify-employee?target_email=${targetEmail}&admin_email=${adminEmail}`, { method: 'POST' });
              const data = await res.json();
              if(res.ok) {
                  alert(`Success! Employee Verified.\nBlockchain ID: ${data.blockchain_id}\nEmail Sent.`);
                  fetchData();
              } else { alert("Verification Failed: " + data.detail); }
          } catch(err) { alert("Network Error"); }
      }
  };

  const handleViewDoc = async (email, docType) => {
      try {
          const res = await fetch(`/api/admin/employee-doc?email=${email}&doc_type=${docType}&admin_email=${adminEmail}`);
          const data = await res.json();
          if (data.data) {
              const win = window.open();
              win.document.write(`<iframe src="${data.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
          } else { alert("No document uploaded for this user."); }
      } catch(e) { alert("Network error fetching document."); }
  };

  // --- File Change Limits ---
  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'filledForm') {
        if (file.size > 2 * 1024 * 1024) {
            alert("Filled Form size cannot exceed 2MB.");
            e.target.value = null; return;
        }
        if (file.type !== 'application/pdf') {
            alert("Filled Form must be a PDF file.");
            e.target.value = null; return;
        }
    } else {
        if (file.size > 5 * 1024 * 1024) {
            alert("File size cannot exceed 5MB.");
            e.target.value = null; return;
        }
    }

    setFiles({ ...files, [type]: file });
    if (type !== 'filledForm') {
        const fileUrl = URL.createObjectURL(file);
        setPreviews({ ...previews, [type]: { url: fileUrl, isImage: file.type.includes('image') } });
    }
  };

  const handleModalClose = () => {
      setShowAddEmp(false);
      setPreviews({ profile: null, aadhar: null, pan: null });
      setFiles({ profile: null, aadhar: null, pan: null, filledForm: null });
  };

  const handleOnboardEmployee = async (e) => {
    e.preventDefault();
    const currentAdminUser = employees.find(emp => emp.email === adminEmail);
    let mgrId = currentAdminUser ? currentAdminUser.id : (parseInt(adminId) || 1);
    const locIdParsed = parseInt(formData.locId);

    const submitData = new FormData();
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
    submitData.append('experience_years', formData.experience || 0);
    submitData.append('prev_company', formData.prevCompany);
    submitData.append('prev_role', formData.prevRole);
    submitData.append('aadhar_number', formData.aadhar);
    submitData.append('pan_number', formData.pan);
    submitData.append('manager_id', mgrId);
    submitData.append('user_type', formData.role);
    if (!isNaN(locIdParsed)) submitData.append('location_id', locIdParsed);
    
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadhar) submitData.append('aadhar_photo', files.aadhar);
    if (files.pan) submitData.append('pan_photo', files.pan);
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
    const result = await res.json();
    
    if (res.ok) { 
        alert(`Employee Form Submitted!\nOfficial Email: ${result.official_email}\n\nStatus: Pending Your Verification.`); 
        handleModalClose();
        fetchData(); 
    } else { alert("Failed to add employee: " + result.detail); }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />System Admin</h2>
        <div>
            {selectedBranchId && <Button variant="secondary" className="me-2 shadow-sm" onClick={handleResetView}>Reset Global View</Button>}
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/>Onboard Staff</Button>
        </div>
      </div>

      <Row className="mb-4 g-3">
        <Col md={3} xs={6}><Card className={`border-0 shadow-sm p-3 text-center h-100 ${selectedBranchId ? 'bg-light border border-primary' : ''}`}><div className="text-muted small fw-bold text-uppercase mb-1">{selectedBranchId ? 'Branch Staff' : 'Total Staff'}</div><h3 className="fw-bold m-0 text-dark"><Users size={24} className="me-2"/>{stats.total}</h3></Card></Col>
        <Col md={3} xs={6}><Card className="border-0 shadow-sm p-3 text-center h-100"><div className="text-muted small fw-bold text-uppercase mb-1">Assigned</div><h3 className="fw-bold m-0 text-primary"><MapPin size={24} className="me-2"/>{stats.assigned}</h3></Card></Col>
        <Col md={3} xs={6}><Card className="border-0 shadow-sm p-3 text-center h-100"><div className="text-muted small fw-bold text-uppercase mb-1">Present</div><h3 className="fw-bold m-0 text-success"><UserCheck size={24} className="me-2"/>{stats.present}</h3></Card></Col>
        <Col md={3} xs={6}><Card className="border-0 shadow-sm p-3 text-center h-100"><div className="text-muted small fw-bold text-uppercase mb-1">Absent</div><h3 className="fw-bold m-0 text-danger"><UserX size={24} className="me-2"/>{stats.absent}</h3></Card></Col>
      </Row>

      <Row className="mb-5 g-4">
        <Col lg={4}>
          <Card className="border-0 shadow-sm p-4 h-100">
            <h5 className="fw-bold mb-3 d-flex align-items-center"><Building2 className="text-danger me-2" size={20} /> Office Branches</h5>
            <InputGroup className="mb-3" size="sm"><InputGroup.Text className="bg-white"><Search size={14}/></InputGroup.Text><Form.Control placeholder="Find branch..." onChange={(e) => setLocSearch(e.target.value)} /></InputGroup>
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
                        <strong style={{cursor:'pointer'}} onClick={() => handleBranchLocate(l)}>{l.name}</strong>
                        <div className="d-flex gap-2">
                            <Button variant={selectedBranchId === l.id ? "primary" : "outline-primary"} size="sm" className="p-1 px-2" onClick={() => handleBranchLocate(l)}><Target size={14}/></Button>
                            <Button variant="link" className="text-danger p-0" onClick={() => handleDeleteLocation(l.id)}><Trash2 size={14}/></Button>
                        </div>
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
                <MapController focusTarget={mapFocus} />
                {locations.map(loc => (
                    <Circle key={`circle-${loc.id}`} center={[loc.lat, loc.lon]} radius={loc.radius} pathOptions={{ color: selectedBranchId === loc.id ? '#0d6efd' : 'red', fillColor: selectedBranchId === loc.id ? '#0d6efd' : 'red', fillOpacity: 0.1 }}>
                        <Popup><strong>{loc.name}</strong><br/>Total Assigned: {employees.filter(e => e.location_id === loc.id).length}</Popup>
                    </Circle>
                ))}
                {locations.map((loc) => (<Marker key={`office-${loc.id}`} position={[loc.lat, loc.lon]}><Popup>🏢 {loc.name}</Popup></Marker>))}
                {liveLocations.map((loc) => (<Marker key={`worker-${loc.email}`} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}><Popup><strong>👷 {loc.name}</strong><br/><Badge bg="success">Live Now</Badge></Popup></Marker>))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm p-4">
        <InputGroup style={{ maxWidth: '400px' }} className="mb-3"><InputGroup.Text className="bg-white border-end-0"><Search size={18} className="text-muted"/></InputGroup.Text><Form.Control className="border-start-0 ps-0" placeholder="Search staff..." onChange={(e) => setEmpSearch(e.target.value)} /></InputGroup>
        <Table responsive hover className="align-middle border">
          <thead className="table-light"><tr className="small text-uppercase"><th>Full Name</th><th>Email</th><th>Branch</th><th>Shift & Role</th><th>Verification</th><th>Actions</th></tr></thead>
          <tbody>
            {employees.filter(emp => emp.full_name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => (
              <tr key={emp.id} className={selectedBranchId && emp.location_id !== selectedBranchId ? "opacity-25" : ""}>
                <td><Form.Control size="sm" defaultValue={emp.full_name} id={`name-${emp.id}`} className="border-0 fw-bold" /></td>
                <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} className="border-0" /></td>
                <td>
                  <Form.Select size="sm" defaultValue={emp.location_id} id={`loc-${emp.id}`} className="bg-light border-0">
                    <option value="">No Office</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                  <div className="d-flex gap-1 mb-1"><Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} className="text-center p-0" /><Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} className="text-center p-0" /></div>
                  <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} className="p-0 border-0 small text-muted"><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option></Form.Select>
                </td>
                
                {/* NEW: Verification Actions Column */}
                <td>
                  <div className="d-flex flex-column gap-2 align-items-start">
                      {emp.is_verified ? (
                          <Badge bg="success" className="px-3 py-2"><ShieldCheck size={14} className="me-1"/> Verified</Badge>
                      ) : (
                          <Button variant="success" size="sm" className="fw-bold" onClick={() => handleVerifyEmployee(emp.email)}>✓ Verify & Send ID</Button>
                      )}
                      <Button variant="outline-primary" size="sm" style={{fontSize: '11px'}} onClick={() => handleViewDoc(emp.email, 'filled_form')}>
                          <FileText size={12} className="me-1"/> View PDF Form
                      </Button>
                  </div>
                </td>

                <td>
                  <div className="d-flex gap-2">
                    <Button variant="info" size="sm" className="text-white" onClick={() => handleLocateEmployee(emp)}><Crosshair size={14}/></Button>
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
      <Modal show={showAddEmp} onHide={handleModalClose} size="lg" centered>
        <Modal.Header closeButton className="border-0 bg-light"><Modal.Title className="fw-bold h5">Onboard New Talent</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
            <Form onSubmit={handleOnboardEmployee}>
                <Tabs defaultActiveKey="personal" className="mb-4">
                    <Tab eventKey="personal" title={<><UserIcon size={16} className="me-2"/>Personal</>}>
                        <Row className="mt-3">
                            <Col md={12} className="mb-3 d-flex flex-column align-items-center bg-light py-3 rounded">
                                {previews.profile ? (
                                    <img src={previews.profile.url} alt="Profile Preview" className="rounded-circle mb-2 border shadow-sm" style={{ width: '90px', height: '90px', objectFit: 'cover' }} />
                                ) : (
                                    <div className="rounded-circle mb-2 border d-flex align-items-center justify-content-center bg-white" style={{ width: '90px', height: '90px' }}><UserIcon className="text-muted" /></div>
                                )}
                                <Form.Label className="small fw-bold">Upload Passport Photo</Form.Label>
                                <Form.Control type="file" accept="image/*" size="sm" style={{maxWidth: '250px'}} onChange={(e) => handleFileChange(e, 'profile')} />
                                <Form.Text className="text-muted" style={{fontSize: '11px'}}>Max file size: 5MB</Form.Text>
                            </Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Date of Birth</Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email</Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mobile Number</Form.Label><Form.Control type="tel" pattern="[0-9]{10}" maxLength="10" required placeholder="10-digit number" onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Select onChange={e => setFormData({...formData, bloodGroup: e.target.value})}><option value="">Select...</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>O+</option><option>O-</option><option>AB+</option><option>AB-</option></Form.Select></Col>
                            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Emergency Contact</Form.Label><Form.Control type="tel" pattern="[0-9]{10}" maxLength="10" placeholder="10-digit number" onChange={e => setFormData({...formData, emergencyContact: e.target.value})} /></Col>
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
                            {/* NEW: PDF Form Upload */}
                            <Col md={12} className="mb-4 border border-primary bg-light p-3 rounded">
                                <Form.Label className="fw-bold text-primary mb-1">Upload Filled Onboarding Form</Form.Label>
                                <p className="small text-muted mb-2">Must be a PDF document. Maximum size: 2MB.</p>
                                <Form.Control required type="file" accept=".pdf" onChange={(e) => handleFileChange(e, 'filledForm')} />
                            </Col>

                            <Col md={6} className="mb-3">
                                <Form.Label className="small fw-bold">Aadhaar Number</Form.Label>
                                <Form.Control required placeholder="12-digit UID" pattern="\d{12}" maxLength="12" title="Must be exactly 12 digits" onChange={e => setFormData({...formData, aadhar: e.target.value})} />
                            </Col>
                            <Col md={6} className="mb-3">
                                <Form.Label className="small fw-bold">PAN Number</Form.Label>
                                <Form.Control required placeholder="10-digit PAN (e.g. ABCDE1234F)" pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}" maxLength="10" style={{textTransform: 'uppercase'}} title="Format: 5 Letters, 4 Numbers, 1 Letter" onChange={e => setFormData({...formData, pan: e.target.value})} />
                            </Col>
                            
                            <Col md={6} className="mb-3 border-top pt-3">
                                <Form.Label className="small fw-bold">Upload Aadhaar (Max 5MB)</Form.Label>
                                <Form.Control type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'aadhar')} className="mb-2" />
                                {previews.aadhar && (
                                    <div className="border rounded p-1 text-center bg-light" style={{ height: '120px' }}>
                                        {previews.aadhar.isImage ? <img src={previews.aadhar.url} alt="Aadhaar Preview" style={{maxHeight: '100%', maxWidth: '100%'}} /> : <Badge bg="danger" className="mt-4">PDF Selected</Badge>}
                                    </div>
                                )}
                            </Col>
                            <Col md={6} className="mb-3 border-top pt-3">
                                <Form.Label className="small fw-bold">Upload PAN (Max 5MB)</Form.Label>
                                <Form.Control type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'pan')} className="mb-2" />
                                {previews.pan && (
                                    <div className="border rounded p-1 text-center bg-light" style={{ height: '120px' }}>
                                        {previews.pan.isImage ? <img src={previews.pan.url} alt="PAN Preview" style={{maxHeight: '100%', maxWidth: '100%'}} /> : <Badge bg="danger" className="mt-4">PDF Selected</Badge>}
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </Tab>
                </Tabs>
                <div className="d-flex justify-content-end gap-2 mt-3 border-top pt-3">
                    <Button variant="light" onClick={handleModalClose}>Cancel</Button>
                    <Button type="submit" variant="danger" className="px-4 fw-bold">Submit for Admin Verification</Button>
                </div>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;