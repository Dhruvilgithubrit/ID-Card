'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const XLSX     = require('xlsx');
const multer   = require('multer');
const fs       = require('fs');
const archiver = require('archiver');

const supabase = require('./supabase');
const app = express();
const PORT = process.env.PORT || 3000;

// Setup multer for photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'data', 'photos');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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
app.post('/api/submit', upload.single('photo'), async (req, res) => {
  try {
    let { school_id, class: cls, roll_number, name, dob, gr_number, phone, address } = req.body;

    if (!school_id) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'School ID is required' });
    }

    // Verify school exists and get wants_gr_number setting
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, wants_gr_number')
      .eq('id', school_id)
      .eq('is_active', true)
      .single();

    if (schoolError || !school) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid school' });
    }

    const isGrRequired = school.wants_gr_number !== false;

    // Validate required fields
    if (!cls || !roll_number || !name || !dob || (isGrRequired && !gr_number) || !phone || !address) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Student photo is required' });
    }

    roll_number = parseInt(roll_number, 10);
    if (isNaN(roll_number) || roll_number < 1 || roll_number > 999) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Roll number must be between 1 and 999' });
    }

    if (!/^\d{10}$/.test(String(phone))) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
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
        gr_number: isGrRequired ? String(gr_number).trim() : null,
        phone: phone.trim(),
        address: address.trim()
      });

    if (error) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({
          error: `Roll number ${roll_number} in Class ${cls} is already registered`
        });
      }
      throw error;
    }

    // Rename file to schoolId_class_rollNumber.ext
    const ext = path.extname(req.file.originalname) || '.jpg';
    const newFilename = `${school_id}_${cls}_${roll_number}${ext}`;
    const newPath = path.join(req.file.destination, newFilename);
    fs.renameSync(req.file.path, newPath);

    return res.status(201).json({
      message: `Data saved for Class ${cls}, Roll No. ${roll_number}`
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
      .select('id, school_name, school_code, classes, sections, wants_gr_number')
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
      classes: school.classes,
      sections: school.sections,
      wants_gr_number: school.wants_gr_number,
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

    // Build worksheet rows dynamically based on wants_gr_number
    const wantsGr = school.wants_gr_number !== false;
    const rows = students.map(s => {
      const row = {
        'Roll No':    s.roll_number,
        'Name':       s.name,
        'Date of Birth': s.dob || ''
      };
      if (wantsGr) {
        row['GR. No'] = s.gr_number || '';
      }
      row['Class'] = s.class;
      row['Phone'] = s.phone;
      row['Address'] = s.address;
      row['Photo File'] = `Roll_${s.roll_number}.jpg`;
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    if (wantsGr) {
      ws['!cols'] = [
        { wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
        { wch: 8 }, { wch: 14 }, { wch: 36 }, { wch: 16 }
      ];
    } else {
      ws['!cols'] = [
        { wch: 8 }, { wch: 28 }, { wch: 14 },
        { wch: 8 }, { wch: 14 }, { wch: 36 }, { wch: 16 }
      ];
    }

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

// ── 9.5 GET /api/admin/school/:id/photos ─────────────────────────────────────
//    Download photos as .zip
app.get('/api/admin/school/:id/photos', requireAuth, async (req, res) => {
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
      .select('roll_number, class')
      .eq('school_id', req.params.id);

    if (studentsError) throw studentsError;

    if (!students || students.length === 0) {
      return res.status(404).json({ error: 'No students found' });
    }

    const safeSchoolName = school.school_name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const filename = `ID_CARD_${safeSchoolName}_Photos.zip`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = new archiver.ZipArchive({
      zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', function(err) {
      throw err;
    });

    archive.pipe(res);

    const photosDir = path.join(__dirname, 'data', 'photos');
    
    // Add files to archive
    for (const s of students) {
      const prefix = `${req.params.id}_${s.class}_${s.roll_number}.`;
      let foundFile = null;
      if (fs.existsSync(photosDir)) {
        const files = fs.readdirSync(photosDir);
        for (const f of files) {
          if (f.startsWith(prefix)) {
            foundFile = f;
            break;
          }
        }
      }

      if (foundFile) {
        const filePath = path.join(photosDir, foundFile);
        const ext = path.extname(foundFile);
        const internalPath = `ID CARD/${safeSchoolName}/${s.class}/${s.roll_number}${ext}`;
        archive.file(filePath, { name: internalPath });
      }
    }

    await archive.finalize();

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate zip', details: err.stack || err.message });
    }
  }
});

// ── 10. POST /api/admin/add-school ───────────────────────────────────────────
//     Insert new school with auto-generated school_code
app.post('/api/admin/add-school', requireAuth, async (req, res) => {
  try {
    const { name, classes, sections, wants_gr_number } = req.body;
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

    // Format classes array
    let classesArray = ['Nursery', 'Junior KG', 'Senior KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    if (classes && Array.isArray(classes)) {
      classesArray = classes.map(c => String(c).trim()).filter(c => c.length > 0);
    }

    // Format sections array
    let sectionsArray = ['-', 'A', 'B', 'C', 'D'];
    if (sections && Array.isArray(sections)) {
      sectionsArray = sections.map(s => String(s).trim()).filter(s => s.length > 0);
    }

    const { data: newSchool, error } = await supabase
      .from('schools')
      .insert({
        school_name: name.trim(),
        school_code,
        classes: classesArray,
        sections: sectionsArray,
        wants_gr_number: wants_gr_number !== false
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: newSchool.id,
      name: newSchool.school_name,
      school_code: newSchool.school_code,
      is_active: newSchool.is_active,
      classes: newSchool.classes,
      sections: newSchool.sections,
      wants_gr_number: newSchool.wants_gr_number
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
