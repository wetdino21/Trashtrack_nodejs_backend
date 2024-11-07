

const express = require('express');
const path = require('path');

const WebSocket = require('ws');
const url = require('url');
// Store WebSocket connections mapped by userId
const userConnections = {};

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

//pdf
const { Buffer } = require('buffer');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');

//
const app = express();
const port = 3000;

const networkLink = `http://192.168.254.187:${port}`;


const wss = new WebSocket.Server({ port: 8080 });
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
app.use('/public', express.static(path.join(__dirname, 'public')));

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
  return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit number
}


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


// //websocket
// wss.on('connection', (ws) => {
//   console.log('Client connected');

//   // Handle incoming messages from the client
//   ws.on('message', (message) => {
//     const parsedMessage = JSON.parse(message);
//     switch (parsedMessage.type) {
//       case 'chat':
//         console.log('Received chat message:', parsedMessage.content);
//         // Send a response to the client
//         ws.send(JSON.stringify({ type: 'chat', content: 'Chat message received' }));
//         break;
//       case 'notification':
//         console.log('Received notification message:', parsedMessage.content);
//         ws.send(JSON.stringify({ type: 'notification', content: 'Notification received' }));
//         break;
//       case 'update':
//         console.log('Received update message:', parsedMessage.content);
//         ws.send(JSON.stringify({ type: 'update', content: 'Update received' }));
//         break;
//       default:
//         ws.send(JSON.stringify({ type: 'error', content: 'Unknown message type' }));
//     }
//   });

//   // Handle client disconnection
//   ws.on('close', () => {
//     console.log('Client disconnected');
//   });
// });

// Listen for PostgreSQL notifications
pool.connect((err, client, done) => {
  if (err) throw err;

  client.on('notification', async (msg) => {
    const notificationData = JSON.parse(msg.payload);
    const userId = notificationData.cus_id;

    // Get count of unread notifications for the user
    try {
      const countQuery = 'SELECT COUNT(*) FROM notification WHERE cus_id = $1 AND notif_read = false';
      const result = await pool.query(countQuery, [userId]);
      const unreadCount = result.rows[0].count;

      console.log(`User ${userId} has ${unreadCount} unread notifications`);

      // Send the unread count to the WebSocket client
      const userWs = userConnections[userId];
      if (userWs && userWs.readyState === WebSocket.OPEN) {
        userWs.send(JSON.stringify({ unread_count: unreadCount }));
      }
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    }
  });

  // Subscribe to the PostgreSQL notification channel
  client.query('LISTEN new_notification_channel');
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const query = url.parse(req.url, true).query;
  const userId = query.userId;

  if (userId) {
    userConnections[userId] = ws;
    console.log(`User ${userId} connected`);

    ws.send(JSON.stringify({ message: `Welcome User ${userId}` }));

    ws.on('close', () => {
      delete userConnections[userId];
      console.log(`User ${userId} disconnected`);
    });
  } else {
    ws.close();
  }
});

// Optional: Handle WebSocket server errors
wss.on('error', (error) => {
  console.error('WebSocket error:', error);
});



// send code Email 
async function sendRegistrationCode(to, code) {
  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,
      subject: 'Verification Code',          // List of receivers
      html: `
   <html>
    <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
      <div style="background-color: #673ab7; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; ">
       
          <div style="text-align: center;">
           <h1 style="color: #fff; text-align: center; font-size: 40px">TrashTrack</h1>
               <img src="cid:trashtrack_image" alt="TrashTrack Logo" style="max-width: 200px; height: auto;">
          </div>
        <h2 style="color: #ecf0f1;">Dear User,</h2>
        <p style="color: #ecf0f1; font-size: 16px">Thank you for registering with Trashtrack.</p>
       
        <p style="color: #ecf0f1; font-size: 16px">To complete your registration, please use the following verification code:</p>
        <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
          <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0; letter-spacing: 5px;">
              ${code}
          </h3>
        </div>
        <p style="color: #ecf0f1; font-size: 16px">If you did not request this verification code, please ignore this email.</p>
        <p style="color: #ecf0f1; font-size: 16px">Best regards,<br>The TrashTrack Team</p>
      </div>
    </body>
  </html>

  `,
      attachments: [
        {
          filename: 'trashtrack.jpg',
          //path: 'C:/CAPSTONE/trashtrack/frontend/assets/icon/goldy.jpg',
          path: '../backend/public/images/trashtrackicon.png',
          cid: 'trashtrack_image' // same as the image cid in the <img> tag
        },
      ],
    });
    return info.messageId;
  } catch (error) {
    console.error('Datbase error:', error.message);
    throw new Error('Failed to send email');
  }
}

// send code email update 
async function sendEmailUpdateCode(to, code) {
  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,
      subject: 'Verification Code',          // List of receivers
      html: `
  <html>
  <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
    <div style="background-color: #673ab7; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto;">
      <div style="text-align: center;">
        <h1 style="color: #fff; text-align: center; font-size: 40px;">TrashTrack</h1>
        <img src="cid:trashtrack_image" alt="TrashTrack Logo" style="max-width: 200px; height: auto;">
      </div>
      <h2 style="color: #ecf0f1;">Dear User,</h2>
      <p style="color: #ecf0f1; font-size: 16px;">
        We've received a request to update the email address associated with your TrashTrack account.
      </p>
      <p style="color: #ecf0f1; font-size: 16px;">
        To confirm this change and verify your new email address, please enter the following verification code:
      </p>
      <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
        <h3 style="color: #fff; font-size: 30px; text-align: center; margin: 0; letter-spacing: 5px;">
          ${code}
        </h3>
      </div>
      <p style="color: #ecf0f1; font-size: 16px;">
        If you did not request this change, please ignore this email, and your email address will remain unchanged.
      </p>
      <p style="color: #ecf0f1; font-size: 16px;">
        Best regards,<br>The TrashTrack Team
      </p>
    </div>
  </body>
</html>
  `,
      attachments: [
        {
          filename: 'trashtrack.jpg',
          //path: 'C:/CAPSTONE/trashtrack/frontend/assets/icon/goldy.jpg',
          path: '../backend/public/images/trashtrackicon.png',
          cid: 'trashtrack_image' // same as the image cid in the <img> tag
        },
      ],
    });
    return info.messageId;
  } catch (error) {
    console.error('Datbase error:', error.message);
    throw new Error('Failed to send email');
  }
}

//send code email forgotpass
async function sendForgotPassCode(to, code) {
  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,
      subject: 'Verification Code',          // List of receivers
      html: `
  <html>
  <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
    <div style="background-color: #673ab7; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; ">
       <div style="text-align: center;">
           <h1 style="color: #fff; text-align: center; font-size: 40px">TrashTrack</h1>
               <img src="cid:trashtrack_image" alt="TrashTrack Logo" style="max-width: 200px; height: auto;">
          </div>
      <h2 style="color: #ecf0f1;">Password Reset Request</h2>
      <h2 style="color: #ecf0f1;">Dear User,</h2>
      <p style="color: #ecf0f1; font-size: 16px">You have requested to reset your password for your Trashtrack account.</p>
      <p style="color: #ecf0f1; font-size: 16px">Please use the following verification code to proceed with resetting your password:</p>
      <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
        <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0; letter-spacing: 5px;">
          ${code}
        </h3>
      </div>
      <p style="color: #ecf0f1; font-size: 16px">This code is valid for 5 minutes.</p>
      <p style="color: #ecf0f1; font-size: 16px">If you did not request a password reset, please ignore this email. Your account will remain secure.</p>
      <p style="color: #ecf0f1; font-size: 16px">Best regards,<br>The TrashTrack Team</p>
    </div>
  </body>
</html>
  `,
      attachments: [
        {
          filename: 'trashtrack.jpg',
          //path: 'C:/CAPSTONE/trashtrack/frontend/assets/icon/goldy.jpg',
          path: '../backend/public/images/trashtrackicon.png',
          cid: 'trashtrack_image' // same as the image cid in the <img> tag
        },
      ],
    });
    return info.messageId;
  } catch (error) {
    console.error('Datbase error:', error.message);
    throw new Error('Failed to send email');
  }
}

