const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

//hash
const crypto = require('crypto');
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

//EMAIL Verfctn
const nodemailer = require('nodemailer');
const { smtp } = require('./config');


//
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

// 1. EMAIL check existing
app.post('/api/email_check', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const checkEmail = await pool.query(`
      SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
      UNION ALL
      SELECT 'hauler' AS table_name FROM hauler WHERE haul_email = $1
      UNION ALL
      SELECT 'operational_dispatcher' AS table_name FROM operational_dispatcher WHERE op_email = $1
      UNION ALL
      SELECT 'billing_officer' AS table_name FROM billing_officer WHERE bo_email = $1
      UNION ALL
      SELECT 'account_manager' AS table_name FROM account_manager WHERE acc_email = $1
    `, [email]);

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists', table: checkEmail.rows[0].table_name });
    }

    // Email does not exist in any table
    return res.status(200).json({ message: 'Email is available' });

  } catch (error) {
    console.error('Error checking email:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});


// 1. CREATE (with email check)
app.post('/api/signup', async (req, res) => {
  const { fname, lname, email, password } = req.body;
  try {
    // Check if customer already exists by email
    // const checkEmail = await pool.query(
    //   'SELECT * FROM CUSTOMER WHERE cus_email = $1',
    //   [email]
    // );

    // const checkEmail = await pool.query(`
    //   SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
    //   UNION ALL
    //   SELECT 'hauler' AS table_name FROM hauler WHERE haul_email = $1
    //   UNION ALL
    //   SELECT 'operational_dispatcher' AS table_name FROM operational_dispatcher WHERE op_email = $1
    //   UNION ALL
    //   SELECT 'billing_officer' AS table_name FROM billing_officer WHERE bo_email = $1
    //   UNION ALL
    //   SELECT 'account_manager' AS table_name FROM account_manager WHERE acc_email = $1
    // `, [email]);

    // if (checkEmail.rows.length > 0) {
    //   //return res.status(400).json({ error: 'Email already exists' });
    //   return res.status(400).json(checkEmail.rows[0]);
    // }

    // Hash the password before storing it
    const hashedPassword = hashPassword(password);

    // Insert the new customer into the CUSTOMER table with hashed password
    const result = await pool.query(
      'INSERT INTO CUSTOMER (cus_fname, cus_lname, cus_email, cus_password) VALUES ($1, $2, $3, $4) RETURNING *',
      [fname, lname, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  }
  catch (error) {
    console.error('Error inserting user:', error.message);//show debug print on server cmd
    res.status(500).json({ error: 'Database error' });
  }
});

// LOGIN endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if customer exists by email
    const checkEmail = await pool.query(
      'SELECT * FROM CUSTOMER WHERE cus_email = $1',
      [email]
    );

    if (checkEmail.rows.length === 0) {
      // If the email does not exist in the database
      return res.status(404).json({ error: 'Email address not found' });
    }

    // Get the hashed password from the database
    const customer = checkEmail.rows[0];
    const storedHashedPassword = customer.cus_password;

    // Hash the incoming password
    const hashedPassword = hashPassword(password);

    // Compare the hashed password with the stored hashed password
    if (hashedPassword !== storedHashedPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // If password is correct, login is successful
    res.status(200).json({ message: 'Login successful', customer });
  }
  catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});



//EMAIL vrfctn
// Create a transporter using the SMTP configuration
const transporter = nodemailer.createTransport(smtp);

// Endpoint to send an email
app.post('/api/send_email', async (req, res) => {
  const { to, subject, code } = req.body;

  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,              // List of receivers
      subject: subject,    // Subject line
      html: `
  <html>
    <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
      <div style="background-color: #2c3e50; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; border: 10px solid #2ecc71;">
        <h1 style="color: #ecf0f1; text-align: center;">Trashtrack</h1>
        <h2 style="color: #ecf0f1;">Dear User,</h2>
        <p style="color: #ecf0f1;">Thank you for registering with Trashtrack.</p>
        <p style="color: #ecf0f1;">To complete your registration, please use the following verification code:</p>
        <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
          <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0;">
            ${code}
          </h3>
        </div>
        <p style="color: #ecf0f1;">If you did not request this verification code, please ignore this email.</p>
        <p style="color: #ecf0f1;">Best regards,<br>The Trashtrack Team</p>
      </div>
    </body>
  </html>
  `,
    });

    res.status(200).json({ messageId: info.messageId });
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});
///EMAIL









// Start the server
// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://192.168.254.187:${port}`);
});

