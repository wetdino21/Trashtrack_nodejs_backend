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
// app.use(bodyParser.json());
// app.use(cors());
// Increase the limit for JSON and URL-encoded payloads
app.use(bodyParser.json({ limit: '50mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

////////////////////////////////////////

const fs = require('fs');
const https = require('https');

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
const RATE_LIMIT = 1 * 60 * 1000; // 1 minutes
const emailLimitCache = {};

// API Endpoints

// send create verification code (with check email)
app.post('/api/send_code_createacc', async (req, res) => {
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

// send verification code (with check email)
app.post('/api/send_code_forgotpass', async (req, res) => {
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
app.post('/api/verify_code', async (req, res) => {
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
/////////////////////////////////////////////

//FETCH ALL DATA 
// app.post('/api/fetch_user_data', async (req, res) => {
//   const { email } = req.body;
//   try {
//     // First, check in the CUSTOMER table
//     let result = await pool.query('SELECT * FROM CUSTOMER WHERE cus_email = $1', [email]);

//     // If not found in CUSTOMER table, check in the HAULER table
//     if (result.rows.length === 0) {
//       result = await pool.query('SELECT * FROM HAULER WHERE haul_email = $1', [email]);
//     }
//     if(result.rows.length > 0){
//       const user = result.rows[0];

//       // Convert 'cus_profile' from bytea to base64
//       const base64Image = user.cus_profile
//         ? user.cus_profile.toString('base64') // Convert bytea to base64 string
//         : null;

//       // Log the base64 string
//       console.log('Base64 Encoded Image:', base64Image);
//     }

//     // Check if any data was found
//     if (result.rows.length > 0) {
//       // const user = result.rows[0];
//       // // Convert bytea data to base64 string
//       // user.cus_profile = user.cus_profile.toString('base64');

//       res.json(user);
//     } else {
//       res.status(404).json({ error: 'User not found' });
//     }
//   } catch (error) {
//     console.error('Error fetching user data:', error.message);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

//FETCH ALL DATA 
app.post('/api/fetch_user_data', async (req, res) => {
  const { email } = req.body;

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

// EMAIL forgot pass check existing cus and haul
app.post('/api/email_check_forgotpass', async (req, res) => {
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
app.post('/api/signup_google', async (req, res) => {
  const { fname, lname, email, photo } = req.body;
  try {

    // Convert base64 string back to bytea
    const photoBytes = photo ? Buffer.from(photo, 'base64') : null;

    // Insert the new customer into the CUSTOMER table with hashed password
    const result = await pool.query(
      'INSERT INTO CUSTOMER (cus_fname, cus_lname, cus_email, cus_status, cus_type, cus_auth_method, cus_profile) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [fname, lname, email, 'active', 'non-contractual', 'google', photoBytes]
    );

    res.status(201).json(result.rows[0]);
  }
  catch (error) {
    console.error('Error inserting user:', error.message);//show debug print on server cmd
    res.status(500).json({ error: 'Database error' });
  }
});

// 1. CREATE ACC (email_password)
app.post('/api/signup', async (req, res) => {
  const { fname, lname, email, password } = req.body;
  try {
    // Hash the password before storing it
    const hashedPassword = hashPassword(password);

    // Insert the new customer into the CUSTOMER table with hashed password
    const result = await pool.query(
      'INSERT INTO CUSTOMER (cus_fname, cus_lname, cus_email, cus_password, cus_status, cus_type, cus_auth_method) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [fname, lname, email, hashedPassword, 'active', 'non-contractual', 'email_password']
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
        return res.status(200).json({ message: 'User found in customer' });
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
        return res.status(201).json({ message: 'User found in hauler' });
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

////////////
// LOGIN with GOOGLE
app.post('/api/login_google', async (req, res) => {
  const { email} = req.body;

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
      return res.status(200).json({ message: 'User found in customer' });
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
      return res.status(201).json({ message: 'User found in hauler' });
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
app.post('/api/update_password', async (req, res) => {
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
    //console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

//email forgot pass
app.post('/api/send_email_forgotpass', async (req, res) => {
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









// Start the server
// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://192.168.254.187:${port}`);
});

