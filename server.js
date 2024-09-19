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
    SELECT 'hauler' AS table_name FROM hauler WHERE haul_email = $1
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
      SELECT 'hauler' AS table_name FROM hauler WHERE haul_contact = $1
      UNION ALL
      SELECT 'operational_dispatcher' AS table_name FROM operational_dispatcher WHERE op_contact = $1
      UNION ALL
      SELECT 'billing_officer' AS table_name FROM billing_officer WHERE bo_contact = $1
      UNION ALL
      SELECT 'account_manager' AS table_name FROM account_manager WHERE acc_contact = $1
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

// EMAIL forgot pass check existing cus and haul
app.post('/email_check_forgotpass', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const checkEmail = await pool.query(`
      SELECT 'customer' AS table_name FROM customer WHERE cus_email = $1
      UNION ALL
      SELECT 'hauler' AS table_name FROM hauler WHERE haul_email = $1
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
        'active',                 // cus_status
        'non-contractual',         // cus_type
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
        'active', 'non-contractual', 'email_password'
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
        if (status == 'deactivated') {
          return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
        }
        if (status == 'suspended') {
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

    // Check if hauler exists by email
    const checkHaulerEmail = await pool.query(
      'SELECT * FROM HAULER WHERE haul_email = $1',
      [email]
    );

    if (checkHaulerEmail.rows.length > 0) {
      // Get the hashed password from the database
      const hauler = checkHaulerEmail.rows[0];
      const authType = hauler.haul_auth_method;
      const status = hauler.haul_status;
      //const email = hauler.haul_email;

      if (authType == 'google') {
        return res.status(402).json({ message: 'Looks like this account is signed up with google. Please login with google' });
      }

      const storedHashedPassword = hauler.haul_password;
      // Hash the incoming password
      const hashedPassword = hashPassword(password);

      // Compare the hashed password with the stored hashed password
      if (hashedPassword === storedHashedPassword) {
        if (status == 'deactivated') {
          return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
        }
        if (status == 'suspended') {
          return res.status(203).json({ message: 'Your Accoount is currently suspended' });
        }

        // Access the inserted row
        const id = hauler.haul_id;

        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        // console.error('access: ' + accessToken);
        // console.error('refresh: ' + refreshToken);
        return res.status(201).json({
          message: 'User found in hauler',
          accessToken: accessToken,
          refreshToken: refreshToken
        });

      }
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or hauler tables' });
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
      if (customer.cus_status == 'active') {
        res.status(200).json({ message: 'User is a customer' });
      }
    }

    //check where user is from table
    const checkHaulerEmail = await pool.query(
      'SELECT * FROM HAULER WHERE haul_email = $1',
      [email]
    );

    if (checkHaulerEmail.rowCount > 0) {
      const hauler = checkHaulerEmail.rows[0];
      if (hauler.haul_status == 'active') {
        res.status(201).json({ message: 'User is a hauler' });
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
      if (status == 'deactivated') {
        return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
      }
      if (status == 'suspended') {
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

    // Check if hauler exists by email
    const checkHaulerEmail = await pool.query(
      'SELECT * FROM HAULER WHERE haul_email = $1',
      [email]
    );

    if (checkHaulerEmail.rows.length > 0) {
      // Get the hashed password from the database
      const hauler = checkHaulerEmail.rows[0];
      const authType = hauler.haul_auth_method;
      const status = hauler.haul_status;

      if (authType == 'email_password') {
        return res.status(402).json({ message: 'Looks like this account is registered with email and password. Please log in using your email and password.' });
      }
      if (status == 'deactivated') {
        return res.status(202).json({ message: 'Your Accoount is currently deactivated' });
      }
      if (status == 'suspended') {
        return res.status(203).json({ message: 'Your Accoount is currently suspended' });
      }
      // Access the inserted row
      const id = hauler.haul_id;

      // store user data to token
      const user = { email: email, id: id };

      const { accessToken, refreshToken } = generateTokens(user);
      console.log(accessToken + '' + refreshToken);
      return res.status(201).json({
        message: 'Successful google hauler login',
        accessToken: accessToken,
        refreshToken: refreshToken
      });
      //return res.status(201).json({ message: 'User found in hauler' });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or hauler tables' });
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

    // Check if the email exists in the 'hauler' table
    const checkHaulerEmail = await pool.query(
      'SELECT haul_password FROM HAULER WHERE haul_email = $1',
      [email]
    );

    if (checkHaulerEmail.rows.length > 0) {
      const currentPassword = checkHaulerEmail.rows[0].haul_password;
      const hashedNewPassword = hashPassword(newPassword);

      // Check if the new password is the same as the current password
      if (currentPassword === hashedNewPassword) {
        return res.status(400).json({ error: 'New password cannot be the same as the old password' });
      }

      // Update the password if it is different
      await pool.query(
        'UPDATE HAULER SET haul_password = $1 WHERE haul_email = $2',
        [hashedNewPassword, email]
      );

      return res.status(200).json({ message: 'Password updated successfully for hauler' });
    }

    // If email not found in either table
    return res.status(404).json({ error: 'Email address not found in customer or hauler tables' });
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

    // If not found in CUSTOMER table, check in the HAULER table
    if (result.rows.length === 0) {
      result = await pool.query('SELECT * FROM HAULER WHERE haul_email = $1', [email]);
    }

    // Check if any user data was found
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // Handle profile image for both CUSTOMER and HAULER tables
      let base64Image = null;
      if (user.cus_profile) {
        base64Image = user.cus_profile.toString('base64');  // If cus_profile exists
      } else if (user.haul_profile) {
        base64Image = user.haul_profile.toString('base64'); // If haul_profile exists
      }

      // Add the base64 image data to the response object
      const responseData = {
        ...user,
        profileImage: base64Image  // Add the base64-encoded image here
      };

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

    // If not found in CUSTOMER table, check in the HAULER table
    if (result.rows.length === 0) {
      result = await pool.query('SELECT haul_profile FROM HAULER WHERE haul_email = $1', [email]);
    }

    // Check if any user data was found
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // Handle profile image for both CUSTOMER and HAULER tables
      let base64Image = null;
      if (user.cus_profile) {
        base64Image = user.cus_profile.toString('base64');  // If cus_profile exists
      } else if (user.haul_profile) {
        base64Image = user.haul_profile.toString('base64'); // If haul_profile exists
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
    const result = await pool.query('SELECT wc_name FROM waste_category WHERE wc_status = $1', ['active']);
    res.json(result.rows);
   
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
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



const PAYMONGO_SECRET_KEY = 'sk_test_SEQdG3bnMZroCCEVDm216X2Q'; // Replace with your actual key
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
app.post('/payment_intent', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const { email } = req.user;

  try {
    const paymentIntentResponse = await axios.post(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: {
            amount: amount,
            payment_method_allowed: ['gcash', 'card'],  // You can allow more methods
            currency: 'PHP',
            capture_type: 'automatic',
            description: `Payment from ${email}`,
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

    const paymentIntent = paymentIntentResponse.data.data;

    // Proceed to create a source for GCash payment
    const paymentSourceResponse = await axios.post(
      'https://api.paymongo.com/v1/sources',
      {
        data: {
          attributes: {
            amount: amount,
            redirect: {
              success: 'https://yourwebsite.com/success',
              failed: 'https://yourwebsite.com/failure',
            },
            type: 'gcash',  // GCash is the type here, you can use card for card payments
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

    const paymentSource = paymentSourceResponse.data.data;
    const checkoutUrl = paymentSource.attributes.redirect.checkout_url;

    res.json({
      checkoutUrl: checkoutUrl,
    });
  } catch (error) {
    console.error('Error creating payment intent or source:', error.message || error);
    res.status(500).json({ error: 'Failed to create payment intent or source' });
  }
});





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

