const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'trashtrack', //database name
  password: '123456',
  port: 5432,
});

// Middleware
app.use(bodyParser.json());
app.use(cors());

// API Endpoints

// 1. CREATE (with email check)
app.post('/api/customers', async (req, res) => {
    const { fname, lname, email, password } = req.body;
    try {
      // Check if customer already exists by email
      const checkEmail = await pool.query(
        'SELECT * FROM CUSTOMER WHERE cus_email = $1',
        [email]
      );
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
  
      // Insert the new customer into the CUSTOMER table
      const result = await pool.query(
        'INSERT INTO CUSTOMER (cus_fname, cus_lname, cus_email, cus_password) VALUES ($1, $2, $3, $4) RETURNING *',
        [fname, lname, email, password]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error inserting user:', error.message);//show debug print on server cmd
      res.status(500).json({ error: 'Database error' });
    }
  });
  
// // 1. CREATE
// app.post('/api/users', async (req, res) => {
//   const { name, email } = req.body;
//   try {
//     const result = await pool.query(
//       'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
//       [name, email]
//     );
//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // 2. READ (Get All Users)
// app.get('/api/users', async (req, res) => {
//   try {
//     const result = await pool.query('SELECT * FROM users');
//     res.status(200).json(result.rows);
//   } catch (error) {
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // 3. UPDATE
// app.put('/api/users/:id', async (req, res) => {
//   const { id } = req.params;
//   const { name, email } = req.body;
//   try {
//     const result = await pool.query(
//       'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
//       [name, email, id]
//     );
//     res.status(200).json(result.rows[0]);
//   } catch (error) {
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // 4. DELETE
// app.delete('/api/users/:id', async (req, res) => {
//   const { id } = req.params;
//   try {
//     await pool.query('DELETE FROM users WHERE id = $1', [id]);
//     res.status(200).json({ message: 'User deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Database error' });
//   }
// });



// Start the server
// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://192.168.254.187:${port}`);
  });
  
