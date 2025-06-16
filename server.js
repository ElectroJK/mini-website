const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS = JSON.parse(fs.readFileSync('credentials.json'));
const auth = new google.auth.GoogleAuth({
  credentials: CREDENTIALS,
  scopes: SCOPES,
});

const SHEET_ID = '1TXDEr7xHZALymI4RCITy6UY8_IKmCIB8BnBNklqnYho';

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function generateUserId(req) {
  const ip = req.ip || 'unknown';
  const timestamp = Date.now().toString();
  return crypto.createHash('sha256').update(ip + timestamp).digest('hex').slice(0, 12);
}

function normalizePhone(number) {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('8')) return '7' + digits.slice(1);
  if (digits.startsWith('7')) return digits;
  if (digits.startsWith('77')) return '7' + digits.slice(1);
  return digits;
}

app.get('/submitted', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submitted.html'));
});

app.post('/submit', async (req, res) => {
  if (req.cookies.submitted === 'true') {
    return res.redirect('/submitted');
  }

  const { name, phone } = req.body;
  const userId = generateUserId(req);
  const normalizedPhone = normalizePhone(phone);

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'A1:C1000',
    });

    const rows = existingData.data.values || [];

    const isDuplicate = rows.some(row => {
      const rowName = row[1] || '';
      const rowPhone = row[2] || '';
      return rowName === name || normalizePhone(rowPhone) === normalizedPhone;
    });

    if (isDuplicate) {
      return res.send(`
        <script>
          alert("Ошибка: такое имя или номер телефона уже существуют.");
          window.location.href = "/";
        </script>
      `);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[userId, name, normalizedPhone]],
      },
    });

    res.cookie('submitted', 'true', { maxAge: 1000 * 60 * 60 * 24 * 365 });

    res.send(`
      <script>
        alert("Спасибо! Мы скоро с вами свяжемся.");
        window.location.href = "/submitted";
      </script>
    `);
  } catch (error) {
    console.error('Ошибка при добавлении данных:', error);
    res.status(500).send('Ошибка сервера');
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