//send code email bind to trashtrack
async function sendBindTrashtrackCode(to, code) {
  try {
    const info = await transporter.sendMail({
      from: smtp.auth.user, // Sender address
      to: to,
      subject: 'Verification Code',          // List of receivers
      html: `
 <html>
  <body style="font-family: Arial, sans-serif; color: #fff; margin: 0; padding: 0;">
    <div style="background-color: #673ab7; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto;">
      <div style="text-align: center;">
        <h1 style="color: #fff; text-align: center; font-size: 40px">TrashTrack</h1>
        <img src="cid:trashtrack_image" alt="TrashTrack Logo" style="max-width: 200px; height: auto;">
      </div>
      <h2 style="color: #ecf0f1;">Set Your Password</h2>
      <h2 style="color: #ecf0f1;">Dear User,</h2>
      <p style="color: #ecf0f1; font-size: 16px;">
        Thank you for binding your account with email and password, allowing you to access TrashTrack with either Google Authentication or a password.
      </p>
      <p style="color: #ecf0f1; font-size: 16px;">
        Please use the following verification code to complete the process of setting your password:
      </p>
      <div style="background-color: #1abc9c; padding: 15px; border-radius: 4px; max-width: fit-content; margin: 0 auto;">
        <h3 style="color: #fff; font-size: 30px; text-align: left; margin: 0; letter-spacing: 5px;">
          ${code}
        </h3>
      </div>
      <p style="color: #ecf0f1; font-size: 16px;">
        This code is valid for 5 minutes.
      </p>
      <p style="color: #ecf0f1; font-size: 16px;">
        If you did not initiate this request, please ignore this email and continue using your Google account to log in. Your account will remain secure.
      </p>
      <p style="color: #ecf0f1; font-size: 16px;">
        Best regards,<br>The TrashTrack Team
      </p>
    </div>
  </body>
</html>

  `,
      attachments: [
        {
          filename: 'trashtrack.jpg',
          //path: 'C:/CAPSTONE/trashtrack/frontend/assets/icon/goldy.jpg',
          path: '../backend/public/images/trashtrackicon.png',
          cid: 'trashtrack_image' // same as the image cid in the <img> tag
        },
      ],
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

    await sendRegistrationCode(email, code); //call function to send email

    return res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('Datbase error:', error.message);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// send bind with email-password verification code (with check email)
app.post('/send_code_trashrack_bind', async (req, res) => {
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

    await sendBindTrashtrackCode(email, code); //call function to send email

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

    await sendForgotPassCode(email, code); //call function to send email

    return res.status(200).json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('Datbase error:', error.message);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});


// send code user update (with check email)
app.post('/send_code_email_update', async (req, res) => {
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

    await sendEmailUpdateCode(email, code); //call function to send email

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
        'GOOGLE',                  // cus_auth_method
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
        'Active', 'Non-Contractual', 'TRASHTRACK'
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

// Update account
app.post('/user_update', authenticateToken, async (req, res) => {
  const id = req.user.id; // Get the user ID from the token
  const emailToken = req.user.email;
  const { fname, mname, lname, email, photo, contact, province, city, brgy, street, postal, address } = req.body;

  try {
    // Convert base64 string back to bytea
    const photoBytes = photo ? Buffer.from(photo, 'base64') : null;

    let checkEemail = await pool.query(
      'SELECT CUS_EMAIL FROM CUSTOMER WHERE CUS_EMAIL = $1', [emailToken]
    );
    if (checkEemail.rows.length > 0) {
      // Update the customer record in the database
      const result = await pool.query(
        `UPDATE CUSTOMER
      SET 
        cus_fname = $1, 
        cus_mname = $2, 
        cus_lname = $3, 
        cus_email = $4, 
        cus_profile = $5,
        cus_contact = $6, 
        cus_province = $7, 
        cus_city = $8, 
        cus_brgy = $9, 
        cus_street = $10, 
        cus_postal = $11
      WHERE cus_id = $12 RETURNING *`,
        [
          fname,
          mname,
          lname,
          email,
          photoBytes,
          contact,
          province,
          city,
          brgy,
          street,
          postal,
          id
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Access the updated row
      const updatedRow = result.rows[0];
      const user = { email: updatedRow.cus_email, id: updatedRow.cus_id };
      const { accessToken, refreshToken } = generateTokens(user);

      return res.status(200).json({
        message: 'User updated successfully',
        accessToken: accessToken,
        refreshToken: refreshToken,
      });
    }

    checkEemail = await pool.query(
      'SELECT EMP_EMAIL FROM EMPLOYEE WHERE EMP_EMAIL = $1', [emailToken]
    );
    if (checkEemail.rows.length > 0) {
      // Update the customer record in the database
      const result = await pool.query(
        `UPDATE EMPLOYEE
      SET 
        emp_fname = $1, 
        emp_mname = $2, 
        emp_lname = $3, 
        emp_email = $4, 
        emp_profile = $5,
        emp_contact = $6, 
        emp_address = $7
      WHERE emp_id = $8 RETURNING *`,
        [
          fname,
          mname,
          lname,
          email,
          photoBytes,
          contact,
          address,
          id
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Access the updated row
      const updatedRow = result.rows[0];
      const user = { email: updatedRow.emp_email, id: updatedRow.emp_id };
      const { accessToken, refreshToken } = generateTokens(user);

      return res.status(200).json({
        message: 'User updated successfully',
        accessToken: accessToken,
        refreshToken: refreshToken,
      });
    }

  } catch (error) {
    console.error('Error updating user:', error.message); // Show debug print on server cmd
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

      if (authType == 'GOOGLE') {
        return res.status(402).json({ message: 'Looks like this account is signed up with google. Please login with google' });
      }

      const storedHashedPassword = customer.cus_password;

      // Hash the incoming password
      const hashedPassword = hashPassword(password);

      // Compare the hashed password with the stored hashed password
      if (hashedPassword === storedHashedPassword) {
        if (status == 'Deactivated') {
          return res.status(202).json({
            email: email,
            type: 'customer', message: 'Your Accoount is currently deactivated'
          });
        }
        if (status == 'Suspended') {
          return res.status(203).json({ message: 'Your Accoount is currently suspended' });
        }

        if (status == 'Active') {
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

      if (authType == 'GOOGLE') {
        return res.status(402).json({ message: 'Looks like this account is signed up with google. Please login with google' });
      }

      const storedHashedPassword = employee.emp_password;
      // Hash the incoming password
      const hashedPassword = hashPassword(password);

      // Compare the hashed password with the stored hashed password
      if (hashedPassword === storedHashedPassword) {
        if (status == 'Deactivated') {
          return res.status(202).json({
            email: email,
            type: 'hauler', message: 'Your Accoount is currently deactivated'
          });
        }
        if (status == 'Suspended') {
          return res.status(203).json({ message: 'Your Accoount is currently suspended' });
        }
        if (status == 'Active') {
          // Access the inserted row
          const id = employee.emp_id;

          // store user data to token
          const user = { email: email, id: id };

          const { accessToken, refreshToken } = generateTokens(user);
          // console.error('access: ' + accessToken);
          // console.error('refresh: ' + refreshToken);
          return res.status(200).json({
            message: 'User found as Employee',
            accessToken: accessToken,
            refreshToken: refreshToken
          });
        }
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

// // Middleware to authenticate access token
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) return res.status(403).json({ error: 'No access token provided' });

//   // Verify the access token
//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) {
//       if (err.name === 'TokenExpiredError') {
//         return res.status(401).json({ error: 'Access token has expired' });
//       }
//       return res.status(403).json({ error: 'Invalid access token' });
//     }
//     req.user = user;
//     next();
//   });
// };

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
        return res.status(200).json({ message: 'User is a customer' });
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
        return res.status(201).json({ message: 'User is a employee' });
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

      if (authType == 'TRASHTRACK') {
        return res.status(402).json({ message: 'Looks like this account is not registered with Google. Please log in using your email and password.' });
      }
      if (status == 'Deactivated') {
        return res.status(202).json({
          email: email,
          type: 'customer', message: 'Your Accoount is currently deactivated'
        });
      }
      if (status == 'Suspended') {
        return res.status(203).json({ message: 'Your Accoount is currently suspended' });
      }
      if (status == 'Active') {
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
      }

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

      if (authType == 'TRASHTRACK') {
        return res.status(402).json({ message: 'Looks like this account is not registered with google. Please log in using your email and password.' });
      }
      if (status == 'Deactivated') {
        return res.status(202).json({
          email: email,
          type: 'hauler', message: 'Your Accoount is currently deactivated'
        });
      }
      if (status == 'Suspended') {
        return res.status(203).json({ message: 'Your Accoount is currently suspended' });
      }
      if (status == 'Active') {
        // Access the inserted row
        const id = employee.emp_id;

        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        return res.status(200).json({
          message: 'Successful google EMPLOYEE login',
          accessToken: accessToken,
          refreshToken: refreshToken
        });
      }

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

// reactivate acc
app.post('/reactivate', async (req, res) => {
  const { email, type } = req.body;
  let success = false;
  try {
    if (type === 'customer') {
      const result = await pool.query(
        'UPDATE CUSTOMER SET cus_status = $1 WHERE cus_email = $2',
        ['Active', email]
      );
      if (result.rowCount > 0) {
        success = true;
      }
    } else if (type === 'hauler') {
      const result = await pool.query(
        'UPDATE EMPLOYEE SET emp_status = $1 WHERE emp_email = $2',
        ['Active', email]
      );
      if (result.rowCount > 0) {
        success = true;
      }
    }

    if (success) {
      return res.status(200).json({ message: 'Reactivated successfully' });
    } else {
      return res.status(400).json({ error: 'Unable to reactivate. Please check the email or account type.' });
    }
  } catch (error) {
    console.error('Error during reactivation:', error.message);
    res.status(500).json({ error: 'Database error occurred during reactivation' });
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
        <h1 style="color: #fff; text-align: center;">Trashtrack</h1>
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
      <h1 style="color: #fff; text-align: center;">Trashtrack</h1>
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
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});
///EMAIL


//deactivate
app.post('/deactivate', authenticateToken, async (req, res) => {
  const email = req.user.email;

  try {
    // Check if the user is in the CUSTOMER or EMPLOYEE table
    let result = await pool.query('SELECT cus_status FROM CUSTOMER WHERE cus_email = $1', [email]);

    let isCustomer = true;
    if (result.rows.length === 0) {
      result = await pool.query('SELECT emp_status FROM EMPLOYEE WHERE emp_email = $1', [email]);
      isCustomer = false;
    }

    // Check if any user data was found
    if (result.rows.length > 0) {
      // Prepare the deactivation query
      const deactivateQuery = isCustomer
        ? 'UPDATE CUSTOMER SET cus_status = $1 WHERE cus_email = $2'
        : 'UPDATE EMPLOYEE SET emp_status = $1 WHERE emp_email = $2';

      // Execute the deactivation query
      result = await pool.query(deactivateQuery, ['Deactivated', email]);

      // Check if the deactivation was successful using rowCount
      if (result.rowCount > 0) {
        res.status(200).json({ message: 'Account deactivated successfully' });
      } else {
        res.status(404).json({ error: 'Unable to deactivate account' });
      }
    } else {
      console.error('User not found');
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error deactivating user:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//arrive notif
app.post('/arrival_notif', authenticateToken, async (req, res) => {
  const id = req.user.id;
  const { bk_id } = req.body;

  try {
    const bookingResult = await pool.query('SELECT * FROM booking WHERE bk_id = $1', [bk_id]);

    // Check if the booking exists
    if (bookingResult.rows.length === 0) {
      console.error('Booking not found');
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.bk_arrived == true) {
      return res.status(429).json({ message: 'Already notified' });
    }

    const fullAddress = `${booking.bk_street}, ${booking.bk_brgy}, ${booking.bk_city}, ${booking.bk_province}, ${booking.bk_postal}`;
    const pickupDateOnly = new Date(booking.bk_date).toLocaleDateString(); // Extract only the date part
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Format current time to HH:MM

    const message = `Waste Pickup Truck has arrived 🚛.\n` +
      `------------------------------------------\n` +
      `BOOKING# ${bk_id}\n\n` +
      `Dear ${booking.bk_fullname},\n\n` +
      `Please be prepared for waste collection at your designated spot!\n\n` +
      `📍 Pickup Location: ${fullAddress}\n\n` +
      `Thank you for your cooperation 💜`;
    //`Date: ${pickupDateOnly}  ${currentTime}\n\n` +
    //`Please be prepared for waste collection at your designated spot. Ensure that all waste for collection is accessible and ready for pickup.\n\n`;

    const notificationResult = await pool.query(
      'INSERT INTO notification (notif_message, emp_id, cus_id, bk_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [message, id, booking.cus_id, bk_id]
    );
    if (notificationResult.rows.length > 0) {
      const updateBook = await pool.query(`UPDATE BOOKING SET BK_ARRIVED = $1 WHERE BK_ID = $2`, [true, bk_id]);
      if (updateBook.rowCount > 0)
        res.json({ notification: notificationResult.rows[0] });
    }

  } catch (error) {
    console.error('Error handling arrival notification:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//read notification
app.post('/read_notification', authenticateToken, async (req, res) => {
  const { notif_id } = req.body;

  try {
    await pool.query('UPDATE NOTIFICATION SET notif_read = $1 WHERE notif_id = $2', [true, notif_id]);
    res.json();
  } catch (error) {
    console.error('Error handling arrival notification:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//fetch status notif
app.post('/fetch_notif_status', async (req, res) => {
  const { bkId } = req.body;

  try {
    const status = await pool.query('SELECT BK_STATUS FROM BOOKING WHERE bk_id = $1', [bkId]);
    if (status.rows.length > 0) {
      console.error(status.rows[0]);
      return res.json(status.rows[0]);
    }
    return res.status(404).json();
  } catch (error) {
    console.error('Error fetching booking status:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//total cus request
app.post('/total_cus_pickup_request', authenticateToken, async (req, res) => {
  const id = req.user.id;
  try {
    const result = await pool.query('SELECT COUNT(CUS_ID) AS total FROM BOOKING WHERE cus_id = $1', [id]);
    res.json({ total: result.rows[0].total }); // Access the total count
  } catch (error) {
    console.error('Error handling total request:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//total pickup
app.post('/total_hauler_pickup', authenticateToken, async (req, res) => {
  const id = req.user.id;
  try {
    const result = await pool.query('SELECT COUNT(EMP_ID) AS total FROM BOOKING WHERE emp_id = $1 AND bk_status = $2', [id, 'Collected']);
    res.json({ total: result.rows[0].total }); // Access the total count
  } catch (error) {
    console.error('Error handling total pickup:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//total cus waste collected
app.post('/total_cus_waste_collected', authenticateToken, async (req, res) => {
  const id = req.user.id;
  try {
    const result = await pool.query(`SELECT SUM(bw.bw_total_unit) AS total FROM BOOKING b 
      JOIN BOOKING_WASTE bw ON b.bk_id = bw.bk_id WHERE b.cus_id = $1 AND bw.bw_unit = $2 AND b.bk_status = $3`, [id, 'kg', 'Collected']);
    res.json({ total: result.rows[0].total }); // Access the total count
  } catch (error) {
    console.error('Error handling total request:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//total haul waste collected
app.post('/total_haul_waste_collected', authenticateToken, async (req, res) => {
  const id = req.user.id;
  try {
    const result = await pool.query(`SELECT SUM(bw.bw_total_unit) AS total FROM BOOKING b 
      JOIN BOOKING_WASTE bw ON b.bk_id = bw.bk_id WHERE b.emp_id = $1 AND bw.bw_unit = $2 AND b.bk_status = $3`, [id, 'kg', 'Collected']);
    res.json({ total: result.rows[0].total }); // Access the total count
  } catch (error) {
    console.error('Error handling total request:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});


///////////CUSTOMER DATA ////////////////////////////////////////////////////////
//FETCH ALL DATA 
app.post('/fetch_data', authenticateToken, async (req, res) => {
  const email = req.user.email;

  let userType = 'customer'; //for identity
  try {
    let result = await pool.query('SELECT * FROM CUSTOMER WHERE cus_email = $1', [email]);

    // If not found in CUSTOMER table, check in the EMPLOYEE table
    if (result.rows.length === 0) {
      userType = 'hauler'; //for identity
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
        user: userType,
      };
      // Conditionally add `roleName` if it's an employee
      if (user.role_name) {
        responseData.emp_role = user.role_name;
      }

      // Log the base64 string (optional for debugging)

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

//fetch profile
app.post('/fetch_profile', authenticateToken, async (req, res) => {
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

// Check if booking limit is reached
app.post('/check_book_limit', authenticateToken, async (req, res) => {
  const userId = req.user.id;  // Assuming the user ID is stored in the token
  try {
    // Fetch booking limit
    const bookLimit = await pool.query(`SELECT BL_MAX_COUNT, BL_STOP FROM BOOKING_LIMIT LIMIT 1`);

    if (bookLimit.rows.length === 0) {
      return res.status(400).json({ error: "No booking limit data found." });
    }
    if (bookLimit.rows[0].bl_stop === true) {
      return res.status(409).json({ error: "WE dont accept booking at this time" });
    }

    const maxCount = parseInt(bookLimit.rows[0].bl_max_count, 10); // Convert to integer

    // Fetch the current booking count for the user
    const result = await pool.query(
      'SELECT COUNT(bk_id) AS count FROM booking WHERE (bk_status = $1 OR bk_status = $2) AND cus_id = $3',
      ['Pending', 'Ongoing', userId]
    );

    const bookingCount = parseInt(result.rows[0].count, 10);

    // Check if the booking limit is reached
    if (bookingCount >= maxCount) {
      return res.status(429).json({ error: 'Booking limit reached' });
    }

    // Success - booking allowed
    res.status(200).json({ message: 'Booking allowed' });

  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//check unpaid bill
app.post('/check_unpaid_bill', authenticateToken, async (req, res) => {
  const userId = req.user.id;  // Assuming the user ID is stored in the token
  try {
    const result = await pool.query(
      'SELECT gb.gb_id FROM GENERATE_BILL gb JOIN BOOKING b ON gb.bk_id = b.bk_id WHERE gb.gb_status = $1  AND b.cus_id = $2',
      ['Unpaid', userId]
    );

    if (result.rows.length > 0) {
      return res.status(429).json({ error: 'Pending payment' });
    }

    // Success - booking allowed
    res.status(200).json({ message: 'Booking allowed' });

  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fetch booking limit
app.post('/fetch_book_limit', authenticateToken, async (req, res) => {

  try {
    const bookLimit = await pool.query(`SELECT * FROM BOOKING_LIMIT`);

    if (bookLimit.rows.length > 0) {
      return res.status(200).json(bookLimit.rows[0]);
    }
    else {
      return res.status(404).json({ error: 'No bookings limit found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fetch day limit
app.post('/fetch_day_limit', authenticateToken, async (req, res) => {

  try {
    const bookLimit = await pool.query(`WITH daily_counts AS (
                                          SELECT 
                                              DATE(bk_date) AS day,
                                              COUNT(*) AS count_per_day
                                          FROM 
                                              booking
                                          GROUP BY 
                                              DATE(bk_date)
                                      )
                                      SELECT 
                                          daily_counts.day,
                                          daily_counts.count_per_day,
                                          booking_limit.bl_max_day
                                      FROM 
                                          daily_counts
                                      CROSS JOIN
                                          booking_limit
                                      WHERE 
                                          daily_counts.count_per_day >= booking_limit.bl_max_day
                                      ORDER BY 
                                          daily_counts.day;`);

    if (bookLimit.rows.length > 0) {
      return res.status(200).json(bookLimit.rows);
    }
    else {
      return res.status(404).json({ error: 'No bookings limit found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fetch waste limit
app.post('/fetch_waste_limit', authenticateToken, async (req, res) => {
  const { date } = req.body;

  try {
    const bookLimit = await pool.query(`SELECT
                      bw.wc_id,
                      wc.wc_name,
                      COUNT(bw.bw_id) AS bw_count,
                      wc.wc_max 
                      FROM
                      booking b
                      JOIN
                      booking_waste bw ON b.bk_id = bw.bk_id
                      JOIN
                      waste_category wc ON bw.wc_id = wc.wc_id
                      WHERE
                      DATE(b.bk_date) = $1 
                      GROUP BY
                      bw.wc_id, wc.wc_name, wc.wc_max 
                      HAVING
                      COUNT(bw.bw_id) >= wc.wc_max 
                      ORDER BY
                      bw.wc_id;
                      `, [date]);

    //
    console.log(bookLimit.rows);
    return res.status(200).json(bookLimit.rows);

  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Check if date is from max date
app.post('/check_date_limit', authenticateToken, async (req, res) => {
  const { date } = req.body; // Expect the date to be sent in the request body

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    // Ensure the date is in the correct format for PostgreSQL
    const formattedDate = new Date(date).toISOString().split('T')[0]; // Convert to YYYY-MM-DD

    const bookLimit = await pool.query(`
       WITH daily_counts AS (
         SELECT 
           DATE(bk_date) AS day,
           COUNT(*) AS count_per_day
         FROM 
           booking
         GROUP BY 
           DATE(bk_date)
       )
       SELECT 
         daily_counts.day,
         daily_counts.count_per_day,
         booking_limit.bl_max_day
       FROM 
         daily_counts
       CROSS JOIN 
         booking_limit
       WHERE 
         daily_counts.day = $1
       AND 
         daily_counts.count_per_day >= booking_limit.bl_max_day
       LIMIT 1;`, [formattedDate]);

    console.log(bookLimit.rows);
    console.log(date);
    if (bookLimit.rows.length > 0) {
      return res.status(200).json({ isExceeding: true }); //bad
    } else {
      return res.status(200).json({ isExceeding: false }); //good
    }
  } catch (error) {
    console.error('Error checking date limit:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});


// booking
app.post('/booking', authenticateToken, async (req, res) => {
  const id = req.user.id;

  const {
    fullname,
    contact,
    province,
    city,
    brgy,
    street,
    postal,
    latitude,
    longitude,
    date,
    wasteTypes  // list
  } = req.body;

  try {
    // check if date is not full
    const bookLimit = await pool.query(`
       WITH daily_counts AS (
         SELECT 
           DATE(bk_date) AS day,
           COUNT(*) AS count_per_day
         FROM 
           booking
         GROUP BY 
           DATE(bk_date)
       )
       SELECT 
         daily_counts.day,
         daily_counts.count_per_day,
         booking_limit.bl_max_day
       FROM 
         daily_counts
       CROSS JOIN 
         booking_limit
       WHERE 
         daily_counts.day = $1
       AND 
         daily_counts.count_per_day >= booking_limit.bl_max_day
       LIMIT 1;`, [date]);

    if (bookLimit.rows.length > 0) {
      return res.status(429).json(); //fully booked date
    }

    //insert now
    const query = `
      INSERT INTO booking (bk_fullname, bk_contact, bk_province, bk_city, bk_brgy, bk_street, bk_postal, bk_latitude, bk_longitude, bk_date, cus_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING bk_id;  -- Return the id of the newly inserted booking
    `;

    const result = await pool.query(query, [
      fullname,
      contact,
      province,
      city,
      brgy,
      street,
      postal,
      latitude,
      longitude,
      date,
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
  const userId = req.user.id; // Assuming the user ID is stored in the token

  try {
    // Fetch current bookings (Pending, Ongoing)
    const resultCurrent = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE cus_id = $1 AND (bk_status = $2 OR bk_status = $3) ORDER BY bk_date ASC',
      [userId, 'Pending', 'Ongoing']
    );

    // Extract all current booking IDs (bk_id)
    const bookingCurrentIds = resultCurrent.rows.map(booking => booking.bk_id);

    // Fetch waste types for current bookings
    let resultCurrentWaste = { rows: [] };
    if (bookingCurrentIds.length > 0) {
      resultCurrentWaste = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
        [bookingCurrentIds]
      );
    }

    // Fetch historical bookings (all other statuses)
    const resultHistory = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE cus_id = $1 AND bk_status NOT IN ($2, $3) ORDER BY bk_date DESC',
      [userId, 'Pending', 'Ongoing']
    );

    // Extract all historical booking IDs (bk_id)
    const bookingHistoryIds = resultHistory.rows.map(booking => booking.bk_id);

    // Fetch waste types for historical bookings
    let resultHistoryWaste = { rows: [] };
    if (bookingHistoryIds.length > 0) {
      resultHistoryWaste = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
        [bookingHistoryIds]
      );
    }

    // Combine current and historical booking data into one response object
    res.status(200).json({
      booking: resultCurrent.rows,
      wasteTypes: resultCurrentWaste.rows,
      booking2: resultHistory.rows,
      wasteTypes2: resultHistoryWaste.rows
    });
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// app.post('/fetch_booking', authenticateToken, async (req, res) => {
//   const userId = req.user.id;  // Assuming the user ID is stored in the token
//   try {
//     const result = await pool.query(
//       'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE cus_id = $1 ORDER BY bk_date ASC',
//       [userId]
//     );

//     if (result.rows.length > 0) {
//       // Extract all booking IDs (bk_id) for the user
//       const bookingIds = result.rows.map(booking => booking.bk_id);

//       // Fetch the booking waste for the user's booking IDs
//       const result2 = await pool.query(
//         'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
//         [bookingIds]
//       );
//       // Combine booking data and waste data into one response object
//       res.status(200).json({
//         booking: result.rows,
//         wasteTypes: result2.rows

//       });
//     } else {
//       res.status(404).json({ error: 'No bookings found' });
//     }
//   } catch (error) {
//     console.error('Error fetching booking data:', error.message);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

//fetch booking data
app.post('/fetch_booking_details', authenticateToken, async (req, res) => {
  const { bookID } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM booking WHERE bk_id = $1',
      [bookID]
    );

    if (result.rows.length > 0) {
      const result2 = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = $1',
        [bookID]
      );
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
    fullname,
    contact,
    province,
    city,
    brgy,
    street,
    postal,
    latitude,
    longitude,
    date,
    wasteTypes  // list
  } = req.body;

  try {
    // check if date is not full
    const bkdateDB = await pool.query(`SELECT bk_id from booking where bk_id = $1 AND date(bk_date) = $2`, [bookingId, date]);
    if (bkdateDB.rows.length === 0) {
      const bookLimit = await pool.query(`
        WITH daily_counts AS (
          SELECT 
            DATE(bk_date) AS day,
            COUNT(*) AS count_per_day
          FROM 
            booking
          GROUP BY 
            DATE(bk_date)
        )
        SELECT 
          daily_counts.day,
          daily_counts.count_per_day,
          booking_limit.bl_max_day
        FROM 
          daily_counts
        CROSS JOIN 
          booking_limit
        WHERE 
          daily_counts.day = $1
        AND 
          daily_counts.count_per_day >= booking_limit.bl_max_day
        LIMIT 1;`, [date]);

      if (bookLimit.rows.length > 0) {
        return res.status(429).json(); //fully booked date
      }
    }


    //
    const result = await pool.query(
      'SELECT bk_status FROM booking WHERE bk_status != $1 AND bk_id = $2',
      ['Pending', bookingId]
    );

    if (result.rows.length > 0) {
      //was already onging no update
      return res.status(409).json({ message: 'Booking cannot be updated as it is no longer pending.' });
    }

    //if still pending
    const client = await pool.connect();

    try {
      // Start a transaction
      await client.query('BEGIN');

      // Step 1: Update the booking details
      const updateBookingQuery = `
        UPDATE booking 
        SET  bk_fullname = $1, bk_contact = $2, bk_province = $3, bk_city = $4, bk_brgy = $5, bk_street = $6, bk_postal = $7, bk_latitude = $8, bk_longitude = $9, bk_date = $10
        WHERE bk_id = $11 AND cus_id = $12
        RETURNING bk_id;
      `;

      const result = await client.query(updateBookingQuery, [
        fullname,
        contact,
        province,
        city,
        brgy,
        street,
        postal,
        latitude,
        longitude,
        date,
        bookingId,
        id
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
    const resultOnging = await pool.query(
      'SELECT bk_status FROM booking WHERE bk_status != $1 AND bk_id = $2',
      ['Pending', bookingId]
    );

    if (resultOnging.rows.length > 0) {
      return res.status(409).json({ message: 'Booking cannot be cancel as it is no longer pending.' });
    }

    //if still pending
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

//fetch booking today pending
app.post('/fetch_today_booking', authenticateToken, async (req, res) => {
  //const userId = req.user.id;  

  try {
    // const result = await pool.query(
    //   'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND bk_date::date <= CURRENT_DATE ORDER BY bk_date ASC',
    //   ['Pending']
    // );
    const result = await pool.query(
      `SELECT *, bk_date::timestamp without time zone AS bk_date 
       FROM booking 
       WHERE bk_status = $1 
         AND bk_date::date <= CURRENT_DATE 
       ORDER BY 
         bk_priority DESC, 
         bk_date ASC`,
      ['Pending']
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

//fetch booking upcoming pending
app.post('/fetch_upcoming_booking', authenticateToken, async (req, res) => {

  try {
    const result = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND bk_date::date > CURRENT_DATE ORDER BY  bk_priority DESC, bk_date ASC',
      ['Pending']
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

//accept booking
app.post('/accept_booking', authenticateToken, async (req, res) => {
  const userID = req.user.id;
  const { bookID, haulLat, haulLong } = req.body;
  try {
    const resultPending = await pool.query(
      'SELECT bk_status FROM booking WHERE bk_status = $1 AND bk_id = $2',
      ['Pending', bookID]
    );
    if (resultPending.rows.length === 0) {
      return res.status(409).json({ message: 'Already accepted from other' });
    }
    //if still pending
    const result = await pool.query(
      'UPDATE BOOKING SET bk_status = $1, bk_haul_lat = $2, bk_haul_long = $3, emp_id = $4 WHERE bk_id = $5',
      ['Ongoing', haulLat, haulLong, userID, bookID]
    );
    if (result.rowCount > 0) {
      res.status(200).json({ message: 'Accepted booking' });
    } else {
      res.status(404).json({ error: 'No bookings found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//cancel booking
app.post('/booking_return', authenticateToken, async (req, res) => {
  const id = req.user.id;

  const {
    bookingId,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE booking
       SET 
         bk_status = $1, 
         bk_haul_lat = NULL, 
         bk_haul_long = NULL, 
         emp_id = NULL, 
         bk_arrived = $2 
       WHERE bk_id = $3`,
      [
        'Pending',
        false,
        bookingId
      ]
    );

    if (result.rowCount > 0) {
      res.status(200).json({ bookingId });
    } else {
      console.error('Booking return failed');
      res.status(400).json({ error: 'Booking return failed' });
    }
  } catch (error) {
    console.error('Error booking cancellation:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//fetch current all pickup
app.post('/fetch_hauler_pickup', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Fetch current bookings
    const resultCurrent = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND emp_id = $2 ORDER BY bk_date ASC',
      ['Ongoing', userId]
    );

    // Extract all current booking IDs (bk_id)
    const bookingCurrentIds = resultCurrent.rows.map(booking => booking.bk_id);

    // Fetch the waste types for current bookings (if any)
    let resultCurrentWaste = { rows: [] };
    if (bookingCurrentIds.length > 0) {
      resultCurrentWaste = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
        [bookingCurrentIds]
      );
    }

    // Fetch historical bookings
    const resultHistory = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE (bk_status != $1 AND bk_status != $2 AND bk_status != $3) AND emp_id = $4 ORDER BY bk_date DESC',
      ['Pending', 'Ongoing', 'Cancelled', userId]
    );

    // Extract all historical booking IDs (bk_id)
    const bookingHistoryIds = resultHistory.rows.map(booking => booking.bk_id);

    // Fetch the waste types for historical bookings (if any)
    let resultHistoryWaste = { rows: [] };

    if (bookingHistoryIds.length > 0) {
      resultHistoryWaste = await pool.query(
        'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
        [bookingHistoryIds]
      );
    }

    // Combine current and historical booking data into one response object
    res.status(200).json({
      booking: resultCurrent.rows,
      wasteTypes: resultCurrentWaste.rows,
      booking2: resultHistory.rows,
      wasteTypes2: resultHistoryWaste.rows
    });
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});



// Fetch all bill
app.post('/fetch_bill', authenticateToken, async (req, res) => {
  const cusId = req.user.id; // Assuming user ID is available after authentication

  try {
    // Fetch bills associated with the specified bk_id for the authenticated customer

    const result = await pool.query(
      `SELECT gb.* FROM GENERATE_BILL gb
       JOIN BOOKING b ON gb.BK_ID = b.BK_ID
       WHERE b.CUS_ID = $1 AND gb.gb_status = $2`,
      [cusId, 'Unpaid']
    );

    // const result = await pool.query(
    //   `SELECT gb.*, 
    //           (SUM(bw.bw_total_price)) AS amount_due
    //    FROM GENERATE_BILL gb
    //    JOIN BOOKING b ON gb.BK_ID = b.BK_ID
    //    JOIN BOOKING_WASTE bw ON bw.BK_ID = b.BK_ID
    //    WHERE b.CUS_ID = $1 AND gb.gb_status = $2
    //    GROUP BY gb.BK_ID, gb.GB_ID, gb.gb_tax, gb.gb_status
    //    ORDER BY gb_date_due
    //   `,
    //   [cusId, 'Unpaid']
    // );

    // Check if any bill data was found
    if (result.rows.length > 0) {

      // const Datetoday = new Date().setHours(0, 0, 0, 0); // Today's date at midnight
      // const Date_today = new Date(Datetoday);
      // result.rows.forEach(row => {
      //   const taxRate = row.gb_tax / 100; // Convert tax to decimal
      //   let amount_due = parseFloat(row.amount_due);
      //   //let amount_due = row.amount_due; // Amount due before VAT
      //   const vat = amount_due * taxRate; // Calculate VAT
      //   amount_due += vat; // Add VAT to amount due

      //   // Calculate due dates for interest application
      //   const dateIssued = new Date(row.gb_date_issued).setHours(0, 0, 0, 0);
      //   const leadDays = row.gb_lead_days;
      //   const dueDate = new Date(dateIssued);
      //   dueDate.setDate(dueDate.getDate() + leadDays); // Calculate due date

      //   const accrualPeriod = row.gb_accrual_period;
      //   const suspendPeriod = row.gb_suspend_period;
      //   const interest = row.gb_interest;

      //   // Check if today is past the due date
      //   if (Date_today > dueDate) {
      //     console.log(`\nBill ID: ${row.gb_id}`);
      //     console.log('Amount after VAT: ₱' + amount_due.toFixed(2));
      //     console.log('Today is after the due date, interest will be applied.');

      //     // Apply interest for the first time after the due date
      //     let interestAppliedCount = 0;  // To count how many times interest is applied
      //     let interestAmount = amount_due * (interest / 100);
      //     amount_due += interestAmount; // Add interest
      //     interestAppliedCount += 1;

      //     console.log(`First interest applied: ₱${interestAmount.toFixed(2)}`);
      //     console.log('New Amount Due after first interest:', amount_due.toFixed(2));

      //     // Calculate accrual date and suspension date
      //     let accrualDate = new Date(dueDate);
      //     accrualDate.setDate(accrualDate.getDate() + accrualPeriod);
      //     let suspendDate = new Date(dueDate);
      //     suspendDate.setDate(suspendDate.getDate() + suspendPeriod);

      //     // Continue applying interest until the suspension date
      //     while (Date_today >= accrualDate && accrualDate <= suspendDate) {
      //       interestAmount = amount_due * (interest / 100);
      //       amount_due += interestAmount; // Add interest


      //       console.log(`Accrued interest applied: ₱${interestAmount.toFixed(2)}`);
      //       console.log('New Amount Due after accrued interest:', amount_due.toFixed(2));

      //       // Move to the next accrual period
      //       accrualDate.setDate(accrualDate.getDate() + accrualPeriod);
      //     }
      //   }

      //   console.log(`Final Amount Due after interest for Bill ID ${row.gb_id}: ₱${amount_due.toFixed(2)}`);
      // });

      res.json(result.rows); // Return the bills as a response
    } else {
      res.status(404).json({ error: 'No bills found for the specified booking ID' });
    }
  } catch (error) {
    console.error('Error fetching bill data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fetch single bill
app.post('/fetch_bill_details', authenticateToken, async (req, res) => {
  const { billId } = req.body;

  try {
    // Fetch bills associated with the specified bk_id for the authenticated customer
    const result = await pool.query(
      `SELECT * FROM GENERATE_BILL WHERE GB_ID = $1`,
      [billId]
    );

    // Check if any bill data was found
    if (result.rows.length > 0) {
      const amount_due = await fetchTotalAmountDue(result.rows[0].gb_id);
      //console.log(amount_due);
      // Include the amount_due in the response
      const billDetails = { ...result.rows[0], amount_due };
      res.json(billDetails);
    } else {
      console.error('No bills found ');
      res.status(404).json({ error: 'No bills found ' });
    }
  } catch (error) {
    console.error('Error fetching bill data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fetch total amount due
async function fetchTotalAmountDue(gb_id) {
  try {
    const result = await pool.query(
      `SELECT gb.*, 
              (SUM(bw.bw_total_price)) AS amount_due
       FROM GENERATE_BILL gb
       JOIN BOOKING b ON gb.BK_ID = b.BK_ID
       JOIN BOOKING_WASTE bw ON bw.BK_ID = b.BK_ID
       WHERE gb.GB_ID = $1
       GROUP BY gb.BK_ID, gb.GB_ID, gb.gb_tax, gb.gb_status`,
      [gb_id]
    );

    // Check if any bill data was found
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const Datetoday = new Date().setHours(0, 0, 0, 0); // Today's date at midnight
      const Date_today = new Date(Datetoday);

      const taxRate = row.gb_tax / 100; // Convert tax to decimal
      let amount_due = parseFloat(row.amount_due);
      const addFees = Number(row.gb_add_fees);
      const addNote = row.gb_note;

      if (addNote != null && addFees > 0) {
        amount_due += addFees;
      }
      //let amount_due = row.amount_due; // Amount due before VAT
      const vat = amount_due * taxRate; // Calculate VAT
      amount_due += vat; // Add VAT to amount due

      // Calculate due dates for interest application
      const dateIssued = new Date(row.gb_date_issued).setHours(0, 0, 0, 0);
      const leadDays = row.gb_lead_days;
      const dueDate = new Date(dateIssued);
      dueDate.setDate(dueDate.getDate() + leadDays); // Calculate due date

      const accrualPeriod = row.gb_accrual_period;
      const suspendPeriod = row.gb_suspend_period;
      const interest = row.gb_interest;

      // Check if today is past the due date
      if (Date_today > dueDate) {
        // console.log(`\nBill ID: ${row.gb_id}`);
        // console.log('Amount after VAT: ₱' + amount_due.toFixed(2));
        // console.log('Today is after the due date, interest will be applied.');

        // Apply interest for the first time after the due date
        let interestAppliedCount = 0;  // To count how many times interest is applied
        let interestAmount = amount_due * (interest / 100);
        amount_due += interestAmount; // Add interest
        interestAppliedCount += 1;

        // console.log(`First interest applied: ₱${interestAmount.toFixed(2)}`);
        // console.log('New Amount Due after first interest:', amount_due.toFixed(2));

        // Calculate accrual date and suspension date
        let accrualDate = new Date(dueDate);
        accrualDate.setDate(accrualDate.getDate() + accrualPeriod);
        let suspendDate = new Date(dueDate);
        suspendDate.setDate(suspendDate.getDate() + suspendPeriod);

        // Continue applying interest until the suspension date
        while (Date_today >= accrualDate && accrualDate <= suspendDate) {
          interestAmount = amount_due * (interest / 100);
          amount_due += interestAmount; // Add interest


          // console.log(`Accrued interest applied: ₱${interestAmount.toFixed(2)}`);
          // console.log('New Amount Due after accrued interest:', amount_due.toFixed(2));

          // Move to the next accrual period
          accrualDate.setDate(accrualDate.getDate() + accrualPeriod);
        }
      }

      console.log(`Calculation Final Amount Due after interest for Bill ID ${row.gb_id}: ₱${amount_due.toFixed(2)}`);
      return parseFloat(amount_due.toFixed(2)); // Return the final amount due
    } else {
      console.error('No bills found for the specified booking ID');
      //throw new Error('No bills found for the specified booking ID');
    }
  } catch (error) {
    console.error('Error fetching total amount due:', error.message);
    throw new Error('Database error');
  }
}

//get payment
app.post('/fetch_payment', authenticateToken, async (req, res) => {
  const cusId = req.user.id;

  try {
    const result = await pool.query(`SELECT p.*,b.bk_id FROM PAYMENT p JOIN generate_bill gb ON gb.gb_id = p.gb_id JOIN booking b ON gb.bk_id = b.bk_id WHERE b.cus_id = $1  ORDER BY p_date_paid DESC`, [cusId]);

    // Check if any user data was found
    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.status(404).json({ error: 'not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//get payment details
app.post('/fetch_payment_details', authenticateToken, async (req, res) => {
  const { billId } = req.body;

  try {
    const result = await pool.query(`SELECT * FROM PAYMENT WHERE gb_id = $1`, [billId]);

    // Check if any user data was found
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//fetch all pdf bills
app.post('/fetch_pdf_bills', authenticateToken, async (req, res) => {
  const { gb_id } = req.body;
  try {
    const result = await pool.query(`
      SELECT bd_created_at,
        bd_total_amnt, bd_file FROM bill_document WHERE gb_id = $1 ORDER BY bd_created_at DESC`, [gb_id]);

    if (result.rows.length > 0) {
      // Map over all rows to convert PDF data to base64
      const billsData = result.rows.map(bill => ({
        bd_created_at: bill.bd_created_at,
        bd_total_amnt: bill.bd_total_amnt,
        bd_file: bill.bd_file.toString('base64'),
      }));
      res.json(billsData);
    } else {
      res.status(404).json({ error: 'Bills not found' });
    }
  } catch (error) {
    console.error('Error fetching bill data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

//
// app.post('/fetch_pdf', authenticateToken, async (req, res) => {
//   const { gb_id } = req.body;
//   try {
//     const result = await pool.query(`SELECT bd_file FROM bill_document WHERE gb_id = $1`, [gb_id]);
//     if (result.rows.length > 0) {
//       console.log(22222222);
//       const pdfFiles = result.rows.map(row => row.bd_file); // Collect all PDF binary data
//       res.contentType("application/json");
//       res.json(pdfFiles);
//     } else {
//       res.status(404).json({ error: 'PDFs not found' });
//     }
//   } catch (error) {
//     console.error('Error fetching PDFs:', error.message);
//     res.status(500).json({ error: 'Database error' });
//   }
// });



// Fetch all vehicles with vehicle type
app.post('/fetch_all_vehicles', authenticateToken, async (req, res) => {
  try {
    // Fetch all vehicles along with their vehicle type
    const result = await pool.query(
      `
      SELECT v.v_id, v.v_plate, v.v_status, v.v_capacity, v.v_capacity_unit, 
             v.v_created_at, v.v_updated_at, v.emp_id, v.driver_id, 
             v.driver_date_assigned_at, v.driver_date_updated_at, 
             vt.vtype_name
      FROM vehicle v
      JOIN vehicle_type vt ON v.v_typeid = vt.vtype_id
      `
    );

    // Check if any vehicle data was found
    if (result.rows.length > 0) {
      res.json(result.rows); // Return the vehicles and their types as a response
    } else {
      console.error('No vehicles found');
      res.status(404).json({ error: 'No vehicles found' });
    }
  } catch (error) {
    console.error('Error fetching vehicle data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// app.post('/fetch_hauler_pickup', authenticateToken, async (req, res) => {
//   const userId = req.user.id;

//   try {
//      //current
//     const resultCurrent = await pool.query(
//       'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND emp_id = $2 ORDER BY bk_date ASC',
//       ['Ongoing', userId]
//     );
//     if (resultCurrent.rows.length > 0) {
//       // Extract all booking IDs (bk_id) for the user
//       const bookingCurrentIds = resultCurrent.rows.map(booking => booking.bk_id);

//       // Fetch the booking waste for the user's booking IDs
//       const resultCurrentWaste = await pool.query(
//         'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
//         [bookingCurrentIds]
//       );

//       //history
//       const resultHistory = await pool.query(
//         'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND emp_id = $2 ORDER BY bk_date ASC',
//         ['Ongoing', userId]
//       );
//       if (resultHistory.rows.length > 0) {
//         const bookingHistoryIds = resultCurrent.rows.map(booking => booking.bk_id);
//         const resultHistoryWaste = await pool.query(
//           'SELECT * FROM booking_waste WHERE bk_id = ANY($1::int[])',
//           [bookingHistoryIds]
//         );
//       }
//       // Combine booking data and waste data into one response object
//       res.status(200).json({
//         booking: resultCurrent.rows,
//         wasteTypes: resultCurrentWaste.rows

//       });
//     } else {
//       res.status(404).json({ error: 'No bookings found' });
//     }
//   } catch (error) {
//     console.error('Error fetching booking data:', error.message);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// Fetch haul latitude longitude
app.post('/fetch_all_latlong', authenticateToken, async (req, res) => {
  const { bookID } = req.body;

  try {
    const result = await pool.query(
      'SELECT bk_haul_lat, bk_haul_long, bk_latitude, bk_longitude FROM BOOKING WHERE bk_id = $1',
      [bookID]
    );

    if (result.rows.length > 0) {
      const { bk_haul_lat, bk_haul_long, bk_latitude, bk_longitude } = result.rows[0]; // Get the first row of results
      return res.status(200).json({
        haul_lat: bk_haul_lat,
        haul_long: bk_haul_long,
        cus_lat: bk_latitude,
        cus_long: bk_longitude,
      });
    } else {
      return res.status(404).json({ error: 'No bookings found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

// update haul latitude longitude
app.post('/update_haul_latlong', authenticateToken, async (req, res) => {
  const { bookID, lat, long } = req.body;

  try {
    const result = await pool.query(
      'UPDATE booking SET bk_haul_lat = $1, bk_haul_long = $2 WHERE bk_id = $3 AND bk_status = $4',
      [lat, long, bookID, 'Ongoing']
    );

    if (result.rowCount > 0) {
      return res.status(200).json();
    } else {
      return res.status(404).json({ error: 'No bookings found' });
    }
  } catch (error) {
    console.error('Error fetching booking data:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
});


// Update password and auth method
app.post('/binding_trashtrack', authenticateToken, async (req, res) => {
  const id = req.user.id; // Get the user ID from the token
  const email = req.user.email;
  const { password } = req.body; // Assuming the password is sent in the request body

  // Update employee password and auth method
  const hashedPassword = hashPassword(password);

  try {
    // Check if the email belongs to an employee or a customer
    let emailCheck = await pool.query(
      `SELECT cus_email from CUSTOMER WHERE cus_email = $1`,
      [email]
    );

    if (emailCheck.rows.length > 0) {
      const result = await pool.query(
        `UPDATE CUSTOMER 
        SET cus_password = $1, cus_auth_method = 'TRASHTRACK_GOOGLE' 
        WHERE cus_email = $2 RETURNING *`,
        [hashedPassword, email]
      );

      if (result.rowCount > 0) {
        return res.status(200).json({ message: 'Success' });
      }
    }

    //if hauler
    emailCheck = await pool.query(
      `SELECT emp_email from EMPLOYEE WHERE emp_email = $1`,
      [email]
    );

    if (emailCheck.rows.length > 0) {
      const result = await pool.query(
        `UPDATE EMPLOYEE 
         SET emp_password = $1, emp_auth_method = 'TRASHTRACK_GOOGLE' 
         WHERE emp_email = $2 RETURNING *`,
        [hashedPassword, email]
      );

      if (result.rowCount > 0) {
        return res.status(200).json({ message: 'Success' });
      }
    }

    return res.status(404).json({ message: 'User not found' });

  } catch (error) {
    console.error('Error updating user:', error.message); // Show debug print on server cmd
    res.status(500).json({ error: 'Database error' });
  }
});

// change password
app.post('/change_password', authenticateToken, async (req, res) => {
  const email = req.user.email;
  const { newPassword } = req.body;

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
        return res.status(400).json('New password cannot be the same as the old password');
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
        return res.status(400).json('New password cannot be the same as the old password');
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

// Update email and auth method
app.post('/binding_google', authenticateToken, async (req, res) => {
  const id = req.user.id; // Get the user ID from the token
  const emailToken = req.user.email;
  const { email } = req.body; // Assuming the email is sent in the request body

  try {
    // Check if the email belongs to an employee or a customer
    let emailCheck = await pool.query(
      `SELECT cus_email from CUSTOMER WHERE cus_email = $1`,
      [emailToken]
    );

    if (emailCheck.rows.length > 0) {
      const result = await pool.query(
        `UPDATE CUSTOMER 
        SET cus_email = $1, cus_auth_method = 'TRASHTRACK_GOOGLE' 
        WHERE cus_email = $2 RETURNING *`,
        [email, emailToken]
      );

      if (result.rowCount > 0) {
        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        return res.status(200).json({
          message: 'User found in customer',
          accessToken: accessToken,
          refreshToken: refreshToken
        });
      }
    }

    //if hauler
    emailCheck = await pool.query(
      `SELECT emp_email from EMPLOYEE WHERE emp_email = $1`,
      [emailToken]
    );

    if (emailCheck.rows.length > 0) {
      const result = await pool.query(
        `UPDATE EMPLOYEE 
         SET emp_email = $1, emp_auth_method = 'TRASHTRACK_GOOGLE' 
         WHERE emp_email = $2 RETURNING *`,
        [email, emailToken]
      );

      if (result.rowCount > 0) {
        console.log('sucess bind');
        // store user data to token
        const user = { email: email, id: id };

        const { accessToken, refreshToken } = generateTokens(user);
        return res.status(200).json({
          message: 'User found in customer',
          accessToken: accessToken,
          refreshToken: refreshToken
        });
      }
    }

    return res.status(404).json({ message: 'User not found' });

  } catch (error) {
    console.error('Error updating user:', error.message); // Show debug print on server cmd
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


// Payment link session endpoint
app.post('/payment_link_Session', authenticateToken, async (req, res) => {
  const { email } = req.user;
  const { gb_id } = req.body; // The amount in centavos

  try {

    const dbAmount_due = await fetchTotalAmountDue(gb_id);
    const amount_due = Math.round(dbAmount_due * 100);
    console.log(amount_due);
    if (!amount_due || amount_due <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

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
              // amount: amount * 1000,
              // currency: 'PHP', 
              description: 'Billing Id: ' + gb_id,
              //description: 'Payment for your transaction',
              billing: {
                name,
                email,
                phone,

              },
              billing_information_fields_editable: 'disabled', //cant edit
              line_items: [
                {
                  name: 'Waste Pickup Service',
                  amount: amount_due, // in centavos
                  currency: 'PHP',
                  //description: 'Billing Id: ' + gb_id,
                  quantity: 1,
                },
                // {
                //   name: 'Poop Waste',
                //   amount: 100 * 100,
                //   currency: 'PHP',
                //   description: 'Payment for service',
                //   quantity: 1,
                // },


              ],
              payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay', 'qrph'],
              // success_url: 'https://trashtrack.com/payment-success',
              // cancel_url: 'https://trashtrack.com/payment-cancel',
              //success_url: 'http://192.168.254.187:3000',
              metadata: { gb_id: gb_id }, //for generated bill from table db
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
      const sessionId = response.data.data.id;

      console.log(checkoutUrl);
      if (checkoutUrl) {
        res.json({ checkoutUrl, sessionId });
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
//////////////

// // Payment status check endpoint
// app.get('/payment_status/:sessionId', authenticateToken, async (req, res) => {
//   const { sessionId } = req.params;

//   try {
//     const response = await axios.get(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
//       headers: {
//         Authorization: `Basic ${encodedSecretKey}`,
//         'Content-Type': 'application/json',
//       },
//     });

//     const payments = response.data.data.attributes.payments;

//     if (payments && payments.length > 0) {
//       const isPaid = payments.some(payment => payment.attributes.status === 'paid');

//       if (isPaid) {

//         console.log("At least one payment is 'paid'");
//         return res.json();
//       } else {
//         console.log("Failed");
//       }

//     } else {
//       console.log('No payments found');
//     }

//   } catch (error) {
//     console.error('Error checking payment status:', error.message);
//     res.status(500).json({ error: 'Failed to check payment status' });
//   }
// });

// paymongo will this endpoint (for status check)
app.post('/webhooks/paymongo', async (req, res) => {
  const event = req.body; // Event payload from PayMongo
  //console.log('Received event:', JSON.stringify(event, null, 2)); // Log the entire event payload

  // Access the event type correctly
  const eventType = event.data.attributes.type;

  if (!eventType) {
    console.log('Event type is undefined');
    return res.sendStatus(400); // Respond with an error for unhandled types
  }

  switch (eventType) {
    case 'checkout_session.payment.paid':
      const payments = event.data.attributes.data.attributes.payments;
      const checkoutId = event.data.attributes.data.id;
      const billId = event.data.attributes.data.attributes.metadata.gb_id;

      if (payments && payments.length > 0) {
        const paymentId = payments[0].id; // Payment ID
        const amount = payments[0].attributes.amount / 100; // Amount in cents
        const method = payments[0].attributes.source.type;
        const pay_status = payments[0].attributes.status;
        console.log(amount);
        console.log(method);
        console.log(pay_status);
        console.log(paymentId);
        console.log(checkoutId);
        console.log(billId);
        console.log('Payment was successful');
        // console.log('Payment was successful:', event.data);
        // Insert logic to save the session and amount to your database

        try {
          await pool.query(`
            INSERT INTO payment (p_amount, p_status, p_method, p_trans_id, p_checkout_id, gb_id)
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [amount, pay_status, method, paymentId, checkoutId, billId]
          );

          const updateResult = await pool.query(`
            UPDATE GENERATE_BILL SET gb_status = $1 WHERE gb_id = $2`,
            ['Paid', billId]
          );
          if (updateResult.rowCount > 0) {
            console.log('Payment details inserted successfully.');
            //
            // const response = await axios.get(`https://api.paymongo.com/v1/checkout_sessions/${checkoutId}`, {
            //   headers: {
            //     Authorization: `Basic ${encodedSecretKey}`,
            //     'Content-Type': 'application/json',
            //   },
            // });
            // if (response.status === 200) {
            //   console.log('Payment details inserted successfully.');
            //   console.log('Checkout session details:', response.data);
            // } else {
            //   console.log('Failed to fetch checkout session:', response.status);
            // }
            //
          }

        } catch (err) {
          console.error('Error inserting payment details:', err);
        }
      } else {
        console.error('Payments array is empty or undefined:', payments);
      }
      break;


    case 'checkout_session.payment.failed':
      // Handle failed payment
      console.log('Payment failed:', event.data);
      // Insert logic for handling failed payment
      break;

    default:
      console.log('Unhandled event type:', eventType);
      return res.sendStatus(400); // Respond with an error for unhandled types
  }

  res.sendStatus(200); // Respond to acknowledge receipt
});




//// PDF ///////////////////////////////////////////////

//add days to date for pdf
function addDaysToDate(dateString, daysToAdd) {
  // Parse the date string into a Date object
  const date = new Date(dateString);

  // Add the specified number of days
  date.setDate(date.getDate() + daysToAdd);

  // Return the new date in ISO format (or any other format you prefer)
  return date.toISOString(); // returns date in ISO 8601 format
}

// Utility function to format numbers with commas
function formatNumComma(number) {
  return Number(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generate bill PDF
app.post('/generate-pdf', authenticateToken, async (req, res) => {
  const { billId } = req.body;
  console.log(billId);
  const doc = new PDFDocument();

  // Set the filename for download and content type
  res.setHeader('Content-Disposition', 'attachment; filename=generated_pdf.pdf');
  res.setHeader('Content-Type', 'application/pdf');

  // Pipe the document to the response
  doc.pipe(res);

  // Image and Title (Header)
  const imagePath = path.join(__dirname, 'public/images/trashtrackicon.png');
  const roboto = path.join(__dirname, 'fonts/Roboto-Light.ttf');
  const robotoBold = path.join(__dirname, 'fonts/Roboto-Regular.ttf');
  let yHeaderPosition = 50;

  if (fs.existsSync(imagePath)) {
    doc.image(imagePath, {
      fit: [50, 50],
      align: 'left',
      valign: 'center',
      x: yHeaderPosition - 10,
      y: yHeaderPosition - 10
    });

    doc.fontSize(20).text('TrashTrack', yHeaderPosition + 30, yHeaderPosition + 10);
  } else {
    doc.text('Image not found', 100, yHeaderPosition);
  }

  // Complete Address of the Binaliw Cebu Dumpsite (aligned to the right)
  doc.font('Helvetica').fontSize(9);
  let addressYPosition = yHeaderPosition;
  doc.text('TrashTrack Company', 400, addressYPosition, { align: 'right' })
  addressYPosition += 15;
  doc.text('Binaliw Landfill', 400, addressYPosition, { align: 'right' });
  addressYPosition += 15;
  doc.text('Cebu City, 6000 Cebu, Philippines', 400, addressYPosition, { align: 'right' });
  addressYPosition += 15;
  doc.text('09916387667', 400, addressYPosition, { align: 'right' });

  // Billing Statement (Centered)
  doc.font('Helvetica-Bold').fontSize(16).text('Billing Statement', 50, addressYPosition + 30, { align: 'center' });

  // doc.font('Helvetica').fontSize(9);
  let billDetailsYPosition = addressYPosition + 50;

  // Display bk_id and billId at the left
  try {
    const result = await pool.query(`
      SELECT
        b.bk_id,
        bw.bw_name,
        bw.bw_unit,
        bw.bw_total_unit,
        bw.bw_price,
        bw.bw_total_price,
        gb.gb_date_issued,
        gb.gb_date_due,
        gb.gb_lead_days,
        gb.gb_date_issued,
        gb.gb_accrual_period,
        gb.gb_suspend_period,
        gb.gb_interest,
        gb.gb_tax,
        gb.gb_add_fees,
        gb.gb_note 

      FROM
        public.generate_bill gb
      JOIN
        public.booking b ON gb.bk_id = b.bk_id
      JOIN
        public.booking_waste bw ON b.bk_id = bw.bk_id
      WHERE
        gb.gb_id = $1
    `, [billId]);

    const tableData = result.rows;

    // Check if data is found
    if (tableData.length === 0) {
      doc.fontSize(14).text('No data found for the given bill ID.', { align: 'left' });
      doc.end();
      return;
    }

    // Display bk_id and billId
    const bkId = tableData[0].bk_id;
    //doc.fontSize(9).text(`Bill ID: ${billId}`, 50, billDetailsYPosition + 10);
    doc.font('Helvetica').fontSize(9).text(`Booking# ${bkId}`, 50, billDetailsYPosition + 20);

    // Add Terms section (Left aligned)
    let termsYPosition = billDetailsYPosition + 50;
    doc.font('Helvetica-Bold').fontSize(12).text('TERMS:', 50, termsYPosition, { align: 'left' });
    doc.font('Helvetica').fontSize(8);

    const dateIssued = tableData[0].gb_date_issued;
    const leadDays = tableData[0].gb_lead_days;
    const accrualPeriod = tableData[0].gb_accrual_period;
    const suspendPeriod = tableData[0].gb_suspend_period;
    const interest = tableData[0].gb_interest;
    const addNote = tableData[0].gb_note;
    const addFees = tableData[0].gb_add_fees;
    const termsText = `The bill shall be due for payment and collection (${leadDays}) days after issuance. Failure by the customer to make payment without valid and justifiable reason will result in a late payment charge of (${interest}% interest) per ${accrualPeriod}days applied to any outstanding balance until ${suspendPeriod}days. Additionally, TrashTrack reserves the right to stop collecting waste materials from the customer's premises if payment is not made, preventing further processing and disposal services.`;

    termsYPosition += 20;
    doc.text(termsText, 50, termsYPosition, { align: 'left' });

    // Move down for IDs and table
    let tableYPosition = termsYPosition + 50;

    // Column widths and positions
    const col1X = 50;
    const col2X = 200;
    const col3X = 250;
    const col4X = 320;
    const col5X = 450;

    // Table Headers
    doc.fontSize(9);
    doc.text('Description', col1X, tableYPosition);
    doc.text('Unit', col2X, tableYPosition);
    doc.text('Total Unit', col3X, tableYPosition);
    doc.text('Unit Price', col4X, tableYPosition);
    doc.text('Total Price', col5X, tableYPosition);

    doc.moveTo(50, tableYPosition + 15)
      .lineTo(550, tableYPosition + 15)
      .stroke();

    let sumAmount = 0;

    doc.font(roboto);

    // Populate table with data
    tableData.forEach(row => {
      tableYPosition += 20;
      doc.text(row.bw_name, col1X, tableYPosition);
      doc.text(row.bw_unit, col2X, tableYPosition);
      doc.text(Number(row.bw_total_unit).toLocaleString(), col3X, tableYPosition);
      doc.text('₱ ' + formatNumComma(row.bw_price), col4X, tableYPosition); // Format price
      doc.text('₱ ' + formatNumComma(row.bw_total_price), col5X, tableYPosition); // Format total price
      sumAmount += Number(row.bw_total_price);
    });

    // additional fee
    if (addFees > 0 && addNote != null) {
      tableYPosition += 20;
      doc.text(addNote, col1X, tableYPosition);
      doc.text('-', col2X, tableYPosition);
      doc.text('-', col3X, tableYPosition);
      doc.text('-', col4X, tableYPosition);
      doc.text('₱ ' + formatNumComma(addFees), col5X, tableYPosition);
      sumAmount += Number(addFees);
    }

    // Draw the bottom line for the table
    tableYPosition += 10;
    doc.moveTo(50, tableYPosition + 10)
      .lineTo(550, tableYPosition + 10)
      .stroke();

    // Move the yPosition down for the total amount display
    tableYPosition += 20;

    // Display the total amount aligned with the "Total Price" column
    doc.font('Helvetica');
    doc.fontSize(9).text('Sum Amount:', col4X, tableYPosition);
    doc.font(roboto);
    doc.text('₱ ' + formatNumComma(sumAmount), col5X, tableYPosition);
    doc.font('Helvetica');

    // Calculate the tax amount
    const gbTax = tableData[0].gb_tax;
    const taxRate = gbTax / 100;
    const VAT = sumAmount * taxRate;
    tableYPosition += 20;

    // Display the tax amount
    doc.font('Helvetica').fontSize(9).text('VAT (' + gbTax + '%):', col4X, tableYPosition);
    doc.font(roboto);
    doc.text('₱ ' + formatNumComma(VAT), col5X, tableYPosition);

    // total amount after tax
    let amountDue = sumAmount + VAT;
    //res.setHeader('totalAmount', totalAmount.toFixed(2));
    const gbDateIssued = tableData[0].gb_date_issued;
    const gbDueDate = tableData[0].gb_date_due;

    // // bill Details (aligned to the right)
    // doc.font(robotoBold).fontSize(9);
    // const rightXPosition = 400;
    // const billDetails = [
    //   { label: 'Bill #:', value: '######' },
    //   { label: 'Date Issued:', value: gbDateIssued.toLocaleDateString() },
    //   { label: 'Due Date:', value: gbDueDate.toLocaleDateString() },
    //   { label: 'Total Due:', value: '₱ ' + formatNumComma(totalAmount) },
    // ];

    // billDetails.forEach((detail, index) => {
    //   const yPosition = billDetailsYPosition + index * 15;
    //   // Display label normally
    //   doc.text(detail.label, rightXPosition, yPosition);

    //   // Check if this is the "Total Due" line to color only the value
    //   if (detail.label === 'Total Due:') {
    //     doc.fillColor('red') // Set color for the amount
    //       .text(detail.value, rightXPosition, yPosition, { align: 'right' })
    //       .fillColor('black'); // Reset color to black for other details
    //   } else {
    //     doc.text(detail.value, rightXPosition, yPosition, { align: 'right' }); // Normal text for other rows
    //   }
    // });


    tableYPosition += 20;

    // Display the final total amount
    doc.font('Helvetica-Bold').fontSize(9).text('Total Amount:', col4X, tableYPosition);
    doc.font(robotoBold);
    doc.text('₱ ' + formatNumComma(amountDue), col5X, tableYPosition);

    tableYPosition += 10;
    // doc.font('Helvetica-Bold').fontSize(12).text('Cash-In place refer to top-right corner of this page', 50, tableYPosition + 120, { align: 'left' });
    // doc.text('Online Payment Paymongo', 50, tableYPosition + 140);


    //added interest
    //console.log('\n11111111111111111111111111111111111111111111111');
    let dueDate = addDaysToDate(dateIssued, leadDays);
    let accrualDate = addDaysToDate(dueDate, accrualPeriod);
    let suspendDate = addDaysToDate(dueDate, suspendPeriod);
    // console.log('issue date: ', dateIssued, leadDays);
    // console.log('due Date: ', dueDate);
    // console.log('accrual: ', accrualPeriod);
    // console.log('suspend: ', suspendPeriod);
    // console.log('interest: ', interest);
    // console.log('accrualDate: ', accrualDate);
    // console.log('suspendDate: ', suspendDate);


    // //convert date
    // let today = new Date();
    // let Date_today = new Date(today.getFullYear(), today.getMonth(), today.getDate()); //
    // let dueDate2 = new Date(dueDate);
    // let Date_due = new Date(dueDate2.getFullYear(), dueDate2.getMonth(), dueDate2.getDate()); //
    // let acrrualDate2 = new Date(accrualDate);
    // let Date_accrual = new Date(acrrualDate2.getFullYear(), acrrualDate2.getMonth(), acrrualDate2.getDate()); //
    // let suspendDate2 = new Date(suspendDate);
    // let Date_suspend = new Date(suspendDate2.getFullYear(), suspendDate2.getMonth(), suspendDate2.getDate()); //

    // console.log('\nDate_today: ', Date_today.toString());
    // console.log('Date_due: ', Date_due.toString());
    // console.log('Date_accrual: ', Date_accrual.toString());
    // console.log('Date_suspend: ', Date_suspend.toString());
    // //
    // let amountDue = totalAmount;
    // console.log('Total Amount: ', amountDue);
    // //
    // if (Date_today > Date_due) {
    //   console.log('\n11111111111111111111111111111111111111111111111');
    //   let interestAmnt = totalAmount * (interest / 100);
    //   amountDue += interestAmnt;
    //   console.log('interestAmnt: ', interestAmnt);
    //   console.log('Amount Due 1: ', amountDue);
    //   // oct 23 <= oct 4 and oct 23 <= oct 19
    //   while (Date_today >= Date_accrual && Date_accrual <= Date_suspend) {
    //     console.log('\n222222222222222222222222222222222222222222222222222222222222222');
    //     interestAmnt = amountDue * (interest / 100);
    //     amountDue += interestAmnt;
    //     console.log('interestAmnt: ', interestAmnt);
    //     console.log('Amount Due: ', amountDue);
    //     console.log('\nDate_accrual111: ', Date_accrual.toString());
    //     Date_accrual = new Date(addDaysToDate(Date_accrual, accrualPeriod)); //add accrual
    //     console.log('Date_accrual222: ', Date_accrual.toString());
    //   }
    // }



    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Convert dates to yyyy-mm-dd for comparison
    let Date_bill = new Date().setHours(0, 0, 0, 0); // Today's date at midnight
    let Date_due = new Date(dueDate).setHours(0, 0, 0, 0);
    let Date_accrual = new Date(accrualDate).setHours(0, 0, 0, 0);
    let Date_suspend = new Date(suspendDate).setHours(0, 0, 0, 0);

    const paidResult = await pool.query(
      `SELECT p_date_paid FROM PAYMENT WHERE gb_id = $1 AND p_status = $2`, [billId, 'paid']
    );

    if (paidResult.rows.length > 0) {
      const date = paidResult.rows[0].p_date_paid;
      Date_bill = new Date(date).setHours(0, 0, 0, 0);
      console.log('Already Paid generating bill PDF');
    }


    // let amountDue = totalAmount;

    // // If today's date is past the due date, calculate the additional interest
    // if (Date_today > Date_due) {
    //   console.log('Amount after tax: ', amountDue);
    //   console.log('Today is after the due date, interest will be applied.');

    //   // First interest application after due date
    //   let interestAmount = totalAmount * (interest / 100);
    //   amountDue += interestAmount;
    //   console.log('Initial interest:', interestAmount);
    //   console.log('New Amount Due:', amountDue);

    //   // Continue applying interest in accrual periods until either today's date is past the suspension date or we reach the accrual date
    //   while (Date_today >= Date_accrual && Date_accrual <= Date_suspend) {
    //     console.log('\nApplying additional interest as we are still within the accrual period.');

    //     // Apply interest for each accrual period
    //     interestAmount = amountDue * (interest / 100);
    //     amountDue += interestAmount;

    //     console.log('Accrual Period Interest:', interestAmount);
    //     console.log('Updated Amount Due:', amountDue);

    //     // Move to the next accrual period
    //     Date_accrual = new Date(addDaysToDate(Date_accrual, accrualPeriod)).setHours(0, 0, 0, 0);
    //     console.log('Next Accrual Date:', new Date(Date_accrual).toDateString());
    //   }
    // }

    // console.log('\nFinal Amount Due after interest:', amountDue.toFixed(2));

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // Added interest calculation section

    // If today's date is past the due date, calculate the additional interest
    if (Date_bill > Date_due) {
      // console.log('Amount after tax: ', amountDue);
      // console.log('Today is after the due date, interest will be applied.');

      let interestAppliedCount = 0;  // To count how many times interest is applied
      //let amountDue = amountDue;   // Start with the total amount

      tableYPosition += 20;
      // Table headers
      doc.font('Helvetica').fontSize(9)
        .text('Date Interest Added', col2X, tableYPosition)
        .text('Description', col4X, tableYPosition)
        .text('Amount', col5X, tableYPosition);


      // Draw the bottom line for the table
      doc.moveTo(col2X, tableYPosition + 15)
        .lineTo(550, tableYPosition + 15)
        .stroke();

      tableYPosition += 20;

      // First interest application after due date
      let interestAmount = amountDue * (interest / 100);
      amountDue += interestAmount;
      interestAppliedCount += 1;

      // Display the first interest row in the table
      const firstdate = addDaysToDate(Date_due, 1);
      doc.font(roboto).fontSize(9)
        .text(new Date(firstdate).toDateString(), col2X, tableYPosition)  // Date of interest application
        .text(`Overdue Interest (${interest}%):`, col4X, tableYPosition)         // Description
        .text('₱ ' + formatNumComma(interestAmount), col5X, tableYPosition); // Interest amount
      tableYPosition += 20;

      // console.log('Initial interest:', interestAmount);
      // console.log('New Amount Due:', amountDue);

      // Continue applying interest in accrual periods until either today's date is past the suspension date or we reach the accrual date
      while (Date_bill >= Date_accrual && Date_accrual <= Date_suspend) {
        // console.log('\nApplying additional interest as we are still within the accrual period.');

        // Apply interest for each accrual period
        interestAmount = amountDue * (interest / 100);
        amountDue += interestAmount;
        interestAppliedCount += 1;

        // Display additional interest in the table
        doc.text(new Date(Date_accrual).toDateString(), col2X, tableYPosition)  // Date of interest application
          .text(`Accrued Interest (${interest}%):`, col4X, tableYPosition)     // Description
          .text('₱ ' + formatNumComma(interestAmount), col5X, tableYPosition); // Interest amount
        tableYPosition += 20;

        // console.log('Accrual Period Interest:', interestAmount);
        // console.log('Updated Amount Due:', amountDue);

        // Move to the next accrual period
        Date_accrual = new Date(addDaysToDate(Date_accrual, accrualPeriod)).setHours(0, 0, 0, 0);
        //console.log('Next Accrual Date:', new Date(Date_accrual).toDateString());
      }

      // Draw the bottom line for the table
      doc.moveTo(col2X, tableYPosition)
        .lineTo(550, tableYPosition)
        .stroke();

      tableYPosition += 10;
      // Display interest summary if interest was applied
      if (interestAppliedCount > 0) {
        doc.text(`Interest Applied: ${interestAppliedCount} time/s`, col4X, tableYPosition);
        tableYPosition += 20;
      }

      console.log('\nGenerated: Final Amount Due after interest:', amountDue.toFixed(2));

      // Display the final total amount with interest in the table
      doc.font(robotoBold).fontSize(11).text('Total Amount Due :', col4X, tableYPosition)
        .text('₱ ' + formatNumComma(amountDue), col5X, tableYPosition);
    }

    //for payment option
    tableYPosition += 50;
    doc.font(roboto).fontSize(9)
      .text('Payment Options:', 50, tableYPosition, { align: 'left' })
      .text('\n')
      .fontSize(10).font(robotoBold)
      .text('Online Payment:')
      .font(roboto).fontSize(9)
      .text('   - Pay through the TrashTrack app with PayMongo.')
      .text('\n')
      .fontSize(10).font(robotoBold)
      .text('In-Person Payment (Walk-In):')
      .font(roboto).fontSize(9)
      .text('   - Cash payments are accepted at our location. Please refer to the top right of this page.');


    //
    // bill Details (aligned to the right)
    doc.font(robotoBold).fontSize(9);
    const rightXPosition = 400;
    const billDetails = [
      { label: 'Bill #:', value: billId },
      { label: 'Date Issued:', value: gbDateIssued.toLocaleDateString() },
      { label: 'Due Date:', value: gbDueDate.toLocaleDateString() },
      { label: 'Total Due:', value: '₱ ' + formatNumComma(amountDue) },
    ];

    billDetails.forEach((detail, index) => {
      const yPosition = billDetailsYPosition + index * 15;
      // Display label normally
      doc.text(detail.label, rightXPosition, yPosition);

      // Check if this is the "Total Due" line to color only the value
      if (detail.label === 'Total Due:') {
        doc.fillColor('red') // Set color for the amount
          .text(detail.value, rightXPosition, yPosition, { align: 'right' })
          .fillColor('black'); // Reset color to black for other details
      } else {
        doc.text(detail.value, rightXPosition, yPosition, { align: 'right' }); // Normal text for other rows
      }
    });
    //
  } catch (error) {
    console.error('Error fetching data:', error);
    doc.fontSize(14).text('Error fetching data for the bill.', { align: 'left' });
  }

  doc.end();
});

///////////////////////////////////////

//upload_pdf
app.post('/upload_pdf', authenticateToken, async (req, res) => {
  const { billId, pdfData } = req.body;

  //
  let passTotalDue = 0;
  try {
    passTotalDue = await fetchTotalAmountDue(billId);
    let insertPDF = false;
    const checkExist = await pool.query(
      `SELECT gb_id FROM bill_document WHERE gb_id = $1`, [billId]);

    if (checkExist.rows.length === 0) {
      insertPDF = true;
    } else {
      const checkAmnt = await pool.query(
        `SELECT MAX(bd_total_amnt) AS total_amnt
         FROM bill_document WHERE gb_id = $1`, [billId]);
      if (checkAmnt.rows[0].total_amnt < passTotalDue.toFixed(2)) {
        insertPDF = true;
      }
    }

    if (insertPDF) {
      // Ensure pdfData is a Buffer
      const buffer = Buffer.from(pdfData, 'binary'); // Convert the pdfData to a buffer
      const insertPDF = await pool.query(
        `INSERT INTO bill_document (bd_total_amnt, gb_id, bd_file) VALUES($1, $2, $3)`,
        [passTotalDue, billId, buffer]); // Insert buffer instead of base64 string

      if (insertPDF.rowCount > 0) {
        console.log('Successfully inserted');
        res.status(200).json({ message: 'PDF uploaded successfully' });
      }
    } else {
      res.status(201).json({ message: 'PDF not inserted due to existing records' });
    }
  } catch (error) {
    console.error('Error fetching PDFs:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});



// app.get('/generate-pdf', (req, res) => {
//   const doc = new PDFDocument();

//   // Set the filename for download
//   res.setHeader('Content-Disposition', 'attachment; filename=generated_pdf.pdf');

//   // Pipe the document to the response
//   doc.pipe(res);

//   // Image and Title (Header)
//   const imagePath = path.join(__dirname, 'public/images/trashtrackicon.png'); // Ensure the image exists here
//   const yHeaderPosition = 50; // Adjust this based on where you want the image and text to appear

//   if (fs.existsSync(imagePath)) {
//     // Draw the image on the left
//     doc.image(imagePath, {
//       fit: [50, 50], // Adjust the size of the image
//       align: 'left',
//       valign: 'center',
//       x: 100, // X position for the image (left alignment)
//       y: yHeaderPosition // Y position for both image and text
//     });

//     // Add title text beside the image
//     doc.fontSize(20).text('TrashTrack', 160, yHeaderPosition + 15); // Adjust X (160) and Y (+15) to align text beside the image
//   } else {
//     doc.text('Image not found', 100, yHeaderPosition);
//   }

//   // Billing receipt message
//   doc.moveDown();
//   doc.fontSize(16).text('This is your billing receipt', { align: 'left' });

//   // Example Table Data
//   const tableData = [
//     { column1: 'Item 1', column2: 'Description 1', column3: '$10' },
//     { column1: 'Item 2', column2: 'Description 2', column3: '$15' },
//     { column1: 'Item 3', column2: 'Description 3', column3: '$20' }
//   ];

//   // Define the start position for the table
//   const tableStartY = yHeaderPosition + 100;
//   let yPosition = tableStartY;

//   // Draw table headers
//   doc.fontSize(12).text('Item', 100, yPosition);
//   doc.text('Description', 200, yPosition);
//   doc.text('Price', 400, yPosition);

//   // Draw a line under the headers
//   doc.moveTo(100, yPosition + 15)
//     .lineTo(500, yPosition + 15)
//     .stroke();

//   // Iterate over the table data
//   tableData.forEach(row => {
//     yPosition += 20;
//     doc.text(row.column1, 100, yPosition);
//     doc.text(row.column2, 200, yPosition);
//     doc.text(row.column3, 400, yPosition);
//   });

//   // Draw a line under the table
//   doc.moveTo(100, yPosition + 15)
//     .lineTo(500, yPosition + 15)
//     .stroke();

//   // End the document
//   doc.end();
// });

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
//     console.log(paymentLink);
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


// /////// final checkout link
// app.post('/payment_link_Session', authenticateToken, async (req, res) => {
//   const { amount } = req.body;  // The amount in centavos
//   const { email } = req.user;   // Email from the decoded token

//   if (!amount || amount <= 0) {
//     return res.status(400).json({ error: 'Invalid amount' });
//   }

//   try {
//     const result = await pool.query('SELECT * FROM CUSTOMER WHERE cus_email = $1', [email]);

//     if (result.rows.length > 0) {
//       const user = result.rows[0];
//       const name = `${user.cus_fname} ${user.cus_mname || ''} ${user.cus_lname}`.trim();
//       const phone = user.cus_contact;

//       const response = await axios.post(
//         'https://api.paymongo.com/v1/checkout_sessions',
//         {
//           data: {
//             attributes: {
//               amount: amount * 100,
//               currency: 'PHP',
//               description: 'Payment for your transaction',
//               billing: {
//                 name,
//                 email,
//                 phone,
//               },
//               line_items: [
//                 {
//                   name: 'Food Waste',
//                   amount: 100 * 100,
//                   currency: 'PHP',
//                   description: 'Payment for service',
//                   quantity: 1,
//                 },
//               ],
//               //payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
//               payment_method_types: [
//                 'gcash',
//                 'card',
//                 'paymaya',
//                 'grab_pay',
//                 'qrph',
//                 //'billease',
//               ],
//               success_url: 'https://trashtrack.com/success',
//               cancel_url: 'https://trashtrack.com/cancel',
//             },
//           },
//         },
//         {
//           headers: {
//             Authorization: `Basic ${encodedSecretKey}`,
//             'Content-Type': 'application/json',
//           },
//         }
//       );

//       const checkoutUrl = response.data.data.attributes.checkout_url;

//       // const checkoutSession = response.data.data;
//       // const sessionId = checkoutSession.id;  // Checkout session ID
//       // const transactionId = checkoutSession.attributes.transaction_id; // If available

//       const checkoutSession = response.data.data;
//       const sessionId = checkoutSession.id;  // Checkout session ID
//       // const paymentId = checkoutSession.payments.id; // Payment ID
//       // const paymentStatus = checkoutSession.payments.attributes.status; // Payment status

//       console.log(sessionId);
//       // console.log(paymentId);
//       // console.log(paymentStatus);
//       console.log(checkoutUrl);
//       if (checkoutUrl) {
//         res.json({ checkoutUrl });
//       } else {
//         throw new Error('Checkout URL not available');
//       }
//     } else {
//       res.status(404).json({ error: 'User not found' });
//     }
//   } catch (error) {
//     console.error('Error creating checkout session:', error.message || error);
//     res.status(500).json({ error: error.message || 'Failed to create checkout session' });
//   }
// });

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
// app.get('/payment_link_status/:paymentId', authenticateToken, async (req, res) => {
//   const { paymentId } = req.params;

//   console.log(2222222222222222222222222);
//   try {
//     const response = await axios.get(
//       `https://api.paymongo.com/v1/payments/${paymentId}`,
//       {
//         headers: {
//           Authorization: `Basic ${encodedSecretKey}`,
//         },
//       }
//     );

//     const paymentStatus = response.data.data.attributes.status;
//     console.log(paymentStatus);
//     res.json({ status: paymentStatus });

//   } catch (error) {
//     console.error('Error fetching payment status:', error.message || error);
//     res.status(500).json({ error: 'Failed to fetch payment status' });
//   }
// });





// Start the server
// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });

// app.listen(port, '0.0.0.0', () => {
//   console.log(`Server running on http://192.168.254.187:${port}`);
// });

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on ${networkLink}`);
});

//http://192.168.119.156