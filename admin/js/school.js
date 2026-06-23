'use strict';

/* ──────────────────────────────────────────
   State
────────────────────────────────────────── */
let schoolData   = null;
let allStudents  = [];
let schoolId     = null;

/* ──────────────────────────────────────────
   Helpers
────────────────────────────────────────── */
function getSchoolId() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

function getAuthToken() {
  return localStorage.getItem('sb-token');
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  };
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ──────────────────────────────────────────
   Render
────────────────────────────────────────── */
function renderStudents(students) {
  const container = document.getElementById('classesContainer');
  if (!container) return;

  if (students.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎓</div>
        <p>No students found matching your search.</p>
      </div>`;
    return;
  }

  // Group by class
  const byClass = {};
  students.forEach(s => {
    if (!byClass[s.class]) byClass[s.class] = [];
    byClass[s.class].push(s);
  });

  // Sort class keys numerically then alphabetically
  const sortedClasses = Object.keys(byClass).sort((a, b) => {
    const an = parseInt(a), bn = parseInt(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
  });

  container.innerHTML = '';

  sortedClasses.forEach(cls => {
    const classStudents = byClass[cls].slice().sort((a, b) => a.roll_number - b.roll_number);

    const section = document.createElement('div');
    section.className = 'class-section collapsed';
    section.innerHTML = `
      <div class="class-header">
        <div class="class-header-left">
          <span class="class-tag">Class ${cls}</span>
          <span class="class-count-pill">${classStudents.length} student${classStudents.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="class-header-right">
          <button class="btn-export-class" data-class="${cls}" title="Export Class ${cls} to Excel">⬇ Export Class ${cls}</button>
          <span class="toggle-icon">▾</span>
        </div>
      </div>
      <div class="class-body">
        <table class="students-table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Student Name</th>
              <th>DOB</th>
              ${schoolData && schoolData.wants_gr_number !== false ? '<th>GR. No</th>' : ''}
              <th>Phone</th>
              <th>Address</th>
              <th>Registered On</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${classStudents.map(s => `
              <tr data-student-id="${s.id}">
                <td><span class="roll-badge">${s.roll_number}</span></td>
                <td class="student-name">${escapeHtml(s.name)}</td>
                <td class="dob-cell">${s.dob ? formatDate(s.dob) : '—'}</td>
                ${schoolData && schoolData.wants_gr_number !== false ? `<td class="gr-cell">${s.gr_number ? escapeHtml(s.gr_number) : '—'}</td>` : ''}
                <td class="phone-cell">${escapeHtml(s.phone)}</td>
                <td class="address-cell" title="${escapeHtml(s.address)}">${escapeHtml(s.address)}</td>
                <td class="submitted-cell">${formatDate(s.submitted_at)}</td>
                <td>
                  <button class="delete-btn" data-student-id="${s.id}" title="Delete student">🗑 Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Accordion toggle — but not when clicking the export button
    section.querySelector('.class-header').addEventListener('click', e => {
      if (e.target.closest('.btn-export-class')) return;
      section.classList.toggle('collapsed');
    });

    // Class-wise export button
    section.querySelector('.btn-export-class').addEventListener('click', e => {
      e.stopPropagation();
      const cls   = e.currentTarget.getAttribute('data-class');
      const token = getAuthToken();
      window.location = `/api/admin/school/${schoolId}/export?class=${encodeURIComponent(cls)}&token=${encodeURIComponent(token)}`;
    });

    // Delete buttons
    section.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid = btn.getAttribute('data-student-id');
        const row = document.querySelector(`tr[data-student-id="${sid}"]`);
        const name = row ? row.querySelector('.student-name').textContent : 'this student';
        if (confirm(`Delete "${name}"? This cannot be undone.`)) {
          deleteStudent(sid);
        }
      });
    });

    container.appendChild(section);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────
   Stats
────────────────────────────────────────── */
function updateStats(students) {
  const classes = new Set(students.map(s => s.class));

  document.getElementById('totalStudents').textContent = students.length;
  document.getElementById('totalClasses').textContent  = classes.size;

  // Latest entry by submitted_at
  const latest = students
    .filter(s => s.submitted_at)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];
  document.getElementById('latestEntry').textContent = latest ? formatDate(latest.submitted_at) : '—';
}

/* ──────────────────────────────────────────
   Class filter dropdown
────────────────────────────────────────── */
function populateClassFilter(students) {
  const select = document.getElementById('classFilter');
  const classes = [...new Set(students.map(s => s.class))].sort((a, b) => {
    const an = parseInt(a), bn = parseInt(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
  });

  // Keep the "All Classes" option, remove old ones
  select.innerHTML = '<option value="">All Classes</option>';
  classes.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = `Class ${cls}`;
    select.appendChild(opt);
  });
}

/* ──────────────────────────────────────────
   Filter logic
────────────────────────────────────────── */
function applyFilters() {
  const term  = document.getElementById('nameSearch').value.toLowerCase().trim();
  const clsFilter = document.getElementById('classFilter').value;

  const filtered = allStudents.filter(s => {
    const matchClass = !clsFilter || s.class === clsFilter;
    const matchTerm  = !term ||
      s.name.toLowerCase().includes(term) ||
      String(s.roll_number).includes(term) ||
      (s.gr_number && s.gr_number.toLowerCase().includes(term)) ||
      s.phone.includes(term) ||
      s.address.toLowerCase().includes(term);
    return matchClass && matchTerm;
  });

  renderStudents(filtered);
}

/* ──────────────────────────────────────────
   Delete student
────────────────────────────────────────── */
function deleteStudent(studentId) {
  fetch(`/api/admin/student/${studentId}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert('Error: ' + data.error); return; }
      // Remove from local array (id may be string or number)
      allStudents = allStudents.filter(s => String(s.id) !== String(studentId));
      updateStats(allStudents);
      populateClassFilter(allStudents);
      applyFilters();
    })
    .catch(err => {
      console.error(err);
      alert('Failed to delete student.');
    });
}

/* ──────────────────────────────────────────
   Load data
────────────────────────────────────────── */
function loadSchoolData() {
  document.getElementById('classesContainer').innerHTML =
    '<div class="loading-state">⏳ Loading student data…</div>';

  fetch(`/api/admin/school/${schoolId}`, { headers: getHeaders() })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      if (data.error) throw new Error(data.error);

      schoolData  = data.school;
      allStudents = data.students || [];

      // Update heading
      const heading = document.getElementById('schoolHeading');
      const badge   = document.getElementById('schoolCodeBadge');
      if (heading) heading.textContent = schoolData.name || schoolData.school_name || 'School';
      if (badge)   badge.textContent   = schoolData.school_code || '';

      // Page title
      document.title = `${schoolData.name || 'School'} — ID Card Admin`;

      updateStats(allStudents);
      populateClassFilter(allStudents);
      renderStudents(allStudents);
    })
    .catch(err => {
      console.error(err);
      document.getElementById('classesContainer').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Failed to load school data. <a href="/admin/dashboard">Go back</a>.</p>
        </div>`;
    });
}

/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
function initializePage() {
  if (!getAuthToken()) {
    window.location.href = '/admin/login';
    return;
  }

  schoolId = getSchoolId();
  if (!schoolId || schoolId === 'school') {
    window.location.href = '/admin/dashboard';
    return;
  }

  loadSchoolData();

  // Wire up search + filter
  document.getElementById('nameSearch').addEventListener('input', applyFilters);
  document.getElementById('classFilter').addEventListener('change', applyFilters);

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', loadSchoolData);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}
