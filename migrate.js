// const mysql = require('mysql2');
// const fs = require('fs');

// // 1. Point directly to your Downloads folder
// const sqlFilePath = 'C:/Users/victo/Downloads/capstone.sql';

// // THE FIX: Inject the "Turn off Primary Key Rule" command at the very top of the file!
// const sqlScript = "SET SESSION sql_require_primary_key = 0;\n" + fs.readFileSync(sqlFilePath, 'utf8');

// // 2. Connect to Aiven Cloud
// const connection = mysql.createConnection({
//   host: 'ordonio-victorordo27-82de.b.aivencloud.com',
//   port: 11793,
//   user: 'avnadmin',
//   password: '****************', // <-- PASTE YOUR PASSWORD HERE
//   database: 'defaultdb',
//   ssl: { rejectUnauthorized: false },   
//   multipleStatements: true              
// });

// console.log("⏳ Connecting to Aiven Database...");

// connection.connect((err) => {
//   if (err) {
//     return console.error("❌ Connection failed:", err.message);
//   }
//   console.log("✅ Connected! Executing database migration... This might take a minute...");

//   // 3. Blast the SQL into the cloud
//   connection.query(sqlScript, (err, results) => {
//     if (err) {
//       console.error("❌ Migration failed:", err.message);
//     } else {
//       console.log("🚀 MIGRATION 100% SUCCESSFUL! Your Aiven database is fully updated!");
//     }
    
//     // 4. Close the connection so the script ends
//     connection.end();
//   });
// });