

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

//fetch booking all pending
app.post('/fetch_pickup_booking', authenticateToken, async (req, res) => {
  //const userId = req.user.id;  

  try {
    const result = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 ORDER BY bk_date ASC',
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

//fetch current all pickup
app.post('/fetch_current_pickup', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT *, bk_date::timestamp without time zone AS bk_date FROM booking WHERE bk_status = $1 AND emp_id = $2 ORDER BY bk_date ASC',
      ['Ongoing', userId]
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

// app.listen(port, '0.0.0.0', () => {
//   console.log(`Server running on http://192.168.254.187:${port}`);
// });

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on ${networkLink}`);
});

//http://192.168.119.156