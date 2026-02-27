import React, { useState } from 'react';
import { Form, Row, Col, Button, Tabs, Tab, Image, Alert } from 'react-bootstrap';
import { User as UserIcon, Briefcase, FileText, Camera, CreditCard, HeartPulse, ShieldCheck } from 'lucide-react';

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', 
    fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0.0, 
    prevCompany: '', prevRole: '', aadhar: '', pan: '', role: 'employee', 
    locId: '', shiftStart: '09:00', shiftEnd: '18:00'
  });
  
  const [files, setFiles] = useState({ profile: null, aadharPhoto: null, panPhoto: null, filledForm: null });
  const [previews, setPreviews] = useState({ profile: null });
  const [error, setError] = useState(null);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      const limit = type === 'filledForm' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > limit) {
        alert(`File too large. Max: ${limit / (1024 * 1024)}MB`);
        e.target.value = ""; return;
      }
      setFiles({ ...files, [type]: file });
      if (type === 'profile') setPreviews({ profile: URL.createObjectURL(file) });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const submitData = new FormData();
    
    // Exact mapping to match User table columns in database.py
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
    submitData.append('experience_years', parseFloat(formData.experience) || 0.0);
    submitData.append('prev_company', formData.prevCompany);
    submitData.append('prev_role', formData.prevRole);
    submitData.append('aadhar_number', formData.aadhar);
    submitData.append('pan_number', formData.pan);
    submitData.append('user_type', formData.role);
    submitData.append('location_id', formData.locId);
    submitData.append('shift_start', formData.shiftStart);
    submitData.append('shift_end', formData.shiftEnd);
    submitData.append('manager_id', parseInt(localStorage.getItem('userId'), 10));

    // Mapping Document Paths
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadharPhoto) submitData.append('aadhar_photo', files.aadharPhoto);
    if (files.panPhoto) submitData.append('pan_photo', files.panPhoto);
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    try {
        const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
        const data = await res.json();
        if (res.ok) {
            alert(`Onboarding Successful! Initial password is user's DOB in DDMMYYYY format.`);
            onSuccess();
        } else {
            setError(data.detail || "Validation Error: Ensure all required fields (*) are filled.");
        }
    } catch (err) { setError("Network error. Check connection."); }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}
      
      <div className="text-center mb-4">
        <div className="position-relative d-inline-block">
          <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #dc3545' }} />
          <label htmlFor="prof-up" className="position-absolute bottom-0 end-0 bg-danger text-white rounded-circle p-2" style={{ cursor: 'pointer' }}><Camera size={18} /></label>
          <input id="prof-up" type="file" hidden accept="image/*" required onChange={(e) => handleFileChange(e, 'profile')} />
        </div>
        <p className="small text-muted mt-2">Profile Photo <span className="text-danger">*</span></p>
      </div>

      <Tabs defaultActiveKey="personal" className="mb-4">
        {/* TAB 1: PERSONAL & FAMILY (Cols 1 & 2 in User table) */}
        <Tab eventKey="personal" title={<><UserIcon size={16} className="me-2"/>Personal</>}>
          <Row className="mt-3">
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">DOB <span className="text-danger">*</span></Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Personal Email <span className="text-danger">*</span></Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Phone <span className="text-danger">*</span></Form.Label><Form.Control required pattern="[0-9]{10}" onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Control placeholder="e.g. O+" onChange={e => setFormData({...formData, bloodGroup: e.target.value})} /></Col>
            <Col md={12} className="mb-3"><Form.Label className="small fw-bold">Emergency Contact <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, emergencyContact: e.target.value})} /></Col>
          </Row>
        </Tab>

        {/* TAB 2: PROFESSIONAL (Cols 4, 5 & 8 in User table) */}
        <Tab eventKey="work" title={<><Briefcase size={16} className="me-2"/>Work</>}>
          <Row className="mt-3">
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Department <span className="text-danger">*</span></Form.Label><Form.Select onChange={e => setFormData({...formData, department: e.target.value})}><option>IT / Engineering</option><option>Facility Management</option><option>HR</option><option>Operations</option></Form.Select></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Assign Branch <span className="text-danger">*</span></Form.Label><Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select Branch...</option>{locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">System Role <span className="text-danger">*</span></Form.Label><Form.Select onChange={e => setFormData({...formData, role: e.target.value})}><option value="employee">Employee</option><option value="manager">Manager</option></Form.Select></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Shift Start <span className="text-danger">*</span></Form.Label><Form.Control type="time" value={formData.shiftStart} onChange={e => setFormData({...formData, shiftStart: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Shift End <span className="text-danger">*</span></Form.Label><Form.Control type="time" value={formData.shiftEnd} onChange={e => setFormData({...formData, shiftEnd: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Exp (Years)</Form.Label><Form.Control type="number" step="0.1" onChange={e => setFormData({...formData, experience: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Prev Company</Form.Label><Form.Control onChange={e => setFormData({...formData, prevCompany: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Prev Role</Form.Label><Form.Control onChange={e => setFormData({...formData, prevRole: e.target.value})} /></Col>
          </Row>
        </Tab>

        {/* TAB 3: DOCUMENTS (Cols 6 & 7 in User table) */}
        <Tab eventKey="docs" title={<><FileText size={16} className="me-2"/>IDs & Docs</>}>
          <Row className="mt-3">
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">Aadhar Number <span className="text-danger">*</span></Form.Label>
              <Form.Control required maxLength="12" className="mb-2" onChange={e => setFormData({...formData, aadhar: e.target.value})} />
              <Form.Label className="extra-small text-muted">Aadhar Photo</Form.Label>
              <Form.Control type="file" accept="image/*" required onChange={(e) => handleFileChange(e, 'aadharPhoto')} />
            </Col>
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">PAN Number <span className="text-danger">*</span></Form.Label>
              <Form.Control required maxLength="10" className="mb-2" onChange={e => setFormData({...formData, pan: e.target.value})} />
              <Form.Label className="extra-small text-muted">PAN Photo</Form.Label>
              <Form.Control type="file" accept="image/*" required onChange={(e) => handleFileChange(e, 'panPhoto')} />
            </Col>
            <Col md={12} className="mb-3">
              <Form.Label className="small fw-bold text-danger">Verification Form (PDF Only) <span className="text-danger">*</span></Form.Label>
              <Form.Control type="file" accept=".pdf" required onChange={(e) => handleFileChange(e, 'filledForm')} />
            </Col>
          </Row>
        </Tab>
      </Tabs>

      <div className="d-flex justify-content-end gap-2 border-top pt-3">
        <Button variant="light" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="danger" className="px-4 fw-bold shadow-sm">Complete System Onboarding</Button>
      </div>
    </Form>
  );
};

export default EmployeeOnboardForm;