// Landing page - fetch and display schools from API
document.addEventListener('DOMContentLoaded', function() {
  const schoolsContainer = document.getElementById('schoolsContainer') || document.querySelector('.schools-grid');
  
  // Fetch schools from API
  fetch('/api/schools')
    .then(response => response.json())
    .then(schools => {
      if (!schools || schools.length === 0) {
        schoolsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">No schools registered yet</p>';
        return;
      }

      // Clear existing content
      schoolsContainer.innerHTML = '';

      // Create school cards dynamically
      schools.forEach(school => {
        const card = document.createElement('div');
        card.className = 'school-card';
        card.innerHTML = `
          <div>
            <h3 class="school-name">${school.name || school.school_name}</h3>
          </div>
          <a href="form.html?school=${school.school_code}" class="btn-primary">Fill Form →</a>
        `;
        schoolsContainer.appendChild(card);
      });
    })
    .catch(error => {
      console.error('Error fetching schools:', error);
      schoolsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #d32f2f;">Error loading schools. Please try again later.</p>';
    });
});
