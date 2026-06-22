'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const XLSX     = require('xlsx');

const supabase = require('./supabase');
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

// Disable browser caching for static files (ensures Render deploys show latest changes)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Admin static files (CSS/JS assets inside /admin)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ── Auth Middleware ───────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  try {
    // Accept token from Authorization header OR ?token= query param (needed for file downloads)
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // Check if token is valid
    if (token !== 'admin-token-123') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── 1. GET / ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 4. GET /school/:school_code  →  serve form.html ───────────────────────────
app.get('/school/:school_code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// Legacy route kept for backwards compat with existing HTML hrefs
app.get('/form.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. GET /api/schools ───────────────────────────────────────────────────────
//    All active schools with total student count
app.get('/api/schools', async (req, res) => {
  try {
    const { data: schools, error } = await supabase
      .from('schools')
      .select('id, school_name, school_code')
      .eq('is_active', true)
      .order('school_name', { ascending: true });

    if (error) throw error;

    // Get student counts for each school
    const schoolsWithCounts = await Promise.all(
      schools.map(async (school) => {
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', school.id);
        return { ...school, name: school.school_name, student_count: count || 0 };
      })
    );

    res.json(schoolsWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// ── 2. POST /api/submit ───────────────────────────────────────────────────────
//    Register a student
app.post('/api/submit', async (req, res) => {
  try {
    let { school_id, class: cls, roll_number, name, dob, gr_number, phone, address } = req.body;

    // Validate required fields
    if (!school_id || !cls || !roll_number || !name || !dob || !gr_number || !phone || !address) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    roll_number = parseInt(roll_number, 10);
    if (isNaN(roll_number) || roll_number < 1 || roll_number > 999) {
      return res.status(400).json({ error: 'Roll number must be between 1 and 999' });
    }

    if (!/^\d{10}$/.test(String(phone))) {
      return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
    }

    // Verify school exists
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id')
      .eq('id', school_id)
      .eq('is_active', true)
      .single();

    if (schoolError || !school) {
      return res.status(400).json({ error: 'Invalid school' });
    }

    // Insert student
    const { error } = await supabase
      .from('students')
      .insert({
        school_id,
        class: cls,
        roll_number,
        name: name.trim(),
        dob: dob,
        gr_number: String(gr_number).trim(),
        phone: phone.trim(),
        address: address.trim()
      });

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({
          error: `Roll number ${roll_number} in Class ${cls} is already registered`
        });
      }
      throw error;
    }

    return res.status(201).json({
      message: `Data saved for Class ${cls}, Roll No. ${roll_number}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// ── 3. GET /api/school/:school_code ───────────────────────────────────────────
//    Single school info by school_code
app.get('/api/school/:school_code', async (req, res) => {
  try {
    const { data: school, error } = await supabase
      .from('schools')
      .select('id, school_name, school_code')
      .eq('school_code', req.params.school_code)
      .eq('is_active', true)
      .single();

    if (error || !school) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Get student count
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', school.id);

    res.json({
      id: school.id,
      name: school.school_name,
      school_code: school.school_code,
      student_count: count || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN HTML ROUTES
// ═════════════════════════════════════════════════════════════════════════════

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/admin/school/:schoolId', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'school.html'));
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN API ROUTES  (all require auth)
// ═════════════════════════════════════════════════════════════════════════════

// ── 7. GET /api/admin/schools ─────────────────────────────────────────────────
//    All schools + student count + distinct class count
app.get('/api/admin/schools', requireAuth, async (req, res) => {
  try {
    const { data: schools, error } = await supabase
      .from('schools')
      .select('id, school_name, school_code, is_active')
      .order('school_name', { ascending: true });

    if (error) throw error;

    // Get student and class counts for each school
    const schoolsWithCounts = await Promise.all(
      schools.map(async (school) => {
        const { count: studentCount } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', school.id);

        const { data: classes } = await supabase
          .from('students')
          .select('class')
          .eq('school_id', school.id);

        const classCount = new Set(classes.map(c => c.class)).size;

        return {
          id: school.id,
          name: school.school_name,
          school_code: school.school_code,
          is_active: school.is_active,
          student_count: studentCount || 0,
          class_count: classCount
        };
      })
    );

    res.json(schoolsWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// ── 8. GET /api/admin/school/:id ─────────────────────────────────────────────
//    All students for a school, sorted by class ASC then roll_number ASC
app.get('/api/admin/school/:id', requireAuth, async (req, res) => {
  try {
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (schoolError || !school) {
      return res.status(404).json({ error: 'School not found' });
    }

    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, class, roll_number, name, dob, gr_number, phone, address, submitted_at')
      .eq('school_id', req.params.id)
      .order('class', { ascending: true })
      .order('roll_number', { ascending: true });

    if (studentsError) throw studentsError;

    res.json({
      school: {
        id: school.id,
        name: school.school_name,
        school_code: school.school_code,
        is_active: school.is_active
      },
      students: students || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ── 9. GET /api/admin/school/:id/export ──────────────────────────────────────
//    Download students as .xlsx   (add ?class=5 to export only class 5)
app.get('/api/admin/school/:id/export', requireAuth, async (req, res) => {
  try {
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (schoolError || !school) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Read optional class filter from query string
    const classFilter = req.query.class ? String(req.query.class).trim() : null;

    // Build query
    let query = supabase
      .from('students')
      .select('roll_number, name, dob, gr_number, class, phone, address')
      .eq('school_id', req.params.id);

    // Apply class filter if provided
    if (classFilter) {
      query = query.eq('class', classFilter);
    }

    query = query
      .order('class', { ascending: true })
      .order('roll_number', { ascending: true });

    const { data: students, error: studentsError } = await query;
    if (studentsError) throw studentsError;

    if (!students || students.length === 0) {
      return res.status(404).json({ error: 'No students found' });
    }

    // Build worksheet rows
    const rows = students.map(s => ({
      'Roll No':    s.roll_number,
      'Name':       s.name,
      'Date of Birth': s.dob || '',
      'GR. No':     s.gr_number || '',
      'Class':      s.class,
      'Phone':      s.phone,
      'Address':    s.address,
      'Photo File': `Roll_${s.roll_number}.jpg`
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
      { wch: 8 }, { wch: 14 }, { wch: 36 }, { wch: 16 }
    ];

    const sheetName = classFilter ? `Class ${classFilter}` : 'Students';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const safeName  = school.school_name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const classPart = classFilter ? `_Class${classFilter}` : '_AllStudents';
    const filename  = `${safeName}${classPart}.xlsx`;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// ── 10. POST /api/admin/add-school ───────────────────────────────────────────
//     Insert new school with auto-generated school_code
app.post('/api/admin/add-school', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'School name is required' });
    }

    // Generate SCH_XXXXXX (6 random uppercase alphanumeric chars)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const school_code = `SCH_${suffix}`;

    const { data: newSchool, error } = await supabase
      .from('schools')
      .insert({
        school_name: name.trim(),
        school_code
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: newSchool.id,
      name: newSchool.school_name,
      school_code: newSchool.school_code,
      is_active: newSchool.is_active
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add school' });
  }
});

// ── 11. DELETE /api/admin/student/:id ────────────────────────────────────────
//     Delete a student by id
app.delete('/api/admin/student/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Student not found' });
      }
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// ── 12. DELETE /api/admin/school/:id ───────────────────────────────────────────
//     Delete a school by id
app.delete('/api/admin/school/:id', requireAuth, async (req, res) => {
  try {
    // First delete all students associated with this school
    await supabase
      .from('students')
      .delete()
      .eq('school_id', req.params.id);

    // Then delete the school
    const { error } = await supabase
      .from('schools')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'School not found' });
      }
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

// ── 404 Catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ID Card System running on http://localhost:${PORT}`);
});
