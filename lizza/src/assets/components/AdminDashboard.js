import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, InputGroup, Badge, Tab, Tabs, Alert } from 'react-bootstrap';
import { UserCog, Save, Building2, UserPlus, Search, Trash2, Users, UserCheck, UserX, MapPin, Crosshair, Target, FileText, Briefcase, User as UserIcon, ShieldCheck, Bell, ChevronRight, Fingerprint, Phone } from 'lucide-react';
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
    if (focusTarget) map.flyTo([focusTarget.lat, focusTarget.lon], focusTarget.zoom || 16, { animate: true, duration: 1.5 });
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
  
  // Notification State
  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [newLoc, setNewLoc] = useState({ name: '', lat: 22.5726, lon: 88.3639, radius: 200 });
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, prevCompany: '', prevRole: '',
    aadhar: '', pan: '', role: 'employee', locId: ''
  });

  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null, filledForm: null });
  const [previews, setPreviews] = useState({ profile: null, aadhar: null, pan: null });
  
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
          if(liveRes.ok) setLiveLocations(await liveRes.json());
          setLoading(false);
      }
    } catch (err) { setLoading(false); }
  }, [adminEmail]); 

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- MISSING HELPERS RESTORED ---
  const handleResetView = () => setSelectedBranchId(null);

  const handleModalClose = () => {
      setShowAddEmp(false);
      setPreviews({ profile: null, aadhar: null, pan: null });
      setFiles({ profile: null, aadhar: null, pan: null, filledForm: null });
  };

  const handleDeleteLocation = async (locId) => {
    if (window.confirm("Delete branch?")) {
      await fetch(`/api/admin/delete-location/${locId}?admin_email=${adminEmail}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleVerify = async (email) => {
      const res = await fetch(`/api/admin/verify-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'POST' });
      if (res.ok) { alert("Verified!"); setSelectedStaff(null); fetchData(); }
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    setFiles({ ...files, [type]: file });
    if (type !== 'filledForm') {
        setPreviews({ ...previews, [type]: { url: URL.createObjectURL(file), isImage: file.type.includes('image') } });
    }
  };

  const handleOnboardSubmit = async (e) => {
    e.preventDefault();
    const submitData = new FormData();
    Object.keys(formData).forEach(key => submitData.append(key, formData[key]));
    Object.keys(files).forEach(key => { if(files[key]) submitData.append(key, files[key]); });
    submitData.append('manager_id', localStorage.getItem('userId'));

    const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
    if (res.ok) { alert("Submitted for verification!"); handleModalClose(); fetchData(); }
  };

  const pending = employees.filter(e => !e.is_verified && e.user_type !== 'admin');
  const verified = employees.filter(e => e.is_verified);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="text-danger me-2" />Admin Dash</h2>
        <div className="d-flex gap-2">
            {selectedBranchId && <Button variant="secondary" onClick={handleResetView}>Global View</Button>}
            <Button variant="light" className="position-relative border shadow-sm" onClick={() => setShowNotif(true)}>
                <Bell size={24} />
                {pending.length > 0 && <Badge bg="danger" pill className="position-absolute top-0 start-100 translate-middle">{pending.length}</Badge>}
            </Button>
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus className="me-2"/>Onboard</Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <Table responsive hover className="mb-0 align-middle">
          <thead className="table-light">
            <tr><th>ID</th><th>Name</th><th>Phone</th><th>Branch</th><th>Status</th></tr>
          </thead>
          <tbody>
            {verified.map(emp => (
              <tr key={emp.id}>
                <td className="fw-bold text-danger font-monospace">{emp.blockchain_id}</td>
                <td>{emp.full_name}</td>
                <td>{emp.phone_number}</td>
                <td>{locations.find(l => l.id === emp.location_id)?.name || 'N/A'}</td>
                <td>{emp.is_present ? <Badge bg="success">On Duty</Badge> : <Badge bg="light" text="dark">Offline</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Verification Modal */}
      <Modal show={showNotif} onHide={() => setShowNotif(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Pending Approval</Modal.Title></Modal.Header>
        <Modal.Body className="p-0">
          {pending.map(p => (
            <div key={p.id} className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
              <div><h6 className="mb-0 fw-bold">{p.full_name}</h6><small className="text-muted">{p.personal_email}</small></div>
              <Button variant="danger" size="sm" onClick={() => setSelectedStaff(p)}>REVIEW</Button>
            </div>
          ))}
        </Modal.Body>
      </Modal>

      {/* Review Window */}
      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl">
        <Modal.Header closeButton className="bg-dark text-white"><Modal.Title className="h6">Reviewing: {selectedStaff?.full_name}</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light p-4">
          <Row>
            <Col md={4}>
              <Card className="p-3 shadow-sm border-0 mb-3">
                <p><strong>Phone:</strong> {selectedStaff?.phone_number}</p>
                <p><strong>DOB:</strong> {selectedStaff?.dob}</p>
                <Button variant="success" className="w-100 fw-bold mt-3" onClick={() => handleVerify(selectedStaff.email)}>APPROVE & ACTIVATE</Button>
              </Card>
            </Col>
            <Col md={8}>
              <Card className="border-0 shadow-sm h-100" style={{ minHeight: '600px' }}>
                <iframe src={selectedStaff?.filled_form_path} width="100%" height="100%" title="PDF" />
              </Card>
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      {/* Add Staff Modal */}
      <Modal show={showAddEmp} onHide={handleModalClose} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Add Staff</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
            <Form onSubmit={handleOnboardSubmit}>
                <Row>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">First Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Last Name</Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email</Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Phone</Form.Label><Form.Control required onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">DOB</Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                    <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Branch</Form.Label><Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select...</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
                    <Col md={12} className="mb-3"><Form.Label className="small fw-bold">Onboarding Form (PDF)</Form.Label><Form.Control type="file" accept=".pdf" required onChange={e => handleFileChange(e, 'filledForm')} /></Col>
                </Row>
                <div className="d-flex justify-content-end gap-2 mt-3 border-top pt-3">
                    <Button variant="light" onClick={handleModalClose}>Cancel</Button>
                    <Button type="submit" variant="danger" className="px-4 fw-bold">Submit Verification</Button>
                </div>
            </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default AdminDashboard;