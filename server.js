const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// *************--- DATABASE CONNECTION ---************ //
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "", // Add your password if you have one in XAMPP
    database: "capstone"
});


//************ */ --- CLOUD DATABASE CONNECTION (AIVEN) --- *************//
// const db = mysql.createConnection({
//     host: "ordonio-victorordo27-82de.b.aivencloud.com",       // Paste your Aiven Host
//     port: 11793,         // Paste your Aiven Port (no quotes around the number)
//     user: "avnadmin",                   // Paste your Aiven User
//     password: process.env.DB_PASSWORD,    // Paste your Aiven Password
//     database: "defaultdb",              // Aiven uses 'defaultdb' by default
//     ssl: {
//         rejectUnauthorized: false       // Aiven requires SSL, this allows the connection
//     }
// });



db.connect(err => {
    if (err) {
        console.error("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to database.");
});

// ==========================================
// AUTHENTICATION & DASHBOARD ROUTES
// ==========================================
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, data) => {
        if (err) return res.status(500).json({ success: false, message: "Server error" });
        if (data.length > 0) {
            const user = data[0];
            if (user.status === 'Inactive') return res.json({ success: false, message: "Account is inactive" });

            db.query("INSERT INTO activity_logs (user, action, role) VALUES (?, 'Logged in', ?)", [user.first_name, user.role]);
            return res.json({ success: true, role: user.role, username: user.username });
        } else {
            return res.json({ success: false, message: "Invalid credentials" });
        }
    });
});

app.get('/api/stats', (req, res) => {
    const queries = {
        total_checkers: "SELECT COUNT(*) as count FROM users WHERE role LIKE 'Checker%'",
        active_checkers: "SELECT COUNT(*) as count FROM users WHERE role LIKE 'Checker%' AND status = 'Active'",
        total_faculties: "SELECT COUNT(*) as count FROM faculties",
        active_faculties: "SELECT COUNT(*) as count FROM faculties WHERE status = 'Active'"
    };

    let results = {};
    let pending = Object.keys(queries).length;

    for (let key in queries) {
        db.query(queries[key], (err, data) => {
            if (err) return res.status(500).json({ error: "Database error" });
            results[key] = data[0].count;
            pending--;
            if (pending === 0) res.json(results);
        });
    }
});

app.get('/api/recent-activity', (req, res) => {
    db.query("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10", (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(data);
    });
});

// ==========================================
// CHECKERS MANAGEMENT ROUTES
// ==========================================
app.get('/api/checkers', (req, res) => {
    const sql = "SELECT id, first_name, last_name, username, assigned_building, role, status FROM users WHERE role LIKE 'Checker%'";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });

        const formattedData = data.map(checker => {
            let parsedBuildings = [];
            if (checker.assigned_building) {
                try {
                    parsedBuildings = JSON.parse(checker.assigned_building);
                    if (!Array.isArray(parsedBuildings)) parsedBuildings = [checker.assigned_building];
                } catch (e) { parsedBuildings = [checker.assigned_building]; }
            }
            return { ...checker, assigned_building: parsedBuildings };
        });
        res.json(formattedData);
    });
});

app.post('/api/checkers', (req, res) => {
    const { first_name, last_name, username, password, assigned_building } = req.body;
    const buildingStr = JSON.stringify(assigned_building || []);

    const sql = "INSERT INTO users (first_name, last_name, username, password, assigned_building, role, status) VALUES (?, ?, ?, ?, ?, 'Checker 1', 'Active')";
    db.query(sql, [first_name, last_name, username, password, buildingStr], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Checker added" });
    });
});

app.put('/api/checkers/:id', (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, username, password, assigned_building, status } = req.body;
    const buildingStr = JSON.stringify(assigned_building || []);

    let sql, params;
    if (password) {
        sql = "UPDATE users SET first_name=?, last_name=?, username=?, password=?, assigned_building=?, status=? WHERE id=?";
        params = [first_name, last_name, username, password, buildingStr, status, id];
    } else {
        sql = "UPDATE users SET first_name=?, last_name=?, username=?, assigned_building=?, status=? WHERE id=?";
        params = [first_name, last_name, username, buildingStr, status, id];
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Checker updated" });
    });
});

