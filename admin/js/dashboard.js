document.addEventListener('DOMContentLoaded', function() {
  const addSchoolBtn = document.getElementById('addSchoolBtn');
  const modal = document.getElementById('addSchoolModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const addSchoolConfirmBtn = document.getElementById('addSchoolConfirmBtn');
  const addSchoolForm = document.getElementById('addSchoolForm');

  let schoolsData = [];

  // Get auth token
  function getAuthToken() {
    return localStorage.getItem('sb-token');
  }

  // Get auth headers
  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`
    };
  }

  // Check authentication
  if (!getAuthToken()) {
    window.location.href = '/admin/login';
    return;
  }

  // Fetch and display schools on page load
  function loadSchools() {
    fetch('/api/admin/schools', {
      headers: getHeaders()
    })
      .then(response => response.json())
      .then(schools => {
        schoolsData = schools;
        renderSchools(schools);
        updateStats(schools);
      })
      .catch(error => {
        console.error('Error fetching schools:', error);
        alert('Failed to load schools');
      });
  }

  // Update stats
  function updateStats(schools) {
    let totalStudents = 0;
    let totalClasses = new Set();

    schools.forEach(school => {
      totalStudents += school.student_count || 0;
      if (school.class_count) {
        for (let i = 0; i < school.class_count; i++) {
          totalClasses.add(i);
        }
      }
    });

    const statsContainer = document.querySelector('.stats-grid');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-number">${schools.length}</div>
          <div class="stat-label">Total Schools</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${totalStudents}</div>
          <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${totalClasses.size}</div>
          <div class="stat-label">Total Classes</div>
        </div>
      `;
    }
  }

  // Render schools table
  function renderSchools(schools) {
    const tbody = document.querySelector('table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (schools.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 32px;">No schools found</td></tr>';
      return;
    }

    schools.forEach(school => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${school.name || school.school_name}</td>
        <td>${school.school_code}</td>
        <td>${school.student_count || 0}</td>
        <td>${school.class_count || 0}</td>
        <td>
          <div class="action-buttons">
            <a href="/admin/school/${school.id}" class="btn-small btn-view">View →</a>
            <a href="/api/admin/school/${school.id}/export?token=${encodeURIComponent(getAuthToken())}" download class="btn-small btn-export">Export Excel</a>
            <a href="/api/admin/school/${school.id}/photos?token=${encodeURIComponent(getAuthToken())}" download class="btn-small btn-export">Export Photos</a>
            <button class="btn-small btn-delete" data-school-id="${school.id}" data-school-name="${school.name || school.school_name}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
      
      // Add event listener to delete button
      const deleteBtn = row.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', function() {
        deleteSchool(this.dataset.schoolId, this.dataset.schoolName);
      });
    });
  }

  // Delete school function
  function deleteSchool(schoolId, schoolName) {
    if (!confirm(`Are you sure you want to delete "${schoolName}" and all its students? This action cannot be undone.`)) {
      return;
    }

    fetch(`/api/admin/school/${schoolId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          alert('Error: ' + data.error);
          return;
        }
        // Success - reload schools
        loadSchools();
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Failed to delete school');
      });
  }

  // Open modal
  addSchoolBtn.addEventListener('click', function() {
    modal.classList.add('active');
  });

  // Close modal
  cancelBtn.addEventListener('click', function() {
    modal.classList.remove('active');
    addSchoolForm.reset();
  });

  // Handle Add School form submission
  addSchoolConfirmBtn.addEventListener('click', function(e) {
    e.preventDefault();

    const schoolName = document.getElementById('schoolName').value.trim();
    const maxStudents = document.getElementById('maxStudents').value.trim() || 60;

    if (!schoolName) {
      alert('School name is required');
      return;
    }

    fetch('/api/admin/add-school', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        name: schoolName,
        max_students_per_class: parseInt(maxStudents, 10)
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          alert('Error: ' + data.error);
          return;
        }

        // Success - close modal and reload schools
        modal.classList.remove('active');
        addSchoolForm.reset();
        loadSchools();
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Failed to add school');
      });
  });

  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.classList.remove('active');
      addSchoolForm.reset();
    }
  });

  // Load schools on page load
  loadSchools();
});
