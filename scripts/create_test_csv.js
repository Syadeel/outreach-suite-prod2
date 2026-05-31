const fs = require('fs');
const path = require('path');

const csvContent = `email,first_name,last_name,company,website
alice@example.com,Alice,Smith,Acme Corp,https://acme.com
bob@example.org,Bob,Jones,Globex,https://globex.com`;

const filePath = path.join(__dirname, 'sample_leads.csv');
fs.writeFileSync(filePath, csvContent, 'utf8');

// Output base64 string for quick curl usage
const base64 = Buffer.from(csvContent, 'utf8').toString('base64');
console.log('Created sample CSV at', filePath);
console.log('Base64 (copy‑paste into request body):');
console.log(base64);
