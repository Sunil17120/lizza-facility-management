import React, { useState } from 'react';
import { Form, Row, Col, Button, Image, Alert, Card } from 'react-bootstrap';
import { Camera, CheckCircle, UploadCloud, ExternalLink } from 'lucide-react';

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const [verifyMode, setVerifyMode] = useState('manual'); // 'ekyc' or 'manual'
  const [ekycStatus, setEkycStatus] = useState('pending'); // pending, verified
  
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '', dob: '', 
    fatherName: '', aadhar: '', designation: '', department: 'IT / Engineering', 
    role: 'employee', locId: '', shiftStart: '09:00', shiftEnd: '18:00'
  });
  
  const [files, setFiles] = useState({ profile: null, aadharPhoto: null });
  const [previews, setPreviews] = useState({ profile: null });
  const [error, setError] = useState(null);

  // States for Offline e-KYC
  const [ekycZip, setEkycZip] = useState(null);
  const [shareCode, setShareCode] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large. Max: 5MB");
        e.target.value = ""; return;
      }
      setFiles({ ...files, [type]: file });
      if (type === 'profile') setPreviews({ profile: URL.createObjectURL(file) });
    }
  };

  // REAL OFFLINE E-KYC EXTRACTION CALLING THE FASTAPI BACKEND
  const processOfflineEkyc = async () => {
    if (!ekycZip || shareCode.length !== 4) {
      setError("Please upload the e-KYC ZIP file and enter the 4-digit share code.");
      return;
    }
    setError(null);
    setIsExtracting(true);

    const ekycData = new FormData();
    ekycData.append('file', ekycZip);
    ekycData.append('share_code', shareCode);

    try {
      // Call the real Python backend endpoint
      const res = await fetch('/api/manager/extract-ekyc', {
        method: 'POST',
        body: ekycData
      });
      
      const data = await res.json();
      
      if (res.ok && data.status === "success") {
        // 1. Auto-fill the form with real extracted data
        setFormData(prev => ({
          ...prev,
          firstName: data.data.firstName || prev.firstName,
          lastName: data.data.lastName || prev.lastName,
          dob: data.data.dob || prev.dob,
          aadhar: data.data.aadhar_reference || prev.aadhar
        }));
        
        // 2. Set the extracted photo as the profile picture
        if (data.data.photo) {
          setPreviews(prev => ({ ...prev, profile: data.data.photo }));
          
          // Convert the Base64 image back into a standard File object 
          // so the existing form submission handles it normally.
          fetch(data.data.photo)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], "ekyc_extracted_photo.jpg", { type: "image/jpeg" });
              setFiles(prev => ({ ...prev, profile: file }));
            });
        }
        
        setEkycStatus('verified');
      } else {
        setError(data.detail || "Invalid Share Code or Corrupted ZIP file.");
      }
    } catch (err) {
      setError("Network error while contacting the server to process e-KYC.");
    }
    setIsExtracting(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const submitData = new FormData();
    
    // Core Data
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('personal_email', formData.personalEmail);
    submitData.append('phone_number', formData.phone);
    submitData.append('dob', formData.dob); 
    submitData.append('father_name', formData.fatherName);
    submitData.append('aadhar_number', formData.aadhar);
    
    // Work Data
    submitData.append('designation', formData.designation);
    submitData.append('department', formData.department);
    submitData.append('user_type', formData.role);
    submitData.append('location_id', formData.locId);
    submitData.append('shift_start', formData.shiftStart);
    submitData.append('shift_end', formData.shiftEnd);
    submitData.append('manager_id', parseInt(localStorage.getItem('userId'), 10));

    // MOCK DATA: Passing dummy values to keep backend happy
    submitData.append('pan_number', 'NA_MINIMAL_KYC');
    submitData.append('experience_years', 0.0);
    submitData.append('mother_name', '');
    submitData.append('blood_group', '');
    submitData.append('emergency_contact', formData.phone);
    submitData.append('prev_company', '');
    submitData.append('prev_role', '');

    // Photos
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadharPhoto) submitData.append('aadhar_photo', files.aadharPhoto);

    try {
        const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
        const data = await res.json();
        if (res.ok) {
            alert(`Onboarding Successful! Initial password is user's DOB (DDMMYYYY).`);
            onSuccess();
        } else {
            setError(data.detail || "Ensure all required fields are filled.");
        }
    } catch (err) { setError("Network error. Check connection."); }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}
      
      {/* Verification Mode Toggle */}
      <Card className="mb-4 bg-light border-0 shadow-sm">
        <Card.Body className="d-flex justify-content-center gap-4">
            <Form.Check 
                type="radio" label="Offline e-KYC (XML/ZIP)" name="kycMode" 
                checked={verifyMode === 'ekyc'} onChange={() => setVerifyMode('ekyc')} 
                className="fw-bold text-primary"
            />
            <Form.Check 
                type="radio" label="Manual Entry" name="kycMode" 
                checked={verifyMode === 'manual'} onChange={() => { setVerifyMode('manual'); setEkycStatus('pending'); }}
                className="fw-bold"
            />
        </Card.Body>
      </Card>

      {/* Profile Photo Upload */}
      <div className="text-center mb-4">
        <div className="position-relative d-inline-block">
          <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #0d6efd' }} />
          <label htmlFor="prof-up" className="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle p-2" style={{ cursor: 'pointer' }}><Camera size={18} /></label>
         <input id="prof-up" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
        </div>
        <p className="small text-muted mt-2">Profile Photo <span className="text-danger">*</span></p>
      </div>

      {/* E-KYC Offline Gate */}
      {verifyMode === 'ekyc' && ekycStatus === 'pending' && (
        <Alert variant="info" className="p-4 shadow-sm">
          <div className="text-center mb-3">
            <h5 className="fw-bold text-primary mb-1">Aadhaar Paperless Offline e-KYC</h5>
            <p className="small text-muted mb-2">Upload the password-protected ZIP file downloaded from the UIDAI portal.</p>
            <a href="https://myaadhaar.uidai.gov.in/" target="_blank" rel="noreferrer" className="small d-inline-flex align-items-center">
              Download Offline e-KYC from UIDAI <ExternalLink size={14} className="ms-1" />
            </a>
          </div>
          
          <Row className="justify-content-center">
            <Col md={8}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold"><UploadCloud size={16} className="me-2"/>Upload Paperless ZIP</Form.Label>
                <Form.Control type="file" accept=".zip" onChange={(e) => setEkycZip(e.target.files[0])} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">4-Digit Share Code</Form.Label>
                <Form.Control type="password" placeholder="e.g., 1234" maxLength="4" value={shareCode} onChange={(e) => setShareCode(e.target.value)} />
                <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>The code used to password-protect the ZIP file.</Form.Text>
              </Form.Group>
              <Button variant="primary" className="w-100 fw-bold" onClick={processOfflineEkyc} disabled={isExtracting}>
                {isExtracting ? 'Extracting Data...' : 'Extract & Verify'}
              </Button>
            </Col>
          </Row>
        </Alert>
      )}

      {/* Main Minimal Form */}
      {(verifyMode === 'manual' || ekycStatus === 'verified') && (
        <>
          {ekycStatus === 'verified' && <Alert variant="success" className="d-flex justify-content-center fw-bold"><CheckCircle className="me-2"/> e-KYC Extracted Successfully! Data Auto-filled.</Alert>}
          
          <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Personal Details</h6>
          <Row className="mb-4">
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">First Name *</Form.Label><Form.Control required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Last Name *</Form.Label><Form.Control required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">DOB *</Form.Label><Form.Control type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email *</Form.Label><Form.Control type="email" required value={formData.personalEmail} onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mobile Number *</Form.Label><Form.Control required pattern="[0-9]{10}" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></Col>
          </Row>

          <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Work Details</h6>
          <Row className="mb-4">
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation *</Form.Label><Form.Control required value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
            <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Assign Branch *</Form.Label><Form.Select required value={formData.locId} onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select Branch...</option>{locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
            
            {/* Conditional Column Sizing for Role */}
            <Col md={formData.role === 'field_officer' ? 12 : 4} className="mb-3">
                <Form.Label className="small fw-bold">System Role *</Form.Label>
                <Form.Select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                    <option value="employee">Employee</option>
                    <option value="field_officer">Field Officer</option>
                    <option value="field_officer">Manager</option>
                </Form.Select>
            </Col>

            {/* ONLY SHOW Shift timings if the role is NOT Field Officer */}
            {formData.role !== 'field_officer' && (
                <>
                    <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Shift Start *</Form.Label><Form.Control type="time" required value={formData.shiftStart} onChange={e => setFormData({...formData, shiftStart: e.target.value})} /></Col>
                    <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Shift End *</Form.Label><Form.Control type="time" required value={formData.shiftEnd} onChange={e => setFormData({...formData, shiftEnd: e.target.value})} /></Col>
                </>
            )}
          </Row>

          <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Identity Proof</h6>
          <Row className="mb-4">
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">Aadhaar Number *</Form.Label>
              <Form.Control required value={formData.aadhar} onChange={e => setFormData({...formData, aadhar: e.target.value})} placeholder={ekycStatus === 'verified' ? "Masked via e-KYC" : "12-digit number"} />
            </Col>
            <Col md={6} className="mb-3">
              <Form.Label className="small fw-bold">Upload Aadhaar Photo *</Form.Label>
              <Form.Control type="file" accept="image/*" required={ekycStatus !== 'verified'} onChange={(e) => handleFileChange(e, 'aadharPhoto')} />
              {ekycStatus === 'verified' && <Form.Text className="text-success">Photo extracted from XML. You may upload a physical copy if needed.</Form.Text>}
            </Col>
          </Row>

          <div className="d-flex justify-content-end gap-2 border-top pt-3">
            <Button variant="light" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary" className="px-4 fw-bold shadow-sm">Complete Registration</Button>
          </div>
        </>
      )}
    </Form>
  );
};

export default EmployeeOnboardForm;