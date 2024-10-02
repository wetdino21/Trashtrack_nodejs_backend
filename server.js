const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

//token
const jwt = require('jsonwebtoken');
require('dotenv').config();
//token google secretkey check
const axios = require('axios');

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
// app.use(bodyParser.json());
// app.use(cors());
// Increase the limit for JSON and URL-encoded payloads
app.use(bodyParser.json({ limit: '50mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

////////////////////////////////////////

const fs = require('fs');
const https = require('https');

///
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Function to generate tokens
// const generateTokens = (user) => {
//   const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' }); // Access token expires in 15 minutes
//   const refreshToken = jwt.sign(user, JWT_REFRESH_SECRET, { expiresIn: '7d' }); // Refresh token expires in 7 days
//   return { accessToken, refreshToken };
// };
const generateTokens = (user) => {
  const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' }); // Access token expires in 10 seconds
  const refreshToken = jwt.sign(user, JWT_REFRESH_SECRET, { expiresIn: '7d' }); // Refresh token expires in 10 seconds
  return { accessToken, refreshToken };
};
const generateNewAccessToken = (user) => {
  const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' }); // Access token expires in 10 seconds
  return { accessToken };
};

// Function to generate a random, secure verification code
function generateRandomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-character hex code
}

// Email sending function
async function sendCodeForgotPassEmail(to, code) {
  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,
      subject: 'Verification Code',          // List of receivers
      html: `
  <html>
  <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
    <div style="background-color: #2c3e50; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; ">
      <h1 style="color: #1abc9c; text-align: center; font-size: 40px">Trashtrack</h1>
      <h2 style="color: #ecf0f1;">Password Reset Request</h2>
      <p style="color: #ecf0f1;">Dear User,</p>
      <p style="color: #ecf0f1;">You have requested to reset your password for your Trashtrack account.</p>
      <p style="color: #ecf0f1;">Please use the following verification code to proceed with resetting your password:</p>
      <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
        <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0;">
          ${code}
        </h3>
      </div>
      <p style="color: #ecf0f1;">This code is valid for 5 minutes.</p>
      <p style="color: #ecf0f1;">If you did not request a password reset, please ignore this email. Your account will remain secure.</p>
      <p style="color: #ecf0f1;">Best regards,<br>The Trashtrack Team</p>
    </div>
  </body>
</html>

  `,
    });
    return info.messageId;
  } catch (error) {
    console.error('Datbase error:', error.message);
    throw new Error('Failed to send email');
  }
}
// Rate limiting
const MAX_ATTEMPTS = 5;
const RATE_LIMIT = 0.3 * 60 * 1000; // 1 minutes
const emailLimitCache = {};

// API Endpoints