// ==========================================
// FACULTY MANAGEMENT ROUTES
// ==========================================
app.get('/api/faculties', (req, res) => {
    db.query("SELECT * FROM faculties", (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });
        const formattedData = data.map(faculty => ({
            ...faculty,
            weekly_schedule: faculty.weekly_schedule ? JSON.parse(faculty.weekly_schedule) : []
        }));
        res.json(formattedData);
    });
});

app.post('/api/faculties', (req, res) => {
    const { first_name, last_name, department, weekly_schedule } = req.body;
    const scheduleStr = JSON.stringify(weekly_schedule || []);

    const sql = "INSERT INTO faculties (first_name, last_name, department, weekly_schedule, status) VALUES (?, ?, ?, ?, 'Active')";
    db.query(sql, [first_name, last_name, department, scheduleStr], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Faculty added" });
    });
});

app.put('/api/faculties/:id', (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, department, weekly_schedule, status } = req.body;
    const scheduleStr = JSON.stringify(weekly_schedule || []);

    const sql = "UPDATE faculties SET first_name=?, last_name=?, department=?, weekly_schedule=?, status=? WHERE id=?";
    db.query(sql, [first_name, last_name, department, scheduleStr, status, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Faculty updated" });
    });
});

app.post('/api/faculties/import', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No Excel file uploaded" });
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // THE CHOPPER ENGINE: Converts Excel string into JSON array
        const parseSchedule = (scheduleStr) => {
            if (!scheduleStr) return '[]'; 
            try {
                const sessions = String(scheduleStr).split(';').map(s => s.trim()).filter(s => s);
                const parsedSchedule = sessions.map(session => {
                    const parts = session.split('|').map(p => p.trim());
                    if (parts.length >= 4) {
                        return {
                            day: parts[0],
                            time: parts[1],
                            building: parts[2],
                            room: parts[3]
                        };
                    }
                    return null;
                }).filter(s => s !== null); 
                return JSON.stringify(parsedSchedule);
            } catch (err) {
                return '[]'; 
            }
        };

        const values = data.map(row => [
            row.FirstName || row.first_name || '',
            row.LastName || row.last_name || '',
            row.Department || row.department || '',
            parseSchedule(row.Schedule || row.schedule || ''), 
            'Active'
        ]);
        
        if (values.length === 0) return res.json({ success: true, message: "No data found in Excel" });

        // --- NEW CLASH DETECTOR ENGINE ---
        db.query("SELECT first_name, last_name, weekly_schedule FROM faculties", (err, existingData) => {
            if (err) return res.status(500).json({ error: "Database error: " + err.message });

            let clashes = [];
            
            // Format existing DB data for easy checking
            const allExisting = existingData.map(f => ({
                name: `${f.first_name} ${f.last_name}`.toLowerCase().trim(),
                schedule: f.weekly_schedule ? JSON.parse(f.weekly_schedule) : []
            }));

            // Format new CSV data for easy checking
            const parsedNewSchedules = data.map(row => ({
                name: `${row.FirstName || row.first_name || ''} ${row.LastName || row.last_name || ''}`.toLowerCase().trim(),
                rawName: `${row.FirstName || row.first_name || ''} ${row.LastName || row.last_name || ''}`,
                schedule: JSON.parse(parseSchedule(row.Schedule || row.schedule || ''))
            }));

            // Scan every new person against the DB AND against other people in the CSV
            parsedNewSchedules.forEach(newFac => {
                let hasClash = false;

                newFac.schedule.forEach(newSlot => {
                    // 1. Check against the existing Database
                    allExisting.forEach(exFac => {
                        if (exFac.name === newFac.name) return; // Skip themselves if they are already in DB
                        exFac.schedule.forEach(exSlot => {
                            if (
                                String(exSlot.building).trim().toLowerCase() === String(newSlot.building).trim().toLowerCase() &&
                                String(exSlot.room).trim().toLowerCase() === String(newSlot.room).trim().toLowerCase() &&
                                String(exSlot.day).trim().toLowerCase() === String(newSlot.day).trim().toLowerCase() &&
                                String(exSlot.time).trim().toLowerCase() === String(newSlot.time).trim().toLowerCase()
                            ) { hasClash = true; }
                        });
                    });

                    // 2. Check against other NEW rows in the CSV
                    parsedNewSchedules.forEach(otherNewFac => {
                        if (newFac.name === otherNewFac.name) return; // Skip themselves
                        otherNewFac.schedule.forEach(otherSlot => {
                            if (
                                String(otherSlot.building).trim().toLowerCase() === String(newSlot.building).trim().toLowerCase() &&
                                String(otherSlot.room).trim().toLowerCase() === String(newSlot.room).trim().toLowerCase() &&
                                String(otherSlot.day).trim().toLowerCase() === String(newSlot.day).trim().toLowerCase() &&
                                String(otherSlot.time).trim().toLowerCase() === String(newSlot.time).trim().toLowerCase()
                            ) { hasClash = true; }
                        });
                    });
                });

                if (hasClash) clashes.push(newFac.rawName); // Save their name to the alert list!
            });

            // Remove any duplicate names from the alert list
            clashes = [...new Set(clashes)];

            // Insert into the database regardless of clashes
            const sql = "INSERT INTO faculties (first_name, last_name, department, weekly_schedule, status) VALUES ?";
            db.query(sql, [values], (err, result) => {
                if (err) return res.status(500).json({ error: "Database error: " + err.message });
                
                // Return success BUT include the clashes list for the frontend to show
                res.json({ 
                    success: true, 
                    message: `Successfully imported ${result.affectedRows} faculties.`,
                    clashes: clashes
                });
            });
        });
    } catch (error) { 
        res.status(500).json({ error: "Failed to parse Excel file" }); 
    }
});

