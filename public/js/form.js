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

  // Handle form submission
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // Hide both states first
    successState.style.display = 'none';
    errorState.style.display = 'none';

    // Get form values
    const childName = document.getElementById('childName').value.trim();
    const classValue = document.getElementById('class').value.trim();
    const sectionValue = document.getElementById('section').value.trim();
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();

    // Validation
    let hasError = false;
    let error = '';

    // Check all fields filled
    if (!childName || !classValue || !sectionValue || !rollNumber || !phone || !address) {
      hasError = true;
      error = 'All fields are required';
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
    
    fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        school_id: schoolId,
        class: combinedClass,
        roll_number: rollNum,
        name: childName,
        phone: phone,
        address: address
      })
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