// send create verification code (with check email)
app.post('/send_code_createacc', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const checkEmail = await pool.query(`
    SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
    UNION ALL
    SELECT 'employee' AS table_name FROM employee WHERE emp_email = $1
  `, [email]);

  if (checkEmail.rows.length > 0) {
    return res.status(400).json({ error: 'Email already exists', table: checkEmail.rows[0].table_name });
  }

  if (emailLimitCache[email] && Date.now() - emailLimitCache[email] < RATE_LIMIT) {
    //console.error('Too many requests. Please try again later.'); // check code in CMD

    const timeremain = (30000 - (emailLimitCache[email] && Date.now() - emailLimitCache[email]));
    return res.status(429).json({ error: 'Too many requests. Please try again later.', timeremain: timeremain });// Pass remaining time
  }

  emailLimitCache[email] = Date.now();

  const checkExistingCode = await pool.query(`
    SELECT * FROM email_verification WHERE email = $1
  `, [email]);

  if (checkExistingCode.rows.length > 0) {
    await pool.query(
      'DELETE FROM email_verification WHERE email = $1',
      [email]
    );
  }

  //code genreratd
  const code = generateRandomCode();
  console.error(code); // check code in CMD
  const expiration = Date.now() + 5 * 60 * 1000; // 5 minutes
  const hashedCode = hashPassword(code);

  try {
    await pool.query(
      'INSERT INTO email_verification (email, email_code, email_expire) VALUES ($1, $2, $3)',
      [email, hashedCode, expiration]
    );

    await sendCodeForgotPassEmail(email, code); //call function to send email

    return res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('Datbase error:', error.message);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// send verification code (with check email)
app.post('/send_code_forgotpass', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const checkEmail = await pool.query(`
    SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
    UNION ALL
    SELECT 'employee' AS table_name FROM employee WHERE emp_email = $1
  `, [email]);

  if (checkEmail.rows.length === 0) {
    return res.status(400).json({ error: 'No associated account with this email!' });
  }



  if (emailLimitCache[email] && Date.now() - emailLimitCache[email] < RATE_LIMIT) {
    console.error('Too many requests. Please try again later.'); // check code in CMD

    const timeremain = (60000 - (emailLimitCache[email] && Date.now() - emailLimitCache[email]));
    return res.status(429).json({ error: 'Too many requests. Please try again later.', timeremain: timeremain });// Pass remaining time
  }

  emailLimitCache[email] = Date.now();

  const checkExistingCode = await pool.query(`
    SELECT * FROM email_verification WHERE email = $1
  `, [email]);

  if (checkExistingCode.rows.length > 0) {
    await pool.query(
      'DELETE FROM email_verification WHERE email = $1',
      [email]
    );
  }

  //code genreratd
  const code = generateRandomCode();
  console.error(code); // check code in CMD
  const expiration = Date.now() + 5 * 60 * 1000; // 5 minutes
  const hashedCode = hashPassword(code);

  try {
    await pool.query(
      'INSERT INTO email_verification (email, email_code, email_expire) VALUES ($1, $2, $3)',
      [email, hashedCode, expiration]
    );

    await sendCodeForgotPassEmail(email, code); //call function to send email

    return res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('Datbase error:', error.message);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// verify the code
app.post('/verify_code', async (req, res) => {
  const { email, userInputCode } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM email_verification WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No associated account with this email!' });
    }
    // if (!result.rows[0]) {
    //   return res.status(404).json({ error: 'No verification record found' });
    // }

    const { email_code, email_expire, email_attempts } = result.rows[0];
    const currentTime = Date.now();
    if (currentTime > email_expire) {
      return res.status(400).json({ error: 'Verification code has expired' }); //
    }

    if (email_attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many failed attempts. Please resend a new code.' }); //
    }

    const hashedUserInput = hashPassword(userInputCode);
    if (hashedUserInput !== email_code) {
      await pool.query(
        'UPDATE email_verification SET email_attempts = $1 WHERE email = $2',
        [email_attempts + 1, email]
      );
      return res.status(401).json({ error: 'Incorrect verification code' });
    }

    await pool.query(
      'DELETE FROM email_verification WHERE email = $1',
      [email]
    );

    res.status(200).json({ message: 'Verification successful' });
  } catch (error) {
    console.error('Datbase error:', error.message);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});
////////////////////////////

// 1. EMAIL check existing
app.post('/email_check', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const checkEmail = await pool.query(`
      SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
      UNION ALL
      SELECT 'employee' AS table_name FROM employee WHERE emp_email = $1
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

// check contact existing
app.post('/contact_check', async (req, res) => {
  const { contact } = req.body;

  if (!contact) {
    return res.status(400).json({ error: 'Contact is required' });
  }

  try {
    const checkEmail = await pool.query(`
      SELECT 'customer' AS table_name FROM customer WHERE cus_contact = $1
      UNION ALL
      SELECT 'employee' AS table_name FROM employee WHERE emp_contact = $1
    `, [contact]);

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Contact number already exists', table: checkEmail.rows[0].table_name });
    }

    // Email does not exist in any table
    return res.status(200).json({ message: 'Contact number is available' });

  } catch (error) {
    console.error('Error checking Contact number:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// EMAIL forgot pass check existing cus and employee
app.post('/email_check_forgotpass', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const checkEmail = await pool.query(`
      SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
      UNION ALL
      SELECT 'employee' AS table_name FROM employee WHERE emp_email = $1
    `, [email]);

    if (checkEmail.rows.length === 0) {
      return res.status(400).json({ error: 'Email doesn\'t exists' });
    }

    // Email does not exist in any table
    return res.status(200).json({ message: 'Email is available', table: checkEmail.rows[0].table_name });

  } catch (error) {
    console.error('Error checking email:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 1. CREATE ACC (GOOGLE REGISTER)
app.post('/signup_google', async (req, res) => {
  const { fname, mname, lname, email, photo, contact, province, city, brgy, street, postal } = req.body;
  try {

    // Convert base64 string back to bytea
    const photoBytes = photo ? Buffer.from(photo, 'base64') : null;

    // Convert base64 string back to bytea
    const result = await pool.query(
      `INSERT INTO CUSTOMER (
        cus_fname, cus_mname, cus_lname, cus_email, cus_status, 
        cus_type, cus_auth_method, cus_profile, cus_contact, 
        cus_province, cus_city, cus_brgy, cus_street, cus_postal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        fname,
        mname,
        lname,
        email,
        'Active',                 // cus_status
        'Non-Contractual',         // cus_type
        'google',                  // cus_auth_method
        photoBytes,                // cus_profile (converted base64 image)
        contact,
        province,
        city,
        brgy,
        street,
        postal
      ]
    );

    // Access the inserted row
    const insertedRow = result.rows[0];
    const id = insertedRow.cus_id;

    // store user data to token
    const user = { email: email, id: id };

    const { accessToken, refreshToken } = generateTokens(user);
    return res.status(201).json({
      message: 'Created new User',
      accessToken: accessToken,
      refreshToken: refreshToken
    });
    //res.status(201).json(result.rows[0]);
  }
  catch (error) {
    console.error('Error inserting user:', error.message);//show debug print on server cmd
    res.status(500).json({ error: 'Database error' });
  }
});

// 1. CREATE ACC (email_password)
app.post('/signup', async (req, res) => {
  const {
    fname, mname, lname, email, password,
    contact, province, city, brgy, street, postal
  } = req.body;

  try {
    // Hash the password before storing it
    const hashedPassword = hashPassword(password);

    // Insert the new customer into the CUSTOMER table
    const result = await pool.query(
      'INSERT INTO CUSTOMER (cus_fname, cus_mname, cus_lname, cus_email, cus_password, cus_contact, cus_province, cus_city, cus_brgy, cus_street, cus_postal, cus_status, cus_type, cus_auth_method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [
        fname, mname, lname, email, hashedPassword,
        contact, province, city, brgy, street, postal,
        'Active', 'Non-Contractual', 'email_password'
      ]
    );

    // Access the inserted row
    const insertedRow = result.rows[0];
    const id = insertedRow.cus_id;

    // Store user data in token
    const user = { email: email, id: id };

    const { accessToken, refreshToken } = generateTokens(user);
    return res.status(201).json({
      message: 'Created new User',
      accessToken: accessToken,
      refreshToken: refreshToken
    });
  }
  catch (error) {
    console.error('Error inserting user:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});


// LOGIN endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if customer exists by email
    const checkCustomerEmail = await pool.query(
      'SELECT * FROM CUSTOMER WHERE cus_email = $1',
      [email]
    );

    if (checkCustomerEmail.rows.length > 0) {
      // Get the hashed password from the database
      const customer = checkCustomerEmail.rows[0];
      const authType = customer.cus_auth_method;
      const status = customer.cus_status;

      if (authType == 'google') {
        return res.status(402).json({ message: 'Looks like this account is signed up with google. Please login with google' });
      }

      const storedHashedPassword = customer.cus_password;

      // Hash the incoming password
      const hashedPassword = hashPassword(password);

      // Compare the hashed password with the stored hashed password
      if (hashedPassword === storedHashedPassword) {
        if (status == 'Deactivated') {
          return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
        }
        if (status == 'Suspended') {
          return res.status(203).json({ message: 'Your Accoount is currently suspended' });
        }

        // Access the inserted row
        const id = customer.cus_id;

        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        return res.status(200).json({
          message: 'User found in customer',
          accessToken: accessToken,
          refreshToken: refreshToken
        });
      }
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Check if emp exists by email
    const checkEmpEmail = await pool.query(
      `SELECT e.*
       FROM employee e
       JOIN roles r ON e.role_id = r.role_id
       WHERE e.emp_email = $1
       AND r.role_name = 'Hauler'`,
      [email]
    );


    if (checkEmpEmail.rows.length > 0) {
      // Get the hashed password from the database
      const employee = checkEmpEmail.rows[0];
      const authType = employee.emp_auth_method;
      const status = employee.emp_status;

      if (authType == 'google') {
        return res.status(402).json({ message: 'Looks like this account is signed up with google. Please login with google' });
      }

      const storedHashedPassword = employee.emp_password;
      // Hash the incoming password
      const hashedPassword = hashPassword(password);

      // Compare the hashed password with the stored hashed password
      if (hashedPassword === storedHashedPassword) {
        if (status == 'Deactivated') {
          return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
        }
        if (status == 'Suspended') {
          return res.status(203).json({ message: 'Your Accoount is currently suspended' });
        }

        // Access the inserted row
        const id = employee.emp_id;

        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        // console.error('access: ' + accessToken);
        // console.error('refresh: ' + refreshToken);
        return res.status(201).json({
          message: 'User found as Employee',
          accessToken: accessToken,
          refreshToken: refreshToken
        });

      }
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or employee tables' });
  }
  catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

////////////with Tokennn////////////////////////////////////////////////////////////////////////////////
// Refresh Access Token
app.post('/refresh_token', (req, res) => {
  const { refreshToken } = req.body;

  // Verify the refresh token
  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token expired or invalid' });
    }
    //console.log(user);
    // Generate new access token
    const userData = { email: user.email, id: user.id };
    const { accessToken } = generateNewAccessToken(userData);

    // const newAccessToken = jwt.sign({ email: user.email }, JWT_SECRET, {
    //   expiresIn: '5s',
    // });

    return res.status(200).json({
      message: 'Successfully refreshed token',
      accessToken: accessToken,
    });
  });
});

// // Middleware to verify Google access token
// const authenticateGoogleToken = async (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) {
//     return res.status(403).json({ error: 'No access token provided' });
//   }

//   try {
//     // Use Google's API to verify the token
//     const response = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
//     const tokenInfo = response.data;

//     // Check token expiration
//     if (tokenInfo.expires_in <= 0) {
//       return res.status(401).json({ error: 'Access token has expired' });
//     }

//     // Attach user info from the token to the request
//     req.user = tokenInfo;
//     next(); // Token is valid, proceed to the next middleware or route handler

//   } catch (error) {
//     return res.status(403).json({ error: 'Invalid access token' });
//   }
// };

// Middleware to authenticate access token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(403).json({ error: 'No access token provided' });

  // Verify the access token
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token has expired' });
      }
      return res.status(403).json({ error: 'Invalid access token' });
    }
    req.user = user;
    next();
  });
};