// ==========================================
// REPORTS ROUTES (Restored!)
// ==========================================
app.post('/api/reports/submit', (req, res) => {
    // BUG FIX 1: We added 'draft_key' to the incoming request body
    const { checker_name, building, schedule_time, report_date, draft_key, records } = req.body;
    const sql = "INSERT INTO attendance_reports (checker_name, building, schedule_time, report_date, records) VALUES (?, ?, ?, ?, ?)";

    db.query(sql, [checker_name, building, schedule_time, report_date, JSON.stringify(records)], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        // BUG FIX 2: Automatically delete the cloud draft once the final report is submitted!
        if (draft_key) {
            db.query("DELETE FROM drafts WHERE checker_name = ? AND report_date = ?", [checker_name, draft_key]);
        }

        db.query("INSERT INTO activity_logs (user, action, role) VALUES (?, ?, ?)", [checker_name, `Submitted report for ${building}`, 'Checker']);
        res.json({ success: true, message: "Report successfully submitted!" });
    });
});

app.get('/api/reports', (req, res) => {
    db.query("SELECT * FROM attendance_reports ORDER BY created_at DESC", (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(data);
    });
});

// --- NEW ROUTE: SAVE A DRAFT ---
app.post('/api/drafts/save', async (req, res) => {
  const { checker_name, report_date, records } = req.body;
  
  try {
    const checkSql = "SELECT id FROM drafts WHERE checker_name = ? AND report_date = ?";
    db.query(checkSql, [checker_name, report_date], (err, results) => {
      if (err) throw err;

      if (results.length > 0) {
        const updateSql = "UPDATE drafts SET records = ? WHERE id = ?";
        db.query(updateSql, [JSON.stringify(records), results[0].id], (err) => {
          if (err) throw err;
          res.json({ success: true, message: "Draft updated successfully." });
        });
      } else {
        const insertSql = "INSERT INTO drafts (checker_name, report_date, records) VALUES (?, ?, ?)";
        db.query(insertSql, [checker_name, report_date, JSON.stringify(records)], (err) => {
          if (err) throw err;
          res.json({ success: true, message: "Draft saved successfully." });
        });
      }
    });
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({ success: false, message: "Database error." });
  }
});

// --- NEW ROUTE: GET A DRAFT ---
app.get('/api/drafts/:checker_name/:date', (req, res) => {
  const { checker_name, date } = req.params;
  const sql = "SELECT records FROM drafts WHERE checker_name = ? AND report_date = ?";
  
  db.query(sql, [checker_name, date], (err, results) => {
    if (err) {
      console.error("Error fetching draft:", err);
      return res.status(500).json({ success: false, message: "Database error." });
    }
    
    if (results.length > 0) {
      res.json({ success: true, draft: JSON.parse(results[0].records) });
    } else {
      res.json({ success: true, draft: {} }); 
    }
  });
});

// --- SERVER START ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});