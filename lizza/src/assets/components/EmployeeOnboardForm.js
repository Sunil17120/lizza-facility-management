import React, { useState, useRef } from 'react';
import { Form, Row, Col, Button, Image, Alert, Card, Tab, Tabs, Modal } from 'react-bootstrap';
import { Camera, CheckCircle, UploadCloud, QrCode, Fingerprint, Lock, Plus } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

// --- IMAGE COMPRESSOR ---
const compressImage = (file) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1800; const MAX_HEIGHT = 1800; 
        let width = img.width; let height = img.height;

        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }

        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', 0.92); 
      };
    };
  });
};

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const [kycMode, setKycMode] = useState('aadhaar_xml'); 
  const [kycStatus, setKycStatus] = useState('pending'); 
  
  const [formData, setFormData] = useState({
    userType: 'employee', // Default System Role
    firstName: '', lastName: '', fatherName: '', motherName: '', dob: '', 
    gender: '', maritalStatus: '', identityMark: '', height: '', bloodGroup: '', caste: '', category: '', religion: '', nationality: '', medicalRemarks: '',
    permAddress: '', permState: '', permPin: '', permMobile: '', tempAddress: '', tempState: '', tempPin: '', tempMobile: '', email: '',
    joiningDate: '', designation: '', locId: '', shiftStart: '09:00', shiftEnd: '18:00', bankName: '', accountNumber: '', ifscCode: '', unitName: '',
    aadhar: '', panCard: '', voterId: '', drivingLicence: '', passportNo: ''
  });
  
  const [languages, setLanguages] = useState([{ name: '', read: false, write: false, speak: false }]);
  const [education, setEducation] = useState([{ qualification: '', year: '', institute: '', marks: '' }]);
  const [experience, setExperience] = useState([{ company: '', period: '', designation: '' }]);
  const [family, setFamily] = useState([{ name: '', dob: '', relation: '' }]);
  const [references, setReferences] = useState({
      local1: { name: '', contact: '', relation: '' }, local2: { name: '', contact: '', relation: '' },
      native1: { name: '', contact: '', relation: '' }, native2: { name: '', contact: '', relation: '' }
  });

  const [files, setFiles] = useState({ 
    profile: null, aadharPhoto: null, fingerprintsLeft: null, fingerprintsRight: null,
    panPhoto: null, voterPhoto: null, dlPhoto: null, passportPhoto: null, bankPassbook: null
  });
  
  const [previews, setPreviews] = useState({ profile: null });
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // E-KYC States
  const [ekycZip, setEkycZip] = useState(null);
  const [shareCode, setShareCode] = useState('');
  const [qrImage, setQrImage] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);

  // --- CROPPER STATES ---
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [crop, setCrop] = useState({ unit: '%', width: 50, aspect: 1 });
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) { alert("File too large. Max 15MB"); e.target.value = ""; return; }
      const compressedFile = await compressImage(file);
      setFiles({ ...files, [type]: compressedFile });
      if (type === 'profile') setPreviews({ profile: URL.createObjectURL(compressedFile) });
    }
  };

  const handleQrCapture = (e) => {
    if (e.target.files && e.target.files.length > 0) {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setCropImageSrc(reader.result);
            setShowCropModal(true); 
        });
        reader.readAsDataURL(e.target.files[0]);
        e.target.value = ''; 
    }
  };

  const processCrop = async () => {
    if (!completedCrop || !imgRef.current || completedCrop.width === 0) return;
    
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext('2d');
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(
        image,
        completedCrop.x * scaleX, completedCrop.y * scaleY,
        completedCrop.width * scaleX, completedCrop.height * scaleY,
        0, 0, canvas.width, canvas.height
    );
    
    canvas.toBlob(async (blob) => {
        const croppedFile = new File([blob], "qr_cropped.jpg", { type: 'image/jpeg' });
        setQrImage(croppedFile);
        setQrPreview(URL.createObjectURL(croppedFile));
        setShowCropModal(false);
    }, 'image/jpeg', 1);
  };

  const handleKycVerification = async (mode) => {
    setIsProcessing(true); setError(null);
    try {
      let res; let data; const kycFormData = new FormData();
      if (mode === 'xml') {
        if (!ekycZip || shareCode.length !== 4) { setError("Upload ZIP and enter 4-digit code."); setIsProcessing(false); return; }
        kycFormData.append('file', ekycZip); kycFormData.append('share_code', shareCode);
        res = await fetch('/api/manager/extract-ekyc', { method: 'POST', body: kycFormData });
      } else if (mode === 'qr') {
        if (!qrImage) { setError("Upload/capture a QR Code."); setIsProcessing(false); return; }
        kycFormData.append('file', qrImage);
        res = await fetch('/api/manager/extract-qr', { method: 'POST', body: kycFormData });
      }

      data = await res.json();
      if (res.ok && data.status === "success") {
        setFormData(prev => ({
          ...prev, firstName: data.data.firstName || prev.firstName, lastName: data.data.lastName || prev.lastName,
          dob: data.data.dob || prev.dob, fatherName: data.data.fatherName || prev.fatherName,
          gender: data.data.gender === 'M' ? 'Male' : data.data.gender === 'F' ? 'Female' : prev.gender,
          aadhar: data.data.aadhar_reference || prev.aadhar
        }));
        
        if (data.data.photo) {
          setPreviews(prev => ({ ...prev, profile: data.data.photo }));
          fetch(data.data.photo).then(r => r.blob()).then(blob => {
            setFiles(prev => ({ ...prev, profile: new File([blob], "kyc_photo.jpg", { type: "image/jpeg" }) }));
          });
        }
        setKycStatus('verified');
      } else { setError(data.detail || "Verification failed. Ensure the file is valid."); }
    } catch (err) { setError("Network error processing KYC."); }
    setIsProcessing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null);
    
    if (!files.aadharPhoto) { setError("Aadhaar Photo (Front & Back) is strictly mandatory for all onboarding employees."); return; }

    if (kycMode === 'without_aadhaar') {
        if (!files.fingerprintsLeft || !files.fingerprintsRight) { setError("Fingerprints are strictly required when skipping Aadhaar KYC."); return; }
        if (!formData.aadhar) { setError("Aadhaar Number is strictly mandatory when skipping online KYC."); return; }
    }

    const submitData = new FormData();
    Object.keys(formData).forEach(key => submitData.append(key, formData[key]));
    submitData.append('kyc_mode', kycMode);
    
    submitData.append('languages_json', JSON.stringify(languages));
    submitData.append('education_json', JSON.stringify(education));
    submitData.append('experience_json', JSON.stringify(experience));
    submitData.append('family_json', JSON.stringify(family));
    submitData.append('references_json', JSON.stringify(references));

    // Append Files
    if (files.profile) submitData.append('profile_photo', files.profile);
    if (files.aadharPhoto) submitData.append('aadhar_photo', files.aadharPhoto); 
    if (files.bankPassbook) submitData.append('bank_passbook', files.bankPassbook);

    if (kycMode === 'without_aadhaar') {
        submitData.append('fingerprints_left', files.fingerprintsLeft);
        submitData.append('fingerprints_right', files.fingerprintsRight);
    }
    
    if (files.panPhoto) submitData.append('pan_photo', files.panPhoto);
    if (files.voterPhoto) submitData.append('voter_photo', files.voterPhoto);
    if (files.dlPhoto) submitData.append('dl_photo', files.dlPhoto);
    if (files.passportPhoto) submitData.append('passport_photo', files.passportPhoto);

    setIsProcessing(true);
    try {
        const res = await fetch(`/api/manager/add-employee`, { method: 'POST', body: submitData });
        const data = await res.json();
        if (res.ok) { alert(`Registration Successful!`); onSuccess(); } else { setError(data.detail || "Submission failed."); }
    } catch (err) { setError("Network error."); }
    setIsProcessing(false);
  };

  return (
    <Form onSubmit={handleSubmit} className="p-3 bg-white rounded shadow-sm">
      <div className="text-center mb-4">
        <h4 className="fw-bold text-uppercase text-primary">Lizza Facility Management</h4>
        <h6 className="text-muted">Complete Employee Joining Form</h6>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      
      {/* --- CROPPER MODAL --- */}
      <Modal show={showCropModal} onHide={() => setShowCropModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
            <Modal.Title className="fw-bold">Crop QR Code</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
            <p className="small text-muted mb-3">Drag the box so it <b>ONLY</b> covers the QR code.</p>
            {cropImageSrc && (
                <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={1}>
                    <img ref={imgRef} src={cropImageSrc} alt="Crop me" style={{ maxHeight: '60vh', maxWidth: '100%' }} />
                </ReactCrop>
            )}
        </Modal.Body>
        <Modal.Footer>
            <Button variant="light" onClick={() => setShowCropModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={processCrop}>Confirm Crop</Button>
        </Modal.Footer>
      </Modal>

      <Card className="mb-4 bg-light border-0">
        <Card.Body className="d-flex justify-content-center gap-4 flex-wrap">
            <Form.Check type="radio" label="Aadhaar Offline XML" checked={kycMode === 'aadhaar_xml'} onChange={() => { setKycMode('aadhaar_xml'); setKycStatus('pending'); }} className="fw-bold" />
            <Form.Check type="radio" label="Aadhaar QR Scan" checked={kycMode === 'aadhaar_qr'} onChange={() => { setKycMode('aadhaar_qr'); setKycStatus('pending'); setQrImage(null); setQrPreview(null); }} className="fw-bold" />
            <Form.Check type="radio" label="Without Aadhaar (Manual)" checked={kycMode === 'without_aadhaar'} onChange={() => { setKycMode('without_aadhaar'); setKycStatus('pending'); }} className="fw-bold text-danger" />
        </Card.Body>
      </Card>

      {kycStatus === 'pending' && kycMode === 'aadhaar_xml' && (
        <Alert variant="info" className="p-4 shadow-sm text-center">
          <UploadCloud size={32} className="mb-2 text-primary"/><h6 className="fw-bold">Upload Paperless XML/ZIP</h6>
          <Form.Group className="mb-3 mx-auto" style={{maxWidth: '300px'}}>
            <Form.Control type="file" accept=".zip,.xml" onChange={(e) => setEkycZip(e.target.files[0])} />
            <Form.Control type="password" placeholder="4-Digit Share Code" className="mt-2" value={shareCode} onChange={(e) => setShareCode(e.target.value)} />
          </Form.Group>
          <Button onClick={() => handleKycVerification('xml')} disabled={isProcessing}>{isProcessing ? 'Verifying...' : 'Extract & Verify'}</Button>
        </Alert>
      )}

      {kycStatus === 'pending' && kycMode === 'aadhaar_qr' && (
        <Alert variant="info" className="p-4 shadow-sm text-center">
          <QrCode size={32} className="mb-2 text-primary"/><h6 className="fw-bold">Scan QR Code</h6>
          <div className="d-flex justify-content-center gap-3 mb-3">
            <div className="position-relative">
              <Button variant="outline-primary"><UploadCloud size={18} className="me-2" /> Upload File</Button>
              <input type="file" accept="image/*" className="position-absolute top-0 start-0 w-100 h-100 opacity-0" onChange={handleQrCapture} />
            </div>
            <div className="position-relative">
              <Button variant="primary"><Camera size={18} className="me-2" /> Use Camera</Button>
              <input type="file" accept="image/*" capture="environment" className="position-absolute top-0 start-0 w-100 h-100 opacity-0" onChange={handleQrCapture} />
            </div>
          </div>
          {qrPreview && <div className="mb-3"><Image src={qrPreview} thumbnail style={{ maxHeight: '120px' }} /></div>}
          <Button onClick={() => handleKycVerification('qr')} disabled={!qrImage || isProcessing} className="w-100 fw-bold" style={{maxWidth: '300px'}}>{isProcessing ? 'Scanning...' : 'Verify QR'}</Button>
        </Alert>
      )}

      {kycStatus === 'verified' && kycMode !== 'without_aadhaar' && (<Alert variant="success" className="fw-bold text-center"><CheckCircle className="me-2"/> KYC Verified Successfully. Form Unlocked.</Alert>)}

      {(kycStatus === 'verified' || kycMode === 'without_aadhaar') && (
        <>
          <div className="text-center mb-4 mt-4">
            <div className="position-relative d-inline-block">
              <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle style={{ width: '120px', height: '120px', objectFit: 'cover', border: '3px solid #0d6efd' }} />
              <label htmlFor="prof-up" className="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle p-2" style={{ cursor: 'pointer' }}><Camera size={18} /></label>
             <input id="prof-up" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
            </div><p className="small text-muted mt-2">Applicant Photo *</p>
          </div>

          <Tabs defaultActiveKey="personal" className="mb-4 border-bottom-0">
            
            <Tab eventKey="personal" title="Personal & Medical">
              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Identity Details</h6>
              <Row>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">First Name *</Form.Label><Form.Control required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Last Name *</Form.Label><Form.Control required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">DOB *</Form.Label><Form.Control type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Gender</Form.Label><Form.Select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></Form.Select></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Marital Status</Form.Label><Form.Select value={formData.maritalStatus} onChange={e => setFormData({...formData, maritalStatus: e.target.value})}><option value="">Select</option><option value="Single">Single</option><option value="Married">Married</option></Form.Select></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Identity Mark</Form.Label><Form.Control value={formData.identityMark} onChange={e => setFormData({...formData, identityMark: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Father's Name</Form.Label><Form.Control value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} /></Col>
                <Col md={6} className="mb-3"><Form.Label className="small fw-bold">Mother's Name</Form.Label><Form.Control value={formData.motherName} onChange={e => setFormData({...formData, motherName: e.target.value})} /></Col>
              </Row>
              <h6 className="mt-4 fw-bold border-bottom pb-2 text-primary">Medical Fitness</h6>
              <Row>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Height (cm)</Form.Label><Form.Control value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} /></Col>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Blood Group</Form.Label><Form.Control value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})} /></Col>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Caste</Form.Label><Form.Control value={formData.caste} onChange={e => setFormData({...formData, caste: e.target.value})} /></Col>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Category</Form.Label><Form.Control value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} /></Col>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Religion</Form.Label><Form.Control value={formData.religion} onChange={e => setFormData({...formData, religion: e.target.value})} /></Col>
                <Col md={2} className="mb-3"><Form.Label className="small fw-bold">Nationality</Form.Label><Form.Control value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} /></Col>
                <Col md={12} className="mb-3"><Form.Label className="small fw-bold">Remarks (If any)</Form.Label><Form.Control as="textarea" rows={1} value={formData.medicalRemarks} onChange={e => setFormData({...formData, medicalRemarks: e.target.value})} /></Col>
              </Row>
            </Tab>

            <Tab eventKey="address" title="Contact Info">
              <Row className="mt-3">
                <Col md={6} className="mb-4">
                  <h6 className="fw-bold border-bottom pb-2 text-primary">Permanent Address</h6>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">Address</Form.Label><Form.Control as="textarea" rows={2} value={formData.permAddress} onChange={e => setFormData({...formData, permAddress: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">State</Form.Label><Form.Control value={formData.permState} onChange={e => setFormData({...formData, permState: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">PIN</Form.Label><Form.Control value={formData.permPin} onChange={e => setFormData({...formData, permPin: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">Mobile No *</Form.Label><Form.Control required value={formData.permMobile} onChange={e => setFormData({...formData, permMobile: e.target.value})} /></Form.Group>
                </Col>
                <Col md={6} className="mb-4">
                  <h6 className="fw-bold border-bottom pb-2 text-primary">Temporary Address</h6>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">Address</Form.Label><Form.Control as="textarea" rows={2} value={formData.tempAddress} onChange={e => setFormData({...formData, tempAddress: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">State</Form.Label><Form.Control value={formData.tempState} onChange={e => setFormData({...formData, tempState: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">PIN</Form.Label><Form.Control value={formData.tempPin} onChange={e => setFormData({...formData, tempPin: e.target.value})} /></Form.Group>
                  <Form.Group className="mb-2"><Form.Label className="small fw-bold">Mobile No</Form.Label><Form.Control value={formData.tempMobile} onChange={e => setFormData({...formData, tempMobile: e.target.value})} /></Form.Group>
                </Col>
                <Col md={12} className="mb-3"><Form.Label className="small fw-bold">Email Id</Form.Label><Form.Control type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></Col>
              </Row>
            </Tab>

            <Tab eventKey="edu" title="Edu, Exp & Lang">
              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Language Proficiency</h6>
              {languages.map((lang, idx) => (
                <Row key={idx} className="mb-2 align-items-center">
                    <Col md={4}><Form.Control size="sm" placeholder="Language" value={lang.name} onChange={e => { const newLang = [...languages]; newLang[idx].name = e.target.value; setLanguages(newLang); }} /></Col>
                    <Col md={2}><Form.Check type="checkbox" label="Read" checked={lang.read} onChange={e => { const newLang = [...languages]; newLang[idx].read = e.target.checked; setLanguages(newLang); }} /></Col>
                    <Col md={2}><Form.Check type="checkbox" label="Write" checked={lang.write} onChange={e => { const newLang = [...languages]; newLang[idx].write = e.target.checked; setLanguages(newLang); }} /></Col>
                    <Col md={2}><Form.Check type="checkbox" label="Speak" checked={lang.speak} onChange={e => { const newLang = [...languages]; newLang[idx].speak = e.target.checked; setLanguages(newLang); }} /></Col>
                </Row>
              ))}
              <Button size="sm" variant="outline-primary" onClick={() => setLanguages([...languages, { name: '', read: false, write: false, speak: false }])}><Plus size={14} className="me-1"/> Add Language</Button>

              <h6 className="mt-4 fw-bold border-bottom pb-2 text-primary">Educational Qualification</h6>
              {education.map((edu, idx) => (
                <Row key={idx} className="mb-2">
                    <Col><Form.Control size="sm" placeholder="Qualification" value={edu.qualification} onChange={e => { const newEdu = [...education]; newEdu[idx].qualification = e.target.value; setEducation(newEdu); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Year" value={edu.year} onChange={e => { const newEdu = [...education]; newEdu[idx].year = e.target.value; setEducation(newEdu); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Institute/University" value={edu.institute} onChange={e => { const newEdu = [...education]; newEdu[idx].institute = e.target.value; setEducation(newEdu); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Marks %" value={edu.marks} onChange={e => { const newEdu = [...education]; newEdu[idx].marks = e.target.value; setEducation(newEdu); }} /></Col>
                </Row>
              ))}
              <Button size="sm" variant="outline-primary" onClick={() => setEducation([...education, { qualification: '', year: '', institute: '', marks: '' }])}><Plus size={14} className="me-1"/> Add Education</Button>

              <h6 className="mt-4 fw-bold border-bottom pb-2 text-primary">Work Experience</h6>
              {experience.map((exp, idx) => (
                <Row key={idx} className="mb-2">
                    <Col><Form.Control size="sm" placeholder="Company Name" value={exp.company} onChange={e => { const newExp = [...experience]; newExp[idx].company = e.target.value; setExperience(newExp); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Period" value={exp.period} onChange={e => { const newExp = [...experience]; newExp[idx].period = e.target.value; setExperience(newExp); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Designation" value={exp.designation} onChange={e => { const newExp = [...experience]; newExp[idx].designation = e.target.value; setExperience(newExp); }} /></Col>
                </Row>
              ))}
              <Button size="sm" variant="outline-primary" onClick={() => setExperience([...experience, { company: '', period: '', designation: '' }])}><Plus size={14} className="me-1"/> Add Experience</Button>
            </Tab>

            <Tab eventKey="family" title="Family & Refs">
              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Family Details</h6>
              {family.map((fam, idx) => (
                <Row key={idx} className="mb-2">
                    <Col><Form.Control size="sm" placeholder="Name" value={fam.name} onChange={e => { const newFam = [...family]; newFam[idx].name = e.target.value; setFamily(newFam); }} /></Col>
                    <Col><Form.Control size="sm" type="date" placeholder="DOB" value={fam.dob} onChange={e => { const newFam = [...family]; newFam[idx].dob = e.target.value; setFamily(newFam); }} /></Col>
                    <Col><Form.Control size="sm" placeholder="Relation" value={fam.relation} onChange={e => { const newFam = [...family]; newFam[idx].relation = e.target.value; setFamily(newFam); }} /></Col>
                </Row>
              ))}
              <Button size="sm" variant="outline-primary" onClick={() => setFamily([...family, { name: '', dob: '', relation: '' }])}><Plus size={14} className="me-1"/> Add Family Member</Button>

              <h6 className="mt-4 fw-bold border-bottom pb-2 text-primary">Verification References</h6>
              <Row>
                <Col md={6} className="mb-3">
                    <Form.Label className="small fw-bold">Local Reference 1</Form.Label>
                    <Form.Control size="sm" placeholder="Name" className="mb-1" value={references.local1.name} onChange={e => setReferences({...references, local1: {...references.local1, name: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Contact No" className="mb-1" value={references.local1.contact} onChange={e => setReferences({...references, local1: {...references.local1, contact: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Relationship" value={references.local1.relation} onChange={e => setReferences({...references, local1: {...references.local1, relation: e.target.value}})} />
                </Col>
                <Col md={6} className="mb-3">
                    <Form.Label className="small fw-bold">Local Reference 2</Form.Label>
                    <Form.Control size="sm" placeholder="Name" className="mb-1" value={references.local2.name} onChange={e => setReferences({...references, local2: {...references.local2, name: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Contact No" className="mb-1" value={references.local2.contact} onChange={e => setReferences({...references, local2: {...references.local2, contact: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Relationship" value={references.local2.relation} onChange={e => setReferences({...references, local2: {...references.local2, relation: e.target.value}})} />
                </Col>
                <Col md={6} className="mb-3">
                    <Form.Label className="small fw-bold">Native Reference 1</Form.Label>
                    <Form.Control size="sm" placeholder="Name" className="mb-1" value={references.native1.name} onChange={e => setReferences({...references, native1: {...references.native1, name: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Contact No" className="mb-1" value={references.native1.contact} onChange={e => setReferences({...references, native1: {...references.native1, contact: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Relationship" value={references.native1.relation} onChange={e => setReferences({...references, native1: {...references.native1, relation: e.target.value}})} />
                </Col>
                <Col md={6} className="mb-3">
                    <Form.Label className="small fw-bold">Native Reference 2</Form.Label>
                    <Form.Control size="sm" placeholder="Name" className="mb-1" value={references.native2.name} onChange={e => setReferences({...references, native2: {...references.native2, name: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Contact No" className="mb-1" value={references.native2.contact} onChange={e => setReferences({...references, native2: {...references.native2, contact: e.target.value}})} />
                    <Form.Control size="sm" placeholder="Relationship" value={references.native2.relation} onChange={e => setReferences({...references, native2: {...references.native2, relation: e.target.value}})} />
                </Col>
              </Row>
            </Tab>

            <Tab eventKey="bank" title="Work & IDs">
              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Work Allocation</h6>
              
              {/* ROW 1: Role Selection (Always Visible) */}
              <Row className="mb-3">
                <Col md={3} className="mb-2">
                  <Form.Label className="small fw-bold">Joining Date *</Form.Label>
                  <Form.Control type="date" required value={formData.joiningDate} onChange={e => setFormData({...formData, joiningDate: e.target.value})} />
                </Col>
                <Col md={3} className="mb-2">
                  <Form.Label className="small fw-bold">HR Designation *</Form.Label>
                  <Form.Control required value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Plumber, Guard" />
                </Col>
                <Col md={3} className="mb-2">
                  <Form.Label className="small fw-bold text-danger">App Access Role *</Form.Label>
                  <Form.Select required value={formData.userType} onChange={e => setFormData({...formData, userType: e.target.value})} className="border-danger">
                    <option value="employee">Basic Employee</option>
                    <option value="manager">Site Manager</option>
                    <option value="field_officer">Field Officer / Supervisor</option>
                    <option value="admin">System Admin</option>
                  </Form.Select>
                </Col>
                <Col md={3} className="mb-2">
                  <Form.Label className="small fw-bold">LFM ID NO <Lock size={12}/></Form.Label>
                  <Form.Control disabled placeholder="Auto Generated" />
                </Col>
              </Row>

              {/* ROW 2: Shifts and Sites (Conditionally rendered for Employee and Manager ONLY) */}
              {(formData.userType === 'employee' || formData.userType === 'manager') && (
                <Row className="mb-3 p-3 bg-light rounded border border-secondary border-opacity-25">
                  <Col md={4} className="mb-2">
                    <Form.Label className="small fw-bold text-muted">Allocated Unit / Site *</Form.Label>
                    <Form.Control required value={formData.unitName} onChange={e => setFormData({...formData, unitName: e.target.value})} placeholder="e.g. Tech Park Tower A" />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label className="small fw-bold text-muted">Shift Start Time *</Form.Label>
                    <Form.Control type="time" required value={formData.shiftStart} onChange={e => setFormData({...formData, shiftStart: e.target.value})} />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label className="small fw-bold text-muted">Shift End Time *</Form.Label>
                    <Form.Control type="time" required value={formData.shiftEnd} onChange={e => setFormData({...formData, shiftEnd: e.target.value})} />
                  </Col>
                </Row>
              )}

              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Bank Details</h6>
              <Row className="mb-3">
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Bank Name</Form.Label><Form.Control value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">Account Number</Form.Label><Form.Control type="password" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} /></Col>
                <Col md={4} className="mb-3"><Form.Label className="small fw-bold">IFSC Code</Form.Label><Form.Control value={formData.ifscCode} onChange={e => setFormData({...formData, ifscCode: e.target.value})} /></Col>
                
                <Col md={12}>
                    <div className="p-2 bg-light rounded border border-secondary border-opacity-25">
                        <Form.Label className="small text-muted mb-1"><UploadCloud size={14} className="me-1"/>Upload Bank Passbook / Cancelled Cheque</Form.Label>
                        <Form.Control type="file" size="sm" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'bankPassbook')} />
                    </div>
                </Col>
              </Row>

              <h6 className="mt-3 fw-bold border-bottom pb-2 text-primary">Identity & Address Proof</h6>
              <Row>
                <Col md={12} className="mb-3 mt-2">
                  <Form.Label className="small fw-bold d-flex align-items-center">UID (AADHAAR) {kycMode === 'without_aadhaar' ? <span className="text-danger ms-1">*</span> : <Lock size={14} className="ms-2 text-primary" />}</Form.Label>
                  <Form.Control required={kycMode === 'without_aadhaar'} value={formData.aadhar} onChange={e => setFormData({...formData, aadhar: e.target.value})} placeholder={kycMode !== 'without_aadhaar' ? "[Fetched automatically from e-KYC]" : "Enter 12-digit Aadhaar Number"} disabled={kycMode !== 'without_aadhaar'} className={kycMode !== 'without_aadhaar' ? 'bg-light text-success fw-bold' : ''}/>
                </Col>
                
                <Col md={12} className="mb-4">
                   <Card className="border-warning bg-light">
                     <Card.Body className="py-2">
                       <Form.Label className="small fw-bold">Upload Aadhaar Copy (Front & Back) <span className="text-danger">*</span></Form.Label>
                       <Form.Control type="file" required accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'aadharPhoto')} />
                       {kycMode !== 'without_aadhaar' && <small className="text-muted d-block mt-1">Required for physical record keeping, even when e-KYC is verified.</small>}
                     </Card.Body>
                   </Card>
                </Col>

                <Col md={6} className="mb-4">
                    <Form.Label className="small fw-bold">PAN Card Number</Form.Label>
                    <Form.Control value={formData.panCard} onChange={e => setFormData({...formData, panCard: e.target.value})} />
                    {formData.panCard && (
                        <div className="mt-2 p-2 bg-light rounded border border-secondary border-opacity-25">
                            <Form.Label className="small text-muted mb-1"><UploadCloud size={14} className="me-1"/>Upload PAN Photo</Form.Label>
                            <Form.Control type="file" size="sm" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'panPhoto')} />
                        </div>
                    )}
                </Col>

                <Col md={6} className="mb-4">
                    <Form.Label className="small fw-bold">Voter ID</Form.Label>
                    <Form.Control value={formData.voterId} onChange={e => setFormData({...formData, voterId: e.target.value})} />
                    {formData.voterId && (
                        <div className="mt-2 p-2 bg-light rounded border border-secondary border-opacity-25">
                            <Form.Label className="small text-muted mb-1"><UploadCloud size={14} className="me-1"/>Upload Voter ID Photo</Form.Label>
                            <Form.Control type="file" size="sm" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'voterPhoto')} />
                        </div>
                    )}
                </Col>

                <Col md={6} className="mb-4">
                    <Form.Label className="small fw-bold">Driving Licence</Form.Label>
                    <Form.Control value={formData.drivingLicence} onChange={e => setFormData({...formData, drivingLicence: e.target.value})} />
                    {formData.drivingLicence && (
                        <div className="mt-2 p-2 bg-light rounded border border-secondary border-opacity-25">
                            <Form.Label className="small text-muted mb-1"><UploadCloud size={14} className="me-1"/>Upload DL Photo</Form.Label>
                            <Form.Control type="file" size="sm" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'dlPhoto')} />
                        </div>
                    )}
                </Col>

                <Col md={6} className="mb-4">
                    <Form.Label className="small fw-bold">Passport No</Form.Label>
                    <Form.Control value={formData.passportNo} onChange={e => setFormData({...formData, passportNo: e.target.value})} />
                    {formData.passportNo && (
                        <div className="mt-2 p-2 bg-light rounded border border-secondary border-opacity-25">
                            <Form.Label className="small text-muted mb-1"><UploadCloud size={14} className="me-1"/>Upload Passport Photo</Form.Label>
                            <Form.Control type="file" size="sm" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'passportPhoto')} />
                        </div>
                    )}
                </Col>
              </Row>
            </Tab>
          </Tabs>

          {kycMode === 'without_aadhaar' && (
             <Card className="border-danger mb-4">
                <Card.Header className="bg-danger text-white fw-bold d-flex align-items-center"><Fingerprint className="me-2" /> Mandatory Fingerprint Impressions</Card.Header>
                <Card.Body>
                   <p className="small text-muted mb-3">Upload documents containing all 5 finger impressions (Thumb, Index, Middle, Ring, Small) for both hands.</p>
                   <Row>
                     <Col md={6} className="mb-3"><Form.Label className="fw-bold small">LEFT Hand Impressions *</Form.Label><Form.Control type="file" accept="image/*,.pdf" required onChange={(e) => handleFileChange(e, 'fingerprintsLeft')} /></Col>
                     <Col md={6} className="mb-3"><Form.Label className="fw-bold small">RIGHT Hand Impressions *</Form.Label><Form.Control type="file" accept="image/*,.pdf" required onChange={(e) => handleFileChange(e, 'fingerprintsRight')} /></Col>
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