//on Open App with token
app.post('/onOpenApp', authenticateToken, async (req, res) => {
  const email = req.user.email;  // Get the email from the token
  try {
    //check where user is from table
    const checkCustomerEmail = await pool.query(
      'SELECT * FROM CUSTOMER WHERE cus_email = $1',
      [email]
    );
    if (checkCustomerEmail.rowCount > 0) {
      const customer = checkCustomerEmail.rows[0];
      if (customer.cus_status == 'Active') {
        res.status(200).json({ message: 'User is a customer' });
      }
    }

    //check where user is from table
    const checkEmployeeEmail = await pool.query(
      `SELECT e.*
       FROM employee e
       JOIN roles r ON e.role_id = r.role_id
       WHERE e.emp_email = $1
       AND r.role_name = 'Hauler'`,
      [email]
    );

    if (checkEmployeeEmail.rowCount > 0) {
      const employee = checkEmployeeEmail.rows[0];
      if (employee.emp_status == 'Active') {
        res.status(201).json({ message: 'User is a employee' });
      }
    }
  } catch (error) {
    console.error('Database error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//update with token
app.post('/update_customer', authenticateToken, async (req, res) => {
  const { fname, lname } = req.body;
  const email = req.user.email;  // Get the email from the token
  if (!fname || !lname) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }

  try {
    // Update customer details in the database
    const result = await pool.query(
      'UPDATE CUSTOMER SET cus_fname = $1, cus_lname = $2 WHERE cus_email = $3 RETURNING *',
      [fname, lname, email]
    );

    if (result.rowCount > 0) {
      res.json({ message: 'Customer details updated successfully', customer: result.rows[0] });
    } else {
      res.status(404).json({ error: 'Customer not found' });
    }
  } catch (error) {
    console.error('Error updating customer details:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});



///////////////////////////////////////////////////////////////////////////////////////////////////
// LOGIN with GOOGLE
app.post('/login_google', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if customer exists by email
    const checkCustomerEmail = await pool.query(
      'SELECT * FROM CUSTOMER WHERE cus_email = $1',
      [email]
    );

    if (checkCustomerEmail.rows.length > 0) {
      // Get the hashed password from the database
      const customer = checkCustomerEmail.rows[0];
      const authType = customer.cus_auth_method;
      const status = customer.cus_status;

      if (authType == 'email_password') {
        return res.status(402).json({ message: 'Looks like this account is registered with email and password. Please log in using your email and password.' });
      }
      if (status == 'Deactivated') {
        return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
      }
      if (status == 'Suspended') {
        return res.status(203).json({ message: 'Your Accoount is currently suspended' });
      }
      // Access the inserted row
      const id = customer.cus_id;

      // store user data to token
      const user = { email: email, id: id };
      const { accessToken, refreshToken } = generateTokens(user);
      return res.status(200).json({
        message: 'Successful google customer login',
        accessToken: accessToken,
        refreshToken: refreshToken
      });
      //return res.status(200).json({ message: 'User found in customer' });
    }

    // Check if EMPLOYEE exists by email
    const checkEmpEmail = await pool.query(
      `SELECT e.*
       FROM employee e
       JOIN roles r ON e.role_id = r.role_id
       WHERE e.emp_email = $1
       AND r.role_name = 'Hauler'`,
      [email]
    );

    if (checkEmpEmail.rows.length > 0) {
      // Get the hashed password from the database
      const employee = checkEmpEmail.rows[0];
      const authType = employee.emp_auth_method;
      const status = employee.emp_status;

      if (authType == 'email_password') {
        return res.status(402).json({ message: 'Looks like this account is registered with email and password. Please log in using your email and password.' });
      }
      if (status == 'Deactivated') {
        return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
      }
      if (status == 'Suspended') {
        return res.status(203).json({ message: 'Your Accoount is currently suspended' });
      }
      // Access the inserted row
      const id = employee.emp_id;

      // store user data to token
      const user = { email: email, id: id };

      const { accessToken, refreshToken } = generateTokens(user);
      console.log(accessToken + '' + refreshToken);
      return res.status(201).json({
        message: 'Successful google EMPLOYEE login',
        accessToken: accessToken,
        refreshToken: refreshToken
      });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or EMPLOYEE tables' });
  }
  catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// UPDATE PASSWORD endpoint
app.post('/update_password', async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    // Check if the email exists in the 'customer' table
    const checkCustomerEmail = await pool.query(
      'SELECT cus_password FROM CUSTOMER WHERE cus_email = $1',
      [email]
    );

    if (checkCustomerEmail.rows.length > 0) {
      const currentPassword = checkCustomerEmail.rows[0].cus_password;
      const hashedNewPassword = hashPassword(newPassword);

      // Check if the new password is the same as the current password
      if (currentPassword === hashedNewPassword) {
        return res.status(400).json({ error: 'New password cannot be the same as the old password' });
      }

      // Update the password if it is different
      await pool.query(
        'UPDATE CUSTOMER SET cus_password = $1 WHERE cus_email = $2',
        [hashedNewPassword, email]
      );

      return res.status(200).json({ message: 'Password updated successfully for customer' });
    }

    // Check if the email exists in the 'employee' table
    const checkEmployeeEmail = await pool.query(
      `SELECT e.emp_password 
       FROM employee e
       JOIN roles r ON e.role_id = r.role_id
       WHERE e.emp_email = $1 AND r.role_name = 'Hauler'`,
      [email]
    );

    if (checkEmployeeEmail.rows.length > 0) {
      const currentPassword = checkEmployeeEmail.rows[0].emp_password;
      const hashedNewPassword = hashPassword(newPassword);

      // Check if the new password is the same as the current password
      if (currentPassword === hashedNewPassword) {
        return res.status(400).json({ error: 'New password cannot be the same as the old password' });
      }

      // Update the password if it is different
      await pool.query(
        'UPDATE employee SET emp_password = $1 WHERE emp_email = $2',
        [hashedNewPassword, email]
      );

      return res.status(200).json({ message: 'Password updated successfully for employee' });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or employee tables' });
  }
  catch (error) {
    console.error('Error during password update:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});





//EMAIL vrfctn
// Create a transporter using the SMTP configuration
const transporter = nodemailer.createTransport(smtp);

// Endpoint to send an email

//email sign up
app.post('/send_email', async (req, res) => {
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
    //console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

//email forgot pass
app.post('/send_email_forgotpass', async (req, res) => {
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
      <h2 style="color: #ecf0f1;">Password Reset Request</h2>
      <p style="color: #ecf0f1;">Dear User,</p>
      <p style="color: #ecf0f1;">You have requested to reset your password for your Trashtrack account.</p>
      <p style="color: #ecf0f1;">Please use the following verification code to proceed with resetting your password:</p>
      <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
        <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0;">
          ${code}
        </h3>
      </div>
      <p style="color: #ecf0f1;">This code is valid for 5 minutes.</p>
      <p style="color: #ecf0f1;">If you did not request a password reset, please ignore this email. Your account will remain secure.</p>
      <p style="color: #ecf0f1;">Best regards,<br>The Trashtrack Team</p>
    </div>
  </body>
</html>

  `,
    });

    res.status(200).json({ messageId: info.messageId });
    // console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});
///EMAIL


///////////CUSTOMER DATA ////////////////////////////////////////////////////////
//FETCH ALL DATA 
app.post('/customer/fetch_data', authenticateToken, async (req, res) => {
  const email = req.user.email;

  try {
    let result = await pool.query('SELECT * FROM CUSTOMER WHERE cus_email = $1', [email]);

    // If not found in CUSTOMER table, check in the EMPLOYEE table
    if (result.rows.length === 0) {
      result = await pool.query(`
        SELECT e.*, r.role_name 
        FROM EMPLOYEE e 
        LEFT JOIN ROLES r ON e.role_id = r.role_id 
        WHERE e.emp_email = $1
      `, [email]);
    }

    // Check if any user data was found
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // Handle profile image for both CUSTOMER and EMPLOYEE tables
      let base64Image = null;
      if (user.cus_profile) {
        base64Image = user.cus_profile.toString('base64');  // If cus_profile exists
      } else if (user.emp_profile) {
        base64Image = user.emp_profile.toString('base64'); // If emp_profile exists
      }

      // Add the base64 image data to the response object
      const responseData = {
        ...user,
        profileImage: base64Image,  // Add the base64-encoded image here
      };

      // Conditionally add `roleName` if it's an employee
      if (user.role_name) {
        responseData.emp_role = user.role_name;
      }

      // Log the base64 string (optional for debugging)
      //console.log('Base64 Encoded Image:', base64Image);

      res.json(responseData);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/customer/fetch_profile', authenticateToken, async (req, res) => {
  const email = req.user.email;

  try {
    let result = await pool.query('SELECT cus_profile FROM CUSTOMER WHERE cus_email = $1', [email]);

    // If not found in CUSTOMER table, check in the EMPLOYEE table
    if (result.rows.length === 0) {
      result = await pool.query('SELECT emp_profile FROM EMPLOYEE WHERE emp_email = $1', [email]);
    }

    // Check if any user data was found
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // Handle profile image for both CUSTOMER and EMPLOYEE tables
      let base64Image = null;
      if (user.cus_profile) {
        base64Image = user.cus_profile.toString('base64');  // If cus_profile exists
      } else if (user.emp_profile) {
        base64Image = user.emp_profile.toString('base64'); // If emp_profile exists
      }

      // Add the base64 image data to the response object
      const responseData = {
        profileImage: base64Image  // Add the base64-encoded image here
      };

      // Log the base64 string (optional for debugging)
      //console.log('Base64 Encoded Image:', base64Image);

      res.json(responseData);
    } else {
      console.error('User not found');
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//notification
app.post('/customer/fetch_notifications', authenticateToken, async (req, res) => {
  const userId = req.user.id;  // Assuming the user ID is stored in the token
  try {
    const result = await pool.query('SELECT * FROM notification WHERE cus_id = $1 ORDER BY notif_created_at DESC', [userId]);

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.status(404).json({ error: 'No notifications found' });
    }
  } catch (error) {
    console.error('Error fetching notifications:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//waste category
app.get('/waste_category', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM waste_category WHERE wc_status = $1', ['Active']);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// booking
app.post('/booking', authenticateToken, async (req, res) => {
  const id = req.user.id;

  const {
    date,
    province,
    city,
    brgy,
    street,
    postal,
    latitude,
    longitude,
    wasteTypes  // list
  } = req.body;

  try {
    const query = `
      INSERT INTO booking (bk_date, bk_province, bk_city, bk_brgy, bk_street, bk_postal, bk_latitude, bk_longitude, cus_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING bk_id;  -- Return the id of the newly inserted booking
    `;

    const result = await pool.query(query, [
      date,
      province,
      city,
      brgy,
      street,
      postal,
      latitude,
      longitude,
      id
    ]);

    if (result.rows.length > 0) {
      const bookingId = result.rows[0].bk_id;

      // Insert multiple waste types into booking_waste
      if (wasteTypes && wasteTypes.length > 0) {
        const insertWasteQuery = `
          INSERT INTO booking_waste (bw_name, bw_unit, bw_price, bk_id)
          VALUES ($1, $2, $3, $4)
        `;

        // Use a transaction to insert waste types
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          for (const wasteType of wasteTypes) {
            await client.query(insertWasteQuery, [wasteType.name, wasteType.unit, wasteType.price, bookingId]);
          }

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('Error inserting waste types:', error.message);
          return res.status(500).json({ error: 'Failed to insert waste types' });
        } finally {
          client.release();
        }
      }

      // Respond with the newly created booking ID
      res.status(200).json({ bookingId });
    } else {
      console.error('Booking insertion failed');
      res.status(400).json({ error: 'Booking insertion failed' });
    }
  } catch (error) {
    console.error('Error inserting booking:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//fetch booking data
app.post('/fetch_booking', authenticateToken, async (req, res) => {
  const userId = req.user.id;  // Assuming the user ID is stored in the token
  try {
    const result = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE cus_id = $1 ORDER BY bk_date ASC',
      [userId]
    );

    if (result.rows.length > 0) {
      // Extract all booking IDs (bk_id) for the user
      const bookingIds = result.rows.map(booking => booking.bk_id);

      // Fetch the booking waste for the user's booking IDs
      const result2 = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
        [bookingIds]
      );
      // Combine booking data and waste data into one response object
      res.status(200).json({
        booking: result.rows,
        wasteTypes: result2.rows

      });
    } else {
      res.status(404).json({ error: 'No bookings found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//update booking
app.post('/booking_update', authenticateToken, async (req, res) => {
  const id = req.user.id;

  const {
    bookingId,  // Pass this in the request to update an existing booking
    date,
    province,
    city,
    brgy,
    street,
    postal,
    latitude,
    longitude,
    wasteTypes  // List of new waste types
  } = req.body;

  try {
    const client = await pool.connect();

    try {
      // Start a transaction
      await client.query('BEGIN');

      // Step 1: Update the booking details
      const updateBookingQuery = `
        UPDATE booking 
        SET bk_date = $1, bk_province = $2, bk_city = $3, bk_brgy = $4, bk_street = $5, bk_postal = $6, bk_latitude = $7, bk_longitude = $8 
        WHERE bk_id = $9 AND cus_id = $10
        RETURNING bk_id;
      `;

      const result = await client.query(updateBookingQuery, [
        date,
        province,
        city,
        brgy,
        street,
        postal,
        latitude,
        longitude,
        bookingId,
        id  // Check that the booking belongs to the authenticated user
      ]);

      if (result.rows.length === 0) {
        throw new Error('Booking update failed or booking not found');
      }

      // Step 2: Delete old booking_waste entries based on bk_id
      const deleteWasteQuery = `
        DELETE FROM booking_waste WHERE bk_id = $1;
      `;
      await client.query(deleteWasteQuery, [bookingId]);

      // Step 3: Insert new booking_waste entries
      if (wasteTypes && wasteTypes.length > 0) {
        const insertWasteQuery = `
          INSERT INTO booking_waste (bw_name, bw_unit, bw_price, bk_id)
          VALUES ($1, $2, $3, $4);
        `;

        for (const wasteType of wasteTypes) {
          await client.query(insertWasteQuery, [
            wasteType.name,
            wasteType.unit,
            wasteType.price,
            bookingId
          ]);
        }
      }

      // Commit the transaction
      await client.query('COMMIT');

      // Respond with the updated booking ID
      res.status(200).json({ bookingId });
    } catch (error) {
      // Rollback the transaction in case of an error
      await client.query('ROLLBACK');
      console.error('Error updating booking:', error.message);
      res.status(500).json({ error: 'Failed to update booking' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//cancel booking
app.post('/booking_cancel', authenticateToken, async (req, res) => {
  const id = req.user.id;

  const {
    bookingId,  // Pass this in the request to update an existing booking
  } = req.body;

  try {
    const query =
      'UPDATE booking SET bk_status = \'Cancelled\' WHERE cus_id = $1 AND bk_id = $2 RETURNING *';

    const result = await pool.query(query, [
      id,
      bookingId
    ]);

    if (result.rows.length > 0) {
      res.status(200).json({ bookingId });
    } else {
      console.error('Booking insertion failed');
      res.status(400).json({ error: 'Booking cancellation failed' });
    }
  } catch (error) {
    console.error('Error booking cancellation:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});


//////PAYMENT////////////////////////////////////////////////////////////////////////////
// const PAYMONGO_SECRET_KEY = 'sk_test_SEQdG3bnMZroCCEVDm216X2Q'; // Replace with your actual key
// const encodedSecretKey = Buffer.from(PAYMONGO_SECRET_KEY).toString('base64');

// // Route to create a PayMongo payment link
// app.post('/payment_link', authenticateToken, async (req, res) => {
//   const { amount } = req.body;  // The amount in centavos
//   const { email } = req.user;   // Email from the decoded token

//   try {
//     // Create the payment link using PayMongo's API
//     const response = await axios.post(
//       'https://api.paymongo.com/v1/links',
//       {
//         data: {
//           attributes: {
//             amount: amount,
//             description: `Payment from ${email}`,
//             checkout_url: null,
//             payment_method_types: ['card', 'gcash'],
//             currency: 'PHP',
//           },
//         },
//       },
//       {
//         headers: {
//           Authorization: `Basic ${encodedSecretKey}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     const paymentLink = response.data.data;

//     // Check if the paymentLink contains the checkout URL
//     const checkoutUrl = paymentLink.attributes.checkout_url;

//     // If checkout URL exists, return it
//     if (checkoutUrl) {
//       res.json({
//         checkoutUrl: checkoutUrl,
//       });
//     } else {
//       throw new Error('Checkout URL not available');
//     }
//   } catch (error) {
//     console.error('Error creating payment link:', error.message || error);
//     res.status(500).json({ error: 'Failed to create payment link' });
//   }
// });



//const PAYMONGO_SECRET_KEY = 'sk_test_B3AhBpzntGs1eYhNKBWo1hSw'; // Replace with your actual key
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET;

if (!PAYMONGO_SECRET_KEY) {
  throw new Error('PayMongo secret key is not defined');
}
const encodedSecretKey = Buffer.from(PAYMONGO_SECRET_KEY).toString('base64');

// Route to create a PayMongo payment link
app.post('/payment_link', authenticateToken, async (req, res) => {
  const { amount } = req.body;  // The amount in centavos
  const { email } = req.user;   // Email from the decoded token

  try {
    // Create the payment link using PayMongo's API
    const response = await axios.post(
      'https://api.paymongo.com/v1/links',
      {
        data: {
          attributes: {
            amount: amount,
            description: `Payment from ${email}`,
            checkout_url: null,
            payment_method_types: ['card', 'gcash'],
            currency: 'PHP',
          },
        },
      },
      {
        headers: {
          Authorization: `Basic ${encodedSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const paymentLink = response.data.data;

    // Check if the paymentLink contains the checkout URL
    const checkoutUrl = paymentLink.attributes.checkout_url;

    // If checkout URL exists, return it
    if (checkoutUrl) {
      res.json({
        checkoutUrl: checkoutUrl,
      });
    } else {
      throw new Error('Checkout URL not available');
    }
  } catch (error) {
    console.error('Error creating payment link:', error.message || error);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});


///////link2
app.post('/payment_link2', authenticateToken, async (req, res) => {
  const { amount } = req.body;  // The amount in centavos
  const { email } = req.user;   // Email from the decoded token

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const result = await pool.query('SELECT * FROM CUSTOMER WHERE cus_email = $1', [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const name = `${user.cus_fname} ${user.cus_mname || ''} ${user.cus_lname}`.trim();
      const phone = user.cus_contact;

      const response = await axios.post(
        'https://api.paymongo.com/v1/checkout_sessions',
        {
          data: {
            attributes: {
              amount: amount * 100,
              currency: 'PHP',
              description: 'Payment for your transaction',
              billing: {
                name,
                email,
                phone,
              },
              line_items: [
                {
                  name: 'Food Waste',
                  amount: 100 * 100,
                  currency: 'PHP',
                  description: 'Payment for service',
                  quantity: 1,
                },
              ],
              payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
              success_url: 'https://trashtrack.com/success',
              cancel_url: 'https://trashtrack.com/cancel',
            },
          },
        },
        {
          headers: {
            Authorization: `Basic ${encodedSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const checkoutUrl = response.data.data.attributes.checkout_url;

      // const checkoutSession = response.data.data;
      // const sessionId = checkoutSession.id;  // Checkout session ID
      // const transactionId = checkoutSession.attributes.transaction_id; // If available

      const checkoutSession = response.data.data;
      const sessionId = checkoutSession.id;  // Checkout session ID
      // const paymentId = checkoutSession.payments.id; // Payment ID
      // const paymentStatus = checkoutSession.payments.attributes.status; // Payment status

      console.log(sessionId);
      // console.log(paymentId);
      // console.log(paymentStatus);
      console.log(checkoutUrl);
      if (checkoutUrl) {
        res.json({ checkoutUrl });
      } else {
        throw new Error('Checkout URL not available');
      }
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});


// // Route to create a PayMongo checkout session
// app.post('/payment_link2', authenticateToken, async (req, res) => {
//   const { amount } = req.body;  // The amount in centavos
//   const { email } = req.user;   // Email from the decoded token

//   console.log(amount, email);
//   try {
//     // Create the checkout session using PayMongo's API
//     const response = await axios.post(
//       'https://api.paymongo.com/v1/checkout_sessions',
//       {
//         data: {
//           attributes: {
//             amount: amount * 100, // Amount in centavos
//             currency: 'PHP',
//             description: `Payment for`,
//             billing: {
//               name: 'mike',
//               email: email,
//               phone: '092323223',
//             },
//             line_items: [
//               {
//                 name: 'mikesadsda',
//                 amount: 100 * 100, // Price in centavos
//                 currency: 'PHP',
//                 description: 'mikeadsasdasdadas',
//                 quantity: 1,
//               },
//             ],
//             payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
//             // success_url: 'trashtrack://success', // Redirect to your app on success
//             // cancel_url: 'trashtrack://cancel',   // Redirect to your app on cancel
//             // success_url: 'https://example.com/success', // Redirect to your app on success
//             // cancel_url: 'https://example.com/cancel',   // Redirect to your app on cancel
//             success_url: 'https://trashtrack.com/success', // Redirect to your app on success
//             cancel_url: 'https://trashtrack.com/cancel', // Redirect to your app on cancel

//           },
//         },
//       },
//       {
//         headers: {
//           Authorization: `Basic ${encodedSecretKey}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     const checkoutSession = response.data.data;

//     // Check if the checkoutSession contains the checkout URL
//     const checkoutUrl = checkoutSession.attributes.checkout_url;
//     console.log(checkoutUrl);
//     // If checkout URL exists, return it
//     if (checkoutUrl) {
//       res.json({
//         checkoutUrl: checkoutUrl,
//       });
//     } else {
//       throw new Error('Checkout URL not available');
//     }
//   } catch (error) {
//     console.error('Error creating checkout session:', error.message || error);
//     res.status(500).json({ error: 'Failed to create checkout session' });
//   }
// });






///status
app.get('/payment_status/:paymentId', authenticateToken, async (req, res) => {
  const { paymentId } = req.params;


  try {
    const response = await axios.get(
      `https://api.paymongo.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Basic ${encodedSecretKey}`,
        },
      }
    );

    const paymentStatus = response.data.data.attributes.status;
    console.log(paymentStatus);
    res.json({ status: paymentStatus });

  } catch (error) {
    console.error('Error fetching payment status:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});





// Start the server
// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://192.168.254.187:${port}`);
});

//http://192.168.119.156