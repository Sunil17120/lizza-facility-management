import React, { useState } from 'react';
import { Form, Row, Col, Button, Tabs, Tab, Image } from 'react-bootstrap';
import { User as UserIcon, Briefcase, FileText, Camera } from 'lucide-react';

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', 
    fatherName: '', motherName: '', bloodGroup: '', emergencyContact: '',
    designation: '', department: 'IT / Engineering', experience: 0, 
    prevCompany: '', prevRole: '', aadhar: '', pan: '', role: 'employee', 
    locId: '', shift_start: '09:00', shift_end: '18:00'
  });
  
  const [files, setFiles] = useState({ profile: null, aadhar: null, pan: null, filledForm: null });
  const [profilePreview, setProfilePreview] = useState(null);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      setFiles({ ...files, [type]: file });
      if (type === 'profile') {
        setProfilePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const submitData = new FormData();
    
    // Append all text fields
    Object.keys(formData).forEach(key => {
        // Map frontend keys to backend expected keys
        const apiKey = key === 'firstName' ? 'first_name' : 
                       key === 'lastName' ? 'last_name' : 
                       key === 'personalEmail' ? 'personal_email' :
                       key === 'phone' ? 'phone_number' :
                       key === 'locId' ? 'location_id' : 
                       key === 'role' ? 'user_type' :
                       key === 'experience' ? 'experience_years' :
                       key === 'prevCompany' ? 'prev_company' :
                       key === 'prevRole' ? 'prev_role' :
                       key === 'fatherName' ? 'father_name' :
                       key === 'motherName' ? 'mother_name' :
                       key === 'bloodGroup' ? 'blood_group' :
                       key === 'emergencyContact' ? 'emergency_contact' :
                       key === 'aadhar' ? 'aadhar_number' :
                       key === 'pan' ? 'pan_number' : key;
        submitData.append(apiKey, formData[key]);
    });

    submitData.append('manager_id', localStorage.getItem('userId'));

    // Append Files
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadhar) submitData.append('aadhar_photo', files.aadhar);
    if (files.pan) submitData.append('pan_photo', files.pan);
    if (files.filledForm) submitData.append('filled_form', files.filledForm);

    const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
    if (res.ok) {
        const data = await res.json();
        alert(`Success! Employee official email: ${data.official_email}`);
        onSuccess();
    } else {
        alert("Failed to onboard employee.");
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <div className="text-center mb-4">
        <div className="position-relative d-inline-block">
          <Image 
            src={profilePreview || "https://via.placeholder.com/120"} 
            roundedCircle 
            style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #dc3545' }} 
          />
          <label htmlFor="profile-upload" className="position-absolute bottom-0 end-0 bg-danger text-white rounded-circle p-2" style={{ cursor: 'pointer' }}>
            <Camera size={18} />
          </label>
          <input id="profile-upload" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
        </div>
        <p className="small text-muted mt-2">Profile Photo <span className="text-danger">*</span></p>
      </div>

      <Tabs defaultActiveKey="personal" className="mb-4 custom-tabs">
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
          </Row>
        </Tab>

        <Tab eventKey="work" title={<><Briefcase size={16} className="me-2"/>Professional</>}>
          <Row className="mt-3">
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation <span className="text-danger">*</span></Form.Label><Form.Control required onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Department <span className="text-danger">*</span></Form.Label><Form.Select onChange={e => setFormData({...formData, department: e.target.value})}><option>IT / Engineering</option><option>HR</option><option>Admin</option><option>Operations</option></Form.Select></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Assign Branch <span className="text-danger">*</span></Form.Label><Form.Select required onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select...</option>{locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Shift Start <span className="text-danger">*</span></Form.Label><Form.Control type="time" value={formData.shift_start} onChange={e => setFormData({...formData, shift_start: e.target.value})} /></Col>
          </Row>
        </Tab>

        <Tab eventKey="docs" title={<><FileText size={16} className="me-2"/>Documents</>}>
          <Row className="mt-3">
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Aadhar No. <span className="text-danger">*</span></Form.Label><Form.Control required maxLength="12" onChange={e => setFormData({...formData, aadhar: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">PAN No. <span className="text-danger">*</span></Form.Label><Form.Control required maxLength="10" onChange={e => setFormData({...formData, pan: e.target.value})} /></Col>
            <Col md={12} className="mb-3"><Form.Label className="small fw-bold text-danger">Verification PDF <span className="text-danger">*</span></Form.Label><Form.Control type="file" accept=".pdf" required onChange={(e) => handleFileChange(e, 'filledForm')} /></Col>
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