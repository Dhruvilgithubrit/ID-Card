let schoolId = null;

// Extract school_code from URL (either query parameter or path parameter)
function getSchoolCode() {
  // Try query parameter first (form.html?school=XXX)
  const params = new URLSearchParams(window.location.search);
  const querySchool = params.get('school');
  if (querySchool) return querySchool;
  
  // Otherwise extract from path (/school/XXX)
  const pathMatch = window.location.pathname.match(/\/school\/([^/]+)/);
  return pathMatch ? pathMatch[1] : null;
}

document.addEventListener('DOMContentLoaded', function() {
  const schoolCode = getSchoolCode();
  const form = document.getElementById('registrationForm');
  const successState = document.getElementById('successState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const pageHeading = document.getElementById('pageHeading');

  // Fetch school info on page load
  if (schoolCode) {
    fetch(`/api/school/${schoolCode}`)
      .then(response => {
        if (!response.ok) throw new Error('School not found');
        return response.json();
      })
      .then(school => {
        schoolId = school.id;
        if (pageHeading) {
          pageHeading.textContent = school.name || school.school_name;
        }
      })
      .catch(error => {
        console.error('Error fetching school:', error);
        if (pageHeading) {
          pageHeading.textContent = 'School not found';
        }
      });
  }

  // ── DOB hybrid input: text field + date picker sync ──────────────────────
  const dobText   = document.getElementById('dobText');
  const dobPicker = document.getElementById('dobPicker');

  // When user picks a date from calendar → fill text field as DD-MM-YYYY
  dobPicker.addEventListener('change', function() {
    if (!this.value) return;
    const [y, m, d] = this.value.split('-');
    dobText.value = `${d}-${m}-${y}`;
  });

  // Auto-insert dashes while typing (DD-MM-YYYY)
  dobText.addEventListener('input', function() {
    let v = this.value.replace(/[^0-9]/g, '');          // digits only
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length >= 5)      v = v.slice(0,2) + '-' + v.slice(2,4) + '-' + v.slice(4);
    else if (v.length >= 3) v = v.slice(0,2) + '-' + v.slice(2);
    this.value = v;
  });

  // Handle form submission
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // Hide both states first
    successState.style.display = 'none';
    errorState.style.display = 'none';

    // Get form values
    const childName = document.getElementById('childName').value.trim();
    const dobRaw = document.getElementById('dobText').value.trim();
    const grNumber = document.getElementById('grNumber').value.trim();
    const classValue = document.getElementById('class').value.trim();
    const sectionValue = document.getElementById('section').value.trim();
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const photoFile = document.getElementById('photo').files[0];

    // Validation
    let hasError = false;
    let error = '';

    // Check all fields filled
    if (!childName || !dobRaw || !grNumber || !classValue || !sectionValue || !rollNumber || !phone || !address || !photoFile) {
      hasError = true;
      error = 'All fields are required';
    }

    if (!hasError && photoFile && photoFile.size > 5 * 1024 * 1024) {
      hasError = true;
      error = 'Student Photo must be less than 5MB';
    }

    // Parse DD-MM-YYYY and validate date of birth
    let dobISO = '';
    if (!hasError && dobRaw) {
      const dobMatch = dobRaw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (!dobMatch) {
        hasError = true;
        error = 'Date of Birth must be in DD-MM-YYYY format';
      } else {
        const [, dd, mm, yyyy] = dobMatch;
        const dobDate = new Date(`${yyyy}-${mm}-${dd}`);
        if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
          hasError = true;
          error = 'Please enter a valid date of birth';
        } else {
          dobISO = `${yyyy}-${mm}-${dd}`;  // YYYY-MM-DD for API
        }
      }
    }

    // Check phone is exactly 10 digits
    if (!hasError && !/^[0-9]{10}$/.test(phone)) {
      hasError = true;
      error = 'Phone must be exactly 10 digits';
    }

    // Check roll number is between 1-999
    const rollNum = parseInt(rollNumber, 10);
    if (!hasError && (rollNum < 1 || rollNum > 999)) {
      hasError = true;
      error = 'Roll number must be between 1 and 999';
    }

    // Show error if validation failed
    if (hasError) {
      errorMessage.textContent = error;
      errorState.style.display = 'block';
      form.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Validation passed - submit to API
    const combinedClass = classValue + '-' + sectionValue;
    
    const formData = new FormData();
    formData.append('school_id', schoolId);
    formData.append('class', combinedClass);
    formData.append('roll_number', rollNum);
    formData.append('name', childName);
    formData.append('dob', dobISO);
    formData.append('gr_number', grNumber);
    formData.append('phone', phone);
    formData.append('address', address);
    formData.append('photo', photoFile);

    fetch('/api/submit', {
      method: 'POST',
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          errorMessage.textContent = data.error;
          errorState.style.display = 'block';
          form.scrollIntoView({ behavior: 'smooth' });
          return;
        }

        // Success
        document.getElementById('successClass').textContent = combinedClass;
        document.getElementById('successRoll').textContent = rollNum;
        successState.style.display = 'block';
        form.style.display = 'none';
        errorState.style.display = 'none';
        successState.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(error => {
        console.error('Error:', error);
        errorMessage.textContent = 'Something went wrong, please try again';
        errorState.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth' });
      });
  });
});
