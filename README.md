# Multi-School ID Card Data Collection System 🪪

A comprehensive web application designed to streamline the collection, management, and exporting of student data for the purpose of printing school ID cards. The system supports multiple schools concurrently and allows dynamic configuration of form fields per school.

## ✨ Features

### 🏢 Admin Dashboard
- **Multi-School Management**: Add, view, and delete multiple schools from a centralized portal.
- **Dynamic Configuration**: When adding a school, dynamically configure the available **Classes** and **Sections**. 
- **Customizable Forms**: Toggle whether a **GR. Number** is required for each specific school.
- **Real-Time Statistics**: Overview of total registered students, total schools, and total classes.
- **Student Data Viewer**: View detailed student records organized cleanly into expandable Class-based accordions.
- **Search & Filter**: Find specific students using a universal search bar (Name, Roll No, Phone, Address) or filter by Class.
- **Security**: Token-based authentication for all admin routes.

### 📝 Student Registration Portal
- **Dedicated School Links**: Each school gets a unique URL (`/school/SCH_XXXXXX`) to share with parents.
- **Smart Form UI**:
  - Dynamic dropdowns for Classes and Sections based on the school's configuration.
  - Hybrid Date of Birth picker (allows both calendar picking and direct text typing with auto-formatting).
  - Conditional GR Number field (hides automatically if the school doesn't require it).
  - Instant Photo Preview when uploading the student's picture.
- **Robust Validation**: 
  - Prevents duplicate Roll Numbers in the same class.
  - Validates 10-digit phone numbers and file sizes (Max 5MB photos).

### ⬇️ Export & Download Utilities
- **Excel Export (.xlsx)**: Download student data seamlessly into Excel spreadsheets. You can download the entire school's data at once or export a specific class individually.
- **Bulk Photo Export (.zip)**: Download all uploaded student photos in a single ZIP file. Photos are automatically renamed to an organized format (e.g., `SchoolName_Class_RollNumber.jpg`) making it extremely easy for printing software to map photos to the correct student.

---

## 🛠 Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom CSS, no external UI frameworks for maximum speed)
- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **File Handling**: Multer (Photo uploads)
- **Data Exporting**: SheetJS / `xlsx` (Excel files), `archiver` (ZIP file generation)

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- A [Supabase](https://supabase.com/) account for the database.

### 2. Clone & Install
```bash
git clone https://github.com/Dhruvilgithubrit/ID-Card.git
cd "ID Card"
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your credentials:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
SESSION_SECRET=your_secure_secret_key
PORT=3000
```

### 4. Database Schema (Supabase)
You need two tables in your Supabase project:

**Table 1: `schools`**
- `id` (int8, primary key, auto-increment)
- `school_code` (text, unique)
- `school_name` (text)
- `classes` (jsonb)
- `sections` (jsonb)
- `wants_gr_number` (boolean, default: true)
- `is_active` (boolean, default: true)
- `created_at` (timestamptz)

**Table 2: `students`**
- `id` (int8, primary key, auto-increment)
- `school_id` (int8, foreign key referencing schools.id)
- `class` (text)
- `roll_number` (int4)
- `name` (text)
- `dob` (date)
- `gr_number` (text, nullable)
- `phone` (text)
- `address` (text)
- `submitted_at` (timestamptz)

*(Ensure a unique constraint exists on `[school_id, class, roll_number]` to prevent duplicates).*

### 5. Start the Server
```bash
npm start
```
The server will start on `http://localhost:3000`.

---

## 📖 Usage Instructions

1. **Access the Admin Panel**: Navigate to `http://localhost:3000/admin/login` (Default admin token validation is set in `server.js`).
2. **Add a School**: Click "+ Add New School", provide a name, and configure the classes/sections and GR number policy.
3. **Share the Link**: Once added, a unique School Code is generated. Share the URL `http://localhost:3000/school/SCH_XXXXXX` with students/parents.
4. **Collect Data**: Parents fill out the form and upload photos.
5. **Export Data**: Go back to the Admin Dashboard to monitor incoming data, export Excel sheets, and download the organized ZIP file of photos.

---
*Developed for efficient and organized ID card data processing.*
