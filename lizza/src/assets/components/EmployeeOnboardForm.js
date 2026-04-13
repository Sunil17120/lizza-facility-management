import React, { useState } from 'react';
import { Form, Row, Col, Button, Image, Alert, Card, Tab, Tabs } from 'react-bootstrap';
import { Camera, CheckCircle, UploadCloud, QrCode, Fingerprint, Lock } from 'lucide-react';

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  // --- STATES ---
  const [kycMode, setKycMode] = useState('aadhaar_xml'); // 'aadhaar_xml', 'aadhaar_qr', 'without_aadhaar'
  const [kycStatus, setKycStatus] = useState('pending'); // 'pending', 'verified'
  
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', fatherName: '', motherName: '', dob: '', 
    gender: '', maritalStatus: '', identityMark: '',
    mobile: '', email: '', personalEmail: '', permanentAddress: '', tempAddress: '',
    height: '', bloodGroup: '', caste: '', category: '', religion: '', nationality: '',
    joiningDate: '', designation: '', locId: '', shiftStart: '09:00', shiftEnd: '18:00',
    bankName: '', accountNumber: '', ifscCode: '',
    aadhar: '', panCard: '', voterId: '', drivingLicence: '', passportNo: ''
  });
  
  const [files, setFiles] = useState({ 
    profile: null, idProof: null, fingerprintsLeft: null, fingerprintsRight: null 
  });
  const [previews, setPreviews] = useState({ profile: null });
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // E-KYC Specific Upload States
  const [ekycZip, setEkycZip] = useState(null);
  const [shareCode, setShareCode] = useState('');
  const [qrImage, setQrImage] = useState(null);

  // --- HANDLERS ---
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

  const handleKycVerification = async (mode) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      let res;
      let data;
      const kycFormData = new FormData();

      if (mode === 'xml') {
        if (!ekycZip || shareCode.length !== 4) {
           setError("Please upload the ZIP and enter the 4-digit share code.");
           setIsProcessing(false);
           return;
        }
        kycFormData.append('file', ekycZip);
        kycFormData.append('share_code', shareCode);
        
        // Call the XML endpoint
        res = await fetch('/api/manager/extract-ekyc', { method: 'POST', body: kycFormData });
      } 
      else if (mode === 'qr') {
        if (!qrImage) {
           setError("Please upload a QR Code image to scan.");
           setIsProcessing(false);
           return;
        }
        kycFormData.append('file', qrImage);
        
        // Call the QR endpoint
        res = await fetch('/api/manager/extract-qr', { method: 'POST', body: kycFormData });
      }

      data = await res.json();

      if (res.ok && data.status === "success") {
        // Auto-fill form with extracted data
        setFormData(prev => ({
          ...prev,
          firstName: data.data.firstName || prev.firstName,
          lastName: data.data.lastName || prev.lastName,
          dob: data.data.dob || prev.dob,
          fatherName: data.data.fatherName || prev.fatherName,
          gender: data.data.gender === 'M' ? 'Male' : data.data.gender === 'F' ? 'Female' : prev.gender,
          aadhar: data.data.aadhar_reference || prev.aadhar
        }));
        
        // Extract and set photo if available
        if (data.data.photo) {
          setPreviews(prev => ({ ...prev, profile: data.data.photo }));
          fetch(data.data.photo).then(r => r.blob()).then(blob => {
            const file = new File([blob], "kyc_photo.jpg", { type: "image/jpeg" });
            setFiles(prev => ({ ...prev, profile: file }));
          });
        }
        
        setKycStatus('verified');
      } else {
        setError(data.detail || "Verification failed. Ensure the file is valid.");
      }
    } catch (err) {
      setError("Network error while contacting the server to process KYC.");
    }
    
    setIsProcessing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (kycMode === 'without_aadhaar' && (!files.fingerprintsLeft || !files.fingerprintsRight)) {
        setError("Fingerprint impressions for both hands are required when registering without Aadhaar.");
        return;
    }

    const submitData = new FormData();
    
    // Core Mandatory Fields
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('phone_number', formData.mobile);
    submitData.append('dob', formData.dob);
    submitData.append('designation', formData.designation);
    submitData.append('kyc_mode', kycMode);

    // Optional Details
    if (formData.personalEmail) submitData.append('personal_email', formData.personalEmail);
    if (formData.gender) submitData.append('gender', formData.gender);
    if (formData.maritalStatus) submitData.append('marital_status', formData.maritalStatus);
    if (formData.identityMark) submitData.append('identity_mark', formData.identityMark);
    if (formData.fatherName) submitData.append('father_name', formData.fatherName);
    if (formData.motherName) submitData.append('mother_name', formData.motherName);
    if (formData.bloodGroup) submitData.append('blood_group', formData.bloodGroup);
    if (formData.locId) submitData.append('location_id', formData.locId);
    if (formData.shiftStart) submitData.append('shift_start', formData.shiftStart);
    if (formData.shiftEnd) submitData.append('shift_end', formData.shiftEnd);

    // Optional Financial & ID Details
    if (formData.bankName) submitData.append('bank_name', formData.bankName);
    if (formData.accountNumber) submitData.append('account_number', formData.accountNumber);
    if (formData.ifscCode) submitData.append('ifsc_code', formData.ifscCode);
    if (kycMode !== 'without_aadhaar' && formData.aadhar) submitData.append('aadhar_number', formData.aadhar);
    if (formData.panCard) submitData.append('pan_number', formData.panCard);
    if (formData.voterId) submitData.append('voter_id', formData.voterId);
    if (formData.drivingLicence) submitData.append('driving_licence', formData.drivingLicence);
    if (formData.passportNo) submitData.append('passport_no', formData.passportNo);

    // File Attachments
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.idProof) submitData.append('id_proof', files.idProof);
    if (kycMode === 'without_aadhaar') {
        if (files.fingerprintsLeft) submitData.append('fingerprints_left', files.fingerprintsLeft);
        if (files.fingerprintsRight) submitData.append('fingerprints_right', files.fingerprintsRight);
    }

    try {
        const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
        const data = await res.json();
        
        if (res.ok) {
            alert(`Registration Successful! ${data.message}`);
            onSuccess();
        } else {
            setError(data.detail || "Submission failed. Please check your fields.");
        }
    } catch (err) { 
        setError("Network error. Please check your connection."); 
    }
  };

  // --- RENDER ---
  return (
    <Form onSubmit={handleSubmit} className="p-3 bg-white rounded shadow-sm">
      <div className="text-center mb-4">
        <h4 className="fw-bold text-uppercase text-primary">Lizza Facility Management</h4>
        <h6 className="text-muted">Standard Employee Onboarding</h6>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      
      {/* 1. KYC Mode Selection */}
      <Card className="mb-4 bg-light border-0">
        <Card.Body className="d-flex justify-content-center gap-4 flex-wrap">
            <Form.Check type="radio" label="Aadhaar Offline XML" checked={kycMode === 'aadhaar_xml'} onChange={() => { setKycMode('aadhaar_xml'); setKycStatus('pending'); }} className="fw-bold" />
            <Form.Check type="radio" label="Aadhaar QR Scan" checked={kycMode === 'aadhaar_qr'} onChange={() => { setKycMode('aadhaar_qr'); setKycStatus('pending'); }} className="fw-bold" />
            <Form.Check type="radio" label="Without Aadhaar (Manual)" checked={kycMode === 'without_aadhaar'} onChange={() => { setKycMode('without_aadhaar'); setKycStatus('pending'); }} className="fw-bold text-danger" />
        </Card.Body>
      </Card>

      {/* 2. KYC Validation Gate */}
      {kycStatus === 'pending' && kycMode === 'aadhaar_xml' && (
        <Alert variant="info" className="p-4 shadow-sm text-center">
          <UploadCloud size={32} className="mb-2 text-primary"/>
          <h6 className="fw-bold">Upload Paperless XML/ZIP</h6>
          <Form.Group className="mb-3 mx-auto" style={{maxWidth: '300px'}}>
            <Form.Control type="file" accept=".zip,.xml" onChange={(e) => setEkycZip(e.target.files[0])} />
            <Form.Control type="password" placeholder="4-Digit Share Code" className="mt-2" value={shareCode} onChange={(e) => setShareCode(e.target.value)} />
          </Form.Group>
          <Button onClick={() => handleKycVerification('xml')} disabled={isProcessing}>
             {isProcessing ? 'Verifying...' : 'Extract & Verify'}
          </Button>
        </Alert>
      )}

      {kycStatus === 'pending' && kycMode === 'aadhaar_qr' && (
        <Alert variant="info" className="p-4 shadow-sm text-center">
          <QrCode size={32} className="mb-2 text-primary"/>
          <h6 className="fw-bold">Scan or Upload QR Code</h6>
          <Form.Group className="mb-3 mx-auto" style={{maxWidth: '300px'}}>
            <Form.Control type="file" accept="image/*" onChange={(e) => setQrImage(e.target.files[0])} />
          </Form.Group>
          <Button onClick={() => handleKycVerification('qr')} disabled={isProcessing}>
             {isProcessing ? 'Scanning...' : 'Verify QR'}
          </Button>
        </Alert>
      )}

      {kycStatus === 'verified' && kycMode !== 'without_aadhaar' && (
         <Alert variant="success" className="fw-bold d-flex align-items-center justify-content-center">
             <CheckCircle className="me-2"/> KYC Verified Successfully. Form Unlocked.
         </Alert>
      )}

      {/* 3. Main Form (Unlocks after KYC) */}
      {(kycStatus === 'verified' || kycMode === 'without_aadhaar') && (
        <>
          <div className="text-center mb-4 mt-4">
            <div className="position-relative d-inline-block">
              <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #0d6efd' }} />
              <label htmlFor="prof-up" className="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle p-2" style={{ cursor: 'pointer' }}><Camera size={18} /></label>
             <input id="prof-up" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
            </div>
            <p className="small text-muted mt-2">Applicant Photo <span className="text-danger">*</span></p>
          </div>

          <Tabs defaultActiveKey="personal" className="mb-4">
            <Tab eventKey="personal" title="1. Personal Info">
              <Row className="mt-3">
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name *</Form.Label><Form.Control required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name *</Form.Label><Form.Control required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">DOB *</Form.Label><Form.Control type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Gender</Form.Label><Form.Select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}><option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></Form.Select></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Marital Status</Form.Label><Form.Select value={formData.maritalStatus} onChange={e => setFormData({...formData, maritalStatus: e.target.value})}><option value="">Select...</option><option value="Single">Single</option><option value="Married">Married</option></Form.Select></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Control value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})} /></Col>
                
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control value={formData.motherName} onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
              </Row>
            </Tab>

            <Tab eventKey="work" title="2. Work & Role">
              <Row className="mt-3">
                <Col md={12} className="mb-4">
                    <Card className="bg-light border-0">
                        <Card.Body className="d-flex align-items-center">
                            <Lock className="text-muted me-3" size={24}/>
                            <div>
                                <h6 className="mb-0 fw-bold text-muted">LFM ID NO</h6>
                                <small className="text-primary fw-bold">Generated automatically post Admin Verification.</small>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Designation *</Form.Label><Form.Control required value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Assign Branch</Form.Label><Form.Select value={formData.locId} onChange={e => setFormData({...formData, locId: e.target.value})}><option value="">Select...</option>{locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Form.Select></Col>
                
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mobile Number *</Form.Label><Form.Control required value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Personal Email</Form.Label><Form.Control type="email" value={formData.personalEmail} onChange={e => setFormData({...formData, personalEmail: e.target.value})} /></Col>
                
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Shift Start</Form.Label><Form.Control type="time" value={formData.shiftStart} onChange={e => setFormData({...formData, shiftStart: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Shift End</Form.Label><Form.Control type="time" value={formData.shiftEnd} onChange={e => setFormData({...formData, shiftEnd: e.target.value})} /></Col>
              </Row>
            </Tab>

            <Tab eventKey="proofs" title="3. Bank & Secure ID">
              <Alert variant="warning" className="small mt-3">Information entered here is highly sensitive and will be encrypted via AES-256 before storing.</Alert>
              <Row>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Bank Name <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Account Number <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control type="password" placeholder="Encrypted on submit" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">IFSC Code <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.ifscCode} onChange={e => setFormData({...formData, ifscCode: e.target.value})} /></Col>
                
                {/* Aadhaar logic: Locked if using XML/QR, open if 'Without Aadhaar' */}
                <Col md={12} className="mb-3 mt-2">
                  <Form.Label className="small fw-bold d-flex align-items-center">
                    Aadhaar Number 
                    {kycMode !== 'without_aadhaar' && <Lock size={14} className="ms-2 text-primary" />}
                  </Form.Label>
                  <Form.Control 
                    value={formData.aadhar} 
                    onChange={e => setFormData({...formData, aadhar: e.target.value})} 
                    placeholder={
                        kycMode === 'aadhaar_xml' ? "[Fetched automatically from XML file]" : 
                        kycMode === 'aadhaar_qr' ? "[Fetched automatically from QR Scan]" : 
                        "Enter Aadhaar Number (Optional)"
                    } 
                    disabled={kycMode !== 'without_aadhaar'} 
                    className={kycMode !== 'without_aadhaar' ? 'bg-light text-success fw-bold' : ''}
                  />
                </Col>

                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">PAN Card Number <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.panCard} onChange={e => setFormData({...formData, panCard: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Voter ID <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.voterId} onChange={e => setFormData({...formData, voterId: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Driving Licence <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.drivingLicence} onChange={e => setFormData({...formData, drivingLicence: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Passport No <span className="text-muted fw-normal">(Optional)</span></Form.Label><Form.Control value={formData.passportNo} onChange={e => setFormData({...formData, passportNo: e.target.value})} /></Col>
              </Row>
            </Tab>
          </Tabs>

          {/* Conditional Fingerprint Uploads */}
          {kycMode === 'without_aadhaar' && (
             <Card className="border-danger mb-4">
                <Card.Header className="bg-danger text-white fw-bold d-flex align-items-center"><Fingerprint className="me-2" /> Mandatory Fingerprints</Card.Header>
                <Card.Body>
                   <Row>
                     <Col md={6} className="mb-3">
                        <Form.Label className="fw-bold small">Upload Left Hand Impressions *</Form.Label>
                        <Form.Control type="file" accept="image/*,.pdf" required onChange={(e) => handleFileChange(e, 'fingerprintsLeft')} />
                     </Col>
                     <Col md={6} className="mb-3">
                        <Form.Label className="fw-bold small">Upload Right Hand Impressions *</Form.Label>
                        <Form.Control type="file" accept="image/*,.pdf" required onChange={(e) => handleFileChange(e, 'fingerprintsRight')} />
                     </Col>
                   </Row>
                </Card.Body>
             </Card>
          )}

          <div className="d-flex justify-content-end gap-2 border-top pt-3 mt-2">
            <Button variant="light" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary" className="px-4 fw-bold shadow-sm" disabled={isProcessing}>
               {isProcessing ? 'Submitting...' : 'Submit to Admin'}
            </Button>
          </div>
        </>
      )}
    </Form>
  );
};

export default EmployeeOnboardForm;