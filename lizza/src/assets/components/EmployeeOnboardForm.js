import React, { useState, useRef } from 'react';
import { Form, Row, Col, Button, Image, Alert, Card, Modal, Container, Badge } from 'react-bootstrap';
import { Camera, CheckCircle, UploadCloud, QrCode, Fingerprint, Lock, Plus, Trash, FileText, ChevronRight, AlertTriangle, ShieldCheck, ChevronLeft } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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
        canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', 0.92); 
      };
    };
  });
};

const EmployeeOnboardForm = ({ locations, onCancel, onSuccess }) => {
  const loggedInEmail = localStorage.getItem('userEmail');
  
  // --- Wizard Step State ---
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const [kycMode, setKycMode] = useState('aadhaar_xml'); 
  const [kycStatus, setKycStatus] = useState('pending'); 
  
  const [formData, setFormData] = useState({
    userType: 'employee', department: 'Security',
    firstName: '', lastName: '', phoneNumber: '', email: '', dob: '', 
    fatherName: '', motherName: '', gender: '', maritalStatus: '', identityMark: '', 
    height: '', bloodGroup: '', caste: '', category: '', religion: '', nationality: '', medicalRemarks: '',
    uniformShirt: '', uniformPant: '', uniformShoe: '', 
    permAddress: '', permState: '', permPin: '', permMobile: '', 
    tempAddress: '', tempState: '', tempPin: '', tempMobile: '', 
    designation: '', unitName: '', shiftStart: '09:00', shiftEnd: '18:00', 
    bankName: '', accountNumber: '', ifscCode: '', 
    aadhar: '', panCard: '', voterId: '', drivingLicence: '', passportNo: ''
  });
  
  const [languages, setLanguages] = useState([{ name: '', read: false, write: false, speak: false }]);
  const [education, setEducation] = useState([{ qualification: '', year: '', institute: '', marks: '' }]);
  const [experience, setExperience] = useState([{ company: '', period: '', designation: '' }]);
  const [family, setFamily] = useState([{ name: '', dob: '', relation: '' }]);
  const [references, setReferences] = useState({ local1: { name: '', contact: '', relation: '' }, local2: { name: '', contact: '', relation: '' } });

  const [files, setFiles] = useState({ profile: null, aadharPhoto: null, fingerprintsLeft: null, fingerprintsRight: null, panPhoto: null, voterPhoto: null, dlPhoto: null, passportPhoto: null, bankPassbook: null });
  const [extraDocuments, setExtraDocuments] = useState([{ title: '', file: null }]);
  const [termsAccepted, setTermsAccepted] = useState(false); 
  
  const [previews, setPreviews] = useState({ profile: null });
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [ekycZip, setEkycZip] = useState(null);
  const [shareCode, setShareCode] = useState('');
  const [qrImage, setQrImage] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);

  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [crop, setCrop] = useState({ unit: '%', width: 50, aspect: 1 });
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  const companyTerms = [
    "If the applicant is selected, he/she should work with company for a period of minimum three months.",
    "Employee agree that will work faithfully without any issues, and will be present in time for duty and complete the duty hrs as per schedule assigned.",
    "Selected candidate should pay 2200/- as security deposit for providing uniform.",
    "Selected candidate should submit any one original document while joining, same will be returned back after 1month as due to verification purpose.",
    "Candidate who are selected and deployed in respective sites while in duty they are sole responsible for any theft or pilerage and they had to be borne by them.",
    "A minimum of one-month notice has to given before leaving the job or a month salary will be deducted.",
    "Employer may terminate Candidate (Employee) if any mis appropriation occurs in duty without prior notice.",
    "The Selected Employee agree that any property like sim card or mobile should returned of at the time of resignation/termination.",
    "Selected Employee should be flexible towards work like in shifts process as per Employer.",
    "Resigned Employee salary will release after cmpletetion of 30 days of notice period, if not then one month salary will be on hold and that will be clear with a fine of 4000/-(every month on 25th).",
    "The above all terms and conditions are Solley Accepted and signed."
  ];

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
        reader.addEventListener('load', () => { setCropImageSrc(reader.result); setShowCropModal(true); });
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
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
        const croppedFile = new File([blob], "qr_cropped.jpg", { type: 'image/jpeg' });
        setQrImage(croppedFile);
        setQrPreview(URL.createObjectURL(croppedFile));
        setShowCropModal(false);
    }, 'image/jpeg', 1);
  };

  const handleKycVerification = async (mode) => {
    setIsProcessing(true); setError(null);
    let res; let data; const kycFormData = new FormData();
    if (mode === 'xml') {
      if (!ekycZip || shareCode.length !== 4) { setError("Upload ZIP and enter 4-digit code."); setIsProcessing(false); return; }
      kycFormData.append('file', ekycZip); kycFormData.append('share_code', shareCode);
      res = await fetch('https://lizza-facility-management.vercel.app/api/manager/extract-ekyc', { method: 'POST', body: kycFormData });
    } else if (mode === 'qr') {
      if (!qrImage) { setError("Upload/capture a QR Code."); setIsProcessing(false); return; }
      kycFormData.append('file', qrImage);
      res = await fetch('https://lizza-facility-management.vercel.app/api/manager/extract-qr', { method: 'POST', body: kycFormData });
    }
    
    if (res && res.ok) {
        data = await res.json();
        if (data.status === "success") {
          setFormData(prev => ({
            ...prev, firstName: data.data.firstName || prev.firstName, lastName: data.data.lastName || prev.lastName,
            dob: data.data.dob || prev.dob, fatherName: data.data.fatherName || prev.fatherName,
            gender: data.data.gender === 'M' ? 'Male' : data.data.gender === 'F' ? 'Female' : prev.gender,
            aadhar: data.data.aadhar_reference || prev.aadhar
          }));
          if (data.data.photo) {
            setPreviews(prev => ({ ...prev, profile: data.data.photo }));
            fetch(data.data.photo).then(r => r.blob()).then(blob => setFiles(prev => ({ ...prev, profile: new File([blob], "kyc_photo.jpg", { type: "image/jpeg" }) })));
          }
          setKycStatus('verified');
        } else { setError(data.detail || "Verification failed. Ensure the file is valid."); }
    } else {
        setError("Network error fetching verification. Please try again.");
    }
    setIsProcessing(false);
  };

  // --- Step Navigation & Validation ---
  const handleNext = () => {
    const stepContainer = document.getElementById(`step-${currentStep}`);
    if (stepContainer) {
        const inputs = stepContainer.querySelectorAll('input, select, textarea');
        for (let i = 0; i < inputs.length; i++) {
            if (!inputs[i].checkValidity()) {
                inputs[i].reportValidity();
                return; 
            }
        }
    }
    setCurrentStep(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null);
    if (!termsAccepted) { setError("You must accept the terms and conditions to complete onboarding."); return; }
    if (!files.aadharPhoto) { setError("Gov ID Photo (Front & Back) is strictly mandatory for our records."); return; }
    if (kycMode === 'without_aadhaar') {
        if (!files.fingerprintsLeft || !files.fingerprintsRight) { setError("Fingerprints are strictly required when skipping digital KYC."); return; }
        if (!formData.aadhar) { setError("Gov ID Number is strictly mandatory when skipping online KYC."); return; }
    }

    const submitData = new FormData();
    submitData.append('kyc_mode', kycMode);
    submitData.append('first_name', formData.firstName);
    submitData.append('last_name', formData.lastName);
    submitData.append('phone_number', formData.phoneNumber); 
    if (formData.email) submitData.append('personal_email', formData.email); 
    submitData.append('dob', formData.dob);
    submitData.append('designation', formData.designation);
    submitData.append('userType', formData.userType);
    submitData.append('department', formData.department);
    
    const uniformStr = `Shirt: ${formData.uniformShirt || 'N/A'}, Pant: ${formData.uniformPant || 'N/A'}, Shoe: ${formData.uniformShoe || 'N/A'}`;
    submitData.append('uniform_details', uniformStr);
    
    if (formData.gender) submitData.append('gender', formData.gender);
    if (formData.maritalStatus) submitData.append('marital_status', formData.maritalStatus);
    if (formData.identityMark) submitData.append('identity_mark', formData.identityMark);
    if (formData.fatherName) submitData.append('father_name', formData.fatherName);
    if (formData.motherName) submitData.append('mother_name', formData.motherName);
    if (formData.bloodGroup) submitData.append('blood_group', formData.bloodGroup);
    if (formData.height) submitData.append('height', formData.height);
    if (formData.caste) submitData.append('caste', formData.caste);
    if (formData.category) submitData.append('category', formData.category);
    if (formData.religion) submitData.append('religion', formData.religion);
    if (formData.nationality) submitData.append('nationality', formData.nationality);
    if (formData.medicalRemarks) submitData.append('medical_remarks', formData.medicalRemarks);
    if (formData.unitName) submitData.append('unit_name', formData.unitName);
    
    if (formData.permAddress) submitData.append('perm_address', formData.permAddress);
    if (formData.permState) submitData.append('perm_state', formData.permState);
    if (formData.permPin) submitData.append('perm_pin', formData.permPin);
    if (formData.permMobile) submitData.append('perm_mobile', formData.permMobile);
    if (formData.tempAddress) submitData.append('temp_address', formData.tempAddress);
    if (formData.tempState) submitData.append('temp_state', formData.tempState);
    if (formData.tempPin) submitData.append('temp_pin', formData.tempPin);
    if (formData.tempMobile) submitData.append('temp_mobile', formData.tempMobile);
    
    if (formData.bankName) submitData.append('bank_name', formData.bankName);
    if (formData.accountNumber) submitData.append('account_number', formData.accountNumber);
    if (formData.ifscCode) submitData.append('ifsc_code', formData.ifscCode);
    if (formData.aadhar) submitData.append('aadhar_number', formData.aadhar);
    if (formData.panCard) submitData.append('pan_number', formData.panCard);
    if (formData.voterId) submitData.append('voter_id', formData.voterId);
    if (formData.drivingLicence) submitData.append('driving_licence', formData.drivingLicence);
    if (formData.passportNo) submitData.append('passport_no', formData.passportNo);
    
    if (formData.shiftStart) submitData.append('shift_start', formData.shiftStart);
    if (formData.shiftEnd) submitData.append('shift_end', formData.shiftEnd);

    submitData.append('languages_json', JSON.stringify(languages));
    submitData.append('education_json', JSON.stringify(education));
    submitData.append('experience_json', JSON.stringify(experience));
    submitData.append('family_json', JSON.stringify(family));
    submitData.append('references_json', JSON.stringify(references));

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

    const extraDocsInfo = [];
    extraDocuments.forEach((doc, idx) => {
      if (doc.title.trim() && doc.file) {
        submitData.append('extra_files', doc.file); 
        extraDocsInfo.push({ title: doc.title, originalName: doc.file.name });
      }
    });
    if (extraDocsInfo.length > 0) {
      submitData.append('extra_docs_info', JSON.stringify(extraDocsInfo));
    }

    if (loggedInEmail) { submitData.append('onboarded_by_email', loggedInEmail); }

    setIsProcessing(true);
    const res = await fetch(`https://lizza-facility-management.vercel.app/api/manager/add-employee`, { method: 'POST', body: submitData });
    if (res.ok) {
        alert(`✅ Registration Successful!\n\nThe application has been successfully submitted to the Admin Panel for final verification.\n\nTemporary Login: ${formData.dob.split('-').reverse().join('')}`); 
        onSuccess(); 
    } else { 
        const data = await res.json();
        setError(data.detail ? JSON.stringify(data.detail) : "Submission failed."); 
    }
    setIsProcessing(false);
  };

  return (
    <>
      <style>
        {`
          .wizard-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          .glass-card { background: #ffffff; border-radius: 20px; border: none; box-shadow: 0 4px 15px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s; }
          .active-scale:active { transform: scale(0.96); transition: transform 0.1s; }
          .fade-in { animation: fadeInAnim 0.5s ease-in-out forwards; }
          @keyframes fadeInAnim { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          
          .custom-input { border-radius: 12px; background-color: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 16px; font-size: 15px; color: #1e293b; transition: all 0.2s; }
          .custom-input:focus { background-color: #fff; border-color: #f30c0c; box-shadow: 0 0 0 4px rgba(245, 16, 16, 0.1); outline: none; }
          
          .file-upload-wrapper { position: relative; border: 2px dashed #cbd5e1; border-radius: 16px; padding: 24px 16px; text-align: center; background: #f8fafc; transition: all 0.2s; cursor: pointer; }
          .file-upload-wrapper:hover { border-color: #e80c0c; background: #eff6ff; }
          .file-upload-wrapper input[type="file"] { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
          
          .btn-premium { border-radius: 100px; padding: 14px 28px; font-weight: 600; font-size: 15px; transition: all 0.2s; }
          .section-title { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 700; margin-bottom: 16px; }
          
          .sticky-bottom-bar { position: sticky; bottom: 0; z-index: 1000; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border-top: 1px solid #e2e8f0; padding: 16px; }
        `}
      </style>

      <div className="wizard-ui">
        <Form onSubmit={handleSubmit} className="pb-5">
            
            <div className="text-center mb-4 pt-4 px-3">
                <ShieldCheck size={36} className="text-primary mb-2" />
                <h4 className="fw-bolder text-dark mb-1">New Personnel Setup</h4>
                <p className="text-muted small">Complete the digital onboarding process</p>
            </div>

            <div className="px-4 mb-4">
                <div className="position-relative mx-auto" style={{maxWidth: '400px'}}>
                    <div className="progress position-absolute top-50 start-0 w-100 translate-middle-y" style={{height: '4px', zIndex: 0}}>
                        <div className="progress-bar bg-primary" style={{width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%`, transition: '0.4s ease-in-out'}}></div>
                    </div>
                    <div className="d-flex justify-content-between position-relative z-1">
                        {[1, 2, 3, 4].map(step => (
                            <div key={step} className={`rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm ${currentStep >= step ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-secondary'} border`} style={{width: '32px', height: '32px', transition: '0.4s ease-in-out'}}>
                                {currentStep > step ? <CheckCircle size={16}/> : step}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="text-center mt-2 fw-bold text-primary small">
                    {currentStep === 1 && "Step 1: Setup & Demographics"}
                    {currentStep === 2 && "Step 2: Work & Banking"}
                    {currentStep === 3 && "Step 3: Background & Uniform"}
                    {currentStep === 4 && "Step 4: Documents & Sign-Off"}
                </div>
            </div>

            {error && <div className="px-3"><Alert variant="danger" className="rounded-4 shadow-sm border-0 small fw-bold d-flex align-items-center"><AlertTriangle size={18} className="me-2 flex-shrink-0"/>{error}</Alert></div>}
            
            <Modal show={showCropModal} onHide={() => setShowCropModal(false)} centered backdrop="static">
                <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold fs-5">Crop QR Code</Modal.Title></Modal.Header>
                <Modal.Body className="text-center bg-light">
                    <p className="small text-muted mb-3">Drag the box so it <b>ONLY</b> covers the QR code.</p>
                    {cropImageSrc && (
                        <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={1}>
                            <img ref={imgRef} src={cropImageSrc} alt="Crop me" style={{ maxHeight: '50vh', maxWidth: '100%', borderRadius: '8px' }} />
                        </ReactCrop>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-0 bg-light">
                    <Button variant="light" className="btn-premium px-4" onClick={() => setShowCropModal(false)}>Cancel</Button>
                    <Button variant="primary" className="btn-premium px-4 shadow-sm" onClick={processCrop}>Confirm Crop</Button>
                </Modal.Footer>
            </Modal>

            {/* ================= STEP 1: VERIFICATION & PERSONAL INFO ================= */}
            <div id="step-1" className={currentStep === 1 ? 'fade-in px-3' : 'd-none'}>
                <Card className="glass-card mb-4 border">
                    <Card.Body className="p-4">
                        <div className="section-title text-primary border-bottom pb-2">Verification Mode</div>
                        <div className="d-flex flex-column flex-md-row gap-3 mt-3">
                            <label className={`w-100 p-3 rounded-4 border ${kycMode === 'aadhaar_xml' ? 'border-primary bg-primary bg-opacity-10' : 'bg-light'} d-flex align-items-center`} style={{cursor: 'pointer'}}>
                                <Form.Check type="radio" checked={kycMode === 'aadhaar_xml'} onChange={() => { setKycMode('aadhaar_xml'); setKycStatus('pending'); }} className="me-3 mb-0" style={{transform: 'scale(1.2)'}}/>
                                <span className={`fw-bold ${kycMode === 'aadhaar_xml' ? 'text-primary' : 'text-dark'}`}>Offline XML</span>
                            </label>
                            <label className={`w-100 p-3 rounded-4 border ${kycMode === 'aadhaar_qr' ? 'border-primary bg-primary bg-opacity-10' : 'bg-light'} d-flex align-items-center`} style={{cursor: 'pointer'}}>
                                <Form.Check type="radio" checked={kycMode === 'aadhaar_qr'} onChange={() => { setKycMode('aadhaar_qr'); setKycStatus('pending'); setQrImage(null); setQrPreview(null); }} className="me-3 mb-0" style={{transform: 'scale(1.2)'}}/>
                                <span className={`fw-bold ${kycMode === 'aadhaar_qr' ? 'text-primary' : 'text-dark'}`}>QR Scan</span>
                            </label>
                            <label className={`w-100 p-3 rounded-4 border ${kycMode === 'without_aadhaar' ? 'border-danger bg-danger bg-opacity-10' : 'bg-light'} d-flex align-items-center`} style={{cursor: 'pointer'}}>
                                <Form.Check type="radio" checked={kycMode === 'without_aadhaar'} onChange={() => { setKycMode('without_aadhaar'); setKycStatus('pending'); }} className="me-3 mb-0" style={{transform: 'scale(1.2)'}}/>
                                <span className={`fw-bold ${kycMode === 'without_aadhaar' ? 'text-danger' : 'text-dark'}`}>Manual Setup</span>
                            </label>
                        </div>
                    </Card.Body>
                </Card>

                {kycStatus === 'pending' && kycMode === 'aadhaar_xml' && (
                    <Card className="glass-card mb-4 border-info">
                    <Card.Body className="p-4 text-center">
                        <UploadCloud size={36} className="mb-3 text-info"/>
                        <h6 className="fw-bold fs-5">Upload Paperless XML/ZIP</h6>
                        <p className="text-muted small mb-4">Securely extract identity details offline.</p>
                        <div className="mx-auto" style={{maxWidth: '300px'}}>
                        <div className="file-upload-wrapper mb-3">
                            <span className="fw-bold text-dark small">Tap to select .zip file</span>
                            <Form.Control type="file" accept=".zip,.xml" onChange={(e) => setEkycZip(e.target.files[0])} />
                            {ekycZip && <div className="text-success mt-2 small fw-bold">{ekycZip.name}</div>}
                        </div>
                        <Form.Control type="password" placeholder="4-Digit Share Code" className="custom-input text-center fw-bold letter-spacing-wide mb-3" value={shareCode} onChange={(e) => setShareCode(e.target.value)} />
                        <Button type="button" variant="info" className="w-100 btn-premium text-white shadow-sm" onClick={() => handleKycVerification('xml')} disabled={isProcessing}>{isProcessing ? 'Verifying...' : 'Extract & Verify'}</Button>
                        </div>
                    </Card.Body>
                    </Card>
                )}

                {kycStatus === 'pending' && kycMode === 'aadhaar_qr' && (
                    <Card className="glass-card mb-4 border-primary">
                    <Card.Body className="p-4 text-center">
                        <QrCode size={36} className="mb-3 text-primary"/>
                        <h6 className="fw-bold fs-5">Scan Verified QR Code</h6>
                        <div className="d-flex flex-column gap-3 my-4 mx-auto" style={{maxWidth: '300px'}}>
                        <div className="file-upload-wrapper">
                            <UploadCloud size={20} className="mb-2 text-primary" />
                            <div className="fw-bold text-dark small">Upload QR Image</div>
                            <input type="file" accept="image/*" onChange={handleQrCapture} />
                        </div>
                        <div className="file-upload-wrapper bg-primary bg-opacity-10 border-primary">
                            <Camera size={20} className="mb-2 text-primary" />
                            <div className="fw-bold text-primary small">Take Photo of QR</div>
                            <input type="file" accept="image/*" capture="environment" onChange={handleQrCapture} />
                        </div>
                        </div>
                        {qrPreview && <div className="mb-4"><Image src={qrPreview} className="rounded-4 shadow-sm" style={{ maxHeight: '120px' }} /></div>}
                        <Button type="button" variant="dark" onClick={() => handleKycVerification('qr')} disabled={!qrImage || isProcessing} className="w-100 btn-premium shadow-sm mx-auto" style={{maxWidth: '300px'}}>{isProcessing ? 'Scanning...' : 'Verify Extracted QR'}</Button>
                    </Card.Body>
                    </Card>
                )}

                {kycStatus === 'verified' && kycMode !== 'without_aadhaar' && (
                    <Alert variant="success" className="rounded-4 p-4 fw-bold text-center shadow-sm border-0 mb-4 d-flex flex-column align-items-center">
                        <CheckCircle size={36} className="mb-2 text-success"/> 
                        <span className="fs-5">KYC Verified Successfully</span>
                        <small className="text-muted fw-normal mt-1">Form has been unlocked.</small>
                    </Alert>
                )}

                {(kycStatus === 'verified' || kycMode === 'without_aadhaar') && (
                    <Card className="glass-card mb-4 border">
                        <Card.Body className="p-4">
                            <div className="text-center mb-4">
                                <div className="position-relative d-inline-block">
                                <Image src={previews.profile || "https://via.placeholder.com/120"} roundedCircle className="shadow-sm" style={{ width: '120px', height: '120px', objectFit: 'cover', border: '4px solid #0d6efd', backgroundColor: '#fff' }} />
                                <label htmlFor="prof-up" className="position-absolute bottom-0 end-0 bg-primary text-white rounded-circle p-2 shadow active-scale" style={{ cursor: 'pointer', transform: 'translate(10%, 10%)' }}>
                                    <Camera size={20} />
                                </label>
                                <input id="prof-up" type="file" hidden accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
                                </div>
                                <p className="small text-muted mt-3 fw-bold">Live Applicant Photo <span className="text-danger">*</span></p>
                            </div>

                            <div className="section-title text-primary border-bottom pb-2">Identity Details</div>
                            <Row className="g-3 mt-1">
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">First Name <span className="text-danger">*</span></Form.Label>
                                    <Form.Control className="custom-input" required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Last Name <span className="text-danger">*</span></Form.Label>
                                    <Form.Control className="custom-input" required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Date of Birth <span className="text-danger">*</span></Form.Label>
                                    <Form.Control className="custom-input" type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Primary Mobile No <span className="text-danger">*</span></Form.Label>
                                    <Form.Control className="custom-input" required type="tel" pattern="\d{10}" maxLength="10" minLength="10" placeholder="10-digit number" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value.replace(/\D/g, '')})} />
                                </Col>
                                <Col xs={12} md={12}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Personal Email {['manager', 'field_officer', 'hr', 'admin'].includes(formData.userType) && <span className="text-danger">*</span>}</Form.Label>
                                    <Form.Control className="custom-input" required={['manager', 'field_officer', 'hr', 'admin'].includes(formData.userType)} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder={formData.userType === 'employee' ? "Optional for Ground Staff" : "Required for Supervisors/HR"} />
                                </Col>
                                <Col xs={6} md={4}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Gender</Form.Label>
                                    <Form.Select className="custom-input" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                                        <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                                    </Form.Select>
                                </Col>
                                <Col xs={6} md={4}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Marital Status</Form.Label>
                                    <Form.Select className="custom-input" value={formData.maritalStatus} onChange={e => setFormData({...formData, maritalStatus: e.target.value})}>
                                        <option value="">Select</option><option value="Single">Single</option><option value="Married">Married</option>
                                    </Form.Select>
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Identity Mark</Form.Label>
                                    <Form.Control className="custom-input" value={formData.identityMark} onChange={e => setFormData({...formData, identityMark: e.target.value})} />
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Father's Name</Form.Label>
                                    <Form.Control className="custom-input" value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} />
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Label className="small fw-bold text-muted ps-1">Mother's Name</Form.Label>
                                    <Form.Control className="custom-input" value={formData.motherName} onChange={e => setFormData({...formData, motherName: e.target.value})} />
                                </Col>
                            </Row>

                            <h6 className="fw-bold border-bottom pb-2 text-primary mt-4">Medical & Demographics</h6>
                            <Row className="g-3 mt-1">
                                <Col xs={6} md={3}><Form.Label className="small fw-bold text-muted ps-1">Height (cm)</Form.Label><Form.Control className="custom-input" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} /></Col>
                                <Col xs={6} md={3}><Form.Label className="small fw-bold text-muted ps-1">Blood Group</Form.Label><Form.Control className="custom-input" value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})} /></Col>
                                <Col xs={6} md={3}><Form.Label className="small fw-bold text-muted ps-1">Caste</Form.Label><Form.Control className="custom-input" value={formData.caste} onChange={e => setFormData({...formData, caste: e.target.value})} /></Col>
                                <Col xs={6} md={3}><Form.Label className="small fw-bold text-muted ps-1">Category</Form.Label><Form.Control className="custom-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} /></Col>
                                <Col xs={12} md={6}><Form.Label className="small fw-bold text-muted ps-1">Religion</Form.Label><Form.Control className="custom-input" value={formData.religion} onChange={e => setFormData({...formData, religion: e.target.value})} /></Col>
                                <Col xs={12} md={6}><Form.Label className="small fw-bold text-muted ps-1">Nationality</Form.Label><Form.Control className="custom-input" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} /></Col>
                                <Col xs={12}><Form.Label className="small fw-bold text-muted ps-1">Medical Remarks (If any)</Form.Label><Form.Control as="textarea" rows={2} className="custom-input" value={formData.medicalRemarks} onChange={e => setFormData({...formData, medicalRemarks: e.target.value})} /></Col>
                            </Row>
                        </Card.Body>
                    </Card>
                )}
            </div>

            {/* ================= STEP 2: WORK & BANK ================= */}
            <div id="step-2" className={currentStep === 2 ? 'fade-in px-3' : 'd-none'}>
                <Card className="glass-card mb-4 border">
                    <Card.Body className="p-4">
                        <div className="section-title text-primary border-bottom pb-2">Address Details</div>
                        <Row className="g-3 mt-1">
                            <Col md={6}>
                                <h6 className="fw-bold mb-3 text-dark">Permanent Address</h6>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">Full Address</Form.Label><Form.Control as="textarea" rows={2} className="custom-input" value={formData.permAddress} onChange={e => setFormData({...formData, permAddress: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">State</Form.Label><Form.Control className="custom-input" value={formData.permState} onChange={e => setFormData({...formData, permState: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">PIN Code</Form.Label><Form.Control className="custom-input" value={formData.permPin} onChange={e => setFormData({...formData, permPin: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">Alt. Mobile No</Form.Label><Form.Control className="custom-input" value={formData.permMobile} onChange={e => setFormData({...formData, permMobile: e.target.value})} /></Form.Group>
                            </Col>
                            <Col md={6}>
                                <h6 className="fw-bold mb-3 text-dark mt-4 mt-md-0">Temporary / Local Address</h6>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">Full Address</Form.Label><Form.Control as="textarea" rows={2} className="custom-input" value={formData.tempAddress} onChange={e => setFormData({...formData, tempAddress: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">State</Form.Label><Form.Control className="custom-input" value={formData.tempState} onChange={e => setFormData({...formData, tempState: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">PIN Code</Form.Label><Form.Control className="custom-input" value={formData.tempPin} onChange={e => setFormData({...formData, tempPin: e.target.value})} /></Form.Group>
                                <Form.Group className="mb-2"><Form.Label className="small fw-bold text-muted">Local Mobile No</Form.Label><Form.Control className="custom-input" value={formData.tempMobile} onChange={e => setFormData({...formData, tempMobile: e.target.value})} /></Form.Group>
                            </Col>
                        </Row>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Work Allocation</div>
                        <Row className="g-3 mt-1">
                            <Col xs={12} md={4}>
                            <Form.Label className="small fw-bold text-muted ps-1">Department <span className="text-danger">*</span></Form.Label>
                            <Form.Select className="custom-input" required value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}>
                                <option value="Security">Security</option>
                                <option value="Housekeeping">Housekeeping</option>
                                <option value="Operations">Operations / General</option>
                                <option value="HR">Human Resources</option>
                            </Form.Select>
                            </Col>
                            <Col xs={12} md={4}>
                            <Form.Label className="small fw-bold text-muted ps-1">Designation (Title) <span className="text-danger">*</span></Form.Label>
                            <Form.Control className="custom-input" required value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Guard, Supervisor" />
                            </Col>
                            <Col xs={12} md={4}>
                            <Form.Label className="small fw-bold text-danger ps-1">App Access Role *</Form.Label>
                            <Form.Select className="custom-input border-danger bg-danger bg-opacity-10 fw-bold" required value={formData.userType} onChange={e => setFormData({...formData, userType: e.target.value})}>
                                <option value="employee">Ground Staff (Guard)</option>
                                <option value="field_officer">Field Officer</option>
                                <option value="manager">Site Manager</option>
                                <option value="hr">HR Administrator</option>
                            </Form.Select>
                            </Col>
                        </Row>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Banking Details</div>
                        <Row className="g-3 mt-1">
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-muted ps-1">Bank Name</Form.Label>
                                <Form.Control className="custom-input" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} />
                            </Col>
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-muted ps-1">IFSC Code</Form.Label>
                                <Form.Control className="custom-input" value={formData.ifscCode} onChange={e => setFormData({...formData, ifscCode: e.target.value})} />
                            </Col>
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-muted ps-1">Account Number</Form.Label>
                                <Form.Control className="custom-input" type="password" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
                            </Col>
                            <Col xs={12}>
                                <div className="file-upload-wrapper p-3 mt-2 bg-light">
                                    <UploadCloud size={20} className="text-primary mb-2" />
                                    <div className="fw-bold text-dark small">Tap to upload Bank Passbook / Cheque Copy</div>
                                    <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'bankPassbook')} />
                                    {files.bankPassbook && <div className="text-success mt-2 small fw-bold"><CheckCircle size={14} className="me-1"/> File Selected</div>}
                                </div>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>
            </div>

            {/* ================= STEP 3: BACKGROUND & UNIFORM ================= */}
            <div id="step-3" className={currentStep === 3 ? 'fade-in px-3' : 'd-none'}>
                <Card className="glass-card mb-4 border">
                    <Card.Body className="p-4">
                        <div className="section-title text-primary border-bottom pb-2">Uniform Provisioning</div>
                        <Row className="g-3 bg-light p-3 rounded-4 mx-0 mt-1 border">
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-dark ps-1">Shirt Size</Form.Label>
                                <Form.Select className="custom-input border-0 shadow-sm" value={formData.uniformShirt} onChange={e => setFormData({...formData, uniformShirt: e.target.value})}>
                                    <option value="">Select Size...</option><option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option><option value="XXL">XXL</option>
                                </Form.Select>
                            </Col>
                            <Col xs={6} md={4}>
                                <Form.Label className="small fw-bold text-dark ps-1">Pant Waist</Form.Label>
                                <Form.Control className="custom-input border-0 shadow-sm" type="number" placeholder="e.g. 32" value={formData.uniformPant} onChange={e => setFormData({...formData, uniformPant: e.target.value})} />
                            </Col>
                            <Col xs={6} md={4}>
                                <Form.Label className="small fw-bold text-dark ps-1">Shoe (UK/IN)</Form.Label>
                                <Form.Control className="custom-input border-0 shadow-sm" type="number" placeholder="e.g. 9" value={formData.uniformShoe} onChange={e => setFormData({...formData, uniformShoe: e.target.value})} />
                            </Col>
                        </Row>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Language Proficiency</div>
                        {languages.map((lang, idx) => (
                            <Row key={idx} className="g-2 mb-2 align-items-center">
                                <Col xs={12} md={4}><Form.Control className="custom-input" placeholder="Language" value={lang.name} onChange={e => { const newLang = [...languages]; newLang[idx].name = e.target.value; setLanguages(newLang); }} /></Col>
                                <Col xs={4} md={2}><Form.Check type="checkbox" label="Read" checked={lang.read} onChange={e => { const newLang = [...languages]; newLang[idx].read = e.target.checked; setLanguages(newLang); }} className="ms-2 fw-bold small text-muted" /></Col>
                                <Col xs={4} md={2}><Form.Check type="checkbox" label="Write" checked={lang.write} onChange={e => { const newLang = [...languages]; newLang[idx].write = e.target.checked; setLanguages(newLang); }} className="fw-bold small text-muted"/></Col>
                                <Col xs={4} md={2}><Form.Check type="checkbox" label="Speak" checked={lang.speak} onChange={e => { const newLang = [...languages]; newLang[idx].speak = e.target.checked; setLanguages(newLang); }} className="fw-bold small text-muted"/></Col>
                            </Row>
                        ))}
                        <Button type="button" variant="outline-primary" size="sm" className="rounded-pill px-3 mt-2 fw-bold" onClick={() => setLanguages([...languages, { name: '', read: false, write: false, speak: false }])}><Plus size={14} className="me-1"/> Add Language</Button>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Educational Qualification</div>
                        {education.map((edu, idx) => (
                            <Row key={idx} className="g-2 mb-2">
                                <Col xs={12} md={3}><Form.Control className="custom-input" placeholder="Qualification" value={edu.qualification} onChange={e => { const newEdu = [...education]; newEdu[idx].qualification = e.target.value; setEducation(newEdu); }} /></Col>
                                <Col xs={6} md={3}><Form.Control className="custom-input" placeholder="Year" value={edu.year} onChange={e => { const newEdu = [...education]; newEdu[idx].year = e.target.value; setEducation(newEdu); }} /></Col>
                                <Col xs={12} md={3}><Form.Control className="custom-input" placeholder="Institute/University" value={edu.institute} onChange={e => { const newEdu = [...education]; newEdu[idx].institute = e.target.value; setEducation(newEdu); }} /></Col>
                                <Col xs={6} md={3}><Form.Control className="custom-input" placeholder="Marks %" value={edu.marks} onChange={e => { const newEdu = [...education]; newEdu[idx].marks = e.target.value; setEducation(newEdu); }} /></Col>
                            </Row>
                        ))}
                        <Button type="button" variant="outline-primary" size="sm" className="rounded-pill px-3 mt-2 fw-bold" onClick={() => setEducation([...education, { qualification: '', year: '', institute: '', marks: '' }])}><Plus size={14} className="me-1"/> Add Education</Button>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Work Experience</div>
                        {experience.map((exp, idx) => (
                            <Row key={idx} className="g-2 mb-2">
                                <Col xs={12} md={4}><Form.Control className="custom-input" placeholder="Company Name" value={exp.company} onChange={e => { const newExp = [...experience]; newExp[idx].company = e.target.value; setExperience(newExp); }} /></Col>
                                <Col xs={6} md={4}><Form.Control className="custom-input" placeholder="Period" value={exp.period} onChange={e => { const newExp = [...experience]; newExp[idx].period = e.target.value; setExperience(newExp); }} /></Col>
                                <Col xs={6} md={4}><Form.Control className="custom-input" placeholder="Designation" value={exp.designation} onChange={e => { const newExp = [...experience]; newExp[idx].designation = e.target.value; setExperience(newExp); }} /></Col>
                            </Row>
                        ))}
                        <Button type="button" variant="outline-primary" size="sm" className="rounded-pill px-3 mt-2 fw-bold" onClick={() => setExperience([...experience, { company: '', period: '', designation: '' }])}><Plus size={14} className="me-1"/> Add Experience</Button>
                    </Card.Body>
                </Card>
            </div>

            {/* ================= STEP 4: DOCS & SUBMIT ================= */}
            <div id="step-4" className={currentStep === 4 ? 'fade-in px-3' : 'd-none'}>
                <Card className="glass-card mb-4 border">
                    <Card.Body className="p-4">
                        <div className="section-title text-primary border-bottom pb-2">Government IDs Upload</div>
                        <Row className="g-3 mt-1">
                            <Col xs={12} className="mb-2">
                                <div className="file-upload-wrapper mt-2 border-warning bg-warning bg-opacity-10">
                                    <UploadCloud size={24} className="text-warning mb-2" />
                                    <div className="fw-bold text-dark small">Tap to upload Gov ID Copy (Front & Back) <span className="text-danger">*</span></div>
                                    <input type="file" required={currentStep === 4} accept="image/*,.pdf" onChange={(e) => handleFileChange(e, 'aadharPhoto')} />
                                    {files.aadharPhoto && <div className="text-success mt-2 small fw-bold"><CheckCircle size={14} className="me-1"/> File Selected</div>}
                                </div>
                                {kycMode !== 'without_aadhaar' && <small className="text-muted d-block mt-2 text-center">Required for physical record keeping, even when e-KYC is verified.</small>}
                            </Col>
                        </Row>

                        <Row className="g-3 mt-3 pt-3 border-top">
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">PAN Card Number</Form.Label>
                                <Form.Control className="custom-input mb-2" value={formData.panCard} onChange={e => setFormData({...formData, panCard: e.target.value})} />
                                <div className="file-upload-wrapper p-3 bg-light">
                                    <UploadCloud size={18} className="text-primary mb-1" />
                                    <div className="fw-bold text-dark" style={{fontSize: '12px'}}>Upload PAN Photo</div>
                                    <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'panPhoto')} />
                                    {files.panPhoto && <div className="text-success mt-1 fw-bold" style={{fontSize:'10px'}}><CheckCircle size={12} className="me-1"/> Selected</div>}
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Voter ID</Form.Label>
                                <Form.Control className="custom-input mb-2" value={formData.voterId} onChange={e => setFormData({...formData, voterId: e.target.value})} />
                                <div className="file-upload-wrapper p-3 bg-light">
                                    <UploadCloud size={18} className="text-primary mb-1" />
                                    <div className="fw-bold text-dark" style={{fontSize: '12px'}}>Upload Voter ID Photo</div>
                                    <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'voterPhoto')} />
                                    {files.voterPhoto && <div className="text-success mt-1 fw-bold" style={{fontSize:'10px'}}><CheckCircle size={12} className="me-1"/> Selected</div>}
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Driving Licence</Form.Label>
                                <Form.Control className="custom-input mb-2" value={formData.drivingLicence} onChange={e => setFormData({...formData, drivingLicence: e.target.value})} />
                                <div className="file-upload-wrapper p-3 bg-light">
                                    <UploadCloud size={18} className="text-primary mb-1" />
                                    <div className="fw-bold text-dark" style={{fontSize: '12px'}}>Upload DL Photo</div>
                                    <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'dlPhoto')} />
                                    {files.dlPhoto && <div className="text-success mt-1 fw-bold" style={{fontSize:'10px'}}><CheckCircle size={12} className="me-1"/> Selected</div>}
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Passport Number</Form.Label>
                                <Form.Control className="custom-input mb-2" value={formData.passportNo} onChange={e => setFormData({...formData, passportNo: e.target.value})} />
                                <div className="file-upload-wrapper p-3 bg-light">
                                    <UploadCloud size={18} className="text-primary mb-1" />
                                    <div className="fw-bold text-dark" style={{fontSize: '12px'}}>Upload Passport Photo</div>
                                    <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'passportPhoto')} />
                                    {files.passportPhoto && <div className="text-success mt-1 fw-bold" style={{fontSize:'10px'}}><CheckCircle size={12} className="me-1"/> Selected</div>}
                                </div>
                            </Col>
                        </Row>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Additional Documents</div>
                        {extraDocuments.map((doc, idx) => (
                            <Row key={idx} className="g-2 mb-3 align-items-center bg-light p-2 rounded-4 border mx-0">
                                <Col xs={12} md={5}>
                                    <Form.Control size="sm" className="custom-input border-0" placeholder="Document Title (e.g. Police Verification)" value={doc.title} onChange={e => { const newDocs = [...extraDocuments]; newDocs[idx].title = e.target.value; setExtraDocuments(newDocs); }} />
                                </Col>
                                <Col xs={10} md={6}>
                                    <div className="file-upload-wrapper py-2" style={{minHeight: '45px'}}>
                                        <div className="fw-bold text-dark" style={{fontSize: '12px'}}>Tap to select file</div>
                                        <input type="file" accept="image/*,.pdf" onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                if (file.size > 15 * 1024 * 1024) { alert("Max 15MB"); e.target.value = ""; return; }
                                                const newDocs = [...extraDocuments];
                                                if (file.type.startsWith('image/')) { newDocs[idx].file = await compressImage(file); } 
                                                else { newDocs[idx].file = file; }
                                                setExtraDocuments(newDocs);
                                            }
                                        }} />
                                    </div>
                                    {doc.file && <div className="text-success mt-1 fw-bold" style={{fontSize:'10px'}}><CheckCircle size={12}/> {doc.file.name}</div>}
                                </Col>
                                <Col xs={2} md={1} className="text-center">
                                    {extraDocuments.length > 1 && (
                                        <Button type="button" size="sm" variant="outline-danger" className="rounded-circle p-2" onClick={() => {
                                            const newDocs = extraDocuments.filter((_, i) => i !== idx); setExtraDocuments(newDocs);
                                        }}><Trash size={14} /></Button>
                                    )}
                                </Col>
                            </Row>
                        ))}
                        <Button type="button" size="sm" variant="outline-primary" className="rounded-pill px-3 mt-2 fw-bold" onClick={() => setExtraDocuments([...extraDocuments, { title: '', file: null }])}>
                            <Plus size={14} className="me-1"/> Add Extra Document
                        </Button>

                        {kycMode === 'without_aadhaar' && (
                            <div className="mt-5 border border-danger p-3 rounded-4 bg-danger bg-opacity-10">
                                <h6 className="text-danger fw-bold d-flex align-items-center"><Fingerprint className="me-2" /> Mandatory Fingerprint Impressions</h6>
                                <p className="small text-muted mb-4">Upload documents containing all 5 finger impressions (Thumb, Index, Middle, Ring, Small) for both hands.</p>
                                <Row className="g-3">
                                    <Col xs={12} md={6}>
                                        <div className="file-upload-wrapper border-danger bg-white">
                                            <div className="fw-bold small text-danger mb-2">LEFT Hand Impressions *</div>
                                            <input type="file" accept="image/*,.pdf" required={currentStep === 4 && kycMode === 'without_aadhaar'} onChange={(e) => handleFileChange(e, 'fingerprintsLeft')} />
                                            {files.fingerprintsLeft && <div className="text-success mt-2 small fw-bold"><CheckCircle size={14} className="me-1"/> Selected</div>}
                                        </div>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <div className="file-upload-wrapper border-danger bg-white">
                                            <div className="fw-bold small text-danger mb-2">RIGHT Hand Impressions *</div>
                                            <input type="file" accept="image/*,.pdf" required={currentStep === 4 && kycMode === 'without_aadhaar'} onChange={(e) => handleFileChange(e, 'fingerprintsRight')} />
                                            {files.fingerprintsRight && <div className="text-success mt-2 small fw-bold"><CheckCircle size={14} className="me-1"/> Selected</div>}
                                        </div>
                                    </Col>
                                </Row>
                            </div>
                        )}

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Family Details</div>
                        {family.map((fam, idx) => (
                            <Row key={idx} className="g-2 mb-2">
                                <Col xs={12} md={4}><Form.Control className="custom-input" placeholder="Name" value={fam.name} onChange={e => { const newFam = [...family]; newFam[idx].name = e.target.value; setFamily(newFam); }} /></Col>
                                <Col xs={6} md={4}><Form.Control className="custom-input" type="date" placeholder="DOB" value={fam.dob} onChange={e => { const newFam = [...family]; newFam[idx].dob = e.target.value; setFamily(newFam); }} /></Col>
                                <Col xs={6} md={4}><Form.Control className="custom-input" placeholder="Relation" value={fam.relation} onChange={e => { const newFam = [...family]; newFam[idx].relation = e.target.value; setFamily(newFam); }} /></Col>
                            </Row>
                        ))}
                        <Button type="button" variant="outline-primary" size="sm" className="rounded-pill px-3 mt-2 fw-bold" onClick={() => setFamily([...family, { name: '', dob: '', relation: '' }])}><Plus size={14} className="me-1"/> Add Family Member</Button>

                        <div className="section-title text-primary border-bottom pb-2 mt-5">Verification References</div>
                        <Row className="g-4">
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Local Reference 1</Form.Label>
                                <Form.Control className="custom-input mb-2" placeholder="Name" value={references.local1.name} onChange={e => setReferences({...references, local1: {...references.local1, name: e.target.value}})} />
                                <Form.Control className="custom-input mb-2" placeholder="Contact No" value={references.local1.contact} onChange={e => setReferences({...references, local1: {...references.local1, contact: e.target.value}})} />
                                <Form.Control className="custom-input" placeholder="Relationship" value={references.local1.relation} onChange={e => setReferences({...references, local1: {...references.local1, relation: e.target.value}})} />
                            </Col>
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Local Reference 2</Form.Label>
                                <Form.Control className="custom-input mb-2" placeholder="Name" value={references.local2.name} onChange={e => setReferences({...references, local2: {...references.local2, name: e.target.value}})} />
                                <Form.Control className="custom-input mb-2" placeholder="Contact No" value={references.local2.contact} onChange={e => setReferences({...references, local2: {...references.local2, contact: e.target.value}})} />
                                <Form.Control className="custom-input" placeholder="Relationship" value={references.local2.relation} onChange={e => setReferences({...references, local2: {...references.local2, relation: e.target.value}})} />
                            </Col>
                        </Row>

                    </Card.Body>
                </Card>

                <Card className="glass-card mb-4 border-primary bg-primary bg-opacity-10 border-2">
                    <Card.Body className="p-4">
                    <div className="section-title text-primary border-bottom border-primary border-opacity-25 pb-2 d-flex align-items-center"><FileText className="me-2" size={18}/> Declarations & Terms</div>
                    <div className="bg-white p-4 rounded-4 mb-4 mt-3 border shadow-sm" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.85rem' }}>
                        <ol className="mb-0 ps-3">
                        {companyTerms.map((term, index) => (
                            <li key={index} className="mb-3 text-muted">{term}</li>
                        ))}
                        </ol>
                    </div>
                    <label className="d-flex align-items-start p-3 bg-white rounded-4 border shadow-sm" style={{cursor: 'pointer'}}>
                        <Form.Check type="checkbox" id="terms-checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 me-3" style={{transform: 'scale(1.2)'}} />
                        <span className="fw-bold text-danger small">I have read, understood, and accept all the terms and conditions outlined above.</span>
                    </label>
                    </Card.Body>
                </Card>
            </div>

            {/* ================= STICKY BOTTOM BAR ================= */}
            <div className="sticky-bottom-bar mx-n3 mx-md-0 px-3 px-md-4 d-flex justify-content-between gap-3 shadow-lg">
                {currentStep === 1 ? (
                    <Button type="button" variant="light" className="btn-premium px-4 border active-scale text-muted" onClick={onCancel}>Cancel</Button>
                ) : (
                    <Button type="button" variant="light" className="btn-premium px-4 border active-scale text-dark d-flex align-items-center" onClick={handlePrev}><ChevronLeft size={18} className="me-1"/> Back</Button>
                )}
                
                {currentStep < totalSteps ? (
                    <Button type="button" variant="primary" className="btn-premium px-5 shadow-sm d-flex align-items-center active-scale" onClick={handleNext}>
                        Next <ChevronRight size={18} className="ms-1"/>
                    </Button>
                ) : (
                    <Button type="submit" variant="primary" className="btn-premium px-5 shadow-sm d-flex align-items-center active-scale" disabled={isProcessing || !termsAccepted}>
                        {isProcessing ? 'Submitting...' : 'Submit to HR'} {!isProcessing && <CheckCircle size={18} className="ms-1"/>}
                    </Button>
                )}
            </div>

        </Form>
      </div>
    </>
  );
};

export default EmployeeOnboardForm;