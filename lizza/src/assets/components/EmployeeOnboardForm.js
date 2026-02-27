import React, { useState } from 'react';
import { Form, Row, Col, Button, Tabs, Tab, Image, Alert } from 'react-bootstrap';
import { User as UserIcon, Briefcase, FileText, Camera, AlertCircle, CreditCard } from 'lucide-react';

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', 
    fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, 
    prevCompany: '', prevRole: '', aadhar: '', pan: '', role: 'employee', 
    locId: '', shift_start: '09:00', shift_end: '18:00'
  });
  
  const [files, setFiles] = useState({ profile: null, aadharPhoto: null, panPhoto: null, filledForm: null });
  const [previews, setPreviews] = useState({ profile: null, aadhar: null, pan: null });
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
      if (type !== 'filledForm') {
        setPreviews({ ...previews, [type]: URL.createObjectURL(file) });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const submitData = new FormData();
    
    // Core Data - Keys must match index.py Form parameters
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
    submitData.append('shift_start', formData.shift_start);
    submitData.append('shift_end', formData.shift_end);
    submitData.append('manager_id', parseInt(localStorage.getItem('userId'), 10));

    // File Uploads - Keys must match index.py File parameters
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadharPhoto) submitData.append('aadhar_photo', files.aadharPhoto);
    if (files.panPhoto) submitData.append('pan_photo', files.panPhoto);
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    try {
        const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
        const data = await res.json();
        if (res.ok) {
            alert(`Success! Employee official email: ${data.official_email}`);
            onSuccess();
        } else {
            console.error("400 Detail:", data.detail);
            setError("Validation Error: Please ensure Aadhar/PAN numbers and photos are provided.");
        }
    } catch (err) { setError("Network error. Please try again."); }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}
      
      <div className="text-center mb-4">
        <div className="position-relative d-inline-block">
          <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #dc3545' }} />
          <label htmlFor="profile-up" className="position-absolute bottom-0 end-0 bg-danger text-white rounded-circle p-2" style={{ cursor: 'pointer' }}><Camera size={18} /></label>
          <input id="profile-up" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
        </div>
        <p className="small text-muted mt-2">Profile Photo <span className="text-danger">*</span></p>
      </div>

      <Tabs defaultActiveKey="personal" className="mb-4">
        <Tab eventKey="personal" title={<><UserIcon size={16} className="me-2"/>Personal</>}>
          <Row className="mt-3">
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
            <Col md={4} className="mb-3"><Form.Label className="small fw-bold">DOB <span className="text-danger">*</span></Form.Label><Form.Control type="date" required onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email <span className="text-danger">*</span></Form.Label><Form.Control type="email" required onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Phone <span className="text-danger">*</span></Form.Label><Form.Control required pattern="[0-9]{10}" onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
          </Row>
        </Tab>

        <Tab eventKey="docs" title={<><CreditCard size={16} className="me-2"/>IDs & Docs</>}>
          <Row className="mt-3">
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">Aadhar Number <span className="text-danger">*</span></Form.Label>
              <Form.Control required maxLength="12" onChange={e => setFormData({...formData, aadhar: e.target.value})} />
              <Form.Control type="file" className="mt-2" accept="image/*" required onChange={(e) => handleFileChange(e, 'aadharPhoto')} />
            </Col>
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">PAN Number <span className="text-danger">*</span></Form.Label>
              <Form.Control required maxLength="10" onChange={e => setFormData({...formData, pan: e.target.value})} />
              <Form.Control type="file" className="mt-2" accept="image/*" required onChange={(e) => handleFileChange(e, 'panPhoto')} />
            </Col>
            <Col md={12} className="mb-3">
              <Form.Label className="small fw-bold text-danger">Onboarding Form (PDF) <span className="text-danger">*</span></Form.Label>
              <Form.Control type="file" accept=".pdf" required onChange={(e) => handleFileChange(e, 'filledForm')} />
            </Col>
          </Row>
        </Tab>
      </Tabs>

      <div className="d-flex justify-content-end gap-2 border-top pt-3">
        <Button variant="light" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="danger" className="px-4 fw-bold">Submit Onboarding</Button>
      </div>
    </Form>
  );
};

export default EmployeeOnboardForm